# 三分钟拥有自己的余晖录（零代码 · 零服务器 · 全程免费）

> 你需要的全部东西：一个 GitHub 账号。不需要会代码、不需要服务器、
> 不需要在电脑上装任何软件 —— 会复制粘贴就能走完全程。

## 第 1 步 · 一键部署（三选一）

### 方案一：Vercel（最简单，约 2 分钟）

1. 点仓库 README 里的 **Deploy with Vercel** 按钮（或直接打开
   <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FQssssY%2FAfterGlow-Notes>）
2. 用 GitHub 账号登录 → 给仓库取个名字 → 点 **Create**
   （Vercel 会自动把博客仓库复制一份到你名下，然后自动构建）
3. 等 1~2 分钟，出现庆祝页面后点 **Visit** —— 博客已在 `https://你取的名字.vercel.app` 上线
4. 可选收尾：项目 **Settings → Environment Variables** 加一条
   `PUBLIC_SITE_URL = https://你的地址`，再到 **Deployments** 里 Redeploy 一次
   （RSS / 站点地图 / 分享卡片的链接靠它指对地址）

> `vercel.app` 域名在中国大陆访问不稳定：读者主要在国内就用方案二，或给 Vercel 绑自己的域名。

### 方案二：Cloudflare Pages（国内可达性最好）

1. **Fork** 本仓库（仓库页右上角，一路默认）
2. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git** → 选你的 fork
3. 构建设置三项：构建命令 `pnpm run build`、输出目录 `dist`、环境变量 `NODE_VERSION = 22`
   （可选再加 `PUBLIC_SITE_URL`）
4. **Save and Deploy**，两分钟后上线在 `https://xxx.pages.dev`

### 方案三：GitHub Pages（全程不出 GitHub）

1. **Fork** 本仓库，并在 **Settings → General** 里把仓库改名为 `你的用户名.github.io`
   （必须这个名字或绑自定义域名 —— 站内链接是根路径写法，挂在 `/仓库名/` 子路径下会全断）
2. **Settings → Pages → Source** 选 **GitHub Actions**
3. **Actions** 页启用工作流 → 左侧选 **pages** → **Run workflow**
4. 上线在 `https://你的用户名.github.io`；之后每次提交自动重新发布

## 第 2 步 · 登录管理台，把它变成你的

打开 `你的博客地址/overview` —— 没有服务器也有管理台（**GitHub 直连模式**）：
写文章、改站点数据、传图、调配色都在网页里点点，**每次保存 = 一次 git 提交**，
托管平台自动重建，1~3 分钟生效。

**登录令牌这样生成（一次性设置，约 1 分钟）：**

1. GitHub 右上角头像 → **Settings** → 左栏最底 **Developer settings** →
   **Personal access tokens → Fine-grained tokens** → **Generate new token**
2. 名字随意；**Repository access** 选 **Only select repositories**，只勾你的博客仓库
3. **Permissions → Repository permissions** 里把 **Contents** 设为 **Read and write**，其余全部不动
4. 复制生成的令牌（只显示一次），粘贴进 `/overview` 登录页；仓库一栏通常已自动填好，
   空着就手填 `你的用户名/仓库名`

> 令牌只存浏览器本会话（关浏览器即忘，换设备重贴），且只能读写你勾的那一个仓库。
> 「统计曲线 / 在线人数 / 友链巡检 / 音乐上传」需要服务器形态（README 方式 A/B），其余全可用。

**登录后把这些页签过一遍，博客就是你的了**（右列是对应文件，想在 GitHub 网页直接改也行——
打开文件点铅笔图标，改完 Commit changes，一样自动重建）：

| 管理台页签 | 对应文件（`src/` 下） | 要点 |
| --- | --- | --- |
| 站点信息 | `data/site.json` + 图片位 | 站名、昵称、签名、邮箱；头像在这里直接传 |
| 社交链接 | `data/socials.json` | 侧栏的 GitHub / B 站按钮 |
| 项目 | `data/repos.json` | 换成你的仓库，**至少留 1 条**（第一条是主推大卡），有「从 GitHub 同步」按钮 |
| 此刻 / 在读 / 在用 / 构成 | `data/now·reading·tools·stack.json` | 首页与关于页的活数据 |
| 友链 / 关于页友链 | `data/blogroll·friends.json` | 没有就清空 |
| 推荐分享 / 更新日志 / 关于页 | `data/share·changelog·about.json` | 分享可清 `[]`；日志留一条「博客上线」 |
| 正在听 | `data/playlist.json` | 没有歌源就清成 `[]`，播放卡自动隐藏 |
| （仅文件）`config.ts` 的 `uptime` | — | 「本站已运行 X 天」的起算日期 |

嫌一个个点麻烦？用下面的 **AI 指令 1**，让 AI 一口气全改完。

## 第 3 步 · 写文章的日常

管理台点**「写新文章」**：所见即所得字段、标签胶囊、粘贴 / 拖拽直接传图、可导入现成 .md，
保存即发布。不用管理台的话，GitHub 网页在 `src/content/posts/` 里 **Add file** 建一个
`英文短横线名.md`（文件名就是网址），开头照抄：

```markdown
---
title: 我的第一篇文章
description: 一句话摘要，会显示在列表和分享卡片里
date: 2026-08-24
tags: [随笔]
---

正文从这里开始，支持全部 Markdown 语法。
```

配图放 `src/content/posts/_covers/`（Upload files），front-matter 加 `cover: ./_covers/图片名.webp`。

## 常见问题

- **改了没生效？** 构建要 1~3 分钟：Vercel/CF 看 Deployments、GitHub 看 Actions；
  红了把日志喂给 AI 指令 3。
- **点赞 / 阅读数 / 在线去哪了？** 纯静态形态自动隐藏（不是坏了）；想要真计数上小服务器走
  README 方式 A/B，内容零迁移。
- **管理台登录不上？** 仓库写成 `owner/repo`；令牌过期就重新生成（必须勾 Contents: Read and write）。
- **音乐怎么没了？** 版权物不进仓库，纯静态没有歌源 —— 歌单清 `[]` 即可。
- **原版更新了怎么跟进？** 仓库页点 **Sync fork**。
- **绑域名？** 三平台都免费支持（各自的 Domains / Pages 设置），绑完更新 `PUBLIC_SITE_URL`。

## AI 指令（复制即用，填【】）

### 指令 1 · 一键变成我的博客（给能改文件的 AI：Claude Code / Cursor 等，打开你 fork 的仓库后粘贴）

```text
这是开源博客 AfterGlow-Notes 的 fork（Astro + Tailwind），请把它从原作者的博客改成我的博客。

我的资料：
- 站名：【你的站名】（英文副标题：【可留空】）
- 昵称：【】；个性签名：【】；邮箱：【】
- GitHub 用户名：【】；其他社交链接：【没有就写「删掉」】
- 建站日期：【今天的日期】
- 我的开源项目（owner/repo，一行一个；没有就写「用我 GitHub 名下最活跃的仓库」）：【】

要求：
1. 只改数据与内容，不改样式、组件结构和动效逻辑
2. 站点身份：src/data/site.json 全部字段过一遍换成我的；社交按钮 src/data/socials.json 指向我
3. 运行天数起点：src/config.ts 的 uptime.since 与 sinceLabel 改成我的建站日期
4. 我的项目：src/data/repos.json 替换成我的仓库 —— 至少保留 1 条（第一条是主推大卡），
   pushed 字段填该仓库最近一次提交时间（之后 CI 会自动刷新）；删掉 src/images/projects/
   里原作者的配图，让占位图兜底
5. 个人内容：src/data/ 下的 now、reading、stack、tools、about 按我的情况重写；
   friends、blogroll、share 没有素材就清成 []；changelog 留一条「博客上线」
6. 音乐：src/data/playlist.json 清成 []（无歌源时播放卡自动隐藏，不会报错）
7. 示例文章：删光 src/content/posts/ 下的 .md 和 _covers/ 里的图，新建一篇 hello-world.md
   （front-matter 格式参考删除前任意一篇的头部）
8. 头像：提醒我之后把一张方图放到 src/images/site/avatar.png，先不用等我
9. 全部改完：跑 npm install && npm run check 确认 0 错误，列出改动文件清单，
   然后 git commit 并 push（push 后托管平台自动重新部署）
```

### 指令 2 · 帮我写一篇文章（给任意对话 AI）

```text
帮我写一篇博客文章，输出成 AfterGlow-Notes 的文章文件。

- 文件放 src/content/posts/<英文短横线文件名>.md，文件名就是网址，帮我取一个
- front-matter 固定格式（date 用今天）：
  ---
  title: 标题
  description: 一句话摘要
  date: YYYY-MM-DD
  tags: [标签1, 标签2]
  ---
- 正文用 Markdown；中文排版：中英文之间加空格，代码块标注语言

主题和素材：【想写什么、有什么要点，随便说】

输出：文件名 + 完整文件内容（一个代码块）。我会粘贴到 GitHub 网页新建文件里，
或把标题和正文分别粘进博客管理台的编辑器。
```

### 指令 3 · 部署失败 / 页面不对，帮我排查（给任意对话 AI）

```text
我的 AfterGlow-Notes fork 部署在【Vercel / Cloudflare Pages / GitHub Pages】上，
现在【构建失败 / 页面显示不对，具体现象：……】。

这个项目的关键事实：Node 22；包管理器 pnpm（package.json 已声明版本）；
构建命令 pnpm run build；输出目录 dist；纯静态形态不需要任何环境变量
（可选 PUBLIC_SITE_URL=站点地址）；内容数据在 src/data/*.json ——
JSON 写错格式会让构建失败，repos.json 至少要有 1 条。

构建日志如下，请定位原因并给出最小修复步骤：
【粘贴平台的 build log】
```
