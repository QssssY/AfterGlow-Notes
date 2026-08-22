---
title: 一个 Go 文件加 SQLite，给静态博客补上点赞和阅读数
description: 静态站没有后端，但计数需要一个。两张表、匿名随机 id、按天去重，两核的小机子绰绰有余。
date: 2026-08-21
tags: [Go, SQLite, 后端]
category: 后端工程
---

静态博客有一个绕不开的矛盾：页面可以是死的，但点赞和阅读数必须是活的。市面上的解法要么接第三方统计（把访客数据交出去），要么上 serverless 函数加云数据库（为两个计数器养一整套云资源）。我选了最土的路：自己写一个 Go 服务。

写完统计了一下，连注释带管理接口一共几百行，核心逻辑不到两百行。部署是一个二进制加一个数据库文件。

## 表设计：把去重交给主键

只有两张表，约束全部长在主键上：

```sql
CREATE TABLE likes (
  slug    TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (slug, visitor)
);
CREATE TABLE views (
  slug    TEXT NOT NULL,
  visitor TEXT NOT NULL,
  day     TEXT NOT NULL,
  PRIMARY KEY (slug, visitor, day)
);
```

- 点赞：每个 `(文章, 访客)` 一票，重复点赞靠 `ON CONFLICT DO NOTHING` 自然吸收，取消就是一条 `DELETE`。
- 阅读：主键多加一个 `day`，同一人同一天刷十次也只算一次，不用写任何去重代码。

计数就是 `SELECT COUNT(*)`。在"个人博客"这个量级上，任何关于性能的担心都是自作多情。

## visitor 是谁：匿名随机 id

访客第一次来时，浏览器端 `crypto.randomUUID()` 生成一个随机 id 存进 localStorage，之后所有请求带着它。服务端**不存 IP、不存 UA、不存来路**——限流用的 IP 只进内存，进程一重启就没了。

这样"一人一票"是成立的（换浏览器算新人，可以接受），而数据库里没有任何能反查到具体人的东西。关于页承诺了不做画像，代码得兑现它。

## SQLite 的两个工程选择

**驱动用 `modernc.org/sqlite`**，纯 Go 实现，不需要 CGO。代价是性能比官方 C 版慢一些，换来的是 `GOOS=linux go build` 在 Windows 上直接交叉编译出 Linux 二进制，部署不用碰工具链。博客的写入频率用不着 C 版的性能。

**连接池锁成一条**：

```go
db, _ := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
db.SetMaxOpenConns(1)
```

SQLite 同一时刻只允许一个写入者，与其让多个连接互相撞 `SQLITE_BUSY`，不如从源头只开一条连接排队。WAL 模式让读不阻塞写。这两行配置解决了 SQLite 并发上 90% 的常见坑。

## 防滥用：内存里的日额度

没有账号体系，防刷只能靠朴素手段：每个 IP 每天最多 200 次写操作，计数放在一个 `map[string]int` 里，跨天清零。够挡住手滑的循环脚本，挡不住认真的攻击者——但认真的攻击者能得到什么呢？把一篇文章的阅读数刷到十万？那是他的行为艺术，不是我的事故。

> 小系统的安全模型可以理直气壮地小，前提是想清楚"最坏能坏到哪"。

## 部署形态

```text
静态站（任意托管）──fetch──▶ Go 二进制（127.0.0.1:8787）◀── Caddy 反代
                                      │
                                hearth.db（一个文件）
```

备份就是拷走那个 `.db` 文件。迁移就是把它拷到新机器。这种"整个系统能装进一个口袋"的感觉，是当初决定自己写而不是接第三方的最大原因。
