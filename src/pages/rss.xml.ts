import type { APIContext } from 'astro'
import { defaultLocale } from '~/i18n/locales'
import { buildFeed } from '~/utils/feed'

export const GET = (context: APIContext) => buildFeed(context, defaultLocale)
