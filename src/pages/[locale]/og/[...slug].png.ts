import type { APIRoute, GetStaticPaths } from 'astro'
import { defaultLocale, isLocale, prefixedLocales } from '~/i18n/locales'
import { ogRoutes, renderOgImage } from '~/utils/og'

export const getStaticPaths = (async () => {
  const routes = []
  for (const locale of prefixedLocales) {
    const perLocale = await ogRoutes(locale)
    routes.push(...perLocale.map((r) => ({ ...r, params: { ...r.params, locale } })))
  }
  return routes
}) satisfies GetStaticPaths

export const GET: APIRoute = async ({ params, props }) => {
  const locale = isLocale(params.locale) ? params.locale : defaultLocale
  const png = await renderOgImage({
    title: props.title as string,
    subtitle: props.subtitle as string,
    tags: props.tags as string[],
    locale,
  })

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
