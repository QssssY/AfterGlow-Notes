/**
 * 动态数据服务（server/ 里的 Go 后端）的浏览器端封装。
 *
 * apiBase 为 null（没配 PUBLIC_API_BASE）时所有函数直接返回 null，
 * 调用方各自退回本机模式 —— 服务挂了也是同样的降级，页面不报错。
 * apiBase 为 ''（PUBLIC_API_BASE=/，Go 服务 -site 托管全站的同源部署）时
 * 请求走相对路径：免 CORS 预检、免第二条 TLS 连接。
 *
 * visitor 是浏览器端生成的匿名随机 id，只用来做「一人一票 / 一天一次」，
 * 服务端不存 IP 和 UA（见 server/main.go 顶部说明）。
 */

import { apiBase } from '~/config'

const VISITOR_KEY = 'afterglow:visitor'

function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY)
    if (!v) {
      v = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, v)
    }
    return v
  } catch {
    // 隐私模式存不了：退化成共享身份，点赞去重交给服务端限流兜底
    return 'anon'
  }
}

export interface LikeState {
  count: number
  liked: boolean
}

async function req<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (apiBase === null) return null
  try {
    const res = await fetch(apiBase + path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/*
 * ---- SWR 回放：上次的应答先亮出来，网络应答到了再校正 ----
 *
 * 计数类数据旧几分钟毫无代价，但「等一个往返才出现」很显眼 —— 尤其在换页
 * 瞬时的站上，别的都秒出、就数字慢半拍。回放的只是服务端的聚合应答原文，
 * 不新增任何采集。首次访问没有缓存，行为跟原来完全一样。
 */
const swrKey = (key: string) => `afterglow:swr:${key}`

export function swr<T>(key: string, fetcher: () => Promise<T | null>, apply: (state: T) => void) {
  const storeKey = swrKey(key)
  try {
    const cached = localStorage.getItem(storeKey)
    if (cached !== null) apply(JSON.parse(cached) as T)
  } catch {
    // 读不了 / 存的是坏值：跳过回放，等网络
  }
  fetcher().then((state) => {
    if (state === null) return
    try {
      localStorage.setItem(storeKey, JSON.stringify(state))
    } catch {
      // 存不了就每次现拉
    }
    apply(state)
  })
}

/**
 * swrPatch：把交互产生的新状态合并进 SWR 缓存。
 * 点赞后如果不同步缓存，下次回放会先闪一下点赞前的旧态、等网络应答才校正。
 */
export function swrPatch(key: string, patch: object) {
  const storeKey = swrKey(key)
  try {
    const cached = localStorage.getItem(storeKey)
    if (cached === null) return
    localStorage.setItem(storeKey, JSON.stringify({ ...JSON.parse(cached), ...patch }))
  } catch {
    // 读写不了就算了 —— 缓存本来就只是提前亮数字
  }
}

export const getLikes = (slug: string) =>
  req<LikeState>(`/api/likes?slug=${encodeURIComponent(slug)}&visitor=${visitorId()}`)

/*
 * 公开写接口的 POST 故意不带 Content-Type: application/json：
 * fetch 对字符串 body 默认给 text/plain，属于 CORS「简单请求」——
 * 分体部署（站点在 Vercel/CF/GH Pages、API 在小机子）是跨域的，带 JSON
 * 头的 POST 浏览器要先发一次 OPTIONS 预检探路；去掉后每次点赞、每次进
 * 文章页都省一个往返。Go 端的 json.Decoder 只看 body 不看这个头。
 */
export const postLike = (slug: string, action: 'like' | 'unlike') =>
  req<LikeState>('/api/likes', {
    method: 'POST',
    body: JSON.stringify({ slug, visitor: visitorId(), action }),
  })

/** 文章页的合并应答 —— 一个往返拿齐全部计数 */
export interface TouchState {
  views: number
  likes: number
  liked: boolean
  /** 最近 5 分钟在线的访客数（聚合匿名，见 server/visitors.go） */
  online: number
}

/*
 * touch：记一次阅读并返回 views + likes + liked + online。
 * 原来这是两个请求（GET /api/likes + POST /api/views）；文章页的点赞按钮
 * 和阅读数脚本是两个消费方，这里按 slug 记住进行中的请求让它们共用一次
 * POST，换页时清掉（astro:before-swap 在新文档就位前触发）。
 */
let touchMemo: { slug: string; promise: Promise<TouchState | null> } | null = null
document.addEventListener('astro:before-swap', () => {
  touchMemo = null
})

export function touch(slug: string): Promise<TouchState | null> {
  if (touchMemo?.slug === slug) return touchMemo.promise
  const promise = req<TouchState>('/api/touch', {
    method: 'POST',
    // 不带 JSON 头 —— 保持「简单请求」免预检，见 postLike 上方说明
    body: JSON.stringify({ slug, visitor: visitorId() }),
  })
  touchMemo = { slug, promise }
  return promise
}

export interface HotItem {
  slug: string
  count: number
}

/** 阅读数最高的前 N 篇（首页「大家在看」卡） */
export const getHot = (limit = 3) => req<{ items: HotItem[] }>(`/api/hot?limit=${limit}`)
