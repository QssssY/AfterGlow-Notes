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

/**
 * 推荐分享 —— tone 决定图标砖的配色（fire = 橙底橙字，leaf = 玻璃底绿字）。
 * 设计稿里它不跟着 category 走（Fontshare 是工具却用 leaf），所以按条存。
 */
export const shareItems = [
  {
    title: 'Ray.so — 把代码片段导出成好看的图',
    desc: '分享代码到社交平台时不用再截屏幕，配色和窗口留白都可调，导出的 PNG 直接能用在文章里。',
    href: 'https://ray.so',
    domain: 'ray.so',
    icon: 'code',
    tone: 'fire',
    category: '工具',
  },
  {
    title: 'Warp — 带块级输出的现代终端',
    desc: '命令和输出被拆成可折叠的块，翻历史记录时不必再和滚动条搏斗，补全提示也比默认 shell 聪明。',
    href: 'https://www.warp.dev',
    domain: 'warp.dev',
    icon: 'terminal',
    tone: 'fire',
    category: '工具',
  },
  {
    title: 'Fontshare — 可商用的免费字体库',
    desc: '每套字重都完整，页面直接给出配对建议，做项目找标题字时比在 Google Fonts 里翻要省事。',
    href: 'https://www.fontshare.com',
    domain: 'fontshare.com',
    icon: 'type',
    tone: 'leaf',
    category: '工具',
  },
  {
    title: '中文文案排版指北',
    desc: '中英混排的空格、全半角标点、数字用法都有明确规则，团队里争论「该不该加空格」时可以直接引用。',
    href: 'https://github.com/sparanoid/chinese-copywriting-guidelines',
    domain: 'github.com',
    icon: 'file-text',
    tone: 'leaf',
    category: '文章',
  },
  {
    title: 'CoRecursive — 代码背后的故事',
    desc: '每期让一个项目的作者讲当初为什么那样设计，比读文档更能理解技术选型背后的取舍，通勤时听正好。',
    href: 'https://corecursive.com',
    domain: 'corecursive.com',
    icon: 'mic',
    tone: 'fire',
    category: '播客',
  },
  {
    title: 'The Book of Shaders — 从零学片元着色器',
    desc: '从 GLSL 基础讲到噪声与图案生成，每章的示例都能在浏览器里改代码实时看效果，入门图形学最少弯路。',
    href: 'https://thebookofshaders.com',
    domain: 'thebookofshaders.com',
    icon: 'palette',
    tone: 'leaf',
    category: '教程',
  },
] as const

/** Share 页 Filter Bar 的档位，顺序照设计稿 */
export const shareFilters = ['全部', '工具', '文章', '播客', '教程'] as const

/**
 * 优秀博客 —— 头像是首字 + 渐变底。渐变的角度和色标位置全站统一，
 * 只有两端颜色和文字色按条手调，所以只存 from / to / initialColor。
 * since 用来算 Page Head 的「年最久」。
 */
export const blogroll = [
  {
    name: '云谏',
    initial: '云',
    href: 'https://yunjian.dev',
    domain: 'yunjian.dev',
    desc: '把 Vite、Rollup 的源码读薄，顺手记下每一个踩过的构建坑。',
    tags: ['前端工程', '构建'],
    from: '#D9812B',
    to: '#EEC25E',
    initialColor: '#241C18',
    since: 2019,
  },
  {
    name: '阿岐',
    initial: '岐',
    href: 'https://aqi.works',
    domain: 'aqi.works',
    desc: 'WebGL 与 shader 笔记，每篇都配一个能拖着玩的实时 demo。',
    tags: ['图形', 'Shader'],
    from: '#1F5E4E',
    to: '#2A7A66',
    initialColor: '#F0E6DA',
    since: 2021,
  },
  {
    name: '林陌',
    initial: '陌',
    href: 'https://linmo.studio',
    domain: 'linmo.studio',
    desc: '中文排版的细节控，讲字距、行高与网格背后的取舍。',
    tags: ['设计', '排版'],
    from: '#A85B12',
    to: '#C9741F',
    initialColor: '#F0E6DA',
    since: 2020,
  },
  {
    name: '陈拾',
    initial: '拾',
    href: 'https://chenshi.me',
    domain: 'chenshi.me',
    desc: '一年只更十几篇，写搬家、旧书和深夜的末班地铁。',
    tags: ['随笔', '生活'],
    from: '#070707',
    to: '#2E2724',
    initialColor: '#F0E6DA',
    since: 2017,
  },
  {
    name: '温亦',
    initial: '亦',
    href: 'https://wenyi.cc',
    domain: 'wenyi.cc',
    desc: 'TypeScript 类型体操与编辑器插件，写得又长又耐心。',
    tags: ['类型系统', '工具链'],
    from: '#EEC25E',
    to: '#C9741F',
    initialColor: '#241C18',
    since: 2022,
  },
  {
    name: '岑野',
    initial: '野',
    href: 'https://cenye.xyz',
    domain: 'cenye.xyz',
    desc: '生成艺术日更，记录从 Processing 迁到 GLSL 的全过程。',
    tags: ['生成艺术', '创作'],
    from: '#2A7A66',
    to: '#EEC25E',
    initialColor: '#241C18',
    since: 2023,
  },
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
