/**
 * 文章统计 —— 阅读时长与字数。
 * 没用 reading-time 之类的库：它们按空格切词，中文全文会被当成 1 个词。
 */

const CJK = /[㐀-䶿一-鿿豈-﫿]/g
const LATIN = /[a-zA-Z0-9]+/g

/** 每分钟阅读字数，中文常用值 */
const SPEED = 300

export function postStats(body: string) {
  const text = body
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '') // 图片与链接
    .replace(/^---[\s\S]*?---/, '') // frontmatter

  const count = (text.match(CJK)?.length ?? 0) + (text.match(LATIN)?.length ?? 0)

  return {
    words: count,
    minutes: Math.max(1, Math.round(count / SPEED)),
    /** 设计稿的写法：1.8k 字 / 860 字 */
    wordsLabel: count >= 1000 ? `${(count / 1000).toFixed(1)}k 字` : `${count} 字`,
  }
}

/** 设计稿 Uptime Card 的写法：1,024 */
export function daysSince(since: Date) {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000)
  return days.toLocaleString('en-US')
}

/**
 * 设计稿的相对时间写法：今天 / 昨天 / 3 天前 / 2 个月前 / 1 年前。
 * 文章页的 Actions 行和左栏 ARTICLE 面板都要说「更新于」，共用这一份。
 */
export function relativeDay(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}
