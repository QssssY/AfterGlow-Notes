#!/usr/bin/env bash
# 余晖录 · 日常部署（方式 B：小机子整站自托管，纯 IP 无域名）
#
#   AFTERGLOW_HOST=root@服务器IP bash scripts/deploy.sh
#
# 做什么：本地构建 → 同步仓库快照与新增歌曲 → 原子替换 dist → 重启服务 → 公网体检。
# 前提：本机有 node(≥22)/git/ssh，且能免密登录 $HOST（把你的公钥加进服务器
#       ~/.ssh/authorized_keys，或先 ssh-copy-id）。首次部署请先跑 scripts/deploy-setup.sh。
# 连接信息不进仓库：公开仓库写死 root@IP 等于把 SSH 用户与目录布局印在明面上 ——
# AFTERGLOW_HOST 必填；AFTERGLOW_URL 可选，缺省按 HOST 里的 IP 拼 http://（绑了域名再给）。
set -euo pipefail
HOST="${AFTERGLOW_HOST:?缺 AFTERGLOW_HOST（例：AFTERGLOW_HOST=root@服务器IP bash scripts/deploy.sh）}"
SITE_URL="${AFTERGLOW_URL:-http://${HOST#*@}}"
ROOT=/opt/afterglow

cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "缺 node（需要 ≥22.12）"; exit 1; }

echo "==> 构建（PUBLIC_API_BASE=same-origin，同源自托管形态）"
PUBLIC_API_BASE=same-origin npm run build

echo "==> 同步仓库快照到 $ROOT/blog（管理台数据页签 / 友链巡检要读；git 跟踪的文件 = 无音乐无秘密）"
# 服务器上用管理台改过的内容（src/data、src/content）会被这一步盖掉 —— 那些改动没回流 git
# 就等于丢了。覆盖前把比上次部署更新的文件备份到 blog.local/<时间>/ 并大声提醒，
# 回来后拿它们回流仓库再重发。上次同步时间以 blog/.blog-synced 的 mtime 为准（别与 pull-deploy 的 $ROOT/.deploy-stamp 搞混，那个记的是 Release 版本）
ssh "$HOST" "mkdir -p $ROOT/blog
  if [ -f $ROOT/blog/.blog-synced ]; then
    changed=\$(find $ROOT/blog/src -type f -newer $ROOT/blog/.blog-synced 2>/dev/null)
    if [ -n \"\$changed\" ]; then
      keep=$ROOT/blog.local/\$(date +%Y%m%d-%H%M%S)
      echo \"  ⚠ 服务器上有管理台改过、尚未回流 git 的文件，覆盖前已备份到 \$keep：\"
      echo \"\$changed\" | while read -r f; do
        echo \"    \$f\"
        mkdir -p \"\$keep/\$(dirname \"\${f#$ROOT/blog/}\")\" && cp -p \"\$f\" \"\$keep/\${f#$ROOT/blog/}\"
      done
    fi
  fi"
git ls-files -z | tar --null -T - -czf - | ssh "$HOST" "tar -xzf - -C $ROOT/blog && touch $ROOT/blog/.blog-synced"

echo "==> 同步新增歌曲（只补服务器没有的；服务器上删除请手动）"
if [ -d public/music ]; then
  remote_list=$(ssh "$HOST" "mkdir -p $ROOT/music && ls -1 $ROOT/music" || true)
  for f in public/music/*; do
    [ -f "$f" ] || continue
    b=$(basename "$f")
    grep -qxF "$b" <<<"$remote_list" || { echo "  ↑ $b"; scp -q "$f" "$HOST:$ROOT/music/"; }
  done
fi

echo "==> 上传 dist 并原子替换（歌不随 dist 走，由 -music 目录供给）"
# 排除音频/歌词/封面，但**不能**排除整个 ./music —— 那里还躺着「我的音乐」页面
# （dist/music/index.html，本地构建时会和 public/music 的歌混在同一目录）。
# 曾经整目录排除，上线后 /music/ 页面 404（歌反而都在）。
# 歌与封面为什么也不进 dist：/music/* 整个前缀归 Go 的供歌处理器（ServeMux
# 最长前缀），一律从服务器的 -music 目录取 —— 打进 dist 的副本永远读不到，
# 白占上传带宽和服务端内存缓存（整站是全量进内存的）。
tar -C dist --exclude='./music/*.mp3' --exclude='./music/*.lrc' \
  --exclude='./music/*.flac' --exclude='./music/*.m4a' --exclude='./music/*.ogg' \
  --exclude='./music/*.wav' --exclude='./music/*.aac' \
  --exclude='./music/*.jpg' --exclude='./music/*.jpeg' --exclude='./music/*.png' \
  --exclude='./music/*.webp' --exclude='./music/*.avif' -czf - . | ssh "$HOST" "
  set -e
  rm -rf $ROOT/dist.new && mkdir -p $ROOT/dist.new
  tar -xzf - -C $ROOT/dist.new
  rm -rf $ROOT/dist.prev
  if [ -d $ROOT/dist ]; then mv $ROOT/dist $ROOT/dist.prev; fi
  mv $ROOT/dist.new $ROOT/dist
"

echo "==> 重启服务（启动时重载内存缓存）"
# 上面一切都是 root 传上去的；服务以 afterglow 账号跑（deploy-setup.sh 建的），
# 管理台要写 blog/、music/ —— 整棵交回给它。老机器上还没建这个账号就跳过
ssh "$HOST" "id -u afterglow >/dev/null 2>&1 && chown -R afterglow:afterglow $ROOT || true
  systemctl restart afterglow"

echo "==> 公网体检"
sleep 8   # 服务重启要预载全部静态进内存（5~7s），等不及会误报「首页不通」
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 8 "$SITE_URL/" || true)
  [ "$code" = 200 ] && break
  sleep 5
done
echo "GET $SITE_URL/ → $code"
if [ "$code" = 200 ]; then
  echo "✅ 部署完成：$SITE_URL"
else
  echo "❌ 首页不通。排查顺序：① 云控制台安全组放行 TCP 80；② ssh 上去看 journalctl -u afterglow -n 50"
  exit 1
fi
