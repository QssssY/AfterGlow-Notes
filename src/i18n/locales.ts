/**
 * 站点支持的语种 —— 全站 i18n 的唯一真源。
 *
 * 加一门语言的完整清单（照着做就行，不用改组件）：
 *   1. 这里的 locales 里加代码，localeMeta 里补一条元信息
 *   2. src/i18n/ui.ts 的字典里加同名一份（缺键 TS 直接报错，漏不掉）
 *   3. src/data/ 下按需加 <名字>.<语种>.json 覆盖（可只写要翻的字段，其余回落中文）
 *   4. 文章要单独译的话，放 src/content/posts/<语种>/ 下同名文件
 * astro.config.mjs 的 i18n.locales 从这里读，不用手动同步。
 */

export const defaultLocale = 'zh' as const

/** 顺序即语言切换器里的显示顺序 */
export const locales = ['zh', 'en', 'ja'] as const

export type Locale = (typeof locales)[number]

export interface LocaleMeta {
  /** 切换器里的自称（一律用该语言自己的写法，不做二次翻译） */
  label: string
  /** 侧栏分段控件用的短标 —— 三格平分 232px，全称会挤，取两三字 */
  short: string
  /** 最窄处（图标条 / 移动端顶栏角标）用的单字缩写 */
  abbr: string
  /** <html lang> 与 hreflang */
  htmlLang: string
  /** og:locale */
  ogLocale: string
  /** Intl.* 的 locale 标签：日期、数字、相对时间都走它 */
  intl: string
  /**
   * 纯语言码（不带地区），给 Intl.DisplayNames 用来说出「这门语言叫什么」。
   * 中文要写 zh-Hans 而不是 zh-CN —— 后者会被说成「中文（中国）」，
   * 前者才是「简体中文 / Simplified Chinese / 簡体中国語」。
   */
  bcp47: string
  /** RSS 的 <language> */
  rssLang: string
  /**
   * 正文按「字」还是按「词」计数。
   * CJK 是逐字数（一个汉字算一个单位），拉丁语按空格切词 —— 混用同一套
   * 速度常量会让英文的阅读时长虚高三四倍。
   */
  counts: 'chars' | 'words'
  /** 该语种的每分钟阅读量，配合 counts 使用 */
  readingSpeed: number
}

export const localeMeta: Record<Locale, LocaleMeta> = {
  zh: {
    label: '简体中文',
    short: '中文',
    abbr: '中',
    htmlLang: 'zh-CN',
    ogLocale: 'zh_CN',
    intl: 'zh-CN',
    bcp47: 'zh-Hans',
    rssLang: 'zh-CN',
    counts: 'chars',
    readingSpeed: 300,
  },
  en: {
    label: 'English',
    short: 'EN',
    abbr: 'EN',
    htmlLang: 'en',
    ogLocale: 'en_US',
    intl: 'en-US',
    bcp47: 'en',
    rssLang: 'en',
    counts: 'words',
    readingSpeed: 220,
  },
  ja: {
    label: '日本語',
    short: '日本語',
    abbr: '日',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    intl: 'ja-JP',
    bcp47: 'ja',
    rssLang: 'ja',
    counts: 'chars',
    readingSpeed: 500,
  },
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/** 非默认语种 —— [locale] 动态路由的 getStaticPaths 用这个，默认语种留在根路径 */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale)
