---
title: Hello World
description: 第一篇测试文章，用来确认 Markdown 渲染链路正常。
date: 2026-08-20
tags: [随笔]
category: 杂记
draft: true
---

这是一篇用来验证渲染链路的测试文章，确认 Markdown、代码高亮、标题锚点都工作正常。

## 二级标题

正文段落，包含 **加粗**、*斜体* 和 [外链](https://astro.build)。

### 三级标题

代码块由 expressive-code 渲染，自带复制按钮和文件名标签：

```ts title="greet.ts"
const greet = (name: string): string => `Hello, ${name}!`

console.log(greet('World'))
```

> 引用块用来放一些补充说明。

- 无序列表项一
- 无序列表项二
- 无序列表项三
