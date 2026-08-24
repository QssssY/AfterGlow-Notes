# 三分钟拥有自己的余晖录（零代码 · 零服务器 · 全程免费）

> 你需要的全部东西：一个 GitHub 账号（免费注册）。
> 不需要会写代码，不需要服务器，不需要在电脑上安装任何软件。
> 会复制粘贴，就能走完全程。

## 第 1 步 · 一键部署（三选一）

### 方案一：Vercel（最简单，约 2 分钟）

1. 点仓库 README 里的 **Deploy with Vercel** 按钮（或直接打开
   <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FQssssY%2FAfterGlow-Notes>）
2. 用 GitHub 账号登录 → 给仓库取个名字 → 点 **Create**
   （Vercel 会自动把博客仓库复制一份到你名下，然后自动构建）
3. 等 1~2 分钟，出现庆祝页面后点 **Visit** —— 你的博客已经在
   `https://你取的名字.vercel.app` 上线了
4. 可选收尾：项目 **Settings → Environment Variables** 加一条
   `PUBLIC_SITE_URL = https://你的地址`，然后到 **Deployments** 里 Redeploy 一次
   （这让 RSS / 站点地图 / 分享卡片里的链接指向正确地址）

> 提醒：`vercel.app` 域名在中国大陆访问不稳定。读者主要在国内的话，
> 建议用方案二，或给 Vercel 绑一个自己的域名。

### 方案二：Cloudflare Pages（国内可达性最好）

1. 先 **Fork** 本仓库到你名下（仓库页右上角 Fork 按钮，一路默认）
2. 打开 <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages →
   Connect to Git** → 选中你刚 fork 的仓库
3. 构建设置填三项：构建命令 `pnpm run build`、输出目录 `dist`、
   环境变量加 `NODE_VERSION = 22`（可选再加 `PUBLIC_SITE_URL`）
4. 点 **Save and Deploy**，两分钟后你的博客在 `https://xxx.pages.dev` 上线

### 方案三：GitHub Pages（全程不出 GitHub）

1. **Fork** 本仓库，并在 fork 的 **Settings → General** 里把仓库改名为
   `你的用户名.github.io`（必须是这个名字，或后续绑自定义域名 ——
   站内链接是根路径写法，挂在 `/仓库名/` 子路径下会全断）
2. **Settings → Pages → Source** 选 **GitHub Actions**
3. 仓库 **Actions** 页点绿色按钮启用工作流 → 左侧选 **pages** → **Run workflow**
4. 跑完后博客在 `https://你的用户名.github.io` 上线；之后每次提交都会自动重新发布

## 第 2 步 · 没有服务器 = 没有管理台，那怎么改内容？

**GitHub 网页就是你的管理台。** 原理一句话：你的博客完全由仓库文件生成，
在 GitHub 网页上改任何文件并提交，托管平台就会自动重新构建，**1~3 分钟后生效**
（Vercel / CF Pages 天生如此；GitHub Pages 走上面启用的工作流）。

在 GitHub 网页改文件的操作：打开文件 → 点右上角**铅笔图标**（Edit）→
改完点 **Commit changes** → 等一两分钟刷新博客。

各文件管什么（都在 `src/` 下）：

| 文件 | 管的内容 |
| --- | --- |
| `data/site.json` | 站名、作者昵称、个性签名、邮箱、页脚细则 |
| `data/socials.json` | 侧栏社交按钮（GitHub / B 站等） |
| `config.ts` 里的 `uptime` | 「本站已运行 X 天」的起算日期 |
| `data/now.json` | 首页「此刻」卡（在做什么、在啃什么） |
| `data/reading.json` | 「最近在读」的书 |
| `data/repos.json` | 「我的项目」（⚠️ 换成你的仓库，**至少保留 1 条**，第一条是主推大卡） |
| `data/about.json` | 关于页全文 |
| `data/friends.json`、`data/blogroll.json` | 友链 |
| `data/share.json` | 推荐分享页（可清成 `[]`） |
| `data/playlist.json` | 音乐歌单 —— 没有歌源就清成 `[]`，播放卡会自动隐藏 |
| `data/changelog.json` | 建站日志 |
| `content/posts/*.md` | 你的文章（详见第 3 步） |
| `images/site/avatar.png` | 你的头像（传一张方图，文件名必须叫 avatar） |

不想一个个文件啃？直接用下面的 **AI 指令 1 或 2**，让 AI 替你干。

> 管理台（写文章界面、统计曲线、真实阅读数点赞在线人数、音乐托管）需要一台
> 便宜小服务器，见仓库 README 的「方式 A / 方式 B」—— 以后随时可以升级，
> 内容零迁移（都在这个仓库里）。

## 第 3 步 · 写文章的日常

1. GitHub 网页进入 `src/content/posts/` → **Add file → Create new file**
2. 文件名用英文短横线，如 `my-first-post.md`（它就是网址：`/posts/my-first-post`）
3. 开头照抄这个模板，然后往下写正文（Markdown 语法）：

```markdown
---
title: 我的第一篇文章
description: 一句话摘要，会显示在列表和分享卡片里
date: 2026-08-24
tags: [随笔]
---

正文从这里开始，支持 **加粗**、`代码`、图片、代码块等全部 Markdown 语法。
```

4. **Commit changes** → 一两分钟后文章上线。就这样，没有别的步骤。

配图：把图片传到 `src/content/posts/_covers/`（Add file → Upload files），
front-matter 加一行 `cover: ./_covers/图片名.webp`。

## 常见问题

- **改了没生效？** 到托管平台看构建状态（Vercel/CF 的 Deployments、GitHub 的
  Actions 页），构建要 1~3 分钟；红了就把日志喂给 AI 指令 4。
- **点赞 / 阅读数 / 在线人数去哪了？** 纯静态形态自动隐藏这些功能（不是坏了）：
  点赞只存在访客自己的浏览器里，计数类整块不渲染。想要真的，上小服务器走方式 A/B。
- **音乐怎么没了？** 音乐文件有版权、不在仓库里，纯静态托管没有歌源。
  `playlist.json` 清成 `[]` 让播放卡消失即可。
- **`/overview` 打不开？** 那是管理台入口，纯静态形态没有管理台（页面里有说明）。
- **原版更新了怎么跟进？** 你的仓库页会出现 **Sync fork** 按钮，点一下即可
  （你改过的文件如有冲突，GitHub 会提示）。
- **绑自己的域名？** 三个平台都免费支持：Vercel/CF 在项目的 Domains 设置里加，
  GitHub Pages 在 Settings → Pages 里加；绑完把 `PUBLIC_SITE_URL` 改成新域名。

## AI 指令（复制即用，按需填【】）

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
2. 站点身份：src/data/site.json 全部字段过一遍换成我的
3. 社交按钮：src/data/socials.json 指向我的主页
4. 运行天数起点：src/config.ts 的 uptime.since 与 sinceLabel 改成我的建站日期
5. 我的项目：src/data/repos.json 替换成我的仓库 —— 注意至少保留 1 条（第一条是主推大卡），
   pushed 字段填该仓库最近一次提交时间（之后 CI 会自动刷新）；删掉 src/images/projects/
   里原作者的配图，让占位图兜底
6. 个人内容：src/data/ 下的 now.json（此刻）、reading.json（在读）、stack.json、tools.json、
   about.json（关于页）按我的情况重写；friends.json、blogroll.json、share.json 没有素材就清成 []；
   changelog.json 留一条「博客上线」
7. 音乐：src/data/playlist.json 清成 []（无歌源时播放卡自动隐藏，不会报错）
8. 示例文章：删光 src/content/posts/ 下的 .md 和 _covers/ 里的图，新建一篇 hello-world.md
   （front-matter 格式参考删除前任意一篇的头部：title/description/date/tags）
9. 头像：提醒我之后把一张方图放到 src/images/site/avatar.png，现在先不用等我
10. 全部改完：跑 npm install && npm run check 确认 0 错误，列出改动文件清单，
    然后 git commit 并 push（push 后托管平台会自动重新部署）
```

### 指令 2 · 纯浏览器路线（给任意对话 AI：让它生成内容，你在 GitHub 网页粘贴）

```text
我 fork 了开源博客 AfterGlow-Notes，正在用 GitHub 网页直接编辑文件，请替我生成新文件内容。

我的资料：【站名 / 昵称 / 签名 / 邮箱 / GitHub 用户名 / 建站日期 / 我的项目 / 在读的书 / 最近在做的事】

规则：我每次发你一个文件的路径和当前内容，你输出这个文件的完整新内容 ——
保持原有 JSON 字段名和结构不变，只把值换成我的资料；数组类文件没有素材就输出 []
（例外：repos.json 至少保留 1 条）。输出用代码块包好方便我整体复制。

第一个文件：src/data/site.json，当前内容如下：
【把 GitHub 上看到的文件原文粘贴到这里】
```

### 指令 3 · 帮我写一篇文章

```text
帮我写一篇博客文章，输出成 AfterGlow-Notes 博客的文章文件。

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

输出：文件名 + 完整文件内容（一个代码块）。
```

### 指令 4 · 部署失败 / 页面不对，帮我排查

```text
我的 AfterGlow-Notes fork 部署在【Vercel / Cloudflare Pages / GitHub Pages】上，
现在【构建失败 / 页面显示不对，具体现象：……】。

这个项目的关键事实：Node 22；包管理器 pnpm（package.json 的 packageManager 已声明版本）；
构建命令 pnpm run build；输出目录 dist；纯静态形态不需要任何环境变量
（可选 PUBLIC_SITE_URL=站点地址）；内容数据在 src/data/*.json ——
JSON 写错格式会让构建失败，repos.json 至少要有 1 条。

构建日志如下，请定位原因并给出最小修复步骤：
【粘贴平台的 build log】
```
