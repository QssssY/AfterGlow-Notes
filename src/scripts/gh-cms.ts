/*
 * GitHub 直连模式：无服务器时的管理台后端 —— 「服务器」就是 GitHub 本身。
 *
 * 思路致谢 YYsuni/2025-blog-public 的 /write（GitHub App + 浏览器直调 Git API）；
 * 这里降门槛为细粒度 PAT：fork 的人在 GitHub 生成一个只授权自己仓库、只有
 * Contents 读写权限的令牌，粘贴进登录页即可。所有读写走 contents API ——
 * 保存 = 一次真实 git 提交 = 托管平台自动重建（1~3 分钟生效）。
 *
 * 形态切换（admin.ts）：构建时配了 PUBLIC_API_BASE 走 Go 服务，没配走这里。
 * 本模块把 /api/overview/* 的请求合同原样复刻（形状对齐 server/admin.go），
 * 页面代码零改动。服务器独有的能力（统计曲线/在线/友链巡检/音乐托管）在
 * 这个模式下不可用，调用会抛带解释的错误，页面各自兜底。
 *
 * 令牌存 sessionStorage（关浏览器即忘，不落盘）；仓库名/分支存 localStorage。
 */

// ---- 存取 ----

const REPO_KEY = 'afterglow:gh:repo'
const BRANCH_KEY = 'afterglow:gh:branch'
const TOKEN_KEY = 'afterglow:gh:token'
const API_KEY = 'afterglow:gh:api' // 测试与 GHES 可覆写接口根地址

export const ghRepo = () => localStorage.getItem(REPO_KEY) ?? ''
export const ghBranch = () => localStorage.getItem(BRANCH_KEY) || 'main'
export const ghToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
const apiRoot = () => localStorage.getItem(API_KEY) || 'https://api.github.com'

export function ghSaveAuth(repo: string, token: string, branch = 'main') {
  localStorage.setItem(REPO_KEY, repo)
  localStorage.setItem(BRANCH_KEY, branch)
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function ghClearAuth() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // 没存过
  }
}

/** 登录校验：令牌能读到仓库且有推送权限才放行 */
export async function ghVerify(repo: string, token: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${apiRoot()}/repos/${repo}`, { headers: authHeaders(token) })
  } catch {
    throw new Error('连不上 GitHub API —— 检查网络（国内可能需要代理）')
  }
  if (res.status === 401) throw new Error('令牌无效或已过期')
  if (res.status === 404) throw new Error(`找不到仓库 ${repo} —— 检查拼写，或令牌没授权这个仓库`)
  if (!res.ok) throw new Error(`GitHub 应答异常（HTTP ${res.status}）`)
  const data = (await res.json()) as { permissions?: { push?: boolean } }
  if (!data.permissions?.push) throw new Error('令牌对这个仓库没有写权限 —— 生成时要勾 Contents: Read and write')
}

// ---- 底层：contents API ----

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const token = ghToken()
  if (!token || !ghRepo()) {
    location.replace('/overview/login')
    throw new Error('未登录')
  }
  let res: Response
  try {
    res = await fetch(`${apiRoot()}/repos/${ghRepo()}${path}`, {
      ...init,
      headers: { ...authHeaders(token), ...(init.headers as Record<string, string>) },
    })
  } catch {
    throw new Error('连不上 GitHub API —— 检查网络（国内可能需要代理）')
  }
  if (res.status === 401) {
    ghClearAuth()
    location.replace('/overview/login')
    throw new Error('令牌失效，请重新登录')
  }
  return res
}

async function ghJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await gh(path, init)
  const data = (await res.json().catch(() => null)) as ({ message?: string } & T) | null
  if (!res.ok) {
    if (res.status === 409) throw new Error('远端已被别处修改（提交冲突）——刷新页面重试')
    throw new Error(data?.message ?? `GitHub 请求失败（HTTP ${res.status}）`)
  }
  return data as T
}

// base64 与 UTF-8 互转（atob/btoa 只认 Latin-1，必须走 TextEncoder；分块避免爆栈）
function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}
const encodeText = (s: string) => b64encode(new TextEncoder().encode(s))
function decodeText(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

interface GhFile {
  content: string
  sha: string
}
interface GhEntry {
  name: string
  path: string
  sha: string
  type: string
}

/** 读单个文件；404 返回 null */
async function getFile(path: string): Promise<GhFile | null> {
  const res = await gh(`/contents/${encodePath(path)}?ref=${ghBranch()}`)
  if (res.status === 404) return null
  const data = (await res.json()) as { content?: string; sha: string; message?: string }
  if (!res.ok) throw new Error(data?.message ?? `读取 ${path} 失败`)
  return { content: data.content ?? '', sha: data.sha }
}

/** 列目录；404（目录还不存在）返回 [] */
async function listDir(path: string): Promise<GhEntry[]> {
  const res = await gh(`/contents/${encodePath(path)}?ref=${ghBranch()}`)
  if (res.status === 404) return []
  const data = (await res.json()) as GhEntry[] | { message?: string }
  if (!res.ok || !Array.isArray(data)) {
    throw new Error((data as { message?: string })?.message ?? `列目录 ${path} 失败`)
  }
  return data
}

async function putFile(path: string, contentB64: string, message: string, sha?: string) {
  await ghJson(`/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentB64, branch: ghBranch(), ...(sha ? { sha } : {}) }),
  })
}

async function deleteFile(path: string, message: string, sha: string) {
  await ghJson(`/contents/${encodePath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: ghBranch() }),
  })
}

// 路径按段编码：中文文件名（歌词等）要过 URL，斜杠本身保留
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

// ---- front-matter：与 server/admin.go 的 parsePost / renderPost 对齐 ----

import type { PostMeta } from './admin'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** 值解码：Go %q 的双引号串与 JSON 兼容，裸值原样 */
function unquote(v: string): string {
  const t = v.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string
    } catch {
      return t.slice(1, -1)
    }
  }
  return t
}

export function parsePost(raw: string): { meta: PostMeta; body: string } {
  const m = FM_RE.exec(raw)
  if (!m) throw new Error('文件缺少 front-matter')
  const meta: PostMeta = { title: '', date: '', tags: [], draft: false }
  for (const line of m[1]!.split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    switch (key) {
      case 'title':
        meta.title = unquote(val)
        break
      case 'description':
        meta.description = unquote(val)
        break
      case 'date':
        meta.date = unquote(val).slice(0, 10)
        break
      case 'updated':
        meta.updated = unquote(val).slice(0, 10)
        break
      case 'category':
        meta.category = unquote(val)
        break
      case 'cover':
        meta.cover = unquote(val)
        break
      case 'draft':
        meta.draft = val === 'true'
        break
      case 'tags':
        if (val.startsWith('[')) {
          meta.tags = val
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map((t) => unquote(t))
            .filter(Boolean)
        }
        break
    }
  }
  return { meta, body: m[2]!.replace(/^[\r\n]+|[\r\n]+$/g, '') }
}

/** 组回文件：写死一种规范格式，字符串一律双引号（与 Go renderPost 一致） */
export function renderPost(meta: PostMeta, body: string): string {
  const q = (s: string) => JSON.stringify(s)
  let out = '---\n'
  out += `title: ${q(meta.title)}\n`
  if (meta.description) out += `description: ${q(meta.description)}\n`
  out += `date: ${meta.date}\n`
  if (meta.updated) out += `updated: ${meta.updated}\n`
  if (meta.tags.length > 0) out += `tags: [${meta.tags.map(q).join(', ')}]\n`
  if (meta.category) out += `category: ${q(meta.category)}\n`
  if (meta.cover) out += `cover: ${meta.cover}\n`
  if (meta.draft) out += 'draft: true\n'
  out += '---\n\n'
  out += body.replaceAll('\r\n', '\n').replace(/\n+$/, '')
  out += '\n'
  return out
}

// ---- /api/overview/* 合同复刻 ----

const POSTS_DIR = 'src/content/posts'
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']
const SITE_NAMES = ['avatar', 'art', 'snapshot-1', 'snapshot-2', 'snapshot-3']

const ext = (name: string) => {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

async function listPosts() {
  const entries = (await listDir(POSTS_DIR)).filter(
    (e) => e.type === 'file' && (e.name.endsWith('.md') || e.name.endsWith('.mdx')),
  )
  const posts = await Promise.all(
    entries.map(async (e) => {
      const file = await getFile(e.path)
      const { meta } = parsePost(decodeText(file!.content))
      return {
        slug: e.name.replace(/\.(md|mdx)$/, ''),
        modified: meta.updated ?? meta.date,
        ...meta,
      }
    }),
  )
  posts.sort((a, b) => (a.date < b.date ? 1 : -1))
  return posts
}

async function findPost(slug: string): Promise<{ path: string; file: GhFile } | null> {
  for (const e of ['.md', '.mdx']) {
    const path = `${POSTS_DIR}/${slug}${e}`
    const file = await getFile(path)
    if (file) return { path, file }
  }
  return null
}

/** 同名不同扩展的旧图清掉（封面/头像/配图按名覆盖时），glob 命中才唯一 */
async function removeSiblingExts(dir: string, base: string, keepExt: string, msg: string) {
  const entries = await listDir(dir)
  for (const e of entries) {
    if (e.type !== 'file') continue
    const x = ext(e.name)
    if (e.name === base + x && IMAGE_EXTS.includes(x) && x !== keepExt) {
      await deleteFile(e.path, msg, e.sha)
    }
  }
}

async function handleUpload(fd: FormData): Promise<{ path: string }> {
  const file = fd.get('file')
  if (!(file instanceof File)) throw new Error('缺少 file 字段')
  const kind = String(fd.get('kind') ?? '')
  const x = ext(file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const b64 = b64encode(bytes)
  const requireImage = () => {
    if (!IMAGE_EXTS.includes(x)) throw new Error('图片只收 png / jpg / webp / gif / avif')
  }

  switch (kind) {
    case 'cover': {
      const slug = String(fd.get('slug') ?? '')
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error('封面上传要带合法的 slug')
      requireImage()
      const dir = `${POSTS_DIR}/_covers`
      await removeSiblingExts(dir, slug, x, `overview: 更换封面 ${slug}`)
      const path = `${dir}/${slug}${x}`
      const prev = await getFile(path)
      await putFile(path, b64, `overview: 上传封面 ${slug}${x}`, prev?.sha)
      return { path: `./_covers/${slug}${x}` }
    }
    case 'image': {
      requireImage()
      // 内容寻址与服务端同规则：SHA-256 前 8 字节的十六进制
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
      const name =
        [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('') + x
      const path = `public/images/uploads/${name}`
      const prev = await getFile(path)
      if (!prev) await putFile(path, b64, `overview: 上传插图 ${name}`)
      return { path: `/images/uploads/${name}` }
    }
    case 'avatar': {
      const domain = String(fd.get('name') ?? '')
        .trim()
        .toLowerCase()
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('头像上传要带域名（如 ruanyifeng.com）')
      requireImage()
      await removeSiblingExts('images/blogroll', domain, x, `overview: 更换头像 ${domain}`)
      const path = `images/blogroll/${domain}${x}`
      const prev = await getFile(path)
      await putFile(path, b64, `overview: 上传头像 ${domain}${x}`, prev?.sha)
      return { path: `images/blogroll/${domain}${x}` }
    }
    case 'project': {
      const name = String(fd.get('name') ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (!name) throw new Error('项目配图上传要带仓库名')
      requireImage()
      await removeSiblingExts('images/projects', name, x, `overview: 更换配图 ${name}`)
      const path = `images/projects/${name}${x}`
      const prev = await getFile(path)
      await putFile(path, b64, `overview: 上传配图 ${name}${x}`, prev?.sha)
      return { path: `images/projects/${name}${x}` }
    }
    case 'site': {
      const name = String(fd.get('name') ?? '')
        .trim()
        .toLowerCase()
      if (!SITE_NAMES.includes(name)) throw new Error('name 只能是 avatar / art / snapshot-1 / snapshot-2 / snapshot-3')
      requireImage()
      await removeSiblingExts('images/site', name, x, `overview: 更换站点图 ${name}`)
      const path = `images/site/${name}${x}`
      const prev = await getFile(path)
      await putFile(path, b64, `overview: 上传站点图 ${name}${x}`, prev?.sha)
      return { path: `images/site/${name}${x}` }
    }
    case 'favicon': {
      if (x === '.svg') {
        const prev = await getFile('public/favicon.svg')
        await putFile('public/favicon.svg', b64, 'overview: 更换站标', prev?.sha)
        return { path: '/favicon.svg' }
      }
      if (x === '.png') {
        const apple = await getFile('public/apple-touch-icon.png')
        await putFile('public/apple-touch-icon.png', b64, 'overview: 更换站标（touch icon）', apple?.sha)
        const f32 = await getFile('public/favicon-32.png')
        await putFile('public/favicon-32.png', b64, 'overview: 更换站标', f32?.sha)
        return { path: '/favicon-32.png' }
      }
      throw new Error('站标只收 svg 或 png（建议方形，png 边长 ≥180）')
    }
    case 'music':
      throw new Error('GitHub 直连模式不收音乐：版权物不该进公开仓库，需要服务器形态（README 方式 A/B）')
    default:
      throw new Error('kind 只能是 cover / image / avatar / project / site / favicon')
  }
}

/**
 * 站点图预览（对应 GET /api/overview/asset/site/{name}）：
 * 传过的从 images/site/ 读，没传过给仓库默认图（映射与 src/utils/site-images.ts 一致）。
 * 返回 blob URL；找不到返回 null。
 */
export async function ghSiteAssetUrl(name: string): Promise<string | null> {
  const candidates: string[] = []
  for (const e of IMAGE_EXTS) candidates.push(`images/site/${name}${e}`)
  const defaults: Record<string, string> = {
    avatar: 'images/cat001.jpg',
    art: 'images/bg.webp',
    'snapshot-1': 'images/snapshot-dusk.png',
    'snapshot-2': 'images/snapshot-field.png',
    'snapshot-3': 'images/snapshot-lantern.png',
  }
  if (defaults[name]) candidates.push(defaults[name]!)
  for (const path of candidates) {
    const file = await getFile(path).catch(() => null)
    if (!file) continue
    const bin = atob(file.content.replace(/\s/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes]))
  }
  return null
}

/** /api/overview/* 的 GitHub 版实现 —— admin.ts 的 api() 在 GitHub 模式下走这里 */
export async function ghRoute<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const route = path.replace(/^\/api\/overview\//, '')

  if (route === 'posts' && method === 'GET') return (await listPosts()) as T

  const postMatch = /^posts\/([^/]+)$/.exec(route)
  if (postMatch) {
    const slug = decodeURIComponent(postMatch[1]!)
    if (method === 'GET') {
      const found = await findPost(slug)
      if (!found) throw new Error('没有这篇文章')
      const { meta, body } = parsePost(decodeText(found.file.content))
      return { slug, meta, body } as T
    }
    if (method === 'PUT') {
      const { meta, body } = init.body as { meta: PostMeta; body: string }
      if (!meta?.title?.trim()) throw new Error('标题不能为空')
      if (!meta.date) throw new Error('日期不能为空')
      const found = await findPost(slug)
      const target = found?.path ?? `${POSTS_DIR}/${slug}.md`
      await putFile(
        target,
        encodeText(renderPost(meta, body)),
        `overview: ${found ? '更新' : '新增'}文章 ${slug}`,
        found?.file.sha,
      )
      return {} as T
    }
    if (method === 'DELETE') {
      const found = await findPost(slug)
      if (!found) throw new Error('没有这篇文章')
      await deleteFile(found.path, `overview: 删除文章 ${slug}`, found.file.sha)
      // 顺手清封面（可能是任意图片扩展名）
      for (const e of await listDir(`${POSTS_DIR}/_covers`)) {
        if (e.type === 'file' && IMAGE_EXTS.includes(ext(e.name)) && e.name === slug + ext(e.name)) {
          await deleteFile(e.path, `overview: 删除封面 ${slug}`, e.sha).catch(() => {})
        }
      }
      return {} as T
    }
  }

  // ?locale=en 是译文覆盖文件（src/data/<name>.<locale>.json），与 Go 端同一套合同：
  // GET 缺文件回 null（前端从空表开始）、DELETE 只对译文开放（删 = 整组回落中文）
  const dataMatch = /^data\/([a-z0-9-]{1,32})(?:\?locale=([a-z]{2}(?:-[a-z]{2,8})?))?$/.exec(route)
  if (dataMatch) {
    const name = dataMatch[1]!
    const locale = dataMatch[2]
    if (locale === 'zh') throw new Error('zh 是基准语种，它的真身就是主文件')
    const path = locale ? `src/data/${name}.${locale}.json` : `src/data/${name}.json`
    if (method === 'GET') {
      const file = await getFile(path)
      if (!file) {
        if (locale) return null as T
        throw new Error(`没有这份数据（${name}）`)
      }
      return JSON.parse(decodeText(file.content)) as T
    }
    if (method === 'PUT') {
      const file = await getFile(path)
      await putFile(
        path,
        encodeText(JSON.stringify(init.body, null, 2) + '\n'),
        `overview: 更新${locale ? `译文 ${name}.${locale}` : `数据 ${name}`}`,
        file?.sha,
      )
      return {} as T
    }
    if (method === 'DELETE' && locale) {
      const file = await getFile(path)
      if (file) await deleteFile(path, `overview: 删除译文 ${name}.${locale}`, file.sha)
      return {} as T
    }
  }

  if (route === 'upload' && method === 'POST') {
    if (!(init.body instanceof FormData)) throw new Error('上传要用 FormData')
    return (await handleUpload(init.body)) as T
  }

  if (route === 'summary' && method === 'GET') {
    const posts = await listPosts()
    return {
      posts: posts.length,
      drafts: posts.filter((p) => p.draft).length,
      siteLikes: 0,
      postLikes: 0,
      views: 0,
      topViews: null,
      topLikes: null,
      buildCmd: false,
    } as T
  }

  if (route === 'build') {
    if (method === 'GET') return { running: false, last: null } as T
    throw new Error('GitHub 直连模式不用手动构建：每次保存就是一次提交，托管平台会自动重建（1~3 分钟）')
  }

  if (route === 'stats' || route === 'linkcheck') {
    throw new Error('统计与友链巡检需要服务器形态（README 方式 A/B）——纯静态托管没有数据服务')
  }

  throw new Error(`GitHub 直连模式不支持该操作（${method} ${path}）`)
}
