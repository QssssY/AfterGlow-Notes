/**
 * 译文盘点 —— `pnpm i18n`
 *
 * 只读，不改任何文件。回答三个问题：
 *   1. 界面文案字典有没有缺键（正常情况下 TS 已经拦住了，这里只是复核）
 *   2. 站点数据每个语种译到什么程度，有没有和基准「错位」
 *   3. 哪些文章额外配了译文
 *
 * 为什么需要它：站点数据的译文是**部分覆盖**（只写要翻的字段），按 href/repo 这类
 * 不可翻字段配对；没有这种字段的短列表（tools/stack/reading/changelog/now.items）
 * 退回按下标配对。下标配对有个静默失败：基准列表增删或重排之后，译文会盖到
 * 错误的条目上，而构建照样成功。所以这里把「基准与译文条数不一致」单独报出来。
 *
 * 文章不在盘点的「欠债」里：文章按作者写作时的语言呈现，没有译文是常态而非缺口。
 * 下面只列出哪些篇额外配了译文，方便你知道自己写到哪儿了。
 *
 * fork 这个仓库的人尤其要跑一遍：src/data/*.<语种>.json 里是**原作者内容的译文**，
 * 换成自己的内容后必须一并换掉或删掉，否则中文站是你的、英文站还是别人的。
 * 清除命令印在报告末尾。
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { locales, defaultLocale } from '../src/i18n/locales.ts'

const DATA = join('src', 'data')
const POSTS = join('src', 'content', 'posts')
/** 与 merge.ts 保持一致：只有这些不可翻的字段能当数组配对主键 */
const IDENTITY_KEYS = ['repo', 'href', 'domain']

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'))
const others = locales.filter((l) => l !== defaultLocale)

let warnings = 0
const warn = (msg) => {
  warnings += 1
  console.log(`  ⚠ ${msg}`)
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

/**
 * 数组配对方式与 merge.ts 同一口径：两边都是对象数组且共有身份字段 → 按它配；否则按下标。
 * 返回一句可打印的摘要；错位（孤儿 / 条数不一致）走 warn。label 是给人看的位置，如
 * `now.en.json` 或 `about.en.json › paragraphs`
 */
function checkArray(base, patch, label) {
  const objs = base.every((x) => x && typeof x === 'object') && patch.every((x) => x && typeof x === 'object')
  const key = objs
    ? IDENTITY_KEYS.find(
        (k) => base.every((i) => typeof i[k] === 'string') && patch.every((i) => typeof i[k] === 'string'),
      )
    : undefined
  if (key) {
    const ids = new Set(base.map((i) => i[key]))
    const hit = patch.filter((i) => ids.has(i[key])).length
    const orphan = patch.filter((i) => !ids.has(i[key])).map((i) => i[key])
    if (orphan.length) warn(`${label} 有 ${orphan.length} 条对不上基准（会被忽略）：${orphan.slice(0, 2).join(', ')}`)
    return `${hit}/${base.length} 按 ${key}`
  }
  if (patch.length !== base.length)
    warn(`${label} 条数与基准不一致（${patch.length} vs ${base.length}）——按下标配对会错位，请逐条核对`)
  return `${patch.length}/${base.length} 按下标`
}

/**
 * 对象型数据（site / about / now）里也埋着按下标配对的列表：now.items、about.paragraphs /
 * chips / listAItems、site.finePrintPoints…… 早先只报「几个字段」，基准顶部插一条
 * 译文没跟上，报告照样说「没有发现错位」。这里递归下去，遇到两边都是数组的键就查
 */
function checkNested(base, patch, label) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in base)) continue
    if (Array.isArray(base[k]) && Array.isArray(v)) checkArray(base[k], v, `${label} › ${k}`)
    else if (isObj(base[k]) && isObj(v)) checkNested(base[k], v, `${label} › ${k}`)
  }
}

/* ── 1. 界面文案字典 ───────────────────────────────────── */

console.log('\n界面文案（src/i18n/ui.ts）')
const { ui } = await import('../src/i18n/ui.ts')
const baseKeys = Object.keys(ui[defaultLocale])
console.log(`  ${defaultLocale}: ${baseKeys.length} 键（基准）`)
for (const loc of others) {
  const missing = baseKeys.filter((k) => !(k in ui[loc]))
  const empty = baseKeys.filter((k) => k in ui[loc] && ui[loc][k] === ui[defaultLocale][k])
  console.log(`  ${loc}: ${Object.keys(ui[loc]).length} 键`)
  if (missing.length) warn(`${loc} 缺 ${missing.length} 键：${missing.slice(0, 5).join(', ')}…`)
  // 与中文逐字相同的键：可能是漏译，也可能本就该保持原样（GENERAL、RSS 这类）
  if (empty.length) console.log(`     其中 ${empty.length} 键与中文相同（专名/缩写通常如此，值得扫一眼）`)
}

/* ── 2. 站点数据 ───────────────────────────────────────── */

console.log('\n站点数据（src/data/*.json）')
const files = await readdir(DATA)
const bases = files.filter((f) => /^[^.]+\.json$/.test(f)).map((f) => f.replace('.json', ''))

for (const name of bases) {
  const base = await readJson(join(DATA, name + '.json'))
  const marks = []
  for (const loc of others) {
    const file = `${name}.${loc}.json`
    if (!files.includes(file)) {
      marks.push(`${loc}:—`)
      continue
    }
    const patch = await readJson(join(DATA, file))
    if (Array.isArray(base) && Array.isArray(patch)) {
      marks.push(`${loc}:${checkArray(base, patch, file)}`)
    } else if (isObj(base) && isObj(patch)) {
      marks.push(`${loc}:${Object.keys(patch).length} 字段`)
      checkNested(base, patch, file)
    } else {
      warn(`${file} 与基准的形状不一致（数组 vs 对象），译文会整份顶掉基准`)
    }
  }
  console.log(`  ${name.padEnd(11)} ${marks.join('   ')}`)
}

/* ── 3. 文章 ───────────────────────────────────────────── */

console.log('\n文章（src/content/posts/）')
const isMd = (f) => /\.mdx?$/.test(f)
const basePosts = (await readdir(POSTS)).filter(isMd).map((f) => f.replace(/\.mdx?$/, ''))
console.log(`  ${basePosts.length} 篇原文。文章按写作时的语言呈现，没有译文是常态，不是缺口。`)

for (const loc of others) {
  const list = await readdir(join(POSTS, loc))
    .then((fs) => fs.filter(isMd).map((f) => f.replace(/\.mdx?$/, '')))
    .catch(() => [])
  console.log(
    list.length
      ? `  ${loc}: 另配了 ${list.length} 篇译文 —— ${list.join(', ')}`
      : `  ${loc}: 没有额外译文（全部显示原文）`,
  )
  const orphan = list.filter((s) => !basePosts.includes(s))
  if (orphan.length)
    warn(`posts/${loc}/ 里有 ${orphan.length} 篇找不到同名原文：${orphan.join(', ')}`)
}

/* ── 收尾 ─────────────────────────────────────────────── */

console.log(
  warnings === 0
    ? '\n没有发现错位或孤儿译文。'
    : `\n共 ${warnings} 处需要处理（见上面的 ⚠）。`,
)
console.log(`
fork 这个仓库的人请注意：src/data/*.<语种>.json 与 src/content/posts/<语种>/
装的是**原作者内容**的译文。换成自己的内容后，把它们一并清掉再重写：

  rm -f src/data/*.en.json src/data/*.ja.json
  rm -rf src/content/posts/en src/content/posts/ja

清掉之后英文/日文站的界面仍然是全译的（界面字典与内容无关），
文章按你写作时的语言呈现 —— 诚实且不会说错话。`)
