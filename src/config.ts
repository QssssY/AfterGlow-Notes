/** 站点级文案与导航 —— 取自 blog.pen 的 Sidebar / Footer / Banner */

/*
 * 会改的内容真身全在 src/data/*.json —— 网页管理后台（/overview，写接口在
 * server/ 的 /api/overview）改的就是这些文件。dev 下保存即热更新；部署后改完要重新构建。
 * 这里只负责 import 进来、补上 TS 类型，再原样导出给组件 —— 组件不感知来源。
 * 留在本文件里的只剩结构性常量（导航、主题档位、uptime 起点这类）。
 */
import aboutData from './data/about.json'
import blogrollData from './data/blogroll.json'
import changelogData from './data/changelog.json'
import friendsData from './data/friends.json'
import nowData from './data/now.json'
import playlistData from './data/playlist.json'
import readingData from './data/reading.json'
import reposData from './data/repos.json'
import shareData from './data/share.json'
import siteData from './data/site.json'
import socialsData from './data/socials.json'
import stackData from './data/stack.json'
import toolsData from './data/tools.json'

/** 站名 / 作者 / 描述等站点文案 —— 管理端「站点信息」页可改（src/data/site.json） */
export const site = {
  /** 侧栏 Wordmark */
  title: siteData.title,
  /** Banner Eyebrow 里的英文名 */
  titleEn: siteData.titleEn,
  author: siteData.author,
  /** 作者名后的橙色小标 */
  authorBadge: siteData.authorBadge,
  description: siteData.description,
  /** Footer 版权行的起始年份 */
  since: siteData.since,
}

/**
 * 动态数据服务（server/ 里的 Go 后端）的地址。构建时用环境变量注入：
 *   PUBLIC_API_BASE=https://api.example.com  独立域名（跨域）
 *   PUBLIC_API_BASE=same-origin（或 /）       同源 —— Go 服务用 -site dist 托管全站时用：
 *                                            请求走相对路径，免预检、免第二条 TLS 连接。
 *                                            Windows 的 Git Bash 里必须写 same-origin：
 *                                            单个 / 会被 MSYS 路径转换偷换成 Git 安装目录
 *                                            （实测变成 D:/develop/Git），烧进产物全站失灵
 *   不设                                      纯本机模式：点赞只存访客自己的浏览器，
 *                                            「N 次阅读」整块不渲染 —— 不编数字
 *
 * null = 未配置（禁用）；'' = 同源。判断是否可用要用 === null，别用真值判断 ——
 * 空字符串是合法的「同源」值。
 */
const rawApiBase = ((import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '').trim()
export const apiBase: string | null =
  rawApiBase === ''
    ? null
    : rawApiBase === '/' || rawApiBase === 'same-origin'
      ? ''
      : rawApiBase.replace(/\/+$/, '')

/**
 * 音乐文件的来源前缀。音乐是版权物，不进 git 仓库（见 README 许可节）——
 * 文件躺在磁盘的 public/music/（gitignored）或服务器的 -music 目录里。
 *   不设                                本地开发 / 单机全站：public/music 同源可达，原样工作
 *   PUBLIC_MUSIC_BASE=https://api.域名  分体部署：页面在平台 CDN 上（产物里没有音乐），
 *                                      歌从小机子走（Go 服务的 -music 目录供给）
 * 跨域取歌时播放器会给 <audio> 挂 crossorigin —— 频谱分析要读采样，
 * 非同源音源不带 CORS 的话 Web Audio 会拿不到数据（见 NowPlayingCard）。
 */
export const musicBase = ((import.meta.env.PUBLIC_MUSIC_BASE as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')

/**
 * 对外联系邮箱 —— 订阅面板与申请友链都用它拼 mailto。
 * 两处表单都没有后端，提交时打开访客自己的邮件客户端并预填内容；
 * 以后接了订阅服务或表单服务，改掉各自的 submit 处理即可。
 */
export const email = siteData.email

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
 * 社交入口 —— 管理端「社交链接」页可改（src/data/socials.json）。
 * 桌面侧栏取第一颗 dark + 第一颗 glass + 邮箱，移动端 Social Row 取前两颗。
 */
export interface Social {
  label: string
  icon: string
  href: string
  /** dark 深色主按钮（GitHub 位）/ glass 玻璃 */
  variant: 'dark' | 'glass'
}
export const socials = socialsData as Social[]

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
  // Date.UTC 钉死起点，不随构建机时区漂移（CI 在 UTC，本地在东八区）
  since: new Date(Date.UTC(2026, 7, 21)),
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
  status: siteData.buildStatus,
  hosting: siteData.hosting,
}

/** Greeting Card */
export const greeting = {
  bio: siteData.bio,
}

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
 * 构成 STACK（项目页左栏）—— 语言占比，管理端「构成」页可改（src/data/stack.json）。
 *
 * 初始值是 repos 里四个真仓库的 GitHub 语言字节数聚合（共 6.43 MB，2026-08-23 取；
 * Astro 占 4.9% 归入「其他」，面板保持四行）。
 * 要刷新就重新跑 api.github.com/repos/<repo>/languages 把字节数加起来重算。
 * accent：占比最高的一条走 fire，中间的走 leaf，「其他」走 dot-idle。
 */
export interface StackRow {
  lang: string
  pct: number
  accent: 'fire' | 'leaf' | 'idle'
}
export const stack = stackData as StackRow[]

/**
 * 状态 NOW（项目页左栏）的末行说明 —— 管理端「站点信息」页可改。
 *
 * 面板里每个仓库的状态不写死，按 repos[].pushed 实时判（见 NowPanel.astro），
 * 所以这句要跟那套判法对得上 —— 改判法记得改这句。
 */
export const repoNote = siteData.repoNote

/**
 * 细则 FINE PRINT（关于页左栏）—— 管理端「站点信息」页可改。说的是这个站真实的做法：
 * 阅读与点赞只存匿名随机 id 的计数（见 server/main.go，不存 IP/UA）、
 * 评论走 mailto、字体和图片都自托管（见 global.css 顶部）。
 */
export const finePrint = {
  blurb: siteData.finePrintBlurb,
  points: siteData.finePrintPoints,
  reply: siteData.finePrintReply,
}

/**
 * Now Playing —— 真播放器，按播放列表走：一首放完自动下一首、到底循环。
 * 加歌 = mp3（和可选的 LRC）丢进 public/music/（该目录 gitignored，版权物不进仓库；
 * 分体部署时丢进服务器的 -music 目录），这里加一行；
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

/**
 * 关于页的自我介绍卡 —— 管理端「关于页」页可改（src/data/about.json）。
 * JSON 里两个清单存成平铺的 label/items 两组（管理端表单好摆），这里拼回组件要的形状。
 */
export const aboutMe = {
  role: aboutData.role,
  paragraphs: aboutData.paragraphs,
  chips: aboutData.chips,
  lists: [
    { label: aboutData.listALabel, items: aboutData.listAItems },
    { label: aboutData.listBLabel, items: aboutData.listBItems },
  ],
}

/** 站点更新日志（关于页时间线）—— 管理端「更新日志」页可改，新条目放最上面 */
export interface ChangelogEntry {
  title: string
  date: string
  desc: string
  current?: boolean
  badge?: string
}
export const changelog = changelogData as ChangelogEntry[]

/**
 * 关于页的「友链 FRIENDS」小面板 —— 管理端「关于页友链」页可改（src/data/friends.json）。
 * 头像不进 JSON：按 domain 从 images/blogroll/ 找（utils/blogroll-avatars.ts），
 * 和友链页共用同一批图，传一次两边都换。
 */
export interface Friend {
  name: string
  desc: string
  icon: string
  href: string
  domain: string
  from: string
  to: string
}
export const friends = friendsData as Friend[]
