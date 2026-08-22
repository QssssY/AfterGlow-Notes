---
title: 手写 Vue 3（二）：diff 的尽头是最长递增子序列
description: mini-vue 复盘第二篇：patch 的分层派发、带 key children 的三步比对，以及为什么"最少移动"是个二分问题。
date: 2026-08-22
tags: [Vue, 算法, 前端]
category: 前端工程
cover: ./_covers/mini-vue-diff.webp
---

接着上篇的响应式，这篇拆 [mini-vue](https://github.com/QssssY/mini-vue) 的 runtime——381 行的 `render.js`，核心是那道所有面试都爱问的题：**diff 到底怎么把 DOM 操作降到最少？**

## patch 是一棵派发树

入口 `patch(n1, n2)` 拿到新旧两个 vnode，先按类型分流：Text、Fragment、Element、Component 各走各的 process 函数；类型都不同（`isSameVNode` 为假）就直接卸载重建，不做无谓的比对。真正的难点全部收敛到一处——**新旧都是带 key 的子节点数组**时的 `patchKeyedChildren`。

## 三步走：收头、收尾、处理中间

Vue 3 的做法（我照着实现的）是先把简单的部分剥掉：

```js title="src/runtime/render.js"
let i = 0
let e1 = c1.length - 1
let e2 = c2.length - 1
// 第一步：从左往右，相同就 patch，直到不同
while (i <= e1 && i <= e2) { ... }
// 第二步：从右往左，同上
// 第三步：剩下中间一段乱序区，才是真正的 diff
```

头尾收缩之后经常发现问题已经解决了一半：要么旧的剩一段（全删），要么新的剩一段（全插）。只有中间都剩下时才进入乱序比对——用新节点的 key 建索引表，把"旧节点在新序列里的位置"填进一个 `source` 数组（找不到的标 `-1`，直接卸载）。

## 为什么需要最长递增子序列

到这一步，每个要保留的节点该去哪都知道了，剩下的问题是**怎么搬家搬得最少**。答案藏在 `source` 数组里：如果一串节点在新旧序列里的相对顺序没变（`source` 里是递增的），它们根本不用动，动别人就行。

所以"最少移动"等价于"找出最长的不用动的队伍"——最长递增子序列：

```js title="src/runtime/render.js"
/*
  seq 记录的是：在 source 数组中，不需要移动的元素的下标
  比如 [1,2,4,3] 的最长递增子序列是 [1,2]，返回其下标 [0,1]
*/
const seq = getSequence(source)
let j = seq.length - 1
// 从后往前遍历乱序区：在 seq 里的节点不动，不在的 insertBefore 挪位
```

`getSequence` 用的是贪心 + 二分（O(n log n)）：维护一个"目前各长度递增序列的最小结尾"数组，新元素要么接尾巴、要么二分替换掉第一个比它大的——再配一个 `position` 数组回溯真实下标。从后往前处理乱序区是因为 `insertBefore` 需要一个已经就位的锚点，后面的节点先就位，前面的才有的插。

## 测试救了我至少三次

runtime 有七组测试（`patchKeyedChildren.spec.js` 最狠），我印象最深的翻车现场：

- 乱序区有新增节点时忘了处理 `source` 里的 `-1`，直接把 undefined 拿去 patch；
- `seq` 遍历方向写反，节点全在动，"最少移动"变成"全员搬家"——功能正确、性能归零，不写断言根本发现不了；
- Fragment 的锚点（`anchor`）没传下去，兄弟节点全插到了父容器末尾。

> diff 这种代码，肉眼 review 是看不出错的——输出的 DOM 长得都对，错的是**中间搬了几次家**。只有测试能钉住它。

写完这两块再去读 Vue 3 源码，那些 `patchFlag`、`Block Tree` 的编译期优化才看得出前因后果：运行时 diff 已经这么抠了，剩下的性能只能靠编译期把"哪里会变"提前标出来。这正是 mini-vue 里 compiler 模块（parse → codegen，能把模板编译成 `h()` 渲染函数）想触碰的方向，不过那是另一篇的事了。
