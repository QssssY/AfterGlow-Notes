---
title: 'Going fully static: three things Astro convinced me of'
description: A record of day-one technology choices — why it ended up being Astro rather than the Vue single-page app I already knew inside out.
date: 2026-08-21
tags: [Astro, 建站, 前端]
category: 建站笔记
cover: ../_covers/rewrite-blog-with-astro.webp
---

Java is my day job and Vue is my frontend, so when I decided to build a personal blog my first instinct was to reach for Vue and be done with it: Vite to start the project, vue-router for routing, articles in Markdown converted to components by a plugin. Every step familiar.

That's not what I did. A blog is, at heart, **a pile of documents that barely ever change**, and visitors arrive, read, and leave. Running a single-page app for content like that means every visitor first downloads a runtime and then assembles the page in their browser. The reader wanted text; I'd be shipping them an application first.

After looking around I picked Astro. Three things convinced me.

## 1. Zero JavaScript by default

Astro components read like JSX, but by default they only run **at build time**, and the output is plain HTML and CSS. Not one line of JavaScript reaches the page unless you ask for it:

```astro title="src/pages/index.astro"
---
// This code only runs at build time — the browser never sees it
const posts = await getCollection('posts')
---
<ul>
  {posts.map((post) => <li><a href={`/posts/${post.id}`}>{post.data.title}</a></li>)}
</ul>
```

Where interaction is genuinely needed — the home-page music card that actually plays, say — you write a separate `<script>` and Astro bundles it into a small module. Static by default, dynamic on request: exactly the shape a blog wants.

## 2. Content collections are typed

Articles live as Markdown files under `src/content/posts/`, with a schema alongside them:

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

Miss a front-matter field or mistype a date and the build fails, naming the file. Anyone who writes Java has no resistance to that "errors caught at compile time" feeling. `image()` also wires the cover into Astro's image pipeline, compressing it and generating responsive sizes at build time.

## 3. The output goes anywhere

What `pnpm build` produces is a `dist/` folder of HTML, CSS and images. Nginx can serve it, object storage can serve it, any static host can serve it. No Node process to keep alive, no cold starts, no server-side dependencies to upgrade.

> The biggest operational advantage of a static site is that it has no operations.

## What I didn't pick, and why

- **Next / Nuxt**: overpowered. I have no use for SSR, middleware or API routes, yet I'd be keeping a Node machine alive for them.
- **Hexo / Hugo**: great theme ecosystems, but I drew this interface myself, one-to-one, and I need control over every pixel. Editing a template language is less pleasant than editing components.
- **Hand-written HTML**: seriously considered. I gave it up because I wanted automatic image compression and schema validation for content, and both are miserable to maintain by hand.

As for the things that genuinely have to be dynamic — likes and read counts — a static site can't do them alone. I later wrote a small Go service for that, which deserves its own post.
