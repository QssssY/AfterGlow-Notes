/**
 * 路径的语种前缀换算 —— 全站链接都得过这里。
 *
 * 采用 prefixDefaultLocale: false：中文留在根路径（/about），其余语种带前缀
 * （/en/about、/ja/about）。这样上线前发出去的中文链接一条都不会失效。
 */

import { defaultLocale, isLocale, type Locale } from './locales'

/**
 * 从任意路径里剥掉语种前缀，得到「与语种无关」的路径（始终以 / 开头）。
 * 尾斜杠原样保留：构建期 Astro.url.pathname 带尾斜杠（目录式产物），中文分支一直是
 * 原样透传的，带前缀的分支早先用 split/join 重组时把它吃掉了 —— 于是 /en/about/ 页上的
 * hreflang 是 /about、/en/about，canonical 与中文页那边却是 /about/、/en/about/，
 * 三语互指对不上（搜索引擎要求成对互指、自指等于 canonical），Go 托管下两种 URL 还都 200。
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const segments = pathname.split('/').filter(Boolean)
  const head = segments[0]
  if (isLocale(head) && head !== defaultLocale) {
    const rest = segments.slice(1).join('/')
    const slash = pathname.endsWith('/') ? '/' : ''
    return { locale: head, path: rest ? `/${rest}${slash}` : '/' }
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
