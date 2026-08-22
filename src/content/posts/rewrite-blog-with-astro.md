---
title: 把博客做成纯静态：Astro 说服我的三件事
description: 建站第一天的技术选型记录：为什么最后是 Astro，而不是熟门熟路的 Vue 单页应用。
date: 2026-08-21
tags: [Astro, 建站, 前端]
category: 建站笔记
cover: ./_covers/rewrite-blog-with-astro.png
---

我主力写 Java，前端用 Vue。所以决定做个人博客的时候，第一反应其实是 Vue 一把梭：Vite 起项目、vue-router 管路由、文章塞进 Markdown 再用插件转组件——每一步都熟。

最后没这么干。博客这个东西，本质上是**一堆几乎不变的文档**，访客来了读完就走。为这样的内容跑一个单页应用，等于让每个访客先下载一套运行时、再在浏览器里现场把页面拼出来。读者要的只是文字，我却先发给他一个应用程序。

调研了一圈之后选了 Astro。说服我的是三件事。

## 一、默认零 JavaScript

Astro 的组件写起来像 JSX，但默认只在**构建时**运行，产物是纯 HTML 和 CSS。页面上一行 JavaScript 都没有，除非你明确要求：

```astro title="src/pages/index.astro"
---
// 这里的代码只在构建时跑，浏览器永远看不到
const posts = await getCollection('posts')
---
<ul>
  {posts.map((post) => <li><a href={`/posts/${post.id}`}>{post.data.title}</a></li>)}
</ul>
```

需要交互的地方（比如首页那个能真放歌的音乐卡）再单独写 `<script>`，Astro 会把它打成一个小模块。默认静态、按需动态，这个方向和博客的性质完全对得上。

## 二、内容集合是带类型的

文章放在 `src/content/posts/` 下的 Markdown 文件里，配一份 schema：

```ts title="src/content.config.ts"
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      draft: z.boolean().default(false),
    }),
})
```

front-matter 少写个字段、日期格式打错，构建直接失败并指出是哪个文件。写 Java 的人对这种"编译期就把错挡住"的体验毫无抵抗力。`image()` 还会把封面接进 Astro 的图片管线，构建时自动压缩、生成响应式尺寸。

## 三、产物随便放哪

`pnpm build` 出来的 `dist/` 就是一个文件夹，里面是 HTML、CSS 和图片。Nginx 能伺候、对象存储能伺候、任何静态托管都能伺候，没有 Node 进程要养，没有冷启动，没有服务端依赖要升级。

> 静态站最大的运维优势是：它没有运维。

## 没选什么，为什么

- **Next / Nuxt**：能力过剩。SSR、中间件、API 路由我一个都用不上，却要为它们养一台跑 Node 的机器。
- **Hexo / Hugo**：主题生态很好，但我的设计稿是自己画的（Pencil 里一比一），需要完全掌控每一个像素，模板语言改起来不如组件顺手。
- **纯手写 HTML**：认真考虑过。放弃的原因是想要图片自动压缩和内容 schema 校验，这两样手写维护起来太苦。

至于点赞、阅读数这类必须动态的东西，静态站自己做不了——后面用 Go 写了个小服务，另开一篇记。
