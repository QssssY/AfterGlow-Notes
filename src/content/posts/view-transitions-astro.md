---
title: View Transitions 实战：让换页像翻卡片而不是刷新
description: 同名元素跨页 morphing、主题切换从点击处圆形揭示——浏览器原生 API 就够，一行动画库都没装。
date: 2026-08-22
tags: [前端, 动效, Astro]
category: 前端工程
---

多页静态站的原罪是换页那一下白闪：整个文档换掉重画，再快也是"刷新"，成不了"过渡"。View Transitions API 就是浏览器给这件事的原生答案——这个站的换页动效和主题切换全靠它，没装任何动画库。

## 换页：同名元素自动 morphing

Astro 的 `<ClientRouter />` 把站内跳转接管成 fetch + DOM 替换，并在替换前后各拍一张"快照"交给 View Transitions。真正的魔法在 `transition:name`：**两页上名字相同的元素，浏览器会自动把一个变形成另一个**——位置、尺寸、圆角，全程插值。

这个站的侧栏大卡和内容页的图标条是两个完全不同的组件，但共享一个名字：

```astro
<!-- 首页 Sidebar.astro -->
<aside transition:name="site-nav" class="w-[280px] ...">

<!-- 文章页 NavBar.astro -->
<nav transition:name="site-nav" class="w-fit ...">
```

从首页点进文章，280px 的侧栏卡会"收缩变形"成顶部的小图标条；返回时再展开回去。头像另起一个名字 `nav-avatar` 独立飞行，观感是它从侧栏"飞"进了图标条。

## 踩过的三个坑

- **名字每页只能出现一次**。两个元素同名，整个过渡直接放弃，控制台还只给警告。
- **`display: none` 的元素不参与**。响应式里被藏掉的那份不会被快照，移动端和桌面端要分开想。
- **`transition:name` 只能挂在真实元素上**。挂到 Astro 组件标签上会报错，解法是包一层定了尺寸的 `span`。

## 主题切换：从点击的那个点铺开

`document.startViewTransition()` 也可以手动调用，配合 `::view-transition-new(root)` 伪元素就能做出"新主题从点击处以圆形扩散铺满"的效果：

```ts
const vt = document.startViewTransition(() => applyTheme(next))
await vt.ready
document.documentElement.animate(
  { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
  { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    pseudoElement: '::view-transition-new(root)' },
)
```

`r` 取点击点到最远屏幕角的距离（`Math.hypot`），保证圆一定铺满。有个细节：揭示期间要把页面上所有 `view-transition-name` 临时禁掉（加个 class 配 `view-transition-name: none !important`），否则那些元素会被抠出圆形动画之外，各飞各的。

## 该退让的时候退让

系统开了"减少动态"、浏览器不支持 `startViewTransition`、或者主题实际没变（浅色切浅色）时，圆形揭示退回成 0.3s 的颜色过渡。动效是锦上添花，永远给自己留一条纯 CSS 的退路：

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) { animation: none !important; }
}
```
