/** 站点级文案与导航 —— 取自 blog.pen 的 Sidebar / Footer / Banner */

/*
 * 常改的内容（最近在读 / 此刻 / 播放列表 / 友链 / 项目 / 分享 / 在用）真身在
 * src/data/*.json —— 网页管理后台（/admin，写接口在 server/ 的 /api/admin）改的
 * 就是这些文件。dev 下保存即热更新；部署后改完要重新构建。
 * 这里只负责 import 进来、补上 TS 类型，再原样导出给组件 —— 组件不感知来源。
 */
import blogrollData from './data/blogroll.json'
import nowData from './data/now.json'
import playlistData from './data/playlist.json'
import readingData from './data/reading.json'
import reposData from './data/repos.json'
import shareData from './data/share.json'
import toolsData from './data/tools.json'

export const site = {
  /** 侧栏 Wordmark */
  title: '萤火录',
  /** Banner Eyebrow 里的英文名 */
  titleEn: 'FIREFLY NOTES',
  author: 'Perfect_zzZ',
  /** 作者名后的橙色小标 */
  authorBadge: '(开发中)',
  description: '按时间倒叙的写作记录',
  /** Footer 版权行的起始年份 */
  since: 2026,
} as const

/**
 * 动态数据服务（server/ 里的 Go 后端）的地址，如 https://api.example.com。
 * 构建时用环境变量注入：PUBLIC_API_BASE=… pnpm build。
 * 不设就是纯本机模式：点赞只存访客自己的浏览器，「N 次阅读」整块不渲染 —— 不编数字。
 */
export const apiBase = ((import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '').replace(
  /\/+$/,
  '',
)

/**
 * 对外联系邮箱 —— 订阅面板与申请友链都用它拼 mailto。
 * 两处表单都没有后端，提交时打开访客自己的邮件客户端并预填内容；
 * 以后接了订阅服务或表单服务，改掉各自的 submit 处理即可。
 */
export const email = '1795845968@qq.com'

/**
 * 导航 —— label 用于桌面侧栏，short 用于移动端 Tab Bar。
 * 末项在设计稿里桌面叫「优秀博客」、移动端 Tab 叫「友链」，是同一个目标。
 *
 * match 是激活态的路径前缀组。首页与文章是分开的两项：首页只认 '/'，
 * 文章认整个文章区（归档 / 详情 / 标签），否则首页会同时点亮两项。
 */
export const nav = [
  { label: '首页', short: '首页', icon: 'house', href: '/', match: ['/'] },
  {
    label: '文章',
    short: '文章',
    icon: 'notebook-text',
    href: '/archive',
    match: ['/archive', '/posts', '/tags'],
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

/**
 * 社交入口 —— 设计稿这轮把它们从首页顶部的 Header 挪进了侧栏 Social Row，
 * 首页那排大按钮已经不存在了。桌面侧栏取 github + bilibili + 邮箱三颗，
 * 移动端 Social Row 取前两颗（尺寸另一套，没复用）。
 */
export const socials = [
  { label: 'Github', icon: 'github', href: 'https://github.com/QssssY', variant: 'dark' },
  {
    label: 'bilibili',
    icon: 'tv',
    href: 'https://space.bilibili.com/548357762',
    variant: 'glass',
  },
] as const

/** 外观切换器的三档 */
export const themeChoices = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '自动' },
] as const

/**
 * Uptime Card —— 天数按构建日期实时计算，不是写死的。
 * 起点是这个仓库的首次提交（git log --reverse 可查：2026-08-21），
 * 设计稿写的「自 2023 年 10 月」是虚构人设，别改回去。
 */
export const uptime = {
  since: new Date(2026, 7, 21),
  sinceLabel: '自 2026 年 8 月 21 日 首次提交',
} as const

/**
 * 构建 BUILD（关于页左栏）—— 设计稿把四个值都写死了，会过期也会说假话。
 *
 * 框架 / 样式：构建时从 package.json 读真实版本（见 utils/build.ts），不写在这里。
 * 上次构建：构建时间戳，同上。
 * 天数：复用 uptime.since 实时算。
 * 托管：还没定部署平台（astro.config.mjs 里 site 也还是 localhost），
 *      所以先写占位；定了改这一行就行。
 * 设计稿还有一行「构建耗时 18s」—— 同一次构建里没法自报耗时，删掉了。
 */
export const build = {
  status: '部署正常',
  hosting: '未定',
} as const

/** Greeting Card */
export const greeting = {
  bio: '记录、研究并延伸我所遇见、观察和思考的一切。',
} as const

/*
 * Like Widget 的基数：设计稿写的 20118 是虚构的，已删。
 * 计数以 Go 后端为准（getLikes('site')）；后端不在时只显示访客本机的 0/1。
 */

/**
 * 此刻 Card（首页中栏）—— 设计稿这轮新加的一块，取代了原来的「最新文章」列表。
 *
 * 设计稿里的原文是「在重写画布的相机控制，第七版了」+ Blender / WebGPU 那套，
 * 那是虚构人设。这里换成中性表述，说的都是这个仓库里真有的事；
 * 想写具体进展就直接改这几行，updated 记得跟着动。
 */
export interface NowItem {
  kind: string
  /** 桌面用圆点（active 决定橙/灰），移动端用图标砖（icon 是 lucide 名） */
  detail: string
  icon: string
  active: boolean
}
export const now = {
  ...nowData,
  /** JSON 里存 "YYYY-MM-DD"，这里转回 Date 给组件格式化 */
  updated: new Date(nowData.updated),
  items: nowData.items as NowItem[],
}

/**
 * 在用 Card（首页中栏末位）—— 一行 4 件工具，icon 是 lucide 名。
 * 设计稿列的是 Blender / WebGPU / Astro / Neovim，其中只有 Astro 是真的；
 * 换成这个仓库实际在用的四件。
 */
export interface Tool {
  name: string
  meta: string
  icon: string
}
export const tools = toolsData as Tool[]

/**
 * Snapshot Strip（首页中栏末位）—— 设计稿是三张 Unsplash 占位图，热链的。
 * 和 Art Card 一样先不落图：给了 src 就渲染图，没给就是 avatar-bg 底色块。
 * 想放真照片，把图片放进 images/ 再 import 进 index.astro 传下来。
 */
export const snapshots = [{ alt: '' }, { alt: '' }, { alt: '' }] as const

/**
 * 构成 STACK（项目页左栏）—— 语言占比。
 *
 * 不是设计稿那套 TypeScript/Rust/Astro：这是 repos 里三个真仓库的
 * GitHub 语言字节数聚合（共 5.93 MB，2026-08-21 取）。要刷新就重新跑
 * api.github.com/repos/<repo>/languages 把字节数加起来重算。
 * accent：占比最高的一条走 fire，中间的走 leaf，「其他」走 dot-idle。
 */
export const stack = [
  { lang: 'Java', pct: 49, accent: 'fire' },
  { lang: 'Vue', pct: 32, accent: 'leaf' },
  { lang: 'JavaScript', pct: 16, accent: 'leaf' },
  { lang: '其他', pct: 3, accent: 'idle' },
] as const

/**
 * 状态 NOW（项目页左栏）的末行说明。
 *
 * 面板里每个仓库的状态不写死，按 repos[].pushed 实时判（见 NowPanel.astro），
 * 所以这句要跟那套判法对得上 —— 改判法记得改这句。
 */
export const repoNote = '只列还在动的仓库，状态按最近一次提交算。维护不动的东西，挂着也是欠着。'

/**
 * 细则 FINE PRINT（关于页左栏）—— 说的是这个站真实的做法：
 * 阅读与点赞只存匿名随机 id 的计数（见 server/main.go，不存 IP/UA）、
 * 评论走 mailto、字体和图片都自托管（见 global.css 顶部）。
 * 设计稿原句是「访问量只看服务端日志，不落库」——接了计数服务后不再属实，改掉。
 */
export const finePrint = {
  blurb: '没有埋点，没有广告，也不卖数据给任何人。',
  points: ['阅读数只记匿名总数，不记来路', '评论用邮件代替，不另存一份人', '字体和图片全部自托管'],
  reply: '来信一般三天内回，长信回得慢些。',
} as const

/**
 * Now Playing —— 真播放器，按播放列表走：一首放完自动下一首、到底循环。
 * 加歌 = mp3（和可选的 LRC）丢进 public/music/，这里加一行；
 * 没有 lrc 的歌只显示曲名，不做歌词跟随。多于一首时卡上会出现「下一首」按钮。
 * bars 是未播放时等化条的「定格假谱」高度（取自设计稿），播放时由实时频谱接管。
 */
export interface Track {
  title: string
  artist: string
  src: string
  lrc?: string
}
export const nowPlaying = {
  playlist: playlistData as Track[],
  /** bars 是设计稿常量，不进管理后台 */
  bars: [8, 14, 6, 18, 11, 20, 9, 15, 7, 12, 17, 5],
} as const

/** Reading Card —— progress 是百分比；accent 只有 brand / gold 两档 */
export interface ReadingItem {
  title: string
  author: string
  progress: number
  accent: 'brand' | 'gold'
}
export const reading = readingData as ReadingItem[]

/**
 * 推荐分享 —— tone 决定图标砖的配色（fire = 橙底橙字，leaf = 玻璃底绿字）。
 * 设计稿里它不跟着 category 走（Fontshare 是工具却用 leaf），所以按条存。
 */
export interface ShareItem {
  title: string
  desc: string
  href: string
  domain: string
  icon: string
  tone: 'fire' | 'leaf'
  category: string
}
export const shareItems = shareData as ShareItem[]

/**
 * Share 页 Filter Bar 的档位 —— 从条目里现算（首现顺序），
 * 后台新增一个分类不用再改第二处。
 */
export const shareFilters = ['全部', ...new Set(shareItems.map((i) => i.category))]

/**
 * 优秀博客 —— 头像是首字 + 渐变底。渐变的角度和色标位置全站统一，
 * 只有两端颜色和文字色按条手调，所以只存 from / to / initialColor。
 * since 用来算 Page Head 的「年最久」，用各站真实的上线年份。
 *
 * 这六条是占位：设计稿里的站名和域名都是虚构的，点开全是死链，
 * 换成真实存在的站点，好让友链页能真的点。渐变按位置原样保留。
 */
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
export const blogroll = blogrollData as BlogrollEntry[]

/**
 * GitHub 仓库 —— 项目页与首页「在做的事」共用这一份，取代设计稿里那批虚构项目
 * （pen-canvas / live2d-web / spline-lite 等，链接全是死的）。
 *
 * repos[0] 是主推项目，进项目页的 Featured 卡；其余进下面的网格。
 * stars 是构建时写死的兜底值，浏览器端会拉最新的覆盖它（见 RepoStars.astro），
 * 拉不到就保留这里的数字，不会显示空白。
 *
 * offCat 在 GitHub 上没填 description，desc 是照它 README 摘的；
 * stack 取 GitHub 语言统计里占比最大的那个（mini-vue 的语言统计是空的，
 * 按默认分支上 41 个 .js 判为 JavaScript）。
 */
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
export const repos = reposData as Repo[]

/** 仓库地址由 repo 拼出来，不单独存 href */
export const repoUrl = (repo: string) => `https://github.com/${repo}`
