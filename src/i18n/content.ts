/**
 * 站点内容的多语言解析 —— src/config.ts 的语种感知版。
 *
 * 基准数据（中文）是 src/data/*.json，管理后台改的就是它们；
 * 译文是同目录的 <名字>.<语种>.json，只需写要翻的字段（合并规则见 merge.ts）。
 * 组件不直接 import JSON，一律走 useI18n(Astro) 拿到的 c —— 换语种时内容整套跟着换。
 */

import aboutData from '~/data/about.json'
import blogrollData from '~/data/blogroll.json'
import changelogData from '~/data/changelog.json'
import friendsData from '~/data/friends.json'
import nowData from '~/data/now.json'
import playlistData from '~/data/playlist.json'
import readingData from '~/data/reading.json'
import reposData from '~/data/repos.json'
import shareData from '~/data/share.json'
import siteData from '~/data/site.json'
import socialsData from '~/data/socials.json'
import stackData from '~/data/stack.json'
import toolsData from '~/data/tools.json'
import { mergeContent } from './merge'
import { defaultLocale, type Locale } from './locales'

/* ─── 类型（形状由中文基准数据定义，译文只覆盖字段值） ───────────────── */

export interface Social {
  label: string
  icon: string
  href: string
  /** dark 深色主按钮（GitHub 位）/ glass 玻璃 */
  variant: 'dark' | 'glass'
}

export interface NowItem {
  kind: string
  /** 桌面用圆点（active 决定橙/灰），移动端用图标砖（icon 是 lucide 名） */
  detail: string
  icon: string
  active: boolean
}

export interface Tool {
  name: string
  meta: string
  icon: string
}

export interface StackRow {
  lang: string
  pct: number
  accent: 'fire' | 'leaf' | 'idle'
}

export interface Track {
  title: string
  artist: string
  src: string
  /** 首次加载时播放的曲目；非空歌单必须且只能有一首标记为 true */
  default?: boolean
  lrc?: string
  /** 歌词整体快慢微调，单位为秒 */
  offset?: number
  /** 专辑封面（听歌页 CD 面上转的就是它）：本地文件，由 scripts/fetch-covers.mjs 入库；没有就显示纯盘面 */
  cover?: string
}

/** Reading Card —— progress 是百分比；accent 只有 brand / gold 两档 */
export interface ReadingItem {
  title: string
  author: string
  progress: number
  accent: 'brand' | 'gold'
}

export interface ShareEntry {
  title: string
  desc: string
  href: string
  domain: string
  icon: string
  tone: 'fire' | 'leaf'
  category: string
}

export interface BlogrollEntry {
  name: string
  initial: string
  href: string
  domain: string
  desc: string
  tags: string[]
  from: string
  to: string
  initialColor: string
  since: number
}

export interface Repo {
  repo: string
  name: string
  desc: string
  stack: string
  /** 构建时的兜底星数，浏览器端拉最新的覆盖（见 RepoStars.astro） */
  stars: number
  icon: string
  /** 只有 Featured 卡展示（repos[0]），可空 */
  badge?: string
  pushed: string
}

export interface ChangelogEntry {
  title: string
  date: string
  desc: string
  current?: boolean
  badge?: string
}

export interface Friend {
  name: string
  desc: string
  icon: string
  href: string
  domain: string
  from: string
  to: string
}

/* ─── 译文覆盖的收集 ─────────────────────────────────────────────── */

/*
 * 用 glob 而不是逐个 import：加一门语言只要往 src/data 里丢文件，
 * 这里一行都不用改。eager 让它在构建时就并进产物，运行期零请求。
 */
const overrideModules = import.meta.glob<{ default: unknown }>('~/data/*.json', { eager: true })

/** 文件名 → 语种覆盖表：{ en: { site: {...}, about: {...} }, ja: {...} } */
const overrides = (() => {
  const table: Record<string, Record<string, unknown>> = {}
  for (const [path, mod] of Object.entries(overrideModules)) {
    const file = path.split('/').pop() ?? ''
    // 只认 <名字>.<语种>.json；<名字>.json 是基准，不进这张表
    const match = /^(.+)\.([a-z]{2}(?:-[A-Za-z]+)?)\.json$/.exec(file)
    if (!match) continue
    const [, name, locale] = match
    ;(table[locale!] ??= {})[name!] = mod.default
  }
  return table
})()

const pick = <T>(locale: Locale, name: string, base: T): T =>
  mergeContent(base, overrides[locale]?.[name])

/* ─── 内容装配 ───────────────────────────────────────────────────── */

/**
 * 按语种记忆装配结果：每个 useI18n(Astro) 都会调一次 getContent，一页 20~30 个组件、
 * 百来页就是数千次 13 份 JSON 的深合并，全是同一个答案。只在生产构建里记 ——
 * dev 下 JSON 一改 Vite 会重求值本模块，缓存随之作废，但不记更省心。
 * 返回值是只读约定：没有任何组件在服务端改它（sort/splice 都没有），才能共享一份
 */
const contentCache = new Map<Locale, ReturnType<typeof assembleContent>>()

export function getContent(locale: Locale = defaultLocale) {
  if (!import.meta.env.PROD) return assembleContent(locale)
  let c = contentCache.get(locale)
  if (!c) {
    c = assembleContent(locale)
    contentCache.set(locale, c)
  }
  return c
}

function assembleContent(locale: Locale) {
  const siteRaw = pick(locale, 'site', siteData)
  const aboutRaw = pick(locale, 'about', aboutData)
  const nowRaw = pick(locale, 'now', nowData)

  return {
    /** 站名 / 作者 / 描述等站点文案 —— 管理端「站点信息」页可改 */
    site: {
      /** 侧栏 Wordmark */
      title: siteRaw.title,
      /** Banner Eyebrow 里的英文名 */
      titleEn: siteRaw.titleEn,
      author: siteRaw.author,
      /** 作者名后的橙色小标（管理台可空 —— 删掉键即隐藏，别让 TS 强求它存在） */
      authorBadge: (siteRaw as { authorBadge?: string }).authorBadge ?? '',
      description: siteRaw.description,
      /** Footer 版权行的起始年份 */
      since: siteRaw.since,
    },

    /** Greeting Card */
    greeting: { bio: siteRaw.bio },

    /**
     * 构建 BUILD（关于页左栏）—— 框架/样式版本与构建时间在 utils/build.ts 里
     * 从 package.json 实时取，这里只有会随语种变的两项。
     */
    build: { status: siteRaw.buildStatus, hosting: siteRaw.hosting },

    /**
     * 状态 NOW（项目页左栏）的末行说明。面板里每个仓库的状态按 pushed 实时判
     * （见 NowPanel.astro），所以这句要跟那套判法对得上。
     */
    repoNote: siteRaw.repoNote,

    /** 细则 FINE PRINT（关于页左栏） */
    finePrint: {
      blurb: siteRaw.finePrintBlurb,
      points: siteRaw.finePrintPoints,
      reply: siteRaw.finePrintReply,
    },

    /** 此刻 Card（首页中栏） */
    now: {
      ...nowRaw,
      /** JSON 里存 "YYYY-MM-DD"，这里转回 Date 给组件格式化 */
      updated: new Date(nowRaw.updated),
      items: nowRaw.items as NowItem[],
    },

    /** 社交入口 —— 桌面侧栏取第一颗 dark + 第一颗 glass + 邮箱，移动端取前两颗 */
    socials: pick(locale, 'socials', socialsData) as Social[],

    /** 在用 Card（首页中栏末位）—— 一行 4 件工具，icon 是 lucide 名 */
    tools: pick(locale, 'tools', toolsData) as Tool[],

    /** 构成 STACK（项目页左栏）—— 语言占比 */
    stack: pick(locale, 'stack', stackData) as StackRow[],

    /** Reading Card */
    reading: pick(locale, 'reading', readingData) as ReadingItem[],

    /** 推荐分享 —— tone 决定图标砖的配色（fire = 橙底橙字，leaf = 玻璃底绿字） */
    shareItems: pick(locale, 'share', shareData) as ShareEntry[],

    /** 优秀博客 —— 头像按 domain 从 images/blogroll/ 取，没图退回首字 + 渐变 */
    blogroll: pick(locale, 'blogroll', blogrollData) as BlogrollEntry[],

    /** GitHub 仓库 —— repos[0] 是主推项目，进项目页的 Featured 卡 */
    repos: pick(locale, 'repos', reposData) as Repo[],

    /** 站点更新日志（关于页时间线）—— 新条目放最上面 */
    changelog: pick(locale, 'changelog', changelogData) as ChangelogEntry[],

    /** 关于页的「友链 FRIENDS」小面板 */
    friends: pick(locale, 'friends', friendsData) as Friend[],

    /** 关于页的自我介绍卡 —— JSON 里两个清单存成平铺的两组，这里拼回组件要的形状 */
    aboutMe: {
      role: aboutRaw.role,
      paragraphs: aboutRaw.paragraphs,
      chips: aboutRaw.chips,
      lists: [
        { label: aboutRaw.listALabel, items: aboutRaw.listAItems },
        { label: aboutRaw.listBLabel, items: aboutRaw.listBItems },
      ],
    },

    /**
     * Now Playing —— 曲名和歌手是专有名词，不进译文（各语种听的是同一首歌）；
     * bars 是未播放时等化条的「定格假谱」高度，设计常量。
     */
    nowPlaying: {
      playlist: playlistData as Track[],
      bars: [8, 14, 6, 18, 11, 20, 9, 15, 7, 12, 17, 5],
    },
  }
}

export type SiteContent = ReturnType<typeof getContent>
