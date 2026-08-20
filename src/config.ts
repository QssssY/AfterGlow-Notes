/** 站点级文案与导航 —— 取自 blog.pen 的 Sidebar / Footer / Banner */

export const site = {
  /** 侧栏 Wordmark */
  title: '萤火录',
  /** Banner Eyebrow 里的英文名 */
  titleEn: 'FIREFLY NOTES',
  author: '清川',
  /** 作者名后的橙色小标 */
  authorBadge: '(开发中)',
  description: '按时间倒叙的写作记录',
  /** Footer 版权行的起始年份 */
  since: 2026,
} as const

/**
 * 导航 —— label 用于桌面侧栏，short 用于移动端 Tab Bar。
 * 第 5 项在设计稿里桌面叫「优秀博客」、移动端 Tab 叫「友链」，是同一个目标。
 *
 * match 是激活态的路径前缀组：设计稿里 Home / 归档 / 文章详情三个页面的侧栏
 * 都是「近期文章」高亮（Sidebar 实例零覆盖），说明它代表整个文章区。
 */
export const nav = [
  {
    label: '近期文章',
    short: '文章',
    icon: 'notebook-text',
    href: '/',
    match: ['/', '/archive', '/posts', '/tags'],
  },
  { label: '我的项目', short: '项目', icon: 'layout-grid', href: '/projects', match: ['/projects'] },
  { label: '关于网站', short: '关于', icon: 'circle-user', href: '/about', match: ['/about'] },
  { label: '推荐分享', short: '分享', icon: 'share-2', href: '/share', match: ['/share'] },
  { label: '优秀博客', short: '友链', icon: 'bookmark', href: '/blogroll', match: ['/blogroll'] },
] as const

export function isNavActive(match: readonly string[], pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/'
  return match.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Home Header 的两个 Social Button —— Github 是深色变体 */
export const socials = [
  { label: 'Github', icon: 'github', href: 'https://github.com', variant: 'dark' },
  { label: '稀土掘金', icon: 'pen-line', href: 'https://juejin.cn', variant: 'glass' },
] as const

/** 外观切换器的三档 */
export const themeChoices = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '自动' },
] as const

/** Uptime Card —— 天数按当前日期实时计算，不是写死的 */
export const uptime = {
  since: new Date(2023, 9, 1),
  sinceLabel: '自 2023 年 10 月 首次部署',
} as const

/** Greeting Card */
export const greeting = {
  bio: '记录、研究并延伸我所遇见、观察和思考的一切。',
} as const

/** Like Widget */
export const likes = 20118

/** Now Playing —— 12 根等化条的高度取自设计稿 */
export const nowPlaying = {
  track: 'Weightless — Marconi Union',
  bars: [8, 14, 6, 18, 11, 20, 9, 15, 7, 12, 17, 5],
} as const

/** Reading Card —— progress 是百分比；第二本用金色 */
export const reading = [
  { title: '《数字画笔》', author: 'Golan Levin', progress: 72, accent: 'brand' },
  { title: '《人月神话》', author: 'Fred Brooks', progress: 34, accent: 'gold' },
] as const

/** Projects Section */
export const projects = [
  {
    name: 'pen-canvas',
    desc: '把设计画布做成可脚本化的图层树，给中文排版留足呼吸',
    icon: 'layout-grid',
    stack: 'TypeScript',
    stars: 868,
    href: '#',
  },
  {
    name: 'live2d-web',
    desc: '浏览器里跑 Live2D：口型同步与物理摆动的最小实现',
    icon: 'app-window',
    stack: 'TypeScript',
    stars: 312,
    href: '#',
  },
  {
    name: 'spline-lite',
    desc: 'Three.js 复刻 Spline 的清新材质，包体压到 1/8',
    icon: 'package',
    stack: 'Three.js',
    stars: 247,
    href: '#',
  },
] as const
