/**
 * 文章集合的语种解析 —— 全站唯一的取文章入口。
 *
 * 目录约定（src/content/posts/）：
 *   hello-world.md          中文原文（默认语种，不带前缀）
 *   en/hello-world.md       英文译文
 *   ja/hello-world.md       日文译文
 * 文件名（去掉语种目录）就是这篇文章的身份，也是它在三种语言下共用的网址片段：
 * /posts/hello-world、/en/posts/hello-world、/ja/posts/hello-world。
 *
 * 文章按作者写作时的语言呈现：某语种没有译文时显示原文，并在文章页顶部说明
 * （fallback 标记）。不静默顶替 —— 读者有权知道自己在读的是哪种语言的原文。
 *
 * 必须是独立模块：Astro 会把 getStaticPaths 抽成单独的模块去执行，
 * 页面 frontmatter 里的局部函数在那里访问不到。
 */

import type { ImageMetadata } from 'astro'
import { getCollection, type CollectionEntry } from 'astro:content'
import { defaultLocale, isLocale, localeMeta, type Locale } from '~/i18n/locales'
import { localizePath } from '~/i18n/paths'
import { categoryLabel, tagLabel } from '~/i18n/taxonomy'
import { postStats } from '~/utils/post'

export interface ArchivePost {
  /** 与语种无关的身份，同时是网址片段（不含 /posts/ 前缀与语种前缀） */
  id: string
  /** 渲染用的集合条目 —— 文章页 render() 要它 */
  entry: CollectionEntry<'posts'>
  /** 正文实际所用的语言 */
  lang: Locale
  /** true = 这门语言还没有译文，显示的是默认语种原文 */
  fallback: boolean
  /**
   * 标题与摘要的 lang 属性值 —— 只在文字语种与页面语种不一致时有值。
   * 列表卡片直接 `lang={post.titleLang}`：一致时是 undefined，属性不渲染。
   * 不标的话读屏软件会拿页面语种的语音去念外语标题。
   */
  titleLang?: string | undefined
  title: string
  href: string
  date: Date
  updated?: Date | undefined
  /** 已按当前语种翻好的分类显示名 */
  category: string
  excerpt: string
  /** 原始标签（网址用），三语共用 */
  tags: readonly string[]
  /** 已按当前语种翻好的标签显示名，与 tags 同序 */
  tagLabels: readonly string[]
  minutes: number
  words: number
  cover?: ImageMetadata | undefined
}

/** 从集合 id 里拆出语种与身份：'en/hello-world' → { lang: 'en', key: 'hello-world' } */
export function splitPostId(id: string): { lang: Locale; key: string } {
  const slash = id.indexOf('/')
  if (slash > 0) {
    const head = id.slice(0, slash)
    if (isLocale(head)) return { lang: head, key: id.slice(slash + 1) }
  }
  return { lang: defaultLocale, key: id }
}

/**
 * 按语种取全部已发布文章（时间倒序）。
 * 每篇优先取该语种的译文，没有就回落默认语种原文并打上 fallback。
 */
export async function loadPosts(locale: Locale = defaultLocale): Promise<ArchivePost[]> {
  const all = await getCollection('posts', ({ data }) => !data.draft)

  // 同一篇文章的各语言版本归到一组，键是与语种无关的身份
  const groups = new Map<string, Partial<Record<Locale, CollectionEntry<'posts'>>>>()
  for (const entry of all) {
    const { lang, key } = splitPostId(entry.id)
    const group = groups.get(key) ?? {}
    group[lang] = entry
    groups.set(key, group)
  }

  const posts: ArchivePost[] = []
  for (const [key, group] of groups) {
    const translated = group[locale]
    const entry = translated ?? group[defaultLocale]
    // 只有译文、原文却被删了的情况：拿这组里剩下的任意一份，别让整页构建挂掉
    const resolved = entry ?? Object.values(group)[0]
    if (!resolved) continue

    const lang = splitPostId(resolved.id).lang
    const stats = postStats(resolved.body ?? '', lang)
    const tags = resolved.data.tags

    posts.push({
      id: key,
      entry: resolved,
      lang,
      fallback: !translated,
      titleLang: lang === locale ? undefined : localeMeta[lang].htmlLang,
      title: resolved.data.title,
      href: localizePath(`/posts/${key}`, locale),
      date: resolved.data.date,
      updated: resolved.data.updated,
      category: categoryLabel(resolved.data.category ?? '未分类', locale),
      excerpt: resolved.data.description ?? '',
      tags,
      tagLabels: tags.map((tag) => tagLabel(tag, locale)),
      minutes: stats.minutes,
      words: stats.words,
      cover: resolved.data.cover,
    })
  }

  // 同日文章（YAML 日期没有时分，一天发两篇很常见）按 id 定序：只按日期排的话平局顺序
  // 继承 getCollection 的插入序，而 glob loader 是并发读盘、谁先读完谁先进 store ——
  // 「精选」是哪篇、上下篇、RSS 顺序会在 Windows 本机与 CI/Linux 之间飘
  return posts.sort((a, b) => b.date.valueOf() - a.date.valueOf() || a.id.localeCompare(b.id))
}

export interface PostRoute {
  post: ArchivePost
  /** 标签有交集的最近三篇 */
  related: { title: string; href: string; date: Date; titleLang?: string | undefined }[]
  /** 数组是时间倒序：下一项更旧 = 上一篇，上一项更新 = 下一篇 */
  older?: ArchivePost | undefined
  newer?: ArchivePost | undefined
}

/**
 * 一个语种下全部文章页的路由数据。
 *
 * 相关/上下篇在这里算而不是在组件里：这里本来就握着该语种的全部文章，
 * 组件不必再查一次集合。三个语种各调一次，各自的上下篇都在同语种内串联 ——
 * 英文站的「上一篇」不会突然跳去中文页。
 */
export async function postRoutes(locale: Locale) {
  const posts = await loadPosts(locale)

  return posts.map((post, i) => {
    const tags = new Set(post.tags)
    const related = posts
      .filter((other) => other.id !== post.id && other.tags.some((tag) => tags.has(tag)))
      .slice(0, 3)
      .map((other) => ({
        title: other.title,
        href: other.href,
        date: other.date,
        titleLang: other.titleLang,
      }))

    return {
      params: { slug: post.id },
      props: {
        post,
        related,
        older: posts[i + 1],
        newer: posts[i - 1],
      } satisfies PostRoute,
    }
  })
}

/**
 * 一个语种下全部标签页的路由数据。
 * 标签的网址片段是原始标签词（三语共用），显示名在 view 里按语种取。
 */
export async function tagRoutes(locale: Locale) {
  const posts = await loadPosts(locale)
  const tags = new Set<string>()
  for (const post of posts) {
    for (const tag of post.tags) tags.add(tag)
  }

  return [...tags].map((tag) => ({
    params: { tag },
    props: { tag, posts: posts.filter((post) => post.tags.includes(tag)) },
  }))
}

/* ─── 列表页的数据派生 ────────────────────────────────────── */

/** 按年份倒序分组，组内也倒序 */
export function groupByYear(posts: ArchivePost[]) {
  const years = new Map<number, ArchivePost[]>()
  for (const post of posts) {
    const year = post.date.getUTCFullYear()
    const bucket = years.get(year)
    if (bucket) bucket.push(post)
    else years.set(year, [post])
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, posts: items }))
}

/**
 * Archive 面板的年度条形图数据：年份倒序 + 当年篇数。
 *
 * 条长不在这里算 —— 设计的条是「每篇固定像素」，不是把最多的那年归一到满轨，
 * 换算规则跟着面板走（见 ArchivePanel.astro）。
 */
export function yearBars(posts: ArchivePost[]) {
  const counts = new Map<number, number>()
  for (const post of posts) {
    const year = post.date.getUTCFullYear()
    counts.set(year, (counts.get(year) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, count]) => ({ year, count }))
}

/** 标签频次（含当前语种的显示名），多的在前，同频按名字排 */
export function tagCounts(posts: ArchivePost[], locale: Locale) {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, label: tagLabel(name, locale), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
