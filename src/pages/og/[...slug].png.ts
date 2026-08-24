import type { APIRoute, GetStaticPaths } from 'astro'
import { defaultLocale } from '~/i18n/locales'
import { ogRoutes, renderOgImage } from '~/utils/og'

/**
 * 每篇文章一张 OG 图，外加一张站点默认图（slug = "site"）。
 * 非默认语种的同一批图在 src/pages/[locale]/og/ 下生成 —— 分享到社交平台时
 * 卡片上的站名、副标题、标签都是读者那门语言的写法。
 */
export const getStaticPaths = (async () => ogRoutes(defaultLocale)) satisfies GetStaticPaths

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgImage({
    title: props.title as string,
    subtitle: props.subtitle as string,
    tags: props.tags as string[],
    locale: defaultLocale,
  })

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
