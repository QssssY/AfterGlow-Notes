/**
 * 文章统计 —— 阅读时长与字数。
 * 没用 reading-time 之类的库：它们按空格切词，中文全文会被当成 1 个词。
 */

import { localeMeta, type Locale } from '~/i18n/locales'

// 汉字（扩展 A / 基本区 / 兼容区）+ 平假名 / 片假名（぀-ヿ）+ 谚文音节。
// 日文正文七成是假名：早先只数汉字，`ja/rewrite-blog-with-astro.md` 实际 1069 字
// 只算出 296 字 / 1 分钟 —— locales.ts 给日文的 500 字/分是按逐字计数定的
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣]/g
const LATIN = /[a-zA-Z0-9]+/g

/**
 * 计数单位是「CJK 字数 + 拉丁词数」，混排正文也能算。
 * 速度按**文章自己的语言**取（见 locales.ts 的 readingSpeed）：
 * 中文 300 字/分、日文 500 字/分、英文 220 词/分 —— 拿中文的速度去除英文词数，
 * 阅读时长会虚高三四倍。
 */
export function postStats(body: string, locale: Locale = 'zh') {
  const text = body
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '') // 图片与链接
    .replace(/^---[\s\S]*?---/, '') // frontmatter

  const count = (text.match(CJK)?.length ?? 0) + (text.match(LATIN)?.length ?? 0)

  return {
    words: count,
    minutes: Math.max(1, Math.round(count / localeMeta[locale].readingSpeed)),
  }
}

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
