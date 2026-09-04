/**
 * 语种相关的数字与日期格式化 —— 一律走 Intl，不手写模板。
 *
 * 「3 天前 / 3 days ago / 3 日前」「21万 / 210K / 21万」这类差异，手写模板
 * 迟早会在某个语种上说出病句；Intl 是浏览器与 Node 都自带的现成答案。
 * 设计里那些式样固定的写法（2026 · 08 · 19）与语言无关，原样保留。
 */

import { localeMeta, type Locale } from './locales'

const pad = (n: number) => String(n).padStart(2, '0')

/** Intl 实例不便宜，按 (语种, 用途) 缓存 */
const cache = new Map<string, unknown>()
function memo<T>(key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit) return hit as T
  const made = make()
  cache.set(key, made)
  return made
}

export function createFormat(locale: Locale) {
  const tag = localeMeta[locale].intl

  const dtf = (key: string, options: Intl.DateTimeFormatOptions) =>
    memo(`${tag}:${key}`, () => new Intl.DateTimeFormat(tag, options))

  /*
   * 下面这组吃的都是「日历日」：文章 date / updated（frontmatter 里的 2026-08-22，
   * z.coerce.date 解成 UTC 零点）、now.updated、uptime.since（Date.UTC 钉死）。
   * 取年月日一律按 UTC、Intl 也钉 timeZone:'UTC' —— 用构建机本地时区取的话，
   * UTC 以西的机器（fork 到美洲的开发者、某些托管平台）所有日期少一天，
   * 元旦的文章会归到上一年。CI 在 UTC、本机在东八区，所以此前没露馅。
   * weekday / clockDate 例外：它们格式化的是「现在」，按本地走
   */
  const utc = { timeZone: 'UTC' } as const

  return {
    /** 设计固定式样：2026 · 08 · 19（与语言无关，三语共用） */
    dateDots(d: Date) {
      return `${d.getUTCFullYear()} · ${pad(d.getUTCMonth() + 1)} · ${pad(d.getUTCDate())}`
    },

    /** 08-19（时间轴行用，与语言无关） */
    monthDayNumeric(d: Date) {
      return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    },

    /** 2026 年 8 月 22 日 / August 22, 2026 / 2026年8月22日 */
    dateFull(d: Date) {
      return dtf('full', { year: 'numeric', month: 'long', day: 'numeric', ...utc }).format(d)
    },

    /** 8 月 18 日 / Aug 18 / 8月18日 */
    monthDay(d: Date) {
      return dtf('md', { month: 'short', day: 'numeric', ...utc }).format(d)
    },

    /** 2026 年 8 月 / August 2026 / 2026年8月 */
    yearMonth(d: Date) {
      return dtf('ym', { year: 'numeric', month: 'long', ...utc }).format(d)
    },

    /** 8 月 / Aug / 8月 —— 移动端 NOW 卡右上角那枚小戳 */
    monthShort(d: Date) {
      return dtf('m', { month: 'short', ...utc }).format(d)
    },

    /** 2026 / 08（相关文章那行） */
    yearSlashMonth(d: Date) {
      return `${d.getUTCFullYear()} / ${pad(d.getUTCMonth() + 1)}`
    },

    /** 周三 / Wed / 水 —— 大时钟底下那行（「现在」，按本地时区） */
    weekday(d: Date) {
      return dtf('wd', { weekday: 'short' }).format(d)
    },

    /** 时钟日期行：8 月 24 日 · 周日 / Aug 24 · Sun / 8月24日 · 日（「现在」，按本地时区） */
    clockDate(d: Date) {
      return `${dtf('md-local', { month: 'short', day: 'numeric' }).format(d)} · ${this.weekday(d)}`
    },

    /**
     * 今天 / 昨天 / 3 天前 / 2 个月前 / 1 年前。
     * numeric:'auto' 才会把 -1 天说成「昨天」而不是「1 天前」。
     */
    relativeDay(date: Date, now: Date | number = Date.now()) {
      const rtf = memo(
        `${tag}:rtf`,
        () => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
      )
      const days = Math.floor((Number(now) - date.getTime()) / 86_400_000)
      if (days <= 0) return rtf.format(0, 'day')
      if (days < 30) return rtf.format(-days, 'day')
      if (days < 365) return rtf.format(-Math.floor(days / 30), 'month')
      return rtf.format(-Math.floor(days / 365), 'year')
    },

    /** 1,024 —— 千分位 */
    number(n: number) {
      return memo(`${tag}:num`, () => new Intl.NumberFormat(tag)).format(n)
    },

    /**
     * 21万 / 210K / 21万 —— 统计位那种「一眼量级」的写法。
     * 中文和日文按「万」进位，英文按 K/M，这正是 compact 记数法的差别。
     */
    compact(n: number) {
      return memo(
        `${tag}:compact`,
        () => new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }),
      ).format(n)
    },

    /** 1.8k 字 / 1.8k words / 1.8k 字 */
    wordsLabel(n: number) {
      const value = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
      const unit = locale === 'en' ? 'words' : '字'
      return `${value} ${unit}`
    },

    /**
     * 用当前语种称呼另一门语言：中文站说「简体中文」，英文站说「Simplified Chinese」。
     * 别拿 localeMeta.label 顶替 —— 那是切换器里的自称（一律用该语言自己的写法），
     * 塞进英文句子会写出「This post is written in 简体中文」。
     */
    languageName(of: Locale) {
      const dn = memo(
        `${tag}:lang`,
        () => new Intl.DisplayNames(tag, { type: 'language' }),
      ) as Intl.DisplayNames
      return dn.of(localeMeta[of].bcp47) ?? localeMeta[of].label
    },
  }
}

export type Format = ReturnType<typeof createFormat>
