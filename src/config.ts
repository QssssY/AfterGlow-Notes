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
 * 对外联系邮箱 —— 订阅面板与申请友链都用它拼 mailto。
 * 两处表单都没有后端，提交时打开访客自己的邮件客户端并预填内容；
 * 以后接了订阅服务或表单服务，改掉各自的 submit 处理即可。
 */
export const email = '1795845968@qq.com'

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
  { label: 'Github', icon: 'github', href: 'https://github.com/QssssY', variant: 'dark' },
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
