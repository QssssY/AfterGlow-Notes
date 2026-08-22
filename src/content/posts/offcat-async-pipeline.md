---
title: offCat 复盘：一次简历诊断，背后跑了多少道工序
description: 我的 AI 求职应用的后端账本：直连线程池与 MQ 的双路由、孤儿任务回收、SSE 流式面试、熔断与多 Provider。
date: 2026-08-22
tags: [Java, 后端, AI, 架构]
category: 后端工程
cover: ./_covers/offcat-async-pipeline.webp
---

[offCat](https://github.com/QssssY/offCat) 是我做得最重的一个项目：面向求职场景的 AI 应用，简历诊断、多模式模拟面试、JD 匹配、模板导出，外加社区、会员配额和管理后台。Spring Boot 3.2 + JDK 21 + MyBatis-Plus + RabbitMQ + Redis + MySQL，`db/migrations` 里躺着九十多个按任务编号的迁移脚本——这个数字本身就是开发过程的年轮。

这篇挑后端里我最花心思的三块讲。

## 简历诊断：不着急排队，也不怕排队

用户传一份 PDF 上来，要经历解析（PDFBox 抽文本，扫描件走多模态）、AI 逐项诊断、阶段进度回写。全程几十秒，同步接口必超时，所以是异步任务。但"异步"具体怎么走，我做了个双路由：

```java title="server/.../mq/DirectProcessRouter.java"
/** 当前正在直连处理的任务数 */
private final AtomicInteger inFlightCount = new AtomicInteger(0);

/** 直连处理并发阈值，超过该数量的任务应回退 MQ */
@Value("${app.diagnosis.direct-threshold:3}")
private int directThreshold;
```

系统空闲时任务直接进本地线程池（`aiAsyncExecutor`），省一次 MQ 往返，用户几乎立刻看到进度在走；并发超过阈值就回退 RabbitMQ 排队削峰。这里有个并发坑：先 `canProcess()` 判断再提交，两步之间别的线程可能挤进来——所以真正的入口是**预留槽位式**的 `submitDirectIfCapacity`，判断和占位是同一个原子操作，避免检查与提交分离导致的穿透。

## 任务会死，但不能死得不明不白

异步链路最阴的坑不是失败，是**卡死**：消费者进程崩了、服务重启了，消息已经 ACK，任务状态永远停在 PROCESSING，用户盯着 45% 的进度条到天荒地老。我的兜底是一个定时回收器：

```java title="server/.../mq/TaskRecoveryScheduler.java"
/** 每 5 分钟扫一次，把超过 10 分钟仍在 PROCESSING 的孤儿任务标为 FAILED */
@Scheduled(fixedRate = 300000, initialDelay = 60000)
public void recoverOrphanedTasks() {
    int recovered = resumeDiagnosisTaskService.recoverOrphanedTasks(ORPHAN_TIMEOUT_MINUTES);
}
```

`initialDelay` 设一分钟是防止应用刚启动、正常任务还没跑完就被误杀。标成 FAILED 之后用户能看到失败原因并点重试（重试链路是 TASK_52 专门补的，含阶段回退）——**宁可明确地失败，不要暧昧地转圈**。配上死信队列消费者，消息层面的失败也有下家接。

## 面试是流式的，而且面试官不止一个人设

模拟面试走 SSE：`POST /session/{id}/message/stream` 返回 `ResponseBodyEmitter`，底下接响应式的 `Publisher`，AI 吐一个 token 前端就渲染一个。流式最麻烦的是**生命周期**——用户中途关页面、网络断掉、AI 超时，三种死法都得把上游订阅取消掉，不然线程和连接就漏了。我的做法是把 `streamClosed` 的 `AtomicBoolean`、emitter 回调和 `Subscription` 引用绑在同一个状态对象上统一管理。

面试官本身是一组可配置的人设常量：普通、压力面、岗位定向、大厂 HR、技术 Leader、外企面试官；反馈模式分"每题即时点评"和"面完统一复盘"；交互支持文字和语音。这些全是 prompt 和参数的组合——**产品上的"多模式"，工程上只是常量表的一行**，这是做 AI 应用最划算的扩展方式。

## AI 接入层：把不可靠当成默认

所有模型调用收口在一个 `AiChatClient`：OpenAI 兼容协议、多 Provider 可配（默认豆包），管理后台能热切引擎；用户还能填自己的 API Key（落库前走 `AiCredentialCrypto` 加密）。围着它的三件套：

- **熔断器**：连续失败后直接快速失败一段时间，别让每个用户都陪着上游超时 180 秒；
- **超时钳制**：可配置的读超时强制夹在 10s–300s 之间，防止配置手滑写出天文数字；
- **降级计费**（TASK_74）：平台引擎不可用时回退备用引擎，配额按实际走的引擎算。

## 回头看

这个项目教会我最多的不是任何一个技术点，而是：**AI 应用的后端，一大半工程量花在"AI 不听话的时候怎么办"上**——排队、重试、回收、熔断、降级，全是给那 5% 的异常路径修的路。剩下的那些（JWT 鉴权、配额、社区、管理后台），是把它从 demo 变成产品的体力活，九十多个迁移脚本就是证据。
