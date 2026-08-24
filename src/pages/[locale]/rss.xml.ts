import type { APIContext, GetStaticPaths } from 'astro'
import { isLocale, prefixedLocales, defaultLocale } from '~/i18n/locales'
import { buildFeed } from '~/utils/feed'

export const getStaticPaths = (() =>
  prefixedLocales.map((locale) => ({ params: { locale } }))) satisfies GetStaticPaths

export function GET(context: APIContext) {
  const param = context.params.locale
  return buildFeed(context, isLocale(param) ? param : defaultLocale)
}
