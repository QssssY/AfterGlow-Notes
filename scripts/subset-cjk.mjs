/**
 * 中文字体构建期子集化
 *
 * 设计指定正文用 Noto Sans SC，但完整字体按 unicode-range 分片后是 101 条 @font-face
 * ×4 个字重 = 514KB raw / 90KB brotli 的阻塞样式表，比字体本身更伤首屏。
 * 这里改成扫描源码里实际用到的汉字，把整块 CJK 字体（每字重约 1.1MB）裁成一个小子集，
 * 配一条 @font-face 就够。拉丁字重不裁 —— fontsource 的 latin 分片每个只有 13KB。
 *
 * 产物写到 src/generated/（已 gitignore），由 src/styles/global.css 引入。
 * 用法：pnpm fonts（dev 和 build 会自动先跑一遍）
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import subsetFont from 'subset-font'

const require = createRequire(import.meta.url)

/**
 * 设计用到 400/500/600/700 四档，但中文子集是按字重独立生成的 —— 体积随
 * 「字符数 × 字重数」线性上升。600 只用在移动端 Tab Bar 的激活标签一处，
 * 去掉后按 CSS 字重匹配规则会落到 700，小字号下几乎看不出差别。
 *
 * 字符集按「哪些文字会以这个字重渲染」分三份：
 * - 400/700 全量：文章正文是 400、正文 **加粗** 是 700，得覆盖所有汉字；
 * - 500 瘦身：font-medium 只出现在界面标签和文章标题/摘要（frontmatter）、
 *   文内标题（目录卡引用）上 —— 正文那上千个字进不了 500，裁掉省一大截；
 * - 歌词单独一个惰性 face（'Noto Sans SC Lyrics'，500）：歌词行也以 medium
 *   渲染但用字杂（粤语词），并进 500 会把瘦身的省全吃回去。拆出去后靠
 *   CSS 字体的惰性加载：只在真正唱起来（[data-karaoke] 挂上）时浏览器才
 *   下载它，首访零成本。缺字的兜底与从前一样：回退系统字体。
 */
const WEIGHTS = [400, 500, 700]
/** 用瘦身字符集的字重 */
const CHROME_WEIGHTS = new Set([500])
const SRC_DIR = 'src'
/** 歌词目录。音乐是版权物不进 git —— 目录不存在时（CI / 别的机器）静默跳过：
 *  不生成歌词 face、fonts.css 也不写那条 @font-face，播放歌词回退系统字体 */
const LRC_DIR = join('public', 'music')
const SCAN_EXT = new Set(['.astro', '.ts', '.tsx', '.md', '.mdx', '.json'])
const OUT_DIR = join('src', 'generated')
const FONT_DIR = join(OUT_DIR, 'fonts')
const CSS_FILE = join(OUT_DIR, 'fonts.css')
const STAMP_FILE = join(OUT_DIR, '.charset-hash')

/** 交给浏览器的 unicode-range：只有这些区段才用子集字体，拉丁走 fontsource 的 latin 分片 */
const UNICODE_RANGE = [
  'U+2E80-2EFF',
  'U+3000-303F',
  'U+3040-30FF',
  'U+3200-4DBF',
  'U+4E00-9FFF',
  'U+F900-FAFF',
  'U+FE30-FE4F',
  'U+FF00-FFEF',
].join(', ')

const CJK_MATCH =
  /[⺀-⻿　-〿぀-ヿ㈀-䶿一-鿿豈-﫿︰-﹏＀-￯]/gu

/** 兜底字符：常用标点与全角符号，避免文章里偶发用到却没被扫到 */
const BASELINE = '，。、；：？！“”‘’（）〈〉《》【】—…·　～％＃＠＆＊＋－＝／＼｜'

/**
 * src/data/*.json 里**只以 400 渲染**的字段 —— 它们的字不进 500 瘦身集。
 *
 * 500（font-medium）出现在界面标签、卡片标题、域名戳这些短文字上；JSON 里的大头
 * 恰恰是散文（friends/blogroll/share/repos/changelog 的 desc 一项就 7300 字），
 * 整份 JSON 都并进 500 的话「瘦身」名不副实（实测 1297 vs 全量 1523 字）。
 *
 * 用「排除清单」而不是「白名单」：漏了一个键，代价只是 500 子集大一点点；
 * 而白名单漏一个真以 medium 渲染的键，那个字会逐字回退系统字体 —— 一行两种字形，
 * 是这个脚本最该避免的失败。清单里每一项都逐个核过渲染字重（全是 font-normal）。
 */
const PROSE_KEYS = new Set([
  'desc', // 友链 / 分享 / 项目 / 更新日志 / 关于页友链，六处全是 font-normal
  'description', // 站点描述（SEO 与 RSS，不上屏）
  'paragraphs', // 关于页自我介绍
  'listAItems',
  'listBItems', // 关于页两个小清单
  'note', // 此刻卡 / 友链面板的小字
  'detail', // 此刻卡的条目内容
  'aside', // 分享条目的补充
  'bio', // 首页问候卡
  'role', // 关于页的一句话身份
  'repoNote', // 项目页「状态」面板末行
  'finePrintBlurb',
  'finePrintPoints',
  'finePrintReply', // 关于页细则
])

/** 从 JSON 里挑出会以 500 渲染的文字（丢掉 PROSE_KEYS 那些散文字段） */
function chromeTextFromJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return text // 解析不了（半截文件）就按老样子整份收，宁可大一点
  }
  const out = []
  const walk = (v, key) => {
    if (PROSE_KEYS.has(key)) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) for (const x of v) walk(x, key)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(data, '')
  return out.join('\n')
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'generated' || entry.name === 'node_modules') continue
      yield* walk(path)
    } else if (SCAN_EXT.has(extname(entry.name))) {
      yield path
    }
  }
}

/**
 * 代码文件先剥注释再收字：注释不渲染，收进去的全是白重（实测占了近 1/4）。
 * 只用于 .astro/.ts/.tsx —— md 不剥（文章代码块里的示例注释是要渲染的内容），
 * json 没有注释语法。行注释防两类误伤：'https://…'（斜杠前是冒号）和
 * "//cdn.x/…" 这类协议相对地址（斜杠前是引号）都不算注释。
 */
const stripComments = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

/**
 * 运行期由 Intl 现算的文字源码里扫不到：时钟卡的「周六」、文章页的「昨天」、
 * 统计位的「21亿」、日文站的「火/水/木」与「簡体中国語」…… 这些字落在 unicode-range
 * 之内却不在子集里，浏览器不会换到别的 @font-face，而是逐字回退系统字体 ——
 * 一行两种字形。这里按每个语种把 format.ts / ClockCard / TimelineCard 会调的 Intl
 * 组合各跑一遍样本，产出的字并进字符集；以后加语种自动覆盖。
 * 语种标签直接从 src/i18n/locales.ts 里正则抠（intl / bcp47），不另维护一份。
 */
async function intlSamples() {
  const src = await readFile(join(SRC_DIR, 'i18n', 'locales.ts'), 'utf8')
  const pick = (key) => [...src.matchAll(new RegExp(`\\b${key}:\\s*'([^']+)'`, 'g'))].map((m) => m[1])
  const tags = pick('intl')
  const bcp47s = pick('bcp47')
  const out = []
  // 一整年逐日：周几 × 月份的所有组合都过一遍（含长/短两种写法）
  const days = []
  for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1))
    days.push(new Date(d))
  for (const tag of tags) {
    const fmts = [
      new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long', day: 'numeric' }),
      new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' }),
      new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long' }),
      new Intl.DateTimeFormat(tag, { month: 'short' }),
      new Intl.DateTimeFormat(tag, { weekday: 'short' }),
      new Intl.DateTimeFormat(tag, { weekday: 'long' }),
    ]
    for (const d of days) for (const f of fmts) out.push(f.format(d))
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
    for (const unit of ['day', 'week', 'month', 'year'])
      for (let n = -31; n <= 2; n += 1) out.push(rtf.format(n, unit))
    const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 })
    for (let e = 3; e <= 14; e += 1) out.push(compact.format(10 ** e), compact.format(2.5 * 10 ** e))
    const dn = new Intl.DisplayNames(tag, { type: 'language' })
    for (const code of bcp47s) out.push(dn.of(code) ?? '')
  }
  return out.join('')
}

async function collectCharsets() {
  const full = new Set(BASELINE)
  const chrome = new Set(BASELINE)
  const lrc = new Set()
  const add = (set, text) => {
    for (const ch of text.match(CJK_MATCH) ?? []) set.add(ch)
  }
  // Intl 产出的字两档都要有：时钟 / 相对时间既有 400 也有 500 的落点
  const intl = await intlSamples()
  add(full, intl)
  add(chrome, intl)
  let files = 0
  for await (const path of walk(SRC_DIR)) {
    files += 1
    const text = await readFile(path, 'utf8')
    const ext = extname(path)
    if (ext === '.md' || ext === '.mdx') {
      add(full, text)
      // 文章进 500 的只有会以 medium 渲染的部分：frontmatter（标题/摘要/
      // 分类/标签）和文内标题行（目录卡引用）；正文只以 400/700 出现
      add(chrome, /^---\r?\n[\s\S]*?\r?\n---/.exec(text)?.[0] ?? '')
      add(chrome, (text.match(/^ {0,3}#{1,6}\s.*$/gm) ?? []).join(''))
    } else if (ext === '.json') {
      // 数据文件：全量收（正文散文以 400/700 出现），500 只收会以 medium 渲染的字段
      add(full, text)
      add(chrome, chromeTextFromJson(text))
    } else {
      const code = stripComments(text)
      add(full, code)
      add(chrome, code)
    }
  }
  for (const name of await readdir(LRC_DIR).catch(() => [])) {
    if (extname(name) === '.lrc') add(lrc, await readFile(join(LRC_DIR, name), 'utf8'))
  }
  const sorted = (chars) => [...chars].sort().join('')
  // 歌词 face 只装主 500 没有的字：重复的字走字体栈回退，字形一模一样
  return {
    full: sorted(full),
    chrome: sorted(chrome),
    lyrics: sorted([...lrc].filter((ch) => !chrome.has(ch))),
    files,
  }
}

function fontSource(weight) {
  const pkg = dirname(require.resolve('@fontsource/noto-sans-sc/package.json'))
  return join(pkg, 'files', `noto-sans-sc-chinese-simplified-${weight}-normal.woff2`)
}

function buildCss(withLyrics) {
  const faces = WEIGHTS.map(
    (weight) => `@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('./fonts/noto-sans-sc-cjk-${weight}.woff2') format('woff2');
  unicode-range: ${UNICODE_RANGE};
}`,
  )
  // 歌词 face 独立 family：只有 global.css 里 [data-karaoke] 的规则引用它，
  // 唱起来才会命中 → 浏览器才下载（CSS 字体是按需惰性加载的）
  if (withLyrics)
    faces.push(`@font-face {
  font-family: 'Noto Sans SC Lyrics';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/noto-sans-sc-lyrics-500.woff2') format('woff2');
  unicode-range: ${UNICODE_RANGE};
}`)
  return `/* 自动生成，请勿手改 —— 见 scripts/subset-cjk.mjs */\n\n${faces.join('\n\n')}\n`
}

const { full, chrome, lyrics, files } = await collectCharsets()
// 三段字符集之间用 '\n' 分隔：换行不可能出现在字符集里（CJK_MATCH 不收它），
// 所以 "AB|C" 与 "A|BC" 不会撞出同一个哈希。
// 原先第一个分隔符是个裸 NUL 字节 —— 效果一样，但 git 因此把本文件当二进制，
// diff 一直没法审阅
const hash = createHash('sha256')
  .update(full)
  .update('\n')
  .update(chrome)
  .update('\n')
  .update(lyrics)
  .digest('hex')
  .slice(0, 16)

await mkdir(FONT_DIR, { recursive: true })

if ((await readFile(STAMP_FILE, 'utf8').catch(() => '')) === hash) {
  console.log(
    `[subset-cjk] 字符集未变（全量 ${full.length} / 瘦身 ${chrome.length} / 歌词 ${lyrics.length} 字），跳过`,
  )
  process.exit(0)
}

let total = 0
const make = async (label, text, outName, weight) => {
  const source = await readFile(fontSource(weight))
  const subset = await subsetFont(source, text, { targetFormat: 'woff2' })
  const out = join(FONT_DIR, outName)
  await writeFile(out, subset)
  total += subset.length
  const pct = ((subset.length / source.length) * 100).toFixed(1)
  console.log(
    `[subset-cjk] ${label}: ${text.length} 字，${(source.length / 1024).toFixed(0)}KB → ${(subset.length / 1024).toFixed(1)}KB (${pct}%)  ${relative('.', out)}`,
  )
}

for (const weight of WEIGHTS) {
  const text = CHROME_WEIGHTS.has(weight) ? chrome : full
  await make(String(weight), text, `noto-sans-sc-cjk-${weight}.woff2`, weight)
}
// 歌词 face 基于 500 字重裁（歌词行是 font-medium）；没有歌词就不产文件
if (lyrics) await make('歌词', lyrics, 'noto-sans-sc-lyrics-500.woff2', 500)

await writeFile(CSS_FILE, buildCss(Boolean(lyrics)))
await writeFile(STAMP_FILE, hash)

console.log(
  `[subset-cjk] 扫描 ${files} 个文件；全量 ${full.length} 字（400/700）、瘦身 ${chrome.length} 字（500）、歌词 ${lyrics.length} 字（惰性 face）；共 ${(total / 1024).toFixed(1)}KB`,
)
