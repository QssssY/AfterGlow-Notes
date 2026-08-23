/*
 * 界面截图 —— 给 README 的「界面预览」供图（README.md 引用 docs/screenshots/）。
 *
 *   node scripts/screenshot.mjs [URL基址]
 *
 * 用 playwright-core 驱动系统 Edge（channel: 'msedge'，无需下载浏览器）。
 * 关键在「真实等待」：站点的卡片错峰入场是 CSS 动画，无头截图的
 * virtual-time-budget 会把动画冻在半透明帧，必须等真实时间播完。
 * 截完顺手用 sharp 转 webp 入库（仓库惯例：最终位图进库一律 webp）。
 */
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { mkdir, rm } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://106.12.72.232'
const OUT = 'docs/screenshots'

const pages = [
  ['home', '/'],
  ['post', '/posts/rewrite-blog-with-astro/'],
  ['projects', '/projects/'],
  ['about', '/about/'],
]

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
})

await mkdir(OUT, { recursive: true })
for (const [name, path] of pages) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
  // 等 OG 图/头像等慢资源与错峰入场动画播完（真实时间，不是虚拟时间）
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${OUT}/${name}-2x.png` })
  await sharp(`${OUT}/${name}-2x.png`).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`)
  await rm(`${OUT}/${name}-2x.png`) // 中间产物不入库
  console.log(`✓ ${name} → ${OUT}/${name}.webp`)
}
await browser.close()
