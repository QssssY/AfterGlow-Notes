/*
 * 构建前刷新 src/data/repos.json 的 GitHub 动态字段（stars / 最近推送时间）。
 *
 * 为什么存在：「状态 NOW（在推进/偶尔动/搁置中）」「更新于 X 天前」这些信息
 * 由 repos.json 的 pushed 字段在构建期算出烤进 HTML —— 数据不动它们就永远停摆。
 * CI 每次构建（push 触发 + 每日定时）先跑本脚本，动态字段就跟着真实仓库走；
 * desc / icon / badge 等人工字段仍以 git 里的为准，这里绝不碰。
 *
 * 失败哲学：任何一步失败都沿用旧值退出 0 —— 网络抖动只会让数据停在上一次，
 * 绝不阻塞构建。CI 里传 GH_TOKEN（Actions 自带）走认证配额；本地裸跑走匿名
 * 60 次/时，四个仓库绰绰有余（国内直连不通时挂代理：HTTPS_PROXY=... node 本脚本）。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/data/repos.json', import.meta.url)
const repos = JSON.parse(readFileSync(FILE, 'utf8'))

const headers = {
  'User-Agent': 'afterglow-build',
  Accept: 'application/vnd.github+json',
}
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`

let changed = false
for (const r of repos) {
  try {
    const res = await fetch(`https://api.github.com/repos/${r.repo}`, { headers })
    if (!res.ok) {
      console.warn(`↷ ${r.repo}: HTTP ${res.status}，沿用旧值`)
      continue
    }
    const d = await res.json()
    if (typeof d.pushed_at === 'string' && d.pushed_at !== r.pushed) {
      r.pushed = d.pushed_at
      changed = true
    }
    if (Number.isInteger(d.stargazers_count) && d.stargazers_count !== r.stars) {
      r.stars = d.stargazers_count
      changed = true
    }
    console.log(`✓ ${r.repo}: ★${d.stargazers_count} · 最近推送 ${d.pushed_at}`)
  } catch (e) {
    console.warn(`↷ ${r.repo}: ${e?.message ?? e}，沿用旧值`)
  }
}

if (changed) {
  writeFileSync(FILE, JSON.stringify(repos, null, 2) + '\n')
  console.log('repos.json 动态字段已刷新')
} else {
  console.log('repos.json 无变化')
}
