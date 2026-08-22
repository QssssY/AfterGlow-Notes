# 余晖录 · AFTERGLOW NOTES

一个**个人学习项目**：从 Pencil 设计稿到前后端代码都是练手之作，边搭边学，不定期推翻重来。

按时间倒叙的写作记录 —— 博客本体是 Astro 静态站，点赞 / 阅读计数与网页管理后台由一个 Go 小服务承担。

## 致谢

界面与工程上大量借鉴了两个优秀的开源博客，特此感谢：

- **[CuteLeaf / Firefly](https://github.com/CuteLeaf/Firefly)** —— 界面雏形与 Astro 静态站基础设施（Markdown 插件链、Pagefind 搜索、OG 图、字体子集化等思路均参考自它）
- **[YYsuni / 2025-blog-public](https://github.com/YYsuni/2025-blog-public)** —— 紧凑布局模式、"从不钉超过一屏"的粘性策略、首页七段数码管大时钟

站里学来的每一处，代码注释里都注明了出处。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Astro 7（SSG + View Transitions）· Tailwind CSS 4 · TypeScript |
| 内容 | Markdown（Content Collections）+ `src/data/*.json`，git 即事实源 |
| 动态数据 | Go + SQLite（`server/`）：点赞、阅读计数、GitHub 代理、管理后台写接口 |
| 管理后台 | 站内 `/admin`：写文章、改站点数据、传图传歌，全部落成仓库文件 |

## 本地运行

```bash
pnpm install
pnpm dev          # 博客本体（自动先跑中文字体子集化）

cd server         # 可选：计数 + 管理后台服务
go build -o afterglow-server.exe .
ADMIN_PASSWORD=你的口令 ./afterglow-server.exe -blog-dir ..
```

构建：`pnpm build`（配 `PUBLIC_API_BASE` 指向 Go 服务则启用点赞/阅读数）。部署说明见 `server/README.md`。

## 许可

文章内容采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh) 授权；代码部分 MIT。
