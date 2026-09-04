#!/bin/bash
# AfterGlow pull-deploy —— systemd timer 每 5 分钟触发，自取 GitHub Release。
# 配套 .github/workflows/deploy.yml（CI 只发布产物，不直连本机）。
# 原则：任何网络失败都静默等下一轮，绝不在这里制造告警噪音。
set -u
API="https://api.github.com/repos/QssssY/AfterGlow-Notes/releases/tags/deploy"
ROOT=/opt/afterglow
STAMP=$ROOT/.deploy-stamp

# 元数据走 api.github.com：小 JSON，跨境拥塞下也通畅
meta=$(curl -fsS --max-time 30 "$API" 2>/dev/null) || exit 0
read -r updated dist_url blog_url <<<"$(python3 -c '
import json, sys
r = json.loads(sys.argv[1])
urls = {a["name"]: a["browser_download_url"] for a in r.get("assets", [])}
print(r.get("updated_at", ""), urls.get("dist.tgz", ""), urls.get("blog.tgz", ""))
' "$meta")"
[ -n "$dist_url" ] && [ -n "$blog_url" ] || exit 0
if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$updated" ]; then exit 0; fi

echo "[$(date '+%F %T')] 发现新产物（$updated），开始下载"
# 断点续传只对同一 Release 有效：换了 Release 先清半成品 ——
# 不同版本的 tgz 字节不同，旧半成品续上新字节会拼出校验必死的坏包
if [ ! -f /tmp/pull-release ] || [ "$(cat /tmp/pull-release)" != "$updated" ]; then
  rm -f /tmp/pull-blog.tgz /tmp/pull-dist.tgz
  echo "$updated" > /tmp/pull-release
fi
# 资产下载走 objects.githubusercontent.com —— 跨境拥塞重灾区，
# 掐硬超时，失败不挣扎：下一轮 timer 自然重试。
#
# ⚠️ curl 报错不等于文件没下全：-C - 对**已经下全**的文件会向服务器要一个越界 Range，
# 得到 416 并以退出码 22 收场。一轮里前一个资产下完、后一个没下动时就是这个局面 ——
# 而 /tmp/pull-release 一致又不清残留，于是那一版永远装不上（实测卡了 693 轮、跨了几天，
# 一直被当成「跨境拥塞」）。所以 curl 失败后先让文件自证：是个完整 tar.gz 就当它成功。
dl() {
  curl -fsSL -C - --max-time 240 --retry 5 --retry-all-errors -o "$2" "$1" && return 0
  tar -tzf "$2" >/dev/null 2>&1
}
# 两个都要下：别用 `! dl a || ! dl b`——第一个失败就短路，第二个这一轮根本不会尝试
ok=0
dl "$blog_url" /tmp/pull-blog.tgz || ok=1
dl "$dist_url" /tmp/pull-dist.tgz || ok=1
if [ $ok -ne 0 ]; then
  echo "[$(date '+%F %T')] 下载未完成（跨境拥塞），下一轮再试"
  exit 0
fi
tar -tzf /tmp/pull-blog.tgz >/dev/null 2>&1 || { echo "blog.tgz 校验失败"; exit 0; }
tar -tzf /tmp/pull-dist.tgz >/dev/null 2>&1 || { echo "dist.tgz 校验失败"; exit 0; }

set -e
mkdir -p $ROOT/blog
# 管理台在服务器上改过的内容（src/data、src/content）会被下面的解包盖掉 —— 这条链路每晚
# 定时跑一轮，没回流 git 的改动活不过一天。覆盖前把比上次部署更新的文件备份到
# blog.local/<时间>/，日志里点名；站长看到就拿备份回流仓库。上次同步时间看 blog/.blog-synced 的 mtime（与上面记 Release 版本的 $STAMP 是两回事）
if [ -f $ROOT/blog/.blog-synced ]; then
  changed=$(find $ROOT/blog/src -type f -newer $ROOT/blog/.blog-synced 2>/dev/null || true)
  if [ -n "$changed" ]; then
    keep=$ROOT/blog.local/$(date +%Y%m%d-%H%M%S)
    echo "[$(date '+%F %T')] ⚠ 服务器上有管理台改过、尚未回流 git 的文件，覆盖前已备份到 $keep："
    echo "$changed" | while read -r f; do
      echo "    $f"
      rel=${f#$ROOT/blog/}
      mkdir -p "$keep/$(dirname "$rel")" && cp -p "$f" "$keep/$rel"
    done
  fi
fi
tar -xzf /tmp/pull-blog.tgz -C $ROOT/blog
touch $ROOT/blog/.blog-synced
rm -rf $ROOT/dist.new && mkdir -p $ROOT/dist.new
tar -xzf /tmp/pull-dist.tgz -C $ROOT/dist.new
rm -rf $ROOT/dist.prev
[ -d $ROOT/dist ] && mv $ROOT/dist $ROOT/dist.prev || true
mv $ROOT/dist.new $ROOT/dist
# 服务以 afterglow 账号跑（deploy-setup.sh 建的）：解出来的文件交回给它，管理台才写得动
id -u afterglow >/dev/null 2>&1 && chown -R afterglow:afterglow $ROOT/blog $ROOT/dist || true
systemctl restart afterglow
echo "$updated" > $STAMP
rm -f /tmp/pull-blog.tgz /tmp/pull-dist.tgz
echo "[$(date '+%F %T')] 部署完成"
