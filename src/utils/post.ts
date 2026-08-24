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
    /** 设计的写法：1.8k 字 / 860 字 */
    wordsLabel: count >= 1000 ? `${(count / 1000).toFixed(1)}k 字` : `${count} 字`,
  }
}

/** 设计 Uptime Card 的写法：1,024 */
/**
 * 日历天数差：跨过几个午夜就是几天（8/21 → 8/24 = 3），按运行环境本地时区起算。
 * 旧口径 floor((now-since)/24h) 是「满 24 小时才算一天」—— 起点钉在 UTC 零点时，
 * 北京用户每天要等到早上 8 点数字才 +1，被用户点名「都第三天了还显示 2」。
 * 服务端渲染的数字只是无 JS 兜底，客户端 uptime.ts 会按访客时区实时重算覆盖。
 */
export function calendarDaysSince(since: Date) {
  const mid = (t: Date | number) => {
    const d = new Date(t)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  // round 不用 floor：夏令时会让个别「一天」差一小时，四舍五入抹平
  return Math.round((mid(new Date()) - mid(since)) / 86_400_000)
}

export function daysSince(since: Date) {
  return calendarDaysSince(since).toLocaleString('en-US')
}

/**
 * 设计的相对时间写法：今天 / 昨天 / 3 天前 / 2 个月前 / 1 年前。
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
