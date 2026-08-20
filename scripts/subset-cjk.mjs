/**
 * 中文字体构建期子集化
 *
 * 设计稿指定正文用 Noto Sans SC，但完整字体按 unicode-range 分片后是 101 条 @font-face
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
 * 设计稿用到 400/500/600/700 四档，但中文子集是按字重独立生成的 —— 体积随
 * 「字符数 × 字重数」线性上升（438 字时每字重 57KB，646 字时 85KB）。
 * 600 只用在移动端 Tab Bar 的激活标签一处，去掉后按 CSS 字重匹配规则会落到 700，
 * 小字号下几乎看不出差别，却直接省掉 1/4 体积。
 */
const WEIGHTS = [400, 500, 700]
const SRC_DIR = 'src'
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

async function collectCharset() {
  const chars = new Set(BASELINE)
  let files = 0
  for await (const path of walk(SRC_DIR)) {
    files += 1
    for (const ch of (await readFile(path, 'utf8')).match(CJK_MATCH) ?? []) chars.add(ch)
  }
  return { text: [...chars].sort().join(''), files }
}

function fontSource(weight) {
  const pkg = dirname(require.resolve('@fontsource/noto-sans-sc/package.json'))
  return join(pkg, 'files', `noto-sans-sc-chinese-simplified-${weight}-normal.woff2`)
}

function buildCss() {
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
  return `/* 自动生成，请勿手改 —— 见 scripts/subset-cjk.mjs */\n\n${faces.join('\n\n')}\n`
}

const { text, files } = await collectCharset()
const hash = createHash('sha256').update(text).digest('hex').slice(0, 16)

await mkdir(FONT_DIR, { recursive: true })

if ((await readFile(STAMP_FILE, 'utf8').catch(() => '')) === hash) {
  console.log(`[subset-cjk] 字符集未变（${text.length} 字），跳过`)
  process.exit(0)
}

let total = 0
for (const weight of WEIGHTS) {
  const source = await readFile(fontSource(weight))
  const subset = await subsetFont(source, text, { targetFormat: 'woff2' })
  const out = join(FONT_DIR, `noto-sans-sc-cjk-${weight}.woff2`)
  await writeFile(out, subset)
  total += subset.length
  const pct = ((subset.length / source.length) * 100).toFixed(1)
  console.log(
    `[subset-cjk] ${weight}: ${(source.length / 1024).toFixed(0)}KB → ${(subset.length / 1024).toFixed(1)}KB (${pct}%)  ${relative('.', out)}`,
  )
}

await writeFile(CSS_FILE, buildCss())
await writeFile(STAMP_FILE, hash)

console.log(
  `[subset-cjk] 扫描 ${files} 个文件，收集 ${text.length} 个汉字/符号；${WEIGHTS.length} 个字重共 ${(total / 1024).toFixed(1)}KB`,
)
