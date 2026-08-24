/**
 * 路径的语种前缀换算 —— 全站链接都得过这里。
 *
 * 采用 prefixDefaultLocale: false：中文留在根路径（/about），其余语种带前缀
 * （/en/about、/ja/about）。这样上线前发出去的中文链接一条都不会失效。
 */

import { defaultLocale, isLocale, type Locale } from './locales'

/** 从任意路径里剥掉语种前缀，得到「与语种无关」的路径（始终以 / 开头） */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split('/').filter(Boolean)
  const head = segments[0]
  if (isLocale(head) && head !== defaultLocale) {
    const rest = segments.slice(1).join('/')
    return { locale: head, path: rest ? `/${rest}` : '/' }
  }
  return { locale: defaultLocale, path: pathname.startsWith('/') ? pathname : `/${pathname}` }
}

/**
 * 给一个「与语种无关」的路径套上目标语种的前缀。
 * 传进来的路径如果已经带前缀，会先剥掉再套 —— 语言切换器直接喂当前 URL 也不会叠成 /en/ja/x。
 */
export function localizePath(pathname: string, locale: Locale): string {
  const { path } = stripLocale(pathname)

  // 站外链接、锚点、mailto、以及 /rss.xml 这类带扩展名的端点原样返回
  if (/^([a-z]+:|#|\/\/)/i.test(pathname)) return pathname

  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}/` : `/${locale}${path}`
}

/** 当前请求的语种 —— 优先信 Astro 自己解析的 currentLocale，兜底自己从路径判 */
export function localeFromUrl(url: URL, currentLocale?: string | undefined): Locale {
  if (isLocale(currentLocale)) return currentLocale
  return stripLocale(url.pathname).locale
}
