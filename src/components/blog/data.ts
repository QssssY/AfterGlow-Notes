/** 归档页的数据派生 —— 都从真实文章集合算出来，不用设计里的假数字 */

import type { ImageMetadata } from 'astro'
import { getCollection } from 'astro:content'
import { postStats } from '~/utils/post'

export interface ArchivePost {
  id: string
  title: string
  href: string
  date: Date
  category: string
  excerpt: string
  tags: readonly string[]
  minutes: number
  words: number
  wordsLabel: string
  cover?: ImageMetadata | undefined
}

/**
 * 时间倒序取全部已发布文章。
 * 必须放在这个模块里：Astro 会把 getStaticPaths 抽成独立模块，
 * 页面 frontmatter 里的局部函数在那里访问不到。
 */
export async function loadPosts(): Promise<ArchivePost[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft)
  return posts
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map((post) => {
      const stats = postStats(post.body ?? '')
      return {
        id: post.id,
        title: post.data.title,
        href: `/posts/${post.id}`,
        date: post.data.date,
        category: post.data.category ?? '未分类',
        excerpt: post.data.description ?? '',
        tags: post.data.tags,
        minutes: stats.minutes,
        words: stats.words,
        wordsLabel: stats.wordsLabel,
        cover: post.data.cover,
      }
    })
}

/** 设计 Stats 面板的写法：21万 / 3.2k / 48 */
export function compactCount(n: number) {
  if (n >= 10_000) return `${Number((n / 10_000).toFixed(n >= 100_000 ? 0 : 1))}万`
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}k`
  return String(n)
}

/** 按年份倒序分组，组内也倒序 */
export function groupByYear(posts: ArchivePost[]) {
  const years = new Map<number, ArchivePost[]>()
  for (const post of posts) {
    const year = post.date.getFullYear()
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
    const year = post.date.getFullYear()
    counts.set(year, (counts.get(year) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, count]) => ({ year, count }))
}

export function tagCounts(posts: ArchivePost[]) {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 08-19 */
export const monthDay = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
