/**
 * 管理台的浏览器端基建：API 封装 / 登录态 / toast。
 *
 * API 地址取 PUBLIC_API_BASE；没配时退回本机默认端口 —— 管理台本来就是
 * 「在自己电脑上对着本地服务用」的工具，这个默认值让 pnpm dev 免配置可用。
 */
import { apiBase } from '~/config'
import { ghClearAuth, ghRepo, ghRoute, ghSiteAssetUrl, ghToken } from './gh-cms'

/**
 * 双后端：配了 PUBLIC_API_BASE 走 Go 数据服务（'' = 同源）；
 * 没配 = GitHub 直连模式 —— 管理台读写全走 GitHub contents API，
 * 保存即提交、托管平台自动重建（无服务器的 fork 也有完整管理台）。
 * 本地想连 Go 就在 .env 里设 PUBLIC_API_BASE=http://127.0.0.1:8787（.env.example 有）。
 */
export const ghMode = apiBase === null
export const API = apiBase ?? ''

const TOKEN_KEY = 'afterglow:admin:token'

export const getToken = () => (ghMode ? ghToken() : localStorage.getItem(TOKEN_KEY))
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => {
  if (ghMode) ghClearAuth()
  else localStorage.removeItem(TOKEN_KEY)
  // 登出（含 401 被踢）连缓存的后台数据一起清 —— 别把管理数据留给下一个用这台浏览器的人
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // sessionStorage 不可用时本来也没存过
  }
}

/*
 * ---- 管理数据的 sessionStorage 缓存：页签切换秒渲染 ----
 *
 * 管理台没挂客户端路由，每次切页签都是整页加载 + 重新拉数据，页面要空着
 * 「加载中…」等一个往返（分体部署时还是跨大洋的往返）。这里学站点前台的
 * SWR：上次的应答先渲染出来，最新应答到了再原地校正。
 * 存 sessionStorage 而不是 localStorage：关浏览器即清，后台数据不落盘过夜。
 */
const CACHE_PREFIX = 'afterglow:admin:cache:'

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function cachePut(key: string, value: unknown) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // 存不了就每次现拉
  }
}

/** swrAdmin：缓存先渲染、网络再校正。返回网络那一程，调用方照旧 .catch(report) */
export async function swrAdmin<T>(
  key: string,
  fetcher: () => Promise<T>,
  apply: (value: T) => void,
): Promise<void> {
  const cached = cacheGet<T>(key)
  if (cached !== null) {
    try {
      apply(cached)
    } catch {
      // 缓存的形状过期了（接口字段改了）：当没有缓存，等网络应答
    }
  }
  const fresh = await fetcher()
  cachePut(key, fresh)
  apply(fresh)
}

/** 带 token 的请求；401 一律送回登录页。body 传对象自动 JSON 化，传 FormData 原样发。
 *  GitHub 直连模式下不发 HTTP 给自己人，整个转给 gh-cms 的合同复刻层 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (ghMode) return ghRoute<T>(path, init)
  const headers: Record<string, string> = { Authorization: `Bearer ${getToken() ?? ''}` }
  let body: BodyInit | undefined
  if (init.body instanceof FormData) {
    body = init.body
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }

  let res: Response
  try {
    res = await fetch(API + path, { method: init.method ?? 'GET', headers, body })
  } catch {
    throw new Error(`连不上数据服务（${API}）——先把 server/ 跑起来`)
  }
  if (res.status === 401) {
    clearToken()
    location.replace('/overview/login')
    throw new Error('未登录')
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`)
  return data as T
}

/** 站点图预览地址（blob URL）：服务器模式走资产端点，GitHub 模式直读仓库 */
export async function siteAssetUrl(name: string): Promise<string | null> {
  if (ghMode) return ghSiteAssetUrl(name)
  try {
    const res = await fetch(`${API}/api/overview/asset/site/${name}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

/** GitHub 模式登录后显示身份用（登录页存的 owner/repo） */
export const ghRepoName = ghRepo

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(msg: string, ok = true) {
  document.querySelector('.ad-toast')?.remove()
  const el = document.createElement('div')
  el.className = ok ? 'ad-toast' : 'ad-toast ad-toast--err'
  el.textContent = msg
  document.body.append(el)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.classList.add('ad-toast--out')
    setTimeout(() => el.remove(), 300)
  }, 2600)
}

/** 把 Error 摊给用户看：所有按钮回调都用它兜底 */
export function report(err: unknown) {
  toast(err instanceof Error ? err.message : String(err), false)
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** 页面脚本的 DOM 快捷手：断言必中 —— 管理页的静态骨架都在同文件里，选不到是笔误 */
export const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

/** 本地时区的 YYYY-MM-DD（toISOString 是 UTC，晚上八点后会跳到「明天」） */
export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 文章 slug 规则，与服务端 slugRe 一致 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

// ---- 服务端类型（与 server/admin.go 对应）----

export interface PostMeta {
  title: string
  description?: string
  date: string
  updated?: string
  tags: string[]
  category?: string
  cover?: string
  draft: boolean
}

export interface PostListItem extends PostMeta {
  slug: string
  modified: string
}

export interface Summary {
  posts: number
  drafts: number
  siteLikes: number
  postLikes: number
  views: number
  topViews: { slug: string; count: number }[] | null
  topLikes: { slug: string; count: number }[] | null
  buildCmd: boolean
}

export interface DayStat {
  day: string
  views: number
  visitors: number
  likes: number
}

export interface Stats {
  online: number
  days: DayStat[]
  totals: { views: number; visitors: number; siteLikes: number; postLikes: number }
}

export interface LinkCheckResult {
  source: 'blogroll' | 'friends'
  name: string
  url: string
  ok: boolean
  status?: number
  ms: number
  err?: string
}

export interface LinkCheck {
  running: boolean
  checkedAt?: string
  results: LinkCheckResult[] | null
}
