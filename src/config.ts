/** 站点级常量 —— 与语言无关的那部分 */

/*
 * 会改的内容真身全在 src/data/*.json —— 网页管理后台（/overview，写接口在
 * server/ 的 /api/overview）改的就是这些文件。dev 下保存即热更新；部署后改完要重新构建。
 *
 * 内容的「取用」不在这里：它按语种解析，走 src/i18n/content.ts。
 * 组件一律用 useI18n(Astro) 拿到的 c，换语种时内容整套跟着换：
 *
 *     const { t, c, fmt, path } = useI18n(Astro)
 *     c.site.title / c.repos / c.shareItems ...
 *
 * ⚠️ 本文件被**客户端 <script> 直接 import**（播放器要 musicBase/playlist、
 * RepoStars 要 apiBase、侧栏邮件钮要 email），所以这里**绝不能碰 i18n/content.ts**：
 * 那个模块用 import.meta.glob 把 src/data 下的基准 + 全部译文 JSON 一并 eager 引入，
 * 一旦从这里牵上，整套站点内容（含英日译文）就会跟着打进浏览器包 ——
 * 实测过一次：config 的客户端 chunk 从几百字节涨到 29KB，而脚本一个字都用不上。
 * 要在服务端拿内容，直接 import getContent（见 AdminLayout），别绕这里。
 */

import playlistData from './data/playlist.json'
import siteData from './data/site.json'
import type { Track } from './i18n/content'

export type {
  BlogrollEntry,
  ChangelogEntry,
  Friend,
  NowItem,
  Repo,
  ShareEntry,
  Social,
  StackRow,
  Tool,
  Track,
  ReadingItem,
} from './i18n/content'

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
 * 两处表单都没有后端，提交时打开访客自己的邮件客户端并预填内容。
 */
export const email = siteData.email

/** 仓库地址由 repo 拼出来，不单独存 href */
export const repoUrl = (repo: string) => `https://github.com/${repo}`

/**
 * Uptime Card —— 天数按构建日期实时计算，不是写死的。
 * 起点是这个仓库的首次提交（git log --reverse 可查：2026-08-21）。
 * 显示文案在 ui.ts 的 uptime.since，日期按访客语种格式化。
 */
export const uptime = {
  // Date.UTC 钉死起点，不随构建机时区漂移（CI 在 UTC，本地在东八区）
  since: new Date(Date.UTC(2026, 7, 21)),
} as const

/**
 * Snapshot Strip（首页中栏末位）—— 三格占位。
 * 给了 src 就渲染图，没给就是 avatar-bg 底色块（图在 images/ 里，由 index.astro 传下来）。
 */
export const snapshots = [{ alt: '' }, { alt: '' }, { alt: '' }] as const

const playlist = playlistData as Track[]
const defaultIndexes = playlist.reduce<number[]>((indexes, track, index) => {
  if (track.default === true) indexes.push(index)
  return indexes
}, [])

if (playlist.length > 0 && defaultIndexes.length !== 1) {
  throw new Error('src/data/playlist.json 必须且只能把一首歌标记为 default: true')
}

/**
 * Now Playing 的播放列表 —— 曲名与歌手是专有名词，各语种听的是同一首歌，
 * 所以不进译文表，直接读 JSON（客户端 <script> 也 import 这个）。
 * defaultIndex 是首次加载时的曲目下标，由管理台的 default 勾选项决定；
 * bars 是未播放时等化条的「定格假谱」高度，设计常量。
 */
export const nowPlaying = {
  playlist,
  defaultIndex: defaultIndexes[0] ?? -1,
  bars: [8, 14, 6, 18, 11, 20, 9, 15, 7, 12, 17, 5],
} as const
