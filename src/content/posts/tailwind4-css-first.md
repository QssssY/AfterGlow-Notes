---
title: Tailwind 4 的 CSS-first：配置文件没了之后怎么活
description: tailwind.config.js 退场，@theme 和 @custom-variant 上位。用这个站的真实代码讲讲新写法。
date: 2026-08-21
tags: [Tailwind, CSS, 前端]
category: 前端工程
---

Tailwind 4 最大的变化不是快了多少倍，而是**配置从 JavaScript 搬进了 CSS**。老版本那个几百行的 `tailwind.config.js` 没有了，主题、变体、自定义工具类，全部用 CSS 指令声明。这个站从第一天就用 4，把踩过的几个点记下来。

## @theme：设计 token 就是 CSS 变量

以前扩展主题要在 JS 里写 `theme.extend.colors`，现在直接在样式表里：

```css title="src/styles/global.css"
@theme {
  --color-brand: #d9812b;
  --color-ink: #241c18;
  --color-cream: #faf3e7;
  --font-display: 'Averia Gruesa Libre', cursive;
}
```

声明完立刻获得 `bg-brand`、`text-ink`、`font-display` 这些工具类。更妙的是它们同时就是真实的 CSS 变量——组件里写 `var(--color-brand)` 也能取到，设计 token 只存在一份。

从设计稿抄值的时候这一点特别舒服：Pencil 里量出来什么色号，粘进 `@theme` 就完事，不用在 JS 对象和 CSS 之间来回倒手。

## @custom-variant：自己造变体

内置的 `dark:`、`hover:` 不够用时，可以声明自己的条件前缀。这个站有个双布局模式（原版侧栏版 / 紧凑图标条版），状态挂在 `<html data-layout="...">` 上，变体就这么造：

```css title="src/styles/global.css"
@custom-variant classic (&:where([data-layout='classic'], [data-layout='classic'] *));
@custom-variant compact (&:where([data-layout='compact'], [data-layout='compact'] *));
```

之后模板里就能写 `classic:xl:block`、`compact:xl:sticky`——和官方变体完全同权，还能和响应式前缀任意组合。深色模式也是同一个思路，只是状态挂在 class 上：

```css
@custom-variant dark (&:where(.dark, .dark *));
```

`:where()` 这层包裹很关键，它把选择器权重压成 0，不会打乱正常的层叠顺序。

## 任意值还是老样子，而且更有底气

设计稿给的是 22px 就写 `rounded-[22px]`，是 13.5px 就写 `text-[13.5px]`。4 的引擎按需生成，任意值不再有"撑大产物"的心理负担。一比一还原设计稿的场景里，这比凑近似的预设档位诚实得多。

## 两个不顺手的地方

- **变量得在 `@theme` 里声明才有工具类**。写在 `:root` 里的普通变量只能 `var()` 取，不会生成 `bg-*`。要区分"设计 token"和"运行时状态变量"两类，后者（比如主题切换时动态改的值）留在 `:root`。
- **没有 JS 配置意味着没有条件逻辑**。老项目里那种"按环境变量开关某个插件"的玩法没了，好在博客用不上。

总体感受：CSS-first 之后，样式系统第一次做到了**打开一个文件就能看懂全部约定**。配置即样式表，样式表即文档。
