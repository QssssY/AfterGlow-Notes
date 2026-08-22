/** 站点级文案与导航 —— 取自 blog.pen 的 Sidebar / Footer / Banner */

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

/** Uptime Card —— 天数按当前日期实时计算，不是写死的 */
export const uptime = {
  since: new Date(2023, 9, 1),
  sinceLabel: '自 2023 年 10 月 首次部署',
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

/** Like Widget —— 设计稿写的是 20118，不带千分位 */
export const likes = 20118

/**
 * 此刻 Card（首页中栏）—— 设计稿这轮新加的一块，取代了原来的「最新文章」列表。
 *
 * 设计稿里的原文是「在重写画布的相机控制，第七版了」+ Blender / WebGPU 那套，
 * 那是虚构人设。这里换成中性表述，说的都是这个仓库里真有的事；
 * 想写具体进展就直接改这几行，updated 记得跟着动。
 */
export const now = {
  updated: new Date(2026, 7, 21),
  statement: '在把这个博客从设计稿一比一搬成代码。',
  note: '写东西之前先把它做出来，做的过程里才知道该写什么。所以这里长期有半成品，我不急着收尾。',
  /** 只有移动端 Now Card 有这一行 */
  aside: '这块每周改一次。改不动就说明我这周在摸鱼。',
  /**
   * 桌面用圆点（active 决定橙/灰），移动端用图标砖（icon 是 lucide 名）。
   * 两处共用同一份条目：同一周的事说两套不同的，改一处必忘另一处。
   */
  items: [
    {
      kind: '在做',
      detail: '把 blog.pen 的面板逐块落到 Astro 组件里',
      icon: 'hammer',
      active: true,
    },
    {
      kind: '在啃',
      detail: 'Tailwind 4 的 @theme 与主题变量怎么摆才不重复',
      icon: 'sprout',
      active: false,
    },
  ],
} as const

/**
 * 在用 Card（首页中栏末位）—— 一行 4 件工具，icon 是 lucide 名。
 * 设计稿列的是 Blender / WebGPU / Astro / Neovim，其中只有 Astro 是真的；
 * 换成这个仓库实际在用的四件。
 */
export const tools = [
  { name: 'Astro', meta: '这个站', icon: 'rocket' },
  { name: 'Tailwind', meta: '样式', icon: 'palette' },
  { name: 'Java', meta: '主力', icon: 'coffee' },
  { name: 'Vue', meta: '前端', icon: 'component' },
] as const

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
 * Now Playing —— 现在是真的能放：音频与 LRC 在 public/music/。
 * 12 根等化条的静态高度取自设计稿（未播放时的「定格假谱」，
 * 播放时由 Web Audio 实时频谱接管）。想换歌：换文件、改这四行。
 */
export const nowPlaying = {
  track: '十面埋伏 — 陈奕迅',
  src: '/music/shimianmaifu.mp3',
  lrc: '/music/shimianmaifu.lrc',
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
 * since 用来算 Page Head 的「年最久」，用各站真实的上线年份。
 *
 * 这六条是占位：设计稿里的站名和域名都是虚构的，点开全是死链，
 * 换成真实存在的站点，好让友链页能真的点。渐变按位置原样保留。
 */
export const blogroll = [
  {
    name: '阮一峰',
    initial: '阮',
    href: 'https://www.ruanyifeng.com/blog/',
    domain: 'ruanyifeng.com',
    desc: '每周更新的科技爱好者周刊，入门教程写得比官方文档还好读。',
    tags: ['周刊', '教程'],
    from: '#D9812B',
    to: '#EEC25E',
    initialColor: '#241C18',
    since: 2003,
  },
  {
    name: '张鑫旭',
    initial: '张',
    href: 'https://www.zhangxinxu.com',
    domain: 'zhangxinxu.com',
    desc: 'CSS 与 DOM 的细节考古，一个属性能翻出十年前的浏览器差异。',
    tags: ['CSS', '前端'],
    from: '#1F5E4E',
    to: '#2A7A66',
    initialColor: '#F0E6DA',
    since: 2008,
  },
  {
    name: '少数派',
    initial: '少',
    href: 'https://sspai.com',
    domain: 'sspai.com',
    desc: '效率工具与数字生活，挑软件时先来这里看一圈别人的用法。',
    tags: ['效率', '数字生活'],
    from: '#A85B12',
    to: '#C9741F',
    initialColor: '#F0E6DA',
    since: 2012,
  },
  {
    name: '哔哩哔哩',
    initial: '哔',
    href: 'https://www.bilibili.com',
    domain: 'bilibili.com',
    desc: '技术区与纪录片都值得刷，评论区偶尔比视频本身更有信息量。',
    tags: ['视频', '技术区'],
    from: '#070707',
    to: '#2E2724',
    initialColor: '#F0E6DA',
    since: 2009,
  },
  {
    name: '稀土掘金',
    initial: '掘',
    href: 'https://juejin.cn',
    domain: 'juejin.cn',
    desc: '中文前端文章的集散地，新框架的第一手踩坑记录多半在这。',
    tags: ['社区', '前端'],
    from: '#EEC25E',
    to: '#C9741F',
    initialColor: '#241C18',
    since: 2015,
  },
  {
    name: '知乎',
    initial: '知',
    href: 'https://www.zhihu.com',
    domain: 'zhihu.com',
    desc: '专栏长文的质量参差，但认真写的那批仍然值得订阅。',
    tags: ['问答', '专栏'],
    from: '#2A7A66',
    to: '#EEC25E',
    initialColor: '#241C18',
    since: 2011,
  },
] as const

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
export const repos = [
  {
    repo: 'QssssY/offCat',
    name: 'offCat',
    desc: '面向求职场景的 AI 应用：简历诊断、模拟面试、JD 匹配与模板导出，前后端同仓。',
    stack: 'Java',
    stars: 1,
    icon: 'layout-grid',
    badge: '正在打磨',
    pushed: '2026-08-19T15:06:27Z',
  },
  {
    repo: 'QssssY/ai-psychological-assistant',
    name: 'ai-psychological-assistant',
    desc: 'AI 情感智能助手，做陪伴式对话与情绪记录。',
    stack: 'Vue',
    stars: 0,
    icon: 'app-window',
    pushed: '2026-03-13T14:12:51Z',
  },
  {
    repo: 'QssssY/mini-vue',
    name: 'mini-vue',
    desc: '手写 Vue 3 核心，把响应式、运行时与编译器各自实现一遍。',
    stack: 'JavaScript',
    stars: 0,
    icon: 'package',
    pushed: '2026-02-24T16:33:31Z',
  },
] as const

/** 仓库地址由 repo 拼出来，不单独存 href */
export const repoUrl = (repo: string) => `https://github.com/${repo}`
