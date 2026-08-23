# 服务端（点赞 / 阅读 / 在线 / 管理后台，可选静态托管）

一个 Go 二进制，两种开法：

- **纯 API 模式**（默认，生产用这个）：只管访客数据；站点静态产物丢给
  Vercel / Cloudflare Pages / GitHub Pages 托管 —— 服务器管好自己的事
- **全站模式**（`-site dist`，备选）：连静态产物一起扛 —— 除音乐外整站进内存、
  文本预压 brotli/gzip（首页 HTML 125KB → 17KB）、`_astro/` 带哈希资源
  immutable 一年、HTML 走 ETag 协商缓存（没改就 304 零字节）、音乐支持
  Range。平时用它**本地预演生产形态**；哪天不想依赖第三方平台了，加一个
  参数就能整站自托管

**访客接口**（谁都能碰）：

- **点赞** `/api/likes` —— 每（文章, 访客）一票，可点可取消；`site` 这个 slug 是首页的全站点赞
- **阅读** `/api/views` —— 每（文章, 访客, 天）记一次，同一人同一天重复打开不加数
- **合并** `/api/touch` —— 文章页专用：POST 一次 = 记阅读 + 返回 `{views, likes, liked, online}`，
  原来要两个请求，现在一个往返全办完（且是免预检的 CORS 简单请求）
- **在线** `/api/online` —— 最近 5 分钟活跃的匿名访客数，只进内存
- **热门** `/api/hot` —— 阅读榜前 N；服务端 30 秒微缓存 + 浏览器 60 秒缓存
- **GitHub** `/api/github` —— 仓库星数代理，全站共享一份小时级缓存
- **音乐** `/music/*`（配了 `-music` 才开）—— 音乐是版权物不进 git 仓库，
  文件躺在服务器的一个目录里由这里供给：Range（拖进度条）、一周缓存、按写进度
  续期的超时（慢网传整首歌不断线）、CORS（跨域场景下频谱采样和歌词 fetch 要它）

**管理接口** `/api/admin/*`（要口令，见下）—— 网页管理台 `/admin` 的后端：
写文章、改站点数据（最近在读 / 此刻 / 歌单 / 友链 / 项目 / 分享 / 在用）、传图传音乐、
触发构建（全站模式下构建完自动热替换静态缓存）、**统计**（近 30 天逐日阅读/访客/点赞 +
在线人数）、**友链巡检**（每 12 小时自动探一遍 blogroll 和 friends 的链接，死链无处躲）。
所有内容改动都落成仓库里的文件（`src/content/posts/`、`src/data/`、`public/`），
不建内容数据库 —— git 仍是唯一事实源，改完记得提交。

访客身份是浏览器端生成的匿名随机 id，服务端**不存 IP / UA / 来路**；
限流用的 IP 只在内存里，进程重启即清。数据落在一个 SQLite 文件里。

## 本地跑起来

```bash
cd server
go build -o afterglow-server.exe .
./afterglow-server.exe -admin-pass 你的口令        # 默认 127.0.0.1:8787，数据库 ./afterglow.db
```

站点这边构建时告诉前端服务在哪：

```bash
PUBLIC_API_BASE=http://127.0.0.1:8787 pnpm build
```

想在本地预演生产形态（Go 托管全站、同源 API）：

```bash
PUBLIC_API_BASE=same-origin pnpm build
./afterglow-server.exe -site ../dist        # 浏览器开 http://127.0.0.1:8787
```

不设 `PUBLIC_API_BASE` 就是纯本机模式：点赞只存访客自己的浏览器，「N 次阅读」整块不渲染。
管理台是例外 —— 没配时它默认连 `http://127.0.0.1:8787`，`pnpm dev` 免配置可用。

## 管理后台

- **开关**：`-admin-pass`（或环境变量 `ADMIN_PASSWORD`）。不设 = 整组接口不注册，对外零暴露
  （友链巡检也跟着这个开关走 —— 结果本来就只给站长看）。
- **口令强度是硬门槛**：不足 12 位、或含 afterglow / admin / password 这类看一眼
  仓库就能猜到的字样，服务直接拒绝启动。生成一个合格的（Git Bash 自带 openssl）：
  `openssl rand -base64 18`。仓库是公开的，口令是管理台唯一的门。
- **入口**：站点的 `/admin`（noindex、不进 sitemap）。登录换 30 天会话 token（内存态，服务重启要重登）。
- **仓库位置**：`-blog-dir` 指博客仓库根目录，默认 `..`（服务就住在仓库的 server/ 里）。
- **生效方式**：本地 `pnpm dev` 下保存即热更新；部署后要重新构建 ——
  `-build-cmd "pnpm build"` 配上后，管理台概览页的「重新构建站点」按钮就能远程触发；
  全站模式下构建成功会自动热替换内存里的静态缓存，不用重启进程。
- **防护**：登录每 IP 每天限 20 次且猜错一次强制等 400ms、口令常数时间比较、
  代理头只在直连对端是本机/内网时才采信（防伪造 X-Forwarded-For 洗限流桶）、
  上传扩展名白名单、数据文件按白名单存取、slug/日期/封面路径都有格式校验。

## 部署（分体）：前端交给平台，API 在 2 核 2G 的小机子

页面字节全走 Vercel / Cloudflare Pages / GitHub Pages 的 CDN，小机子跑数字接口 +
音乐供给（音乐不进仓库，构建产物里没有 —— 歌从这台机器的 `-music` 目录走，
160kbps 的流只占 1M 带宽的六分之一，个人博客的并发绰绰有余）。

**1. API 与音乐上机**（Windows 上交叉编译，纯 Go 不需要 CGO）：

```bash
cd server
GOOS=linux GOARCH=amd64 go build -o afterglow-server .
scp afterglow-server root@你的服务器:/opt/afterglow/
scp -r ../public/music root@你的服务器:/opt/afterglow/music   # 歌与歌词（本地这份是 gitignored 的）
```

**2. systemd 常驻**（`/etc/systemd/system/afterglow-api.service`）：

```ini
[Unit]
Description=afterglow blog api
After=network.target

[Service]
WorkingDirectory=/opt/afterglow
# 服务器上也想用管理台的话：把仓库 clone 到机器上，加
#   -admin-pass 你的口令 -blog-dir /opt/afterglow/blog
# （构建与发布都在平台侧做，-build-cmd 在分体形态下一般用不上。
#   配了 -music 后，管理台传歌直接落 /opt/afterglow/music，不碰仓库）
ExecStart=/opt/afterglow/afterglow-server -addr 127.0.0.1:8787 -db /opt/afterglow/afterglow.db -music /opt/afterglow/music -origin https://你的站点域名
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

**4. 前端构建时指向它**：平台侧构建环境变量设
`PUBLIC_API_BASE=https://api.你的域名`，音乐同理 `PUBLIC_MUSIC_BASE=https://api.你的域名`
（播放器会自动给跨域音源挂 `crossorigin`，频谱与歌词都正常）。
`-origin` 必须写成站点的完整来源（协议 + 域名），否则浏览器会拦下跨域应答。

**5. 管理台安全头在平台侧补齐**：全站模式下这俩头由 static.go 下发 ——
HTML 一律 `Referrer-Policy: strict-origin-when-cross-origin`，`/admin` 页
另加 `X-Frame-Options: DENY`（防点击劫持）。分体部署时前端字节不经过本服务，
得在托管平台配置同样两条：Vercel 用 `vercel.json` 的 `headers` 字段，
Cloudflare Pages 在 `public/_headers` 写：

```
/*
  Referrer-Policy: strict-origin-when-cross-origin
/admin/*
  X-Frame-Options: DENY
```

（GitHub Pages 不支持自定义响应头 —— 要挂管理台就别选它。）

**跨域的账已经算过**：公开接口的 POST 故意不带 JSON 头（见 src/scripts/api.ts），
属于 CORS「简单请求」，浏览器不发 OPTIONS 预检 —— 分体部署不为跨域多付往返。

## 备选：全站一个进程（`-site dist`）

不想依赖第三方平台、或平台对你的读者不友好时，一个参数整站自托管：

```ini
ExecStart=… -site /opt/afterglow/blog/dist -music /opt/afterglow/music -origin https://你的域名
```

（音乐不在仓库里，所以服务器上构建出的 dist 也没有它 —— `-music` 指到歌所在的
目录即可，`/music/*` 的路由优先级比静态托管高。本地预演时 public/music 还在磁盘上，
构建会照常把它带进 dist，不用配。）

Caddy 就一条 `你的域名 { reverse_proxy 127.0.0.1:8787 }`，前端构建用
`PUBLIC_API_BASE=same-origin`（同源，连简单请求的 CORS 头都不需要了；
Linux 下写 `/` 等价，但 Windows 的 Git Bash 会把单个 `/` 路径转换成 Git
安装目录，务必用 `same-origin`）。细节见 static.go 顶部注释。
这个模式平时也是**本地预演生产**的工具：

```bash
PUBLIC_API_BASE=same-origin pnpm build
./afterglow-server.exe -site ../dist     # 浏览器开 http://127.0.0.1:8787
```

## 运维备忘

- **备份** = 拷走 `afterglow.db` 一个文件（`sqlite3 afterglow.db ".backup b.db"` 更稳）
- **带宽**：分体形态下页面字节都在平台 CDN 上，这台机器出 JSON 数字 + 音乐流。
  160kbps 一路流约占 20KB/s（1M ≈ 128KB/s），听歌的人多到六个并发才会挤 ——
  个人博客到不了这个量级；真到了就把 mp3 转 128kbps 或给 /music/* 单独套 CDN
- **限流**：`-max-writes`（默认 200/IP/天）；被限到会返回 429，前端静默降级不报错
- **CORS**：`-origin` 生产上写成站点的完整来源（如 `https://blog.example.com`），
  默认 `*` 只适合本地调试；同源备选形态用不上它
- **内存**（仅 `-site` 模式相关）：除音乐外的产物载进内存（当前 ~5MB + 压缩副本
  ~0.6MB），超过 1MB 的单文件自动改走磁盘流式，音乐传多少都不吃内存
