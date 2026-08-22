/**
 * 动态数据服务（server/ 里的 Go 后端）的浏览器端封装。
 *
 * apiBase 为空（没配 PUBLIC_API_BASE）时所有函数直接返回 null，
 * 调用方各自退回本机模式 —— 服务挂了也是同样的降级，页面不报错。
 *
 * visitor 是浏览器端生成的匿名随机 id，只用来做「一人一票 / 一天一次」，
 * 服务端不存 IP 和 UA（见 server/main.go 顶部说明）。
 */

import { apiBase } from '~/config'

const VISITOR_KEY = 'afterglow:visitor'

export function visitorId(): string {
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
  if (!apiBase) return null
  try {
    const res = await fetch(apiBase + path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const getLikes = (slug: string) =>
  req<LikeState>(`/api/likes?slug=${encodeURIComponent(slug)}&visitor=${visitorId()}`)

export const postLike = (slug: string, action: 'like' | 'unlike') =>
  req<LikeState>('/api/likes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, visitor: visitorId(), action }),
  })

export const postView = (slug: string) =>
  req<{ count: number }>('/api/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, visitor: visitorId() }),
  })

export interface HotItem {
  slug: string
  count: number
}

/** 阅读数最高的前 N 篇（首页「大家在看」卡） */
export const getHot = (limit = 3) => req<{ items: HotItem[] }>(`/api/hot?limit=${limit}`)
