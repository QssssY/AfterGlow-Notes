#!/usr/bin/env bash
# 余晖录 · 日常部署（方式 B：小机子整站自托管，纯 IP 无域名）
#
#   bash scripts/deploy.sh
#
# 做什么：本地构建 → 同步仓库快照与新增歌曲 → 原子替换 dist → 重启服务 → 公网体检。
# 前提：本机有 node(≥22)/git/ssh，且能免密登录 $HOST（把你的公钥加进服务器
#       ~/.ssh/authorized_keys，或先 ssh-copy-id）。首次部署请先跑 scripts/deploy-setup.sh。
# 换机器：环境变量 AFTERGLOW_HOST / AFTERGLOW_URL 覆盖，或直接改下面两行。
set -euo pipefail
HOST="${AFTERGLOW_HOST:-root@106.12.72.232}"
SITE_URL="${AFTERGLOW_URL:-http://106.12.72.232}"
ROOT=/opt/afterglow

cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "缺 node（需要 ≥22.12）"; exit 1; }

echo "==> 构建（PUBLIC_API_BASE=same-origin，同源自托管形态）"
PUBLIC_API_BASE=same-origin npm run build

echo "==> 同步仓库快照到 $ROOT/blog（管理台数据页签 / 友链巡检要读；git 跟踪的文件 = 无音乐无秘密）"
git ls-files -z | tar --null -T - -czf - | ssh "$HOST" "mkdir -p $ROOT/blog && tar -xzf - -C $ROOT/blog"

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
tar -C dist --exclude='./music' -czf - . | ssh "$HOST" "
  set -e
  rm -rf $ROOT/dist.new && mkdir -p $ROOT/dist.new
  tar -xzf - -C $ROOT/dist.new
  rm -rf $ROOT/dist.prev
  if [ -d $ROOT/dist ]; then mv $ROOT/dist $ROOT/dist.prev; fi
  mv $ROOT/dist.new $ROOT/dist
"

echo "==> 重启服务（启动时重载内存缓存）"
ssh "$HOST" "systemctl restart afterglow"

echo "==> 公网体检"
sleep 2
code=$(curl -fsS -o /dev/null -w '%{http_code}' "$SITE_URL/" || echo FAIL)
echo "GET $SITE_URL/ → $code"
if [ "$code" = 200 ]; then
  echo "✅ 部署完成：$SITE_URL"
else
  echo "❌ 首页不通。排查顺序：① 云控制台安全组放行 TCP 80；② ssh 上去看 journalctl -u afterglow -n 50"
  exit 1
fi
