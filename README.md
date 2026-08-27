<div align="center">

# 余晖录 · AFTERGLOW NOTES

**一个从零手写的个人博客** —— Astro 静态站 + Go 单二进制后端，也可以完全不要服务器

[![deploy](https://img.shields.io/github/actions/workflow/status/QssssY/AfterGlow-Notes/deploy.yml?branch=main&label=deploy&logo=githubactions&logoColor=white)](https://github.com/QssssY/AfterGlow-Notes/actions/workflows/deploy.yml)
[![license](https://img.shields.io/github/license/QssssY/AfterGlow-Notes?label=license)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro_7-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![Tailwind](https://img.shields.io/badge/Tailwind_4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Go](https://img.shields.io/badge/Go_1.27-00ADD8?logo=go&logoColor=white)](server/)

一个**个人学习项目**：界面到前后端代码全是自己一行行写出来的练手之作，边搭边学，不定期推翻重来。

⚡ [三分钟拥有自己的一份（零代码 · 零服务器 · 免费）](docs/easy-deploy.md) ·
🖥 [服务端部署手册](server/README.md)

</div>

## 界面预览

|                      首页 · 浅色                      |                     首页 · 深色                      |
| :---------------------------------------------------: | :--------------------------------------------------: |
| ![首页 · 浅色](docs/screenshots/home-light.webp) | ![首页 · 深色](docs/screenshots/home-dark.webp) |
|                      **文章页**                       |                     **我的项目**                     |
|      ![文章页](docs/screenshots/post.webp)       |  ![我的项目](docs/screenshots/projects.webp)   |

更多形态 —— 紧凑布局（导航缩成图标条，内容更宽）· 深色阅读页 · 移动端：

|                 紧凑布局 · 文章列表                 |                  文章页 · 深色                  |
| :-------------------------------------------------: | :---------------------------------------------: |
| ![紧凑布局](docs/screenshots/compact-archive.webp) | ![文章页 · 深色](docs/screenshots/post-dark.webp) |

移动端（底部 TabBar · 单列流 · 文章页目录）：

|                    首页                    |                     文章列表                     |                    文章页                    |
| :----------------------------------------: | :----------------------------------------------: | :------------------------------------------: |
| ![移动端首页](docs/screenshots/mobile-home.webp) | ![移动端文章列表](docs/screenshots/mobile-archive.webp) | ![移动端文章页](docs/screenshots/mobile-post.webp) |

> 桌面统一 1600 × 900 视口、移动端 420 × 880 截取。明暗主题与双布局都能在侧栏一键切换，换页零白屏。

## 特性

**读者看到的**：逐像素打磨的界面 · 明暗主题（圆形揭示切换）· 瞬时换页 + 卡片错峰入场 ·
双布局模式（原版 / 紧凑）· Pagefind 全文搜索 · 跨页不断的音乐播放器（歌词跟随 · 顺序 / 随机 / 单曲循环）·
独立听歌页 `/music`（整篇歌词点句跳转 · 歌单搜索）·
RSS / Sitemap / 每页自动生成 OG 图 · 中文字体子集化（每字重 1.1MB → 约 170KB）

**站长用到的**：网页管理台 `/overview`（写文章、改站点数据、传图、配色、统计曲线、友链巡检），
**双后端**——有服务器走 Go 服务，纯静态托管自动切 **GitHub 直连模式**（细粒度令牌登录，
保存即提交、平台自动重建）· 点赞 / 阅读 / 在线人数（匿名聚合，不存 IP / UA）·
所有内容改动落成仓库文件，**git 是唯一事实源**

## 部署：按你手上有什么选

| | 需要什么 | 得到什么 |
|---|---|---|
| **方式 A · 前端平台 + API 小机子** | 低配 VPS + 域名 | 全部功能；页面走平台 CDN，服务器只出 JSON 和音乐 |
| **方式 B · 单机整站** | 低配 VPS（可无域名） | 全部功能；一个进程托管一切，纯 IP 也能跑 |
| **方式 C · 零服务器** | 一个 GitHub 账号 | 完整博客 + 管理台（GitHub 直连）；点赞仅存访客本机，阅读数 / 在线不渲染 |

> 只想白嫖、不碰服务器 → 直接看**方式 C**（附保姆级教程）；手上有小机子再看 A / B。

### 方式 A：前端交给平台，API 放小机子

前端连到任意平台（构建命令 `pnpm build`、输出 `dist`、Node 22），环境变量设
`PUBLIC_API_BASE=https://api.你的域名`；小机子上 systemd 常驻 Go 服务 + Caddy 反代。
完整步骤（交叉编译、service 文件、Caddyfile、`-origin` 跨域）见
[`server/README.md`](server/README.md)。

### 方式 B：一台小机子整站自托管

构建用 `PUBLIC_API_BASE=same-origin`，服务启动加 `-site dist` —— 静态文本预压
brotli（约 1/7）+ 哈希资源缓存一年，低配小机子跑全站绰绰有余；没有域名就 `-addr :80`
纯 IP 直跑。仓库自带两个脚本（连接信息走环境变量，不进仓库）：

```bash
AFTERGLOW_HOST=root@服务器IP bash scripts/deploy-setup.sh   # 首次：编译上传 + 管理口令 + systemd
AFTERGLOW_HOST=root@服务器IP bash scripts/deploy.sh         # 日常：构建 → 增量同步 → 原子换 dist → 体检
```

本仓库自己的发布走 CI：push → GitHub Actions 构建发 Release → 服务器定时自取
（[.github/workflows/deploy.yml](.github/workflows/deploy.yml) 顶部有这么设计的原因）。

### 方式 C：零服务器，一键免费托管

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FQssssY%2FAfterGlow-Notes)

什么环境变量都不用配，构建出来就是纯静态形态。管理台照样有：`/overview` 走
GitHub 直连模式 —— 粘贴一个细粒度令牌，写文章 / 改数据 / 传图 / 调配色都在网页里，
保存 = git 提交 = 平台自动重建（思路致敬 [YYsuni 的 /write](https://github.com/YYsuni/2025-blog-public)）。

📖 **从注册到发出第一篇文章的保姆级教程（Vercel / CF Pages / GitHub Pages 三选一，
附复制即用的 AI 指令）：[docs/easy-deploy.md](docs/easy-deploy.md)**

## 本地跑起来

前置：Node ≥ 22.12、pnpm；想要动态数据 / 管理台再装 Go ≥ 1.27。

```bash
pnpm install
pnpm dev                  # http://localhost:4321（自动先跑中文字体子集化）
```

可选：拉起 Go 服务（`.env` 把 `PUBLIC_API_BASE` 指向它，点赞 / 阅读 / 管理台即刻可用）：

```bash
cd server
go build -o afterglow-server.exe .
ADMIN_PASSWORD="$(openssl rand -base64 18)" ./afterglow-server.exe -blog-dir ..
```

预演生产形态（Go 托管全站、同源 API）：`PUBLIC_API_BASE=same-origin pnpm build`，
然后 `cd server && ./afterglow-server.exe -site ../dist`，浏览器开 `http://127.0.0.1:8787`。

## 配置参考

| 名字 | 给谁 | 说明 |
|---|---|---|
| `PUBLIC_API_BASE` | 前端构建 | Go 服务地址；`same-origin` = 同源（方式 B；Windows Git Bash 别写 `/`，会被 MSYS 路径转换偷换）；**不设 = 纯静态形态，管理台自动切 GitHub 直连** |
| `PUBLIC_SITE_URL` | 前端构建 | 站点正式地址（RSS / Sitemap / OG 绝对链接），一键托管平台在环境变量里给 |
| `PUBLIC_MUSIC_BASE` | 前端构建 | 音乐来源前缀；分体部署设 `https://api.你的域名`（音乐不进仓库） |
| `ADMIN_PASSWORD` / `-admin-pass` | Go 服务 | 管理台口令；不设则管理接口整组关闭；弱口令直接拒绝启动 |
| `-site` / `-music` / `-blog-dir` | Go 服务 | 静态站目录（设了就整站托管）/ 音乐目录 / 仓库根目录 |
| `-origin` | Go 服务 | CORS 允许来源（方式 A 写站点完整地址）；`-db` `-addr` `-max-writes` 见 `-h` |
| `GITHUB_TOKEN` | Go 服务 | 可选：GitHub 代理配额 60 → 5000 次/时 |

上线前过一眼：站点地址（`PUBLIC_SITE_URL` 或 `astro.config.mjs` 的 `site`）、
管理口令换随机串、方式 A 的 `-origin`。

## 变成你自己的博客

fork 下来的是「我的余晖录」，这些地方换成你的（大部分在管理台 `/overview` 里点点就行，
改动全部落成仓库文件）：

> ⚠️ **先做这一步**：仓库里带着**原作者内容的英日译文**（`src/data/*.{en,ja}.json`，
> 以及 `src/content/posts/{en,ja}/` 下的一篇示例译文）。译文是独立文件，改基准不会带着
> 它一起变 —— 不清掉的话，中文站是你的、英文站还是别人的（站名、简介这类字段名相同
> 就直接盖上，不报错，只是静默说错话）。fork 后先跑：
>
> ```bash
> rm -f src/data/*.en.json src/data/*.ja.json
> rm -rf src/content/posts/en src/content/posts/ja
> ```
>
> 清掉之后英日站的**界面仍然是全译的**（界面字典与内容无关），文章按你写作时的语言呈现。
> 之后随时用 `pnpm i18n` 看站点数据译到什么程度、有没有和基准错位。

- **站点信息**：站名 / 作者 / 邮箱 / 简介 / 细则 → 管理台「站点数据 · 站点信息」（`src/data/site.json`）
- **文章**：清掉 `src/content/posts/*.md`（和上面的 `en/` `ja/`）换成你的。front-matter 字段：
  `title` / `description` / `date` / `updated` / `tags` / `category` / `cover`（封面放 `_covers/`）/ `draft`。
  用什么语言写就用什么语言展示，不必配译文（见下面的「多语言」一节）
- **活数据**：在读 / 此刻 / 在用 / 更新日志 / 友链 / 项目 / 推荐分享 → 管理台各页签（`src/data/*.json`）
- **图片**：头像、友链头像、项目配图都从管理台上传（自动归位到 `images/` 对应目录）
- **音乐**：版权物不进仓库（`public/music/` 已 gitignore）。本地丢进 `public/music/` 即可预览；
  有服务器时放 `-music` 目录并设 `PUBLIC_MUSIC_BASE`。**请只使用你有权使用的曲目**
- **设计 token**：颜色 / 圆角 / 玻璃卡都在 `src/styles/global.css` 的 `:root` / `.dark` 里，改这里全站生效
- **结构常量**：建站起始日、接口地址等在 `src/config.ts`；导航项在 `src/i18n/index.ts` 的 `navConfig`
- **语种**：只想留中文，就把 `src/i18n/locales.ts` 的 `locales` 收成 `['zh']`、删掉
  `localeMeta` 与 `ui.ts` 里对应那两份（三处一起删，否则 TS 会报多余属性），
  `/en` `/ja` 连页面都不再生成；加语言见下面的「多语言」一节

## 技术栈与目录

| 层 | 技术 |
|---|---|
| 前端 | Astro 7（SSG + View Transitions）· Tailwind CSS 4 · TypeScript |
| 内容 | Markdown（Content Collections）+ `src/data/*.json`，git 即事实源 |
| 动态数据 | Go + SQLite（modernc 纯 Go 免 CGO）：点赞、阅读、在线、GitHub 代理、静态托管、管理后台 |
| 搜索 / 图 | Pagefind 全文搜索 · satori + resvg 构建期 OG 图 · sharp 图片处理 |

```
src/content/posts/   文章（front-matter + Markdown），_covers/ 放封面，en/ ja/ 放译文
src/data/            站点数据 JSON（管理台的写入目标）+ *.en.json / *.ja.json 译文覆盖
src/i18n/            多语言：语种清单、界面文案字典、内容覆盖合并、Intl 格式化
src/views/           页面主体（src/pages/ 下只剩路由薄壳，三语共用同一份 view）
src/components/      按页面分组的 Astro 组件
src/styles/          global.css（设计 token 在此）+ admin.css
src/scripts/         浏览器端：api / admin / gh-cms（GitHub 直连）/ i18n 取词等
server/              Go 服务：main / static / visitors / linkcheck / admin / github
scripts/             字体子集化、仓库数据同步、部署脚本
```

## 多语言

站点支持简体中文 / English / 日本語，中文在根路径，其余带前缀（`/en/…`、`/ja/…`）。
切换器在桌面侧栏的 LANGUAGE 一格、紧凑图标条和移动端顶栏，切换后**留在当前那一页**。

**翻的是界面与站点数据，文章不翻。** 文章按作者写作时用的语言原样呈现 —— 切语言换的是
导航、面板、按钮那一层，不是正文。混着别的语言的列表会在页头说一句，点进去页顶再说一次，
标题、摘要与正文的 `lang` 标成原文语种（读屏软件才不会拿英文语音去念中文；界面文案
仍跟页面语种走，所以不标整卡）。真想给某篇配译文也行，见下表第三行。

改文案的三个地方，按「改什么」对号入座：

| 要改的东西 | 改哪儿 |
|---|---|
| 界面文案（按钮 / 面板小标 / 空态 / aria） | `src/i18n/ui.ts`。中文那份定义类型，en / ja 少一个键 TS 直接报错 |
| 站点内容（简介 / 分享 / 友链 / 更新日志…） | **管理台「站点数据」页签的「内容语言」一行**（中文 = 基准，其余语种是译文视图：只列文本字段、留空回落中文，Go 与 GitHub 直连两种形态都支持）；或直接改 `src/data/<名字>.<语种>.json`（**只写要翻的字段**） |
| 某篇文章的译文（可选） | 放 `src/content/posts/<语种>/<同名文件>.md`（管理台不管这个）。没有就显示原文 |

全部文案都是**构建期烤进 HTML** 的：`pnpm build` 出的是三套独立静态页，切语言等于跳到
另一个已生成好的 HTML。不接翻译 API、不在浏览器里替换文字、字典也不打进前端包
（客户端脚本要的几句提示由服务端写进 `data-t-*`）。代价是文案得人写，没有自动机翻。

日期、相对时间、紧凑数字（21万 / 210K）、以及「用当前语种称呼另一门语言」
（简体中文 / Simplified Chinese / 簡体中国語）一律不进字典，走 `src/i18n/format.ts` 的
Intl 包装 —— 这类差异标准库比手写模板可靠。标签与分类的**网址不变**（三语共用），
只翻显示名，表在 `src/i18n/taxonomy.ts`，没登记的词原样显示。

`pnpm i18n` 出一份盘点：字典键数、每个数据文件各语种译到几成、哪些文章配了译文，
以及**下标配对错位**的告警 —— 没有 href/repo 这类不可翻字段的短列表
（tools / stack / reading / changelog / now.items）按下标对应，基准增删条目后
译文会盖到错的条目上而构建照样成功，这个告警就是为它准备的。

加一门语言：`src/i18n/locales.ts` 里加代码与元信息 → `ui.ts` 补一份字典（TS 会逼你补齐）
→ 按需加 `src/data/*.<语种>.json`。路由、sitemap、hreflang、RSS、OG 图、pagefind
索引都从这份清单派生，不用逐处同步。

> 管理台只管**站点数据**的译文；文章译文（如果你要写）在仓库文件里改。

## 致谢

界面与工程上大量借鉴了两个优秀的开源博客，特此感谢：

- **[CuteLeaf / Firefly](https://github.com/CuteLeaf/Firefly)** —— 界面雏形与 Astro 静态站基础设施（Markdown 插件链、Pagefind 搜索、OG 图、字体子集化等思路均参考自它）
- **[YYsuni / 2025-blog-public](https://github.com/YYsuni/2025-blog-public)** —— 紧凑布局模式、粘性策略、七段数码管大时钟、GitHub 直连写作后台的思路

站里学来的每一处，代码注释里都注明了出处。

## 许可

代码以 [MIT](LICENSE) 许可开源；文章与图片内容采用
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh) 授权（转载注明出处、不得商用）。
仓库不含任何音乐文件（版权物不随代码分发，git 历史亦已清理），
**请只在自己的部署里使用有权使用的曲目**。
