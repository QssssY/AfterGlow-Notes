/**
 * 管理台的浏览器端基建：API 封装 / 登录态 / toast。
 *
 * API 地址取 PUBLIC_API_BASE；没配时退回本机默认端口 —— 管理台本来就是
 * 「在自己电脑上对着本地服务用」的工具，这个默认值让 pnpm dev 免配置可用。
 */
import { apiBase } from '~/config'

export const API = apiBase || 'http://127.0.0.1:8787'

const TOKEN_KEY = 'firefly:admin:token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

/** 带 token 的请求；401 一律送回登录页。body 传对象自动 JSON 化，传 FormData 原样发 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
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
    location.replace('/admin/login')
    throw new Error('未登录')
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`)
  return data as T
}

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
