---
title: 给 AI 情感助手做前端：POST 流式、情绪花园与虚拟滚动
description: ai-psychological-assistant 复盘：原生 EventSource 接不了 POST 怎么办、每轮对话后的情绪分析怎么反哺 UI。
date: 2026-08-22
tags: [Vue, AI, 前端]
category: 前端工程
---

[ai-psychological-assistant](https://github.com/QssssY/ai-psychological-assistant) 是我做的 AI 情感陪伴应用的前端：Vue 3.5 + Vite + Element Plus + Pinia，核心是一个流式对话页和一本情绪日记。心理陪伴类产品的前端和普通聊天界面看着一样，做起来不一样——**情绪本身是个要渲染的状态**。

## 原生 EventSource 的死穴：只会 GET

AI 回复要流式（一个字一个字出来），标准方案是 SSE。但浏览器原生的 `EventSource` 只支持 GET、不能带请求体、连自定义请求头都塞不进去——而对话请求要 POST 一段用户消息加上鉴权 Token。所以用了微软的 `@microsoft/fetch-event-source`，本质是拿 fetch 手动实现 SSE 协议解析：

```js title="src/views/consultation.vue"
fetchEventSource('/api/psychological-chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Token: token, Accept: 'text/event-stream' },
  body: JSON.stringify({ sessionId, userMessage }),
  signal: streamController.signal,   // AbortController：随时能掐断
  onmessage: (event) => {
    if (event.event === 'done') { ... }        // 服务端宣布结束
    const payload = JSON.parse(event.data)
    currentAiMessage.content += payload.data.content   // 增量拼接
  },
})
```

几个实战细节：`onopen` 里先验响应头真的是 `text/event-stream`（后端降级成普通 JSON 时立刻报错，而不是静默卡住）；`AbortController` 挂在组件状态上，用户切会话或重发时先掐掉旧流；`isSending` 锁防连点。

## 情绪花园：对话结束的那一刻才是重点

这个产品和普通 Chat 最大的区别在 `done` 事件之后——流式结束不代表交互结束，而是立刻触发一次**情绪分析**：

```js
if (eventName === 'done') {
  isAiTyping.value = false
  streamController.abort()
  getCurrentSessionEmotion(currentSession.value.sessionId)  // ← 这里
}
```

后端分析完这轮对话的主导情绪（开心、悲伤、焦虑、平静……九种），前端的"情绪花园"面板随之换主题——悲伤有悲伤的配色，平静有平静的样子。**用户不填任何表单，情绪状态是从对话里长出来的**。这比"请给今天的心情打分"体验好一个量级：心情差的人最没力气填表。

情绪日记页（1200 多行的 `emotionDiary.vue`）再把这些数据沉淀下来，九种情绪各配了手绘图标，趋势用 ECharts 画。

## 长对话的性能：虚拟滚动这里是真需要

上一篇博客我刚写过"静态长文别用虚拟滚动"，这里恰好是反例的正面版本：聊天记录是**动态增长、条目高度不齐、可能几百上千条**的列表，正是 windowing 的主场。用了 `vue-virtual-scroller` 的 `RecycleScroller`，DOM 里永远只有视口附近的消息。同一个技术，在文档里是反模式，在聊天流里是必需品——判断标准从来不是技术本身，是内容形态。

## 一些顺手但值得记的小件

- **TTS 朗读**：`useTTS` composable 包着 Web Speech API，每条 AI 消息可以点播/暂停——陪伴类产品里"听"比"读"更接近陪伴；
- **骨架屏**：会话列表、仪表盘各配了专属 skeleton 组件，加载不闪白；
- **主题切换**：`useTheme` 管明暗，情绪配色叠在主题之上。

## 复盘

这个项目让我把"流式"这件事从后端视角补全到了前端视角：offCat 教我怎么把流稳定地**吐出来**（生命周期、取消、降级），这个项目教我怎么把流优雅地**接住**（协议校验、增量渲染、结束后的二次动作）。两边拼起来，才算真正做过一次流式。
