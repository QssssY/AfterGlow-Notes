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
# 掐硬超时，失败不挣扎：下一轮 timer 自然重试
dl() { curl -fsSL -C - --max-time 240 --retry 5 --retry-all-errors -o "$2" "$1"; }
if ! dl "$blog_url" /tmp/pull-blog.tgz || ! dl "$dist_url" /tmp/pull-dist.tgz; then
  echo "[$(date '+%F %T')] 下载未完成（跨境拥塞），下一轮再试"
  exit 0
fi
tar -tzf /tmp/pull-blog.tgz >/dev/null 2>&1 || { echo "blog.tgz 校验失败"; exit 0; }
tar -tzf /tmp/pull-dist.tgz >/dev/null 2>&1 || { echo "dist.tgz 校验失败"; exit 0; }

set -e
mkdir -p $ROOT/blog && tar -xzf /tmp/pull-blog.tgz -C $ROOT/blog
rm -rf $ROOT/dist.new && mkdir -p $ROOT/dist.new
tar -xzf /tmp/pull-dist.tgz -C $ROOT/dist.new
rm -rf $ROOT/dist.prev
[ -d $ROOT/dist ] && mv $ROOT/dist $ROOT/dist.prev || true
mv $ROOT/dist.new $ROOT/dist
systemctl restart afterglow
echo "$updated" > $STAMP
rm -f /tmp/pull-blog.tgz /tmp/pull-dist.tgz
echo "[$(date '+%F %T')] 部署完成"
