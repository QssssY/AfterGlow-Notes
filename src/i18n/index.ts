/**
 * i18n 的统一入口 —— 组件只需要这一行：
 *
 *   const { t, c, fmt, path, locale } = useI18n(Astro)
 *
 * t   界面文案（字典在 ui.ts）
 * c   站点内容（src/data 的 JSON，按语种覆盖，见 content.ts）
 * fmt 日期与数字（Intl 包装，见 format.ts）
 * path 站内链接套语种前缀（中文在根路径，其余 /en /ja）
 *
 * 语种不用逐层往下传：Astro 配了 i18n 之后每个组件都能读 Astro.currentLocale，
 * 所以嵌套多深的子组件也是同一行代码，不必加 props。
 */

import { getContent } from './content'
import { createFormat } from './format'
import { defaultLocale, localeMeta, locales, type Locale } from './locales'
import { localizePath, localeFromUrl, stripLocale } from './paths'
import { ui, type UIKey } from './ui'

export { defaultLocale, isLocale, localeMeta, locales, prefixedLocales } from './locales'
export type { Locale, LocaleMeta } from './locales'
export { localizePath, localeFromUrl, stripLocale } from './paths'
export { getContent } from './content'
export type { UIKey } from './ui'
export type * from './content'

/** 占位符替换：{n}、{title} 这类 */
function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  )
}

export type Translate = (key: UIKey, params?: Record<string, string | number>) => string

export function useTranslations(locale: Locale): Translate {
  const table = ui[locale] ?? ui[defaultLocale]
  return (key, params) => {
    // 类型上不可能缺键；真缺了（比如手写了字符串）也别抛，回落中文比整页崩好
    const template = table[key] ?? ui[defaultLocale][key] ?? key
    return interpolate(template, params)
  }
}

/* ─── 导航 ───────────────────────────────────────────────── */

/**
 * 导航的结构部分（图标、地址、激活匹配）与语言无关，放在这里；
 * 文案在 ui.ts 的 nav.* 里。末项在桌面侧栏叫「优秀博客」、移动端 Tab 叫「友链」，
 * 是同一个目标 —— 所以每项都有 label 和 short 两份文案。
 *
 * match 是激活态的路径前缀组（已剥掉语种前缀）。首页与文章是分开的两项：
 * 首页只认 '/'，文章认整个文章区（归档 / 详情 / 标签），否则首页会同时点亮两项。
 */
export const navConfig = [
  { key: 'home', icon: 'house', href: '/', match: ['/'] },
  { key: 'posts', icon: 'notebook-text', href: '/archive', match: ['/archive', '/posts', '/tags'] },
  { key: 'projects', icon: 'layout-grid', href: '/projects', match: ['/projects'] },
  { key: 'about', icon: 'circle-user', href: '/about', match: ['/about'] },
  { key: 'share', icon: 'share-2', href: '/share', match: ['/share'] },
  { key: 'blogroll', icon: 'bookmark', href: '/blogroll', match: ['/blogroll'] },
] as const

export interface NavItemResolved {
  icon: string
  /** 已套好当前语种前缀，可直接进 href */
  href: string
  label: string
  short: string
  active: boolean
}

/**
 * 激活判断先剥语种前缀 —— /en/archive 和 /archive 是同一个导航项。
 */
export function isNavActive(match: readonly string[], pathname: string) {
  const { path: bare } = stripLocale(pathname)
  const path = bare.replace(/\/+$/, '') || '/'
  return match.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/* ─── 主入口 ─────────────────────────────────────────────── */

/** useI18n 只用到 Astro 全局的这两个字段，单独取类型好让工具函数也能调 */
export interface I18nSource {
  url: URL
  currentLocale?: string | undefined
}

export function useI18n(astro: I18nSource) {
  const locale = localeFromUrl(astro.url, astro.currentLocale)
  const t = useTranslations(locale)
  const path = (p: string) => localizePath(p, locale)

  return {
    locale,
    meta: localeMeta[locale],
    t,
    c: getContent(locale),
    fmt: createFormat(locale),
    path,

    /** 导航项（文案已按语种解析、地址已套前缀、激活态已算好） */
    nav: navConfig.map(
      (item): NavItemResolved => ({
        icon: item.icon,
        href: path(item.href),
        label: t(`nav.${item.key}`),
        short: t(`nav.${item.key}.short`),
        active: isNavActive(item.match, astro.url.pathname),
      }),
    ),

    /**
     * 当前页在每个语种下的地址 —— 语言切换器和 <link hreflang> 共用。
     * 停在哪一页切语言就留在哪一页，不会被甩回首页。
     */
    alternates: locales.map((code) => ({
      code,
      ...localeMeta[code],
      href: localizePath(astro.url.pathname, code),
      current: code === locale,
    })),
  }
}

export type I18n = ReturnType<typeof useI18n>
