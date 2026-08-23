# 余晖录 · AFTERGLOW NOTES

一个**个人学习项目**：从 Pencil 设计稿到前后端代码都是练手之作，边搭边学，不定期推翻重来。

博客本体是 Astro 静态站；点赞 / 阅读 / 在线人数 / 网页管理台由一个 Go 单二进制承担 ——
它还能顺手把整个静态站托管了（内存 + brotli 预压缩），2 核 2G、1M 带宽的小机子就够跑全站。

## 特性

**读者看到的**：像素级还原设计稿的界面 · 明暗主题（圆形揭示切换）· 瞬时换页 + 卡片错峰入场 ·
双布局模式（原版 / 紧凑）· Pagefind 全文搜索 · 跨页不断的音乐播放器（歌词跟随 · 顺序 / 随机 / 单曲循环）·
RSS / Sitemap / 每页自动生成 OG 图 · 中文字体子集化（每字重 1.1MB → 约 170KB）

**站长用到的**：网页管理台（写文章、改站点数据、传图传歌、看统计曲线、友链巡检、远程触发构建）·
点赞 / 阅读 / 在线人数（匿名聚合，不存 IP / UA，细节见 `server/main.go` 顶部注释）·
GitHub 星数代理（全站共享缓存）· 所有内容改动落成仓库文件，**git 是唯一事实源**

## 界面预览

|                      首页 · 浅色                      |                     首页 · 深色                      |
| :---------------------------------------------------: | :--------------------------------------------------: |
| ![首页 · 浅色](docs/screenshots/home-light.webp) | ![首页 · 深色](docs/screenshots/home-dark.webp) |
|                      **文章页**                       |                     **我的项目**                     |
|      ![文章页](docs/screenshots/post.webp)       |  ![我的项目](docs/screenshots/projects.webp)   |

> 统一 1600 × 900 视口截取。明暗主题与双布局都能在侧栏一键切换，换页零白屏。

## 架构

```
方式 A · 分体（推荐）                        方式 B · 单机全站
┌────────┐    静态字节     ┌──────────────┐   ┌────────┐        ┌──────────────────┐
│ 浏览器  │ ◄────────────  │ Vercel / CF   │   │ 浏览器  │ ◄────► │ Caddy(TLS)        │
│        │                │ Pages / GH    │   └────────┘        │   └► Go 服务       │
│        │    /api/*      └──────────────┘                      │      ├ 静态站(内存) │
│        │ ◄────────────► Caddy ► Go+SQLite                     │      └ /api/*+SQLite│
└────────┘               （2核2G 小机子）                        └──────────────────┘
```

没有服务器也能跑：不配 `PUBLIC_API_BASE` 就是纯静态博客 —— 点赞只存访客本机浏览器、
阅读数和「大家在看」整块不渲染（不编数字），其余功能全部照常。

## 本地跑起来

前置：Node ≥ 22.12、pnpm；想要动态数据 / 管理台再装 Go ≥ 1.27。

```bash
pnpm install
pnpm dev                  # 博客本体 http://localhost:4321（自动先跑中文字体子集化）
```

可选：把 Go 服务也拉起来（`.env` 已把 `PUBLIC_API_BASE` 指向它，点赞 / 阅读 / 管理台即刻可用）：

```bash
cd server
go build -o afterglow-server.exe .
ADMIN_PASSWORD="$(openssl rand -base64 18)" ./afterglow-server.exe -blog-dir ..
# 口令有硬门槛：不足 12 位、或含 afterglow/admin/password 字样会直接拒绝启动
```

预演生产形态（Go 托管全站、同源 API，看真实的压缩与缓存效果）：

```bash
PUBLIC_API_BASE=same-origin pnpm build
cd server && ./afterglow-server.exe -site ../dist    # 浏览器开 http://127.0.0.1:8787
```

## 部署你自己的余晖录

### 方式 A：前端交给平台，API 放小机子（推荐）

**1. 前端** —— 仓库连到 Vercel / Cloudflare Pages / GitHub Pages 任意一家：

| 设置 | 值 |
|---|---|
| 构建命令 | `pnpm build` |
| 输出目录 | `dist` |
| Node 版本 | 22（Vercel 认 `engines` 自动选；CF Pages 设环境变量 `NODE_VERSION=22`；GH Pages 用 [withastro/action](https://github.com/withastro/action)） |
| 环境变量 | `PUBLIC_API_BASE=https://api.你的域名`（没有服务器就不设，纯静态降级） |

**2. API** —— 小机子上 systemd 常驻 + Caddy 反代 `api.你的域名`，
完整步骤（交叉编译、service 文件、Caddyfile）见 [`server/README.md`](server/README.md)。
`-origin` 记得写成站点的完整来源（如 `https://blog.example.com`），否则浏览器会拦下跨域应答。

### 方式 B：一台小机子整站自托管

不想依赖第三方平台：构建用 `PUBLIC_API_BASE=same-origin`，服务启动加 `-site dist`，
Caddy 只剩一行 `你的域名 { reverse_proxy 127.0.0.1:8787 }`。
静态文本已在服务端预压 brotli（约 1/7）+ 带哈希资源缓存一年，1M 带宽跑页面绰绰有余；
细节与运维备忘同见 [`server/README.md`](server/README.md)。

没有域名也能上：服务直接 `-addr :80` 监听，浏览器用 `http://服务器IP` 访问（云厂商的
备案拦截认域名，纯 IP 不受影响）；管理台登录建议走 SSH 隧道，口令不过明文公网。
两个脚本把整套流程包好了（目标机器用环境变量 `AFTERGLOW_HOST` / `AFTERGLOW_URL`
覆盖，或直接改脚本顶部默认值）：

```bash
bash scripts/deploy-setup.sh   # 首次 / 更新服务端：交叉编译上传二进制 + 管理口令 + systemd
bash scripts/deploy.sh         # 日常发布：构建 → 增量同步歌曲与仓库快照 → 原子换 dist → 重启 → 体检
```

### 方式 C：完全不要服务器（一键免费托管）

只想要博客本体、不想碰服务器：**什么环境变量都不用配**，构建出来就是纯静态形态 ——
点赞退化为只存访客本机浏览器；阅读数 / 「大家在看」/ 在线人数整块不渲染（不编数字）；
音乐没有歌源自动闲置。页面、搜索、明暗主题、双布局、动效、RSS / Sitemap / OG 图、
字体子集化全部照常。以后想要真计数了，随时按方式 A 补一台小机子 —— 前端只需加一个
环境变量重新构建。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FQssssY%2FAfterGlow-Notes)

📖 **零基础保姆级教程（一键部署 → 改成你的博客 → 网页上写文章，附四段复制即用的
AI 指令）：[docs/easy-deploy.md](docs/easy-deploy.md)** —— 没有服务器就没有管理台，
但 **GitHub 网页就是你的管理台**：改文件提交，平台自动重建上线，教程手把手教。

- **Vercel**：点上面的按钮 → 登录 → Create，一分钟出站。建议在项目 Settings →
  Environment Variables 加 `PUBLIC_SITE_URL=https://你的地址`，RSS / Sitemap / OG 的
  绝对链接才正确
- **Cloudflare Pages**：fork 后到 Dashboard → Workers & Pages → 连接仓库，构建命令
  `pnpm run build`、输出目录 `dist`，环境变量 `NODE_VERSION=22`（可选 `PUBLIC_SITE_URL`）
- **GitHub Pages**：fork 并把仓库改名为 `<你的用户名>.github.io` → Settings → Pages →
  Source 选「GitHub Actions」→ 启用并运行 `pages` 工作流，之后每次 push 自动重发
  （细节见 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 顶部注释；站内
  链接是根路径写法，必须用根域仓库名或绑自定义域名）

fork 之后把内容换成你自己的：见下方「变成你自己的博客」。

### 上线前检查单

- [ ] `astro.config.mjs` 的 `site` 换成你的正式域名（RSS / Sitemap / OG 图的绝对链接靠它）
- [ ] 管理口令换成随机串（`openssl rand -base64 18`），只写进服务器的 systemd 配置
- [ ] `-origin` 写站点完整来源（方式 B 同源则无所谓）
- [ ]（可选）`GITHUB_TOKEN` 环境变量：把 GitHub 代理的配额从 60 提到 5000 次/时，一般用不上

### 环境变量与启动参数

| 名字 | 给谁 | 说明 |
|---|---|---|
| `PUBLIC_API_BASE` | 前端构建 | Go 服务地址；`same-origin` = 同源（方式 B，Linux 下写 `/` 也行，Windows Git Bash 只能用 `same-origin`——`/` 会被 MSYS 路径转换偷换）；不设 = 纯静态降级 |
| `ADMIN_PASSWORD` / `-admin-pass` | Go 服务 | 管理台口令，不设则管理接口整组不注册；有强度硬门槛 |
| `-site` | Go 服务 | 静态站目录（dist），设了就整站托管 |
| `-blog-dir` | Go 服务 | 博客仓库根目录（管理台读写文章与数据），默认 `..` |
| `-build-cmd` / `BLOG_BUILD_CMD` | Go 服务 | 如 `pnpm build`：管理台「重新构建」按钮的执行内容 |
| `PUBLIC_MUSIC_BASE` | 前端构建 | 音乐来源前缀；分体部署设 `https://api.你的域名`（音乐不进仓库，产物里没有）；本地 / 单机不设 |
| `-music` | Go 服务 | 音乐目录，设了就在 `/music/*` 供给；管理台传歌也落这里 |
| `-origin` | Go 服务 | CORS 允许来源；`-db`、`-addr`、`-max-writes` 见 `-h` |
| `GITHUB_TOKEN` | Go 服务 | 可选，提 GitHub API 配额 |

## 变成你自己的博客

fork 下来的是「我的余晖录」，这些地方换成你的（大部分在管理台 `/overview` 里点点就行，
改动全部落成仓库文件，改完记得提交）：

- **站点信息**：站名 / 作者 / 邮箱 / 简介 / 细则 → 管理台「站点数据 · 站点信息」（`src/data/site.json`）
- **文章**：清掉 `src/content/posts/*.md` 换成你的。front-matter 字段：
  `title` / `description` / `date` / `updated` / `tags` / `category` / `cover`（封面放 `src/content/posts/_covers/`）/ `draft`
- **首页与关于页的活数据**：在读 / 此刻 / 在用 / 更新日志 / 友链 / 项目 / 推荐分享 → 管理台各页签（`src/data/*.json`）
- **音乐**：版权物不进仓库（`public/music/` 已 gitignore）。本地把 mp3（和可选的 `.lrc` 歌词）
  丢进 `public/music/` 即可预览；分体部署时歌放服务器的 `-music` 目录（管理台传歌会自动落那里），
  前端构建加 `PUBLIC_MUSIC_BASE=https://api.你的域名`。**请只使用你有权使用的曲目**
- **图片**：头像等站点图片、友链头像、项目配图都从管理台上传（自动归位到 `images/` 对应目录）
- **设计**：`blog.pen` 是 Pencil 设计源文件（用 Pencil 应用打开）；设计 token（颜色 / 圆角 / 玻璃卡）
  都定义在 `src/styles/global.css` 的 `:root` / `.dark` 里（`@theme inline` 引用它们），改这里全站生效
- **结构常量**：导航、建站起始日等在 `src/config.ts`

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Astro 7（SSG + View Transitions）· Tailwind CSS 4 · TypeScript |
| 内容 | Markdown（Content Collections）+ `src/data/*.json`，git 即事实源 |
| 动态数据 | Go + SQLite（`server/`，modernc 纯 Go 实现免 CGO）：点赞、阅读、在线、GitHub 代理、静态托管、管理后台 |
| 搜索 / 图 | Pagefind 全文搜索 · satori + resvg 构建期生成 OG 图 · sharp 图片处理 |

## 目录一览

```
src/content/posts/   文章（front-matter + Markdown），_covers/ 放封面
src/data/            站点数据 JSON（管理台的写入目标）
src/components/      按页面分组的 Astro 组件
src/styles/          global.css（设计 token 在此）+ admin.css
server/              Go 服务：main / static / visitors / linkcheck / admin / github
scripts/             字体子集化、占位图生成
public/music/        歌单文件（mp3 + lrc；gitignored —— 版权物不进仓库）
blog.pen             Pencil 设计源文件
```

## 致谢

界面与工程上大量借鉴了两个优秀的开源博客，特此感谢：

- **[CuteLeaf / Firefly](https://github.com/CuteLeaf/Firefly)** —— 界面雏形与 Astro 静态站基础设施（Markdown 插件链、Pagefind 搜索、OG 图、字体子集化等思路均参考自它）
- **[YYsuni / 2025-blog-public](https://github.com/YYsuni/2025-blog-public)** —— 紧凑布局模式、「从不钉超过一屏」的粘性策略、首页七段数码管大时钟

站里学来的每一处，代码注释里都注明了出处。

## 许可

代码以 [MIT](LICENSE) 许可开源；文章与图片内容采用
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh) 授权（转载注明出处、不得商用）。
仓库不含任何音乐文件（版权物不随代码分发，git 历史亦已清理）；
歌单数据只存曲名与文件名，**请只在自己的部署里使用有权使用的曲目**。
