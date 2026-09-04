#!/usr/bin/env bash
# 余晖录 · 首次部署 / 服务端二进制更新（日常发布用 scripts/deploy.sh）
#
#   AFTERGLOW_HOST=root@服务器IP bash scripts/deploy-setup.sh   # 首次：编译上传二进制 + 生成口令 + systemd + 全量内容
#   FORCE_NEW_PASS=1 AFTERGLOW_HOST=root@服务器IP bash scripts/deploy-setup.sh
#                                                # 强制换新管理口令（默认沿用服务器上现有的）
#   MUSIC_API_KIND=unified MUSIC_API_BASE=http://127.0.0.1:9000 AFTERGLOW_HOST=... bash scripts/deploy-setup.sh
#                                                # 服务器上自建了统一音源层时这么覆盖
#                                                # （缺省用公共接口，见下方 MUSIC_API 的说明）
#
# 前提：本机有 go / node(≥22) / git / ssh，且能免密登录 $HOST。
# 服务端是纯 Go（modernc SQLite），Windows/macOS 上都能直接交叉编译 linux/amd64。
# 重复执行安全：二进制会更新，口令与数据库(afterglow.db)保持不动。
# 连接信息不进仓库（见 deploy.sh 顶部说明）：AFTERGLOW_HOST 必填，URL 缺省由 HOST 推导。
set -euo pipefail
HOST="${AFTERGLOW_HOST:?缺 AFTERGLOW_HOST（例：AFTERGLOW_HOST=root@服务器IP bash scripts/deploy-setup.sh）}"
SITE_URL="${AFTERGLOW_URL:-http://${HOST#*@}}"
ROOT=/opt/afterglow

cd "$(dirname "$0")/.."
command -v go >/dev/null || { echo "缺 go（用于交叉编译 server/）"; exit 1; }
command -v openssl >/dev/null || { echo "缺 openssl（用于生成管理口令）"; exit 1; }

echo "==> 交叉编译 linux/amd64"
(cd server && GOOS=linux GOARCH=amd64 go build -o afterglow-server-linux .)

echo "==> 上传二进制到 $ROOT/afterglow-server"
ssh "$HOST" "mkdir -p $ROOT $ROOT/music $ROOT/blog && systemctl stop afterglow 2>/dev/null || true"
scp -q server/afterglow-server-linux "$HOST:$ROOT/afterglow-server"
ssh "$HOST" "chmod +x $ROOT/afterglow-server"

echo "==> 管理口令（沿用已有；没有才新生成）"
PASS=$(ssh "$HOST" "sed -n 's/^Environment=ADMIN_PASSWORD=//p' /etc/systemd/system/afterglow.service 2>/dev/null" || true)
NEW_PASS=0
if [ -z "$PASS" ] || [ "${FORCE_NEW_PASS:-0}" = 1 ]; then
  PASS=$(openssl rand -base64 18)
  NEW_PASS=1
fi

# 在线找歌的音源（管理台「正在听」页签用）。Go 的默认值是本机自建统一层
# (127.0.0.1:9000)，那是**本地开发**的形态 —— 服务器上没有这一层，照默认跑
# 只会得到 "connect: connection refused"（实测踩过）。所以这里默认给公共接口，
# 服务器实测可直连；要在服务器上自建统一层时用 MUSIC_API_BASE/KIND 覆盖。
MUSIC_KIND="${MUSIC_API_KIND:-gdstudio}"
MUSIC_API="${MUSIC_API_BASE:-https://music-api.gdstudio.xyz/api.php}"

echo "==> 专用运行账号 afterglow（不用 root 跑网络服务；:80 由能力位放行）"
# 管理接口会写文件、可执行 -build-cmd —— 万一被打穿，root 与普通账号是两种后果。
# 数据目录整棵归它（含已有的 afterglow.db），deploy.sh / pull-deploy.sh 每次传完也会 chown
ssh "$HOST" "id -u afterglow >/dev/null 2>&1 || useradd --system --home-dir $ROOT --shell /usr/sbin/nologin afterglow
  chown -R afterglow:afterglow $ROOT"

echo "==> 写 systemd 单元（含口令，权限 600）并设为开机自启"
ssh "$HOST" "cat > /etc/systemd/system/afterglow.service && chmod 600 /etc/systemd/system/afterglow.service && systemctl daemon-reload && systemctl enable afterglow" <<UNIT
[Unit]
Description=AfterGlow Notes (static site + API, same-origin)
After=network-online.target

[Service]
User=afterglow
Group=afterglow
WorkingDirectory=$ROOT
Environment=ADMIN_PASSWORD=$PASS
# Environment=GITHUB_TOKEN=可选：把 GitHub 代理配额从 60 提到 5000 次/时
ExecStart=$ROOT/afterglow-server -addr :80 -site $ROOT/dist -music $ROOT/music -blog-dir $ROOT/blog -db $ROOT/afterglow.db -origin $SITE_URL -music-api $MUSIC_API -music-api-kind $MUSIC_KIND
Restart=always
RestartSec=3
# 非 root 绑 :80 只要这一个能力位；其余全部收紧：文件系统只读、只放行数据目录，
# 私有 /tmp（上传的临时分片落这儿），禁止提权
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$ROOT
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

echo "==> 自取部署脚本 + 5 分钟定时器（CI 发 Release、服务器自己来拿，见 .github/workflows/deploy.yml）"
# 脚本以 root 跑（要 restart 服务、chown 数据目录）；每次执行 setup 都会把仓库里的最新版推上去
scp -q scripts/pull-deploy.sh "$HOST:$ROOT/pull-deploy.sh"
ssh "$HOST" "chmod +x $ROOT/pull-deploy.sh && cat > /etc/systemd/system/afterglow-pull.service <<'SVC'
[Unit]
Description=AfterGlow pull-deploy (fetch latest Release and swap in)
After=network-online.target

[Service]
Type=oneshot
ExecStart=$ROOT/pull-deploy.sh
SVC
cat > /etc/systemd/system/afterglow-pull.timer <<'TMR'
[Unit]
Description=AfterGlow pull-deploy every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
TMR
systemctl daemon-reload && systemctl enable --now afterglow-pull.timer"

echo "==> SSH 加固 + 防火墙（幂等；前提是本机密钥已能免密登录，否则会把自己锁外面）"
ssh "$HOST" 'set -e
  printf "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n" > /etc/ssh/sshd_config.d/99-hardening.conf
  sshd -t && systemctl restart ssh
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null'

echo "==> 首次内容部署（构建 + 传站 + 起服务 + 体检）"
bash scripts/deploy.sh

echo
echo "================ 收尾信息 ================"
if [ "$NEW_PASS" = 1 ]; then
  echo "管理台口令（只显示这一次，请转交站长妥善保存）："
  echo "    $PASS"
else
  echo "管理台口令沿用服务器现有配置（查看：ssh 后 grep ADMIN_PASSWORD /etc/systemd/system/afterglow.service）"
fi
echo "站点：$SITE_URL    管理台：$SITE_URL/overview"
echo "提醒：管理台登录走明文 HTTP，建议通过 SSH 隧道使用 ——"
echo "    ssh -L 8080:127.0.0.1:80 $HOST 之后浏览器开 http://localhost:8080/overview"
echo "首页不通先查：云控制台安全组是否放行 TCP 80"
