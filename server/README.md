# 动态数据服务（点赞 / 阅读计数 / 管理后台）

站点本体是纯静态的，这个 Go 服务管两类事：

**访客数据**（谁都能碰）：

- **点赞** `/api/likes` —— 每（文章, 访客）一票，可点可取消；`site` 这个 slug 是首页的全站点赞
- **阅读** `/api/views` —— 每（文章, 访客, 天）记一次，同一人同一天重复打开不加数

**管理接口** `/api/admin/*`（要口令，见下）—— 网页管理台 `/admin` 的后端：
写文章、改站点数据（最近在读 / 此刻 / 歌单 / 友链 / 项目 / 分享 / 在用）、传图传音乐、触发构建。
所有改动都落成仓库里的文件（`src/content/posts/`、`src/data/`、`public/`），
不建内容数据库 —— git 仍是唯一事实源，改完记得提交。

访客身份是浏览器端生成的匿名随机 id，服务端**不存 IP / UA / 来路**；
限流用的 IP 只在内存里，进程重启即清。数据落在一个 SQLite 文件里。

## 本地跑起来

```bash
cd server
go build -o afterglow-api.exe .
./afterglow-api.exe -admin-pass 你的口令        # 默认 127.0.0.1:8787，数据库 ./afterglow.db
```

站点这边构建时告诉前端服务在哪：

```bash
PUBLIC_API_BASE=http://127.0.0.1:8787 pnpm build
```

不设 `PUBLIC_API_BASE` 就是纯本机模式：点赞只存访客自己的浏览器，「N 次阅读」整块不渲染。
管理台是例外 —— 没配时它默认连 `http://127.0.0.1:8787`，`pnpm dev` 免配置可用。

## 管理后台

- **开关**：`-admin-pass`（或环境变量 `ADMIN_PASSWORD`）。不设 = 整组接口不注册，对外零暴露。
- **入口**：站点的 `/admin`（noindex、不进 sitemap）。登录换 30 天会话 token（内存态，服务重启要重登）。
- **仓库位置**：`-blog-dir` 指博客仓库根目录，默认 `..`（服务就住在仓库的 server/ 里）。
- **生效方式**：本地 `pnpm dev` 下保存即热更新；部署后要重新构建 ——
  `-build-cmd "pnpm build"` 配上后，管理台概览页的「重新构建站点」按钮就能远程触发。
- **防护**：登录每 IP 每天限 20 次、口令常数时间比较、上传扩展名白名单、
  数据文件按白名单存取、slug/日期/封面路径都有格式校验。

## 部署到 2 核 2G 的小机子

**1. 在 Windows 上交叉编译**（纯 Go 实现，不需要 CGO，直接出 Linux 二进制）：

```bash
cd server
GOOS=linux GOARCH=amd64 go build -o afterglow-api .
scp afterglow-api root@你的服务器:/opt/afterglow/
```

**2. systemd 常驻**（`/etc/systemd/system/afterglow-api.service`）：

```ini
[Unit]
Description=afterglow blog api
After=network.target

[Service]
WorkingDirectory=/opt/afterglow
# 服务器上也想用管理台的话：把仓库 clone 到机器上，加
#   -admin-pass 你的口令 -blog-dir /opt/afterglow/blog -build-cmd "pnpm build"
ExecStart=/opt/afterglow/afterglow-api -addr 127.0.0.1:8787 -db /opt/afterglow/afterglow.db -origin https://你的域名
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now afterglow-api
```

**3. Caddy 反代**（自动 HTTPS；`X-Forwarded-For` 由它补，限流才认得出访客 IP）：

```
api.你的域名 {
    reverse_proxy 127.0.0.1:8787
}
```

服务只监听 127.0.0.1，公网进不来，只能从 Caddy 走。

**4. 站点构建时指向它**：`PUBLIC_API_BASE=https://api.你的域名 pnpm build`。

## 运维备忘

- **备份** = 拷走 `afterglow.db` 一个文件（`sqlite3 afterglow.db ".backup b.db"` 更稳）
- **带宽**：这个 API 每次应答几十字节，1M 带宽毫无压力；吃带宽的是静态资源，站点前面记得套 CDN
- **限流**：`-max-writes`（默认 200/IP/天）；被限到会返回 429，前端静默降级不报错
- **CORS**：`-origin` 生产上写成站点的完整来源（如 `https://blog.example.com`），默认 `*` 只适合本地调试
