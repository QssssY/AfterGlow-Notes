---
title: 手写 Vue 3（一）：五十来行代码的响应式心脏
description: 复盘我的 mini-vue 仓库：effect 栈怎么解决嵌套、targetMap 三层结构、computed 的惰性求值全靠一个 dirty 位。
date: 2026-08-22
tags: [Vue, 源码, 前端]
category: 前端工程
cover: ./_covers/mini-vue-reactivity.webp
---

[mini-vue](https://github.com/QssssY/mini-vue) 是我逼自己把 Vue 3 核心从头写一遍的仓库——响应式、运行时、编译器三个模块各自实现，配了十二组 Jest 测试。这篇先复盘响应式，因为它是整棵树的根，而且核心文件 `effect.js` 只有 59 行。

## 依赖收集的三层地图

响应式要回答的问题只有一个：**数据变了，谁需要知道？** 答案存在一个三层结构里：

```
targetMap: WeakMap<原始对象, Map<属性名, Set<effect>>>
```

`WeakMap` 的键是原始对象——对象被回收时依赖记录跟着消失，不漏内存；第二层按属性名分桶；第三层的 `Set` 天然去重，同一个 effect 读同一个属性一百次也只记一次。

```js title="src/reactivity/effect.js"
let targetMap = new WeakMap()
export function track(target, key) {
  if (!activeEffect) return
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, (depsMap = new Map()))
  let deps = depsMap.get(key)
  if (!deps) depsMap.set(key, (deps = new Set()))
  deps.add(activeEffect)
}
```

`track` 在谁读属性时记账，`trigger` 在谁写属性时把对应的 `Set` 全部重跑。而"当前是谁在读"就是那个全局的 `activeEffect`。

## effect 栈：一个全局变量解决不了嵌套

最初我只用一个 `activeEffect` 变量，测试立刻教育了我：组件是会嵌套的，父组件的 render effect 里会执行子组件的 render effect。内层执行完，`activeEffect` 得**恢复成外层那个**，单变量做不到，于是有了栈：

```js title="src/reactivity/effect.js"
const effectFn = () => {
  try {
    effectStack.push(effectFn)
    activeEffect = effectFn
    return fn()
  } finally {
    effectStack.pop()
    // 恢复上一层；栈空时自然是 undefined
    activeEffect = effectStack[effectStack.length - 1]
  }
}
```

`try/finally` 保证 `fn()` 里抛异常也能正确出栈——这个细节不写，一个报错就能让后续所有依赖收集串味。

## Proxy 的两个小心机

`reactive` 的 handler 本身不长，但有两处容易漏：

- **惰性深代理**：get 到的值还是对象时才递归 `reactive(res)`，不是创建时一口气把整棵树代理完。大对象只代理用到的分支。
- **数组的 length**：给数组 push 元素，改的是下标，但很多 effect 依赖的是 `length`。所以 set 里比较写前写后的 `length`，变了就补一次 `trigger(target, 'length')`。

另外用一个 `proxyMap` 缓存"原始对象 → 代理"，同一个对象 `reactive` 两次拿到的是同一个 Proxy——否则 `reactive(obj) !== reactive(obj)`，各种恒等判断全崩。

## computed：一个 dirty 位撑起惰性求值

computed 是响应式系统里最精巧的部件——它既是别人的依赖（effect），又被别人依赖（像个 ref）。实现只靠一个脏标记：

```js title="src/reactivity/computed.js"
this._effect = effect(getter, {
  lazy: true,
  scheduler: () => {
    if (!this._dirty) {
      this._dirty = true          // 上游变了：只打标记，不计算
      trigger(this, 'value')      // 通知依赖我的人
    }
  },
})
```

上游数据变化时**不重算**，只把 `_dirty` 置真；直到有人真的读 `.value` 才计算一次并缓存。scheduler 这个"依赖变化时别直接跑 effect，先走我"的口子，同时也是组件异步批量更新（`queueJob` + 微任务刷新队列）的实现基础——一个抽象两处受益。

## 写完之后回头看

Vue 3 源码里的响应式还有分支切换清理（cleanup）、`stop`、`readonly`、依赖标记位优化等等，我都没做。但砍掉这些之后剩下的骨架——**track/trigger 双向记账 + effect 栈 + scheduler 口子**——恰恰是最值得亲手写一遍的部分：写完你会发现 Vue、Pinia、`watchEffect` 全是这五十行的变奏。

下一篇写 runtime 的 diff：双端预处理和最长递增子序列。
