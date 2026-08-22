# 动态数据服务（点赞 / 阅读计数）

站点本体是纯静态的，这个 Go 服务只管两件访客产生的数据：

- **点赞** `/api/likes` —— 每（文章, 访客）一票，可点可取消；`site` 这个 slug 是首页的全站点赞
- **阅读** `/api/views` —— 每（文章, 访客, 天）记一次，同一人同一天重复打开不加数

访客身份是浏览器端生成的匿名随机 id，服务端**不存 IP / UA / 来路**；
限流用的 IP 只在内存里，进程重启即清。数据落在一个 SQLite 文件里。

## 本地跑起来

```bash
cd server
go build -o firefly-api.exe .
./firefly-api.exe                       # 默认 127.0.0.1:8787，数据库 ./firefly.db
```

站点这边构建时告诉前端服务在哪：

```bash
PUBLIC_API_BASE=http://127.0.0.1:8787 pnpm build
```

不设 `PUBLIC_API_BASE` 就是纯本机模式：点赞只存访客自己的浏览器，「N 次阅读」整块不渲染。

## 部署到 2 核 2G 的小机子

**1. 在 Windows 上交叉编译**（纯 Go 实现，不需要 CGO，直接出 Linux 二进制）：

```bash
cd server
GOOS=linux GOARCH=amd64 go build -o firefly-api .
scp firefly-api root@你的服务器:/opt/firefly/
```

**2. systemd 常驻**（`/etc/systemd/system/firefly-api.service`）：

```ini
[Unit]
Description=firefly blog api
After=network.target

[Service]
WorkingDirectory=/opt/firefly
ExecStart=/opt/firefly/firefly-api -addr 127.0.0.1:8787 -db /opt/firefly/firefly.db -origin https://你的域名
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now firefly-api
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

- **备份** = 拷走 `firefly.db` 一个文件（`sqlite3 firefly.db ".backup b.db"` 更稳）
- **带宽**：这个 API 每次应答几十字节，1M 带宽毫无压力；吃带宽的是静态资源，站点前面记得套 CDN
- **限流**：`-max-writes`（默认 200/IP/天）；被限到会返回 429，前端静默降级不报错
- **CORS**：`-origin` 生产上写成站点的完整来源（如 `https://blog.example.com`），默认 `*` 只适合本地调试
