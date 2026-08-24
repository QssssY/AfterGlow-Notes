/**
 * RSS 生成 —— 每个语种一份独立的源：
 *   /rss.xml       中文
 *   /en/rss.xml    英文
 *   /ja/rss.xml    日文
 *
 * 各源里的条目就是该语种的文章列表（没配译文的照样在列，按原作语言呈现 ——
 * 与站上看到的一致，订阅者不会点开一篇网页上根本不存在的文章）。
 * <language> 跟着语种走，阅读器才好按语言归类。
 */

import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getContent } from '~/i18n/content'
import { localeMeta, type Locale } from '~/i18n/locales'
import { loadPosts } from '~/utils/posts'

export async function buildFeed(context: APIContext, locale: Locale) {
  const { site } = getContent(locale)
  const posts = await loadPosts(locale)

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? context.url.origin,
    items: posts.map((post) => ({
      title: post.title,
      description: post.excerpt,
      pubDate: post.date,
      // post.href 已经带好语种前缀（见 utils/posts.ts），补个尾斜杠对齐产物路径
      link: `${post.href}/`.replace(/\/+$/, '/'),
      categories: [...post.tagLabels],
    })),
    customData: `<language>${localeMeta[locale].rssLang}</language>`,
  })
}
