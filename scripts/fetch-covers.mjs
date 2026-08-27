#!/usr/bin/env node
/*
 * 专辑封面入库 —— 给歌单里的每首歌配一张本地封面（听歌页的 CD 面上转的就是它）。
 *
 *   node scripts/fetch-covers.mjs              # 只补还没封面的
 *   node scripts/fetch-covers.mjs --force      # 全部重取
 *   node scripts/fetch-covers.mjs --size 1000  # 换边长（默认 600）
 *
 * 为什么是「入库下载」而不是运行时取图：与歌、歌词同一条规矩（见 server/music.go
 * 顶部）—— 聚合/公共接口的直链会过期、会限流，存进 playlist.json 没几天就是死链。
 * 封面落在 public/music/（与 mp3 同名同目录、gitignored，由 scripts/deploy.sh 增量
 * 同步到服务器的 -music 目录），播放器只认本地 /music/*，运行时零依赖任何外部接口。
 *
 * 图源用 Apple 的公开 iTunes Search API：免密钥、中日英曲库都覆盖（实测本站歌单 24/25 命中），且给的是方图正好贴 CD。用户自建的统一音源层（:9000）不返回封面
 * （/api/info 走 lx-music 上游，本机实测 500），所以没接它。
 *
 * 前提：能连 itunes.apple.com。国内直连不通，本机走 Clash 时（Git Bash）：
 *   HTTPS_PROXY=http://127.0.0.1:17897 NODE_USE_ENV_PROXY=1 pnpm covers
 * NODE_USE_ENV_PROXY 是 Node ≥24 让内建 fetch 认 *_PROXY 环境变量的开关；
 * 没挂代理时脚本会逐首报「查询失败」，不会写坏 playlist.json。
 *
 * 找不到封面的歌不写字段、不报错退出 —— 播放器没有 cover 就显示纯 CD 盘面。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PLAYLIST = join(ROOT, 'src/data/playlist.json')
const MUSIC_DIR = join(ROOT, 'public/music')

const args = process.argv.slice(2)
const force = args.includes('--force')
const sizeArg = args.indexOf('--size')
const SIZE = sizeArg >= 0 ? Number(args[sizeArg + 1]) || 600 : 600

/*
 * 繁简折叠（只为配对，不改任何写入的数据）——iTunes 的华语曲库大量用繁体
 * （陀飛輪 / 富士山下），歌单里是简体，不折叠就永远匹配不上，只能让翻唱版
 * 抢走封面（实测「陀飞轮」被综艺翻唱版顶掉）。表只收歌名里高频的那些字，
 * 配不上的落到「宁缺勿错」分支（见 pick），不会硬塞一张错图。
 */
const T2S = Object.fromEntries(
  [
    ['飛', '飞'], ['輪', '轮'], ['陳', '陈'], ['時', '时'], ['說', '说'], ['愛', '爱'],
    ['樂', '乐'], ['夢', '梦'], ['風', '风'], ['雲', '云'], ['車', '车'], ['開', '开'],
    ['關', '关'], ['見', '见'], ['聽', '听'], ['讓', '让'], ['過', '过'], ['還', '还'],
    ['這', '这'], ['個', '个'], ['們', '们'], ['來', '来'], ['對', '对'], ['會', '会'],
    ['後', '后'], ['裡', '里'], ['麗', '丽'], ['歲', '岁'], ['麼', '么'], ['無', '无'],
    ['歡', '欢'], ['戀', '恋'], ['傷', '伤'], ['淚', '泪'], ['離', '离'], ['歸', '归'],
    ['願', '愿'], ['當', '当'], ['麥', '麦'], ['麵', '面'], ['禮', '礼'], ['醫', '医'],
    ['聲', '声'], ['實', '实'], ['寫', '写'], ['習', '习'], ['變', '变'], ['擁', '拥'],
    ['懷', '怀'], ['歷', '历'], ['嗎', '吗'], ['嘆', '叹'], ['靜', '静'], ['歌', '歌'],
    ['孤', '孤'], ['與', '与'], ['為', '为'], ['將', '将'], ['盡', '尽'], ['滅', '灭'],
    ['歐', '欧'], ['蘇', '苏'], ['懂', '懂'], ['總', '总'], ['歎', '叹'], ['雙', '双'],
  ],
)
const fold = (s) => [...s].map((ch) => T2S[ch] ?? ch).join('')

/** 查曲名里的「本体」：去掉 (国语)/【】/(Live) 这类括注 + 繁简折叠 */
const core = (s) =>
  fold(s)
    .replace(/[(（【\[].*?[)）】\]]/g, ' ')
    .replace(/["'“”「」]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** 含中日文字（用来判断「候选歌手名是中文但跟我们要的不是同一个人」） */
const hasCJK = (s) => /[぀-ヿ㐀-鿿]/.test(s)

const search = async (term) => {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: '8',
  })}`
  const res = await fetch(url, { headers: { 'user-agent': 'afterglow-notes/cover-fetch' } })
  if (!res.ok) throw new Error(`iTunes ${res.status}`)
  return (await res.json()).results ?? []
}

/*
 * 选片 —— 宁缺勿错：没有正向的曲名信号就返回 null（那首歌保持纯 CD 盘面），
 * 绝不把第一条硬塞上去。一张明显不对的专辑图比没有图更糟。
 *
 * 歌手名跨语种写法不同（陈奕迅 / Eason Chan），所以：对上加分，
 * 对不上**且候选歌手名是中日文**（说明是另一位华语/日语歌手，多半是翻唱版）
 * 才扣分 —— 罗马字写法一律视为「可能是同一人」，不扣。
 */
const pick = (results, title, artist) => {
  const wantT = core(title)
  const wantA = core(artist ?? '')
  let best = null
  let bestScore = 0 // 0 分即淘汰：必须有正向曲名信号
  let fallback = null
  for (const r of results) {
    const gotT = core(r.trackName ?? '')
    const gotA = core(r.artistName ?? '')
    let score = 0
    if (gotT === wantT) score += 4
    else if (gotT.includes(wantT) || wantT.includes(gotT)) score += 2
    const sameArtist = Boolean(wantA) && (gotA.includes(wantA) || wantA.includes(gotA))
    /*
     * 翻唱硬否决：候选歌手名是中日文、却不是我们要的那位 —— 这种候选**再怎么
     * 曲名全等也不能要**（一首中文歌被另一位华语歌手唱过，那是他专辑的封面）。
     * 曾按扣分处理，结果「特别的人」被同名翻唱者的专辑以「曲名全等」压过方大同。
     * 罗马字写法一律视为「可能是同一人」（Eason Chan = 陈奕迅、Claire Kuo = 郭静）。
     */
    if (Boolean(wantA) && hasCJK(r.artistName ?? '') && !sameArtist) continue
    if (sameArtist) score += 3
    // 现场版/伴奏带在没有更好选择时才要
    if (/live|instrumental|karaoke|remix|cover/i.test(r.trackName ?? '')) score -= 1
    if (score > bestScore) {
      bestScore = score
      best = r
    }
    // 兜底人选：曲名对不上（繁简/异体字折不干净时常有，「單車」就是），
    // 但也没有翻唱嫌疑 —— iTunes 自己的相关性排序在这种情况下比我的
    // 字符串比较靠谱，取它排最前的那条
    if (!fallback) fallback = r
  }
  return { hit: best ?? fallback, sure: Boolean(best) }
}

const main = async () => {
  const tracks = JSON.parse(readFileSync(PLAYLIST, 'utf8'))
  if (!existsSync(MUSIC_DIR)) mkdirSync(MUSIC_DIR, { recursive: true })

  let added = 0
  let skipped = 0
  let missed = 0
  const unsure = [] // 兜底选出来的（曲名没对上），末尾单独列出来让人核对

  for (const track of tracks) {
    // 封面与 mp3 同名（一眼看得出归属）；扩展名跟图源给的走
    const stem = basename(track.src, extname(track.src))
    const have = track.cover && existsSync(join(MUSIC_DIR, basename(track.cover)))
    if (have && !force) {
      skipped += 1
      continue
    }

    // 逃生口：自己往 public/music/ 放一张与 mp3 同名的图（自动配错、或想换成
    // 心里那版专辑封面时），直接采纳、不联网。⚠️ 手放的图别跑 --force，
    // 那会按线上结果重配、配不上就把它清掉
    if (!force) {
      const manual = ['.jpg', '.jpeg', '.png', '.webp', '.avif']
        .map((ext) => `${stem}${ext}`)
        .find((file) => existsSync(join(MUSIC_DIR, file)))
      if (manual) {
        track.cover = `/music/${manual}`
        skipped += 1
        console.log(`· ${track.title} —— 用你放的 ${manual}`)
        continue
      }
    }

    const term = `${track.artist ?? ''} ${track.title}`.trim()
    let hit = null
    let sure = false
    try {
      ;({ hit, sure } = pick(await search(term), track.title, track.artist))
    } catch (err) {
      console.error(`! ${term} —— 查询失败：${err.message}`)
      console.error('  连不上 itunes.apple.com？挂代理重跑（见本文件头部说明）')
      missed += 1
      continue
    }
    const art = hit?.artworkUrl100 ?? hit?.artworkUrl60
    if (!art) {
      // 重查配不上：把上一轮那张（多半是翻唱版抢来的）连字段一起清掉 ——
      // 错图比没图更糟，退回纯 CD 盘面
      if (force && track.cover) {
        const old = join(MUSIC_DIR, basename(track.cover))
        if (existsSync(old)) rmSync(old)
        delete track.cover
        console.log(`✘ ${term} —— 配不上，已清掉旧封面，回到纯 CD`)
      } else {
        console.log(`✘ ${term} —— 没找到封面（保持纯 CD 盘面）`)
      }
      missed += 1
      continue
    }

    // 100x100bb.jpg → 600x600bb.jpg：同一 CDN 路径换边长即可拿高清方图
    const big = art.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${SIZE}x${SIZE}bb.$1`)
    const ext = extname(new URL(big).pathname) || '.jpg'
    const file = `${stem}${ext}`
    try {
      const res = await fetch(big)
      if (!res.ok) throw new Error(`下载 ${res.status}`)
      writeFileSync(join(MUSIC_DIR, file), Buffer.from(await res.arrayBuffer()))
    } catch (err) {
      console.error(`! ${term} —— 下载失败：${err.message}`)
      missed += 1
      continue
    }

    track.cover = `/music/${file}`
    added += 1
    if (!sure) unsure.push(`${track.title} → ${hit.artistName} 《${hit.collectionName}》`)
    console.log(`${sure ? '✔' : '?'} ${track.title} —— ${hit.artistName} 《${hit.collectionName}》`)
  }

  writeFileSync(PLAYLIST, `${JSON.stringify(tracks, null, 2)}\n`, 'utf8')
  console.log(`\n新增 ${added} · 已有 ${skipped} · 没配上 ${missed} · 共 ${tracks.length} 首`)
  if (added > 0) console.log('封面在 public/music/（gitignored）—— 上线记得跑 scripts/deploy.sh 同步')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
