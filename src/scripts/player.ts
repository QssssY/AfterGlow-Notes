import { musicBase, nowPlaying, type Track } from '~/config'
import { fill } from '~/scripts/i18n'

/**
 * 播放器控制层 —— 首页那张 Now Playing 卡和听歌页（/my-music）的最大化播放台
 * 共用这一份。两处组件的 <script> 都只写 `import '~/scripts/player'`：
 * 模块只求值一次，于是整站只有一个 Audio、一份曲目/歌词/音量状态，
 * 首页 ↔ 听歌页来回走不断播。
 *
 * 音频实体是模块级的 new Audio() —— 不进 DOM：
 * Astro 换页 swap 后会重建 body 里所有媒体元素（reifyMediaElements），
 * 连 transition:persist 的都保不住；游离对象则完全不受影响，跨页不断播。
 * 模块级状态（曲目索引 / AudioContext / 频谱 / 各曲歌词缓存）同理跨页存活，
 * 每次 astro:page-load 只重绑当前页的 UI。
 *
 * 首页同时渲染两张卡（桌面右栏一张、移动端流里一张，断点互斥各显其一），
 * 所以 UI 引用是「绑定组」数组：所有卡共享这一个 Audio，状态全量广播 ——
 * 谁可见谁就是播放器，切设备宽度也不丢状态。
 *
 * 听歌页那张卡比首页多用几个钩子，都是可选的（首页没有就整段跳过）：
 *   data-np-no-toggle   整卡点击不切播放（页面那么大，误触太容易）
 *   [data-np-play]      显式的大播放钮，代替「点卡切播放」
 *   [data-np-title]     常驻曲名 / [data-np-artist] 歌手（歌词行另有位置）
 *   [data-np-time]      已播时间 / [data-np-dur] 总时长
 *   [data-np-lyricbox]  整篇歌词滚动区（行由脚本按当前曲现渲）
 */
/** end 是这句「唱完」的时刻（见 loadLrc 里的估算），亮字渐变只跑 t→end 这段 */
type LrcLine = { t: number; text: string; end: number; est: number }

const tracks: readonly Track[] = nowPlaying.playlist
const trackLabel = (t: Track) => (t.artist ? `${t.title} — ${t.artist}` : t.title)

// 音乐可能不与页面同源（分体部署时歌在小机子上，见 config.ts 的 musicBase）
const musicUrl = (p: string) => musicBase + p

let cur = nowPlaying.defaultIndex
const player = new Audio()
// 首次交互前不设置 src：preload='none' 只有在未选中音源时才能保证首屏零音频请求。
// 用户点击播放时再补 src，曲名/封面仍由服务端 HTML 立即展示。
player.preload = 'none'
// 跨域音源必须挂 anonymous + 服务端 CORS：Web Audio 的频谱分析要读采样，
// 不满足同源策略时 analyser 只会输出一排零（等化条永远躺平）。
// 同源时不挂 —— 避免给本地/单机模式引入任何行为变化。必须在赋 src 之前设。
if (musicBase) player.crossOrigin = 'anonymous'

// localStorage 在 Safari「阻止所有 Cookie」/ 沙箱 iframe 里一碰就抛 SecurityError ——
// 这里是模块顶层，抛了整个播放器模块求值失败，卡片从此没反应。包一层，存不了就当没存
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // 不可用就本次会话内记在内存里（player.volume / mode 变量本身）
    }
  },
}

// 音量跨页跨曲记忆；没存过保持默认 1（Number(null)=0 会静音，必须判 null）
const VOLUME_KEY = 'afterglow:volume'
const savedVol = store.get(VOLUME_KEY)
if (savedVol !== null) {
  const v = Number(savedVol)
  if (Number.isFinite(v)) player.volume = Math.min(1, Math.max(0, v))
}

// 播放模式：顺序（列表循环）→ 随机 → 单曲循环，点击轮换，跨页跨会话记忆。
// 单曲循环走原生 loop —— 无缝重播且不触发 ended；随机抽签保证不与当前曲重复
const MODE_KEY = 'afterglow:playmode'
const MODES = ['order', 'shuffle', 'one'] as const
type PlayMode = (typeof MODES)[number]
/*
 * 模式名与「播放 X」「纯音乐」这几句由服务端写在卡片的 data-np-t-* 上
 * （见组件顶部的 scriptText）。第一张卡就够 —— 同一页两张卡语种必然相同。
 * 拿不到时给空串：宁可少一句提示，也不要在英文页面上蹦出中文。
 */
const text = (key: string) =>
  document.querySelector<HTMLElement>('[data-np]')?.dataset[key] ?? ''
const modeLabel = (m: PlayMode) =>
  text(m === 'order' ? 'npTOrder' : m === 'shuffle' ? 'npTShuffle' : 'npTOne')

let mode: PlayMode = 'order'
const savedMode = store.get(MODE_KEY)
if ((MODES as readonly string[]).includes(savedMode ?? '')) mode = savedMode as PlayMode
player.loop = mode === 'one'

const randIndex = () => {
  if (tracks.length < 2) return cur
  let j = cur
  while (j === cur) j = Math.floor(Math.random() * tracks.length)
  return j
}

let audioCtx: AudioContext | undefined
let analyser: AnalyserNode | undefined
let freq: Uint8Array<ArrayBuffer> | undefined
let raf = 0

// 当前页的 UI 绑定组（每次 page-load 刷新；不在首页时为空数组，各处自然 no-op）
interface Bind {
  card: HTMLElement
  line: HTMLElement | null
  lineText: HTMLElement | null
  bars: HTMLElement[]
  progress: HTMLElement | null
  list: HTMLElement | null
  items: HTMLElement[]
  modeBtn: HTMLElement | null
  vol: HTMLElement | null
  volRange: HTMLInputElement | null
  volPct: HTMLElement | null
  volOn: HTMLElement | null
  volOff: HTMLElement | null
  /** 音波 icon 的六根线 + 唱盘：放歌期间由 tick 亲自驱动（global.css 动效军规④） */
  icons: HTMLElement[]
  disc: HTMLElement | null
  /** CD 面上的专辑封面（听歌页有，首页没有 —— null 时整段跳过） */
  cover: HTMLImageElement | null
  /** 以下五项只有听歌页那张大卡有，首页是 null / 空数组，各处自然跳过 */
  title: HTMLElement | null
  artist: HTMLElement | null
  time: HTMLElement | null
  dur: HTMLElement | null
  lyricBox: HTMLElement | null
  lyricRows: HTMLElement[]
  /** 已渲染的歌词身份（曲目 lrc + 行数），换曲才重建 DOM */
  lyricKey: string
  /** 歌词跑马的量测缓存：换句时量一次，tick 每帧只做乘法 */
  textW: number
  boxW: number
  over: number
  /** 跑马当前位移（量化到 0.5px）：没变就不写 DOM */
  shift: number
  /** 这张卡当前可见吗（首页桌面/移动两张卡断点互斥）：display:none 的那张
   *  每帧写 style 只白烧样式重算 —— 绑定与 resize 时量一次，tick 逐帧跳过 */
  visible: boolean
}
let binds: Bind[] = []

/*
 * 逐帧 DOM 写入全部「量化 + 跳写」：等化条 scaleY 量化到 0.01、亮字渐变
 * 量化到 0.5%、跑马位移量化到 0.5px，值没变的帧一个字节都不碰 DOM。
 * 频谱平滑系数 0.75 下大多数条帧间几乎不动，跳写率很高 —— 播放态的
 * 主线程成本（样式重算+重绘）实测靠这个砍掉一大截，视觉完全无感。
 */
let lastScale: number[] = []
let lastSung = -1
let lastIcon: number[] = []
/** 唱盘角度跨页跨暂停存活：暂停停在原角度，换页回来接着转 */
let discAngle = 0
let lastDisc = -1
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const audio = () => player

/** 首次点击播放时才绑定当前曲目的音源，避免首屏触发音频网络请求。 */
const ensureSource = () => {
  const track = tracks[cur]
  if (!track) throw new Error('当前没有可播放的默认曲目')
  if (!player.src) player.src = musicUrl(track.src)
}

/** 首次播放时才建立 Web Audio 链路（需要用户手势，正好在 click 里） */
const ensureGraph = (el: HTMLAudioElement) => {
  if (audioCtx) {
    audioCtx.resume().catch(() => {})
    return
  }
  audioCtx = new AudioContext()
  const source = audioCtx.createMediaElementSource(el)
  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.75
  source.connect(analyser)
  analyser.connect(audioCtx.destination)
  freq = new Uint8Array(analyser.frequencyBinCount)
}

// 歌词按曲缓存；lrcLines 始终是「当前曲」解析好的行，tick 每帧直接查
const lrcCache = new Map<string, Promise<LrcLine[]>>()
let lrcLines: LrcLine[] = []

/**
 * 一句歌词的演唱「份量」（拍数），不是字符数 —— 日文一个汉字常唱两拍
 * （假名才近似一字一拍），英文一串字母只是一两个音节。日英混排的歌
 * （Mr. Broken Heart，用户点名）按纯字符数算：英文钩子句把全曲中位字速
 * 拉低，日文句 est 被低估一半，正常演唱间隙被误判成「间奏」，亮字提前唱满。
 * 加权后同一首歌里各句 gap/份量 落回同一量级，中位拍速才可信。
 * 行内没有假名时汉字按中文一字一拍；纯中文/纯英文歌里权重是整体缩放，
 * est = 份量×中位拍速 的乘积不变，行为与从前一致。
 */
const sungLen = (text: string) => {
  let kana = 0
  let ideo = 0
  let latin = 0
  for (const ch of text) {
    if (/[぀-ヿ]/.test(ch)) kana += 1
    else if (/[㐀-鿿豈-﫿]/.test(ch)) ideo += 1
    else if (/[a-z0-9]/i.test(ch)) latin += 1
    // 标点、空白（含 　 全角空格与  ）不占拍
  }
  return kana + ideo * (kana > 0 ? 2 : 1) + latin * 0.35
}

const loadLrc = (track: Track) => {
  if (!track.lrc) {
    lrcLines = []
    renderLyrics()
    return Promise.resolve([] as LrcLine[])
  }
  if (!lrcCache.has(track.lrc)) {
    const lrcPath = track.lrc
    lrcCache.set(
      lrcPath,
      fetch(musicUrl(lrcPath))
        .then((res) => {
          // 404 = 歌词文件真没有，记成空免得每次切歌都白问一遍；
          // 其它失败（服务重启那几秒 / 断网）抛出去，下面从缓存里摘掉，下次切回来再试
          if (res.status === 404) return ''
          if (!res.ok) throw new Error(`lrc HTTP ${res.status}`)
          return res.text()
        })
        .then((text) => {
          const raw: LrcLine[] = []
          for (const row of text.split('\n')) {
            // 行首可以连着多枚时间戳（压缩 LRC：副歌只写一遍，每次出现各给一枚 ——
            // 网易/QQ 的老歌常见），每枚各成一行；分秒分隔既有 . 也有 :（[00:12:50] 老写法）。
            // 早先只认一枚：第二枚以文本身份混进歌词、副歌第二遍无词
            const stamps: number[] = []
            let rest = row.trim()
            let m: RegExpExecArray | null
            while ((m = /^\[(\d+):(\d+)(?:[.:](\d+))?\]/.exec(rest))) {
              stamps.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0))
              rest = rest.slice(m[0].length)
            }
            const lyric = rest.trim()
            if (lyric) for (const t of stamps) raw.push({ t, text: lyric, end: 0, est: 0 })
          }
          raw.sort((a, b) => a.t - b.t)
          // QQ/网易导出的 lrc 尾部常挂人员表滚屏（Engineered by…/乐手名单），
          // 没有统一格式可认，但节奏出卖了它：行距 <1.4s 连排 ≥3 行，
          // 人声唱不了这么密 —— 把这段密集尾巴整个剪掉
          let k = raw.length - 1
          while (k > 0 && raw.length - k <= 25 && raw[k]!.t - raw[k - 1]!.t < 1.4) k -= 1
          if (raw.length - k >= 3) raw.length = k
          // 首尾散兵：冒号两侧带空格的「key : value」（真歌词几乎不这么写）、
          // 中文制作字段紧贴冒号（监制：Alvin）、/ ℗ © 开头的版权续行
          const lines = raw.filter(
            (l) =>
              !/ [:：] /.test(l.text) &&
              !/^(作词|作曲|编曲|制作人|监制|录音|混音|母带|和声|出品|发行|OP|SP)[:：]/i.test(
                l.text,
              ) &&
              !/^[/℗©]/.test(l.text),
          )
          // 每句的「唱完时刻」end：正常句到下一句开始为止（跟真实演唱最贴）；
          // 间隙明显超出这句该唱的时长（按本曲中位「每拍秒速」估）就认定后面是
          // 间奏/尾奏，亮字只跑演唱段 —— 否则最后一句会把整段尾奏都当成还在唱，
          // 渐变慢速爬完全曲、跑马也跟着慢吞吞（用户点名的结尾走向不对）
          const rates: number[] = []
          for (let i = 0; i + 1 < lines.length; i += 1) {
            const gap = lines[i + 1]!.t - lines[i]!.t
            if (gap > 0.8 && gap < 8) rates.push(gap / Math.max(1, sungLen(lines[i]!.text)))
          }
          rates.sort((a, b) => a - b)
          const perBeat = rates[Math.floor(rates.length / 2)] ?? 0.42
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i]!
            const est = Math.max(2, sungLen(line.text) * perBeat)
            const gap = i + 1 < lines.length ? lines[i + 1]!.t - line.t : Infinity
            line.end = line.t + (gap <= est * 1.8 ? gap : est)
            line.est = est
          }
          return lines
        })
        .catch(() => {
          // 失败结果不能留在缓存里：早先 .catch(() => []) 会把「空」永久缓存，
          // 服务重启那几秒切到某首歌，本次会话内它的歌词区就再也不出字了
          lrcCache.delete(lrcPath)
          return [] as LrcLine[]
        }),
    )
  }
  return lrcCache.get(track.lrc)!.then((lines) => {
    // 异步返回时可能已经切到别的歌了，别把旧歌词塞给新曲。
    // 缓存里存原始时间轴，per-track 的歌词偏移在这里现算（管理端可调）
    if (tracks[cur]!.lrc === track.lrc) {
      const off = Number(track.offset) || 0
      lrcLines = off
        ? lines.map((l) => ({ t: l.t + off, text: l.text, end: l.end + off, est: l.est }))
        : lines
      renderLyrics()
    }
    return lines
  })
}

/**
 * 整篇歌词（听歌页专属）：行由脚本按当前曲现渲 —— 歌词是运行时 fetch 的，
 * 服务端渲不出来。点句跳转走容器上的一个委托监听（绑定时挂，见 page-load），
 * 行下标 = lrcLines 下标；这里不再给每行各挂一个闭包。
 * 行的样式在 global.css（[data-np-lyricbox] > p），别把类名串写进脚本。
 * 首页没有这个容器，整段是空转。
 */
let lyricIdx = -1
const renderLyrics = () => {
  const track = tracks[cur]
  if (!track) return
  const key = `${track.lrc ?? ''}:${lrcLines.length}`
  let rebuilt = false
  for (const b of binds) {
    if (!b.lyricBox) continue
    if (b.lyricKey === key && b.lyricRows.length === lrcLines.length) continue
    rebuilt = true
    b.lyricKey = key
    b.lyricRows = []
    b.lyricBox.textContent = ''
    if (lrcLines.length === 0) {
      // 纯音乐直接说明；有词但还没到（首次 fetch 途中）就留白，别闪一句错话
      if (!track.lrc && b.lyricBox.dataset.empty) {
        const note = document.createElement('p')
        note.dataset.lyricEmpty = ''
        note.textContent = b.lyricBox.dataset.empty
        b.lyricBox.append(note)
      }
      continue
    }
    for (const line of lrcLines) {
      const row = document.createElement('p')
      row.textContent = line.text
      b.lyricBox.append(row)
      b.lyricRows.push(row)
    }
  }
  // 有卡重建了行（换曲）：高亮游标归零，没重建的卡上旧高亮也一并摘掉，
  // 让「lyricIdx 指的行 = 唯一带 data-current 的行」这条不变量成立（markLyricRow 只改两行）。
  // 谁都没重建（同曲的歌词二次到达）就什么都不动 —— 暂停中的高亮别被清掉
  if (rebuilt) {
    for (const b of binds) b.lyricRows[lyricIdx]?.removeAttribute('data-current')
    lyricIdx = -1
  }
}

/** 当前句高亮 + 滚到容器正中（只动容器的 scrollTop，绝不惊动页面滚动）。
 *  只碰上一句和这一句两行：原先每换一句对全部行 toggleAttribute，两张卡 × 百来行就是
 *  几百次属性写，每句一回 */
const markLyricRow = (idx: number) => {
  if (idx === lyricIdx) return
  const prev = lyricIdx
  lyricIdx = idx
  for (const b of binds) {
    if (b.lyricRows.length === 0) continue
    b.lyricRows[prev]?.removeAttribute('data-current')
    const row = b.lyricRows[idx]
    if (!row) continue
    row.setAttribute('data-current', '')
    if (b.lyricBox)
      b.lyricBox.scrollTo({
        top: row.offsetTop - b.lyricBox.clientHeight / 2 + row.offsetHeight / 2,
        behavior: 'smooth',
      })
  }
}

/**
 * 歌词淡切：先淡出，换字后淡入。
 * karaoke=true 时给内层文本挂「唱到哪亮到哪」的渐变（见 global.css），
 * 每换一句从 0% 重新涨；显示曲名时摘掉渐变回普通墨色。
 * 换字后顺手量一次溢出：长句才挂 data-scroll（截断改 clip + 两端羽化），
 * 跑马位移由 tick 按句内进度推，这里只备好 textW/boxW/over。
 */
let shownText = ''
const swapLine = (text: string, karaoke = false) => {
  if (binds.length === 0 || shownText === text) return
  shownText = text
  for (const b of binds) if (b.line) b.line.style.opacity = '0'
  setTimeout(() => {
    lastSung = 0
    for (const b of binds) {
      if (!b.line || !b.lineText) continue
      b.lineText.textContent = text
      b.lineText.style.setProperty('--sung', '0%')
      b.lineText.style.transform = ''
      b.shift = 0
      b.lineText.toggleAttribute('data-karaoke', karaoke)
      b.textW = b.lineText.offsetWidth
      b.boxW = b.line.clientWidth
      b.over = karaoke ? Math.max(0, b.textW - b.boxW) : 0
      b.line.toggleAttribute('data-scroll', b.over > 0)
      b.line.style.opacity = '1'
    }
  }, 150)
}

/**
 * 歌词同步：定位当前句 → 淡切句子 → 句内线性插值推进 --sung 与跑马位移。
 * 学 APlayer 的双入口：播放中由 tick（rAF）每帧驱动；seeked 事件兜底 ——
 * 暂停状态下拖进度条也立刻换句，不用等恢复播放。
 * 切句提前 0.15s = 淡出时长，新句淡入的起点正好踩在时间戳上；
 * --sung 渐变仍按真实时间推，亮字不抢拍。
 */
const syncLyric = (now: number) => {
  if (binds.length === 0 || lrcLines.length === 0) return
  const ahead = now + 0.15
  let idx = -1
  for (let i = 0; i < lrcLines.length; i += 1) {
    if (lrcLines[i]!.t <= ahead) idx = i
    else break
  }
  if (idx < 0) {
    // 还没到第一句（前奏 / 拖回了开头）：回显曲名
    swapLine(trackLabel(tracks[cur]!))
    markLyricRow(-1)
    return
  }
  const curLine = lrcLines[idx]!
  // 整篇歌词那边高亮跟到底：尾奏里也停在最后一句上，不跟着单行回显曲名
  markLyricRow(idx)
  // 尾奏：最后一句唱完（亮满）停留 4s 后回显曲名 —— 与前奏对称，
  // 明确告诉人「后面是伴奏，不是还在唱」；拖回句内会自然重新显示歌词
  if (idx === lrcLines.length - 1 && now > curLine.end + 4) {
    swapLine(trackLabel(tracks[cur]!))
    return
  }
  swapLine(curLine.text, true)
  // 只有正在展示这句时才推进度（淡切的 150ms 里 shownText 已是新句）
  if (shownText !== curLine.text) return
  // 亮字与跑马只跑 t→end 的演唱段；间奏/尾奏里句子保持亮满，不再慢速爬。
  // 普通 LRC 没有逐字时间，句内推进不能整句均摊 —— 结尾拖长音会把每个字
  // 都拉慢，亮字落后人声半句。拖音几乎都在句尾：超出正常语速（est）的
  // 时长全记给最后一个字，前 n-1 字按本曲字速亮，尾字慢慢填满拖音段
  const dur = Math.max(0.5, curLine.end - curLine.t)
  const n = Math.max(1, curLine.text.length)
  const elapsed = now - curLine.t
  let pct
  if (n === 1 || dur <= curLine.est) pct = elapsed / dur
  else {
    const bodyT = curLine.est * ((n - 1) / n)
    pct =
      elapsed <= bodyT
        ? elapsed / curLine.est
        : (n - 1) / n + ((elapsed - bodyT) / (dur - bodyT)) * (1 / n)
  }
  pct = Math.min(1, Math.max(0, pct))
  const sung = Math.round(pct * 200) / 2 // 量化到 0.5%（分界线约 0.7px 一步，肉眼无感）
  const sungChanged = sung !== lastSung
  if (sungChanged) lastSung = sung
  for (const b of binds) {
    if (!b.visible || !b.lineText) continue
    if (sungChanged) b.lineText.style.setProperty('--sung', `${sung}%`)
    // 长句跑马：亮字过了卡宽 42% 就开始左移，唱完时句尾刚好贴右缘
    if (b.over > 0) {
      const shift =
        Math.round(Math.min(b.over, Math.max(0, pct * b.textW - b.boxW * 0.42)) * 2) / 2
      if (shift !== b.shift) {
        b.shift = shift
        b.lineText.style.transform = `translateX(${-shift}px)`
      }
    }
  }
}

/** 播放循环：每帧 ① 等化条映射低中频段 ② 歌词同步。
 * DOM 写入封在 ~33fps：2026-08-29 掉帧复盘的主结论 —— 成本大头不是哪个
 * 元素的重绘，而是「这一帧只要有任意一个样式写入，整条 样式重算→Paint→
 * Layerize→Commit 管线就要全量遍历一次」，页面越大每次越贵。写入帧减半、
 * 间隔帧完全零失效（管线短路），播放态主线程直接砍半；频谱平滑 0.75 本就
 * 迟滞、盘转纹理旋转近似不变，30fps 写入肉眼无感 */
let lastTickAt = 0
const tick = (now: number) => {
  const el = audio()
  // 页面上没有播放卡（文章页边听边读）就把循环停掉：没有可驱动的 UI 还
  // 每帧产主帧，橙点这些 CSS 动画会被逐帧重录（军规④）。回到有卡的页面时
  // astro:page-load 的 setLive 会重启循环
  if (el.paused || binds.length === 0) return
  if (now - lastTickAt < 30) {
    raf = requestAnimationFrame(tick)
    return
  }
  // dt 给唱盘积角度用：首帧（lastTickAt=0，开播/恢复时归零）不积 —— 暂停多久
  // 回来都接着原角度转，不会「补转」
  const dt = lastTickAt ? now - lastTickAt : 0
  lastTickAt = now
  // 主题圆形揭示进行中：暂停逐帧 DOM 写入（条形/歌词），
  // 否则揭示的实时快照每帧都要整层重栅格化。循环保持心跳，揭示完自动恢复
  if (document.documentElement.classList.contains('theme-vt')) {
    raf = requestAnimationFrame(tick)
    return
  }
  if (analyser && freq) {
    analyser.getByteFrequencyData(freq)
    const usable = Math.floor(freq.length * 0.7) // 高频段基本是空的，砍掉
    // 每根条的电平先算一遍，再广播给各张卡（两张卡条数相同）
    const count = binds[0]?.bars.length ?? 0
    for (let i = 0; i < count; i += 1) {
      const start = Math.floor((i / count) * usable)
      const end = Math.max(start + 1, Math.floor(((i + 1) / count) * usable))
      let sum = 0
      for (let j = start; j < end; j += 1) sum += freq[j]!
      const level = sum / (end - start) / 255
      const scale = Math.round((0.25 + level * 0.95) * 100) / 100 // 20px 条上一步 0.2px
      if (lastScale[i] === scale) continue
      lastScale[i] = scale
      const transform = `scaleY(${scale})`
      for (const b of binds) if (b.visible && b.bars[i]) b.bars[i]!.style.transform = transform
    }
  }

  // 音波线与唱盘（放歌期间从 CSS 动画交接到这里，见 global.css 动效军规④）：
  // 复刻原节奏 —— 线 1.15s 一循环、第 2n 根提前 0.4s、第 3n 根再压成 0.75s
  // （与 CSS 里 3n 规则写在 2n 之后的层叠一致）、余弦近似 ease-in-out；
  // 盘 9s 一圈。减少动态偏好下与被替换的 CSS 规则一样保持静止
  if (!reducedMotion.matches) {
    const iconCount = binds[0]?.icons.length ?? 0
    for (let i = 0; i < iconCount; i += 1) {
      const nth = i + 1
      const ahead = nth % 3 === 0 ? 0.75 : nth % 2 === 0 ? 0.4 : 0
      const p = ((now / 1000 + ahead) / 1.15) % 1
      const s = Math.round((0.75 - 0.25 * Math.cos(2 * Math.PI * p)) * 100) / 100
      if (lastIcon[i] === s) continue
      lastIcon[i] = s
      const transform = `scaleY(${s})`
      for (const b of binds) if (b.visible && b.icons[i]) b.icons[i]!.style.transform = transform
    }
    discAngle = (discAngle + dt * 0.12) % 360 // 360° / 3s —— CD 的转速观感（黑胶时代是 9s）
    const deg = Math.round(discAngle * 2) / 2
    if (deg !== lastDisc) {
      lastDisc = deg
      for (const b of binds) if (b.visible && b.disc) b.disc.style.transform = `rotate(${deg}deg)`
    }
  }

  syncLyric(el.currentTime)
  raf = requestAnimationFrame(tick)
}

const setLive = (on: boolean) => {
  for (const b of binds) {
    // 首页卡整卡就是播放按钮，用 aria-pressed 报状态；听歌页那张是普通区块
    // （播放钮另有其人），给它挂 aria-pressed 属于无效 ARIA —— 那边的 CSS
    // 门闩改用 data-playing，两处各取所需
    if (b.card.getAttribute('role') === 'button') b.card.setAttribute('aria-pressed', String(on))
    b.card.toggleAttribute('data-playing', on)
    b.card.querySelector('[data-eq]')?.toggleAttribute('data-live', on)
  }
  // 橙点呼吸这类玻璃卡里的 CSS 循环动画在产帧期间会被逐帧重录（军规④），
  // 放歌时挂 np-live 让它们静息，停歌自动复原。没有播放卡的页面 tick 不跑、
  // 不产主帧，合成器动画本来就免费 —— 那里让橙点照常呼吸
  document.documentElement.classList.toggle('np-live', on && binds.length > 0)
  cancelAnimationFrame(raf)
  lastScale = [] // 缓存作废：暂停清了内联值 / 重新开播首帧要全量写一遍
  lastIcon = []
  if (on) {
    lastTickAt = 0 // 暂停期间不给唱盘积角度
    raf = requestAnimationFrame(tick)
  } else {
    for (const b of binds) {
      for (const bar of b.bars) bar.style.transform = ''
      // 音波线交还 CSS 假律动；唱盘的内联角度特意留着 —— 暂停停在原处
      for (const line of b.icons) line.style.transform = ''
    }
    swapLine(trackLabel(tracks[cur]!))
  }
}

/** 播放列表里当前曲目的高亮，广播给每张卡 */
const markCurrent = () => {
  for (const b of binds)
    b.items.forEach((item, i) => item.toggleAttribute('data-current', i === cur))
}

/** 关掉所有卡的弹层（播放列表 + 音量；外点 / Esc / 互斥切换用） */
const closePanels = () => {
  for (const b of binds) {
    if (b.list) b.list.hidden = true
    if (b.vol) b.vol.hidden = true
    b.card.style.zIndex = ''
  }
}

/** 音量 UI 全量广播：滑杆位置与自绘轨道填充（--v）、百分比、静音图标 */
const updateVolUI = () => {
  const v = Math.round(player.volume * 100)
  for (const b of binds) {
    if (b.volRange) {
      b.volRange.value = String(v)
      b.volRange.style.setProperty('--v', `${v}%`)
    }
    if (b.volPct) b.volPct.textContent = `${v}%`
    b.volOn?.classList.toggle('hidden', v === 0)
    b.volOff?.classList.toggle('hidden', v !== 0)
  }
}

/** 播放模式 UI 广播：图标三选一 + 无障碍文案 */
const updateModeUI = () => {
  for (const b of binds) {
    if (!b.modeBtn) continue
    const label = fill(text('npTMode'), { mode: modeLabel(mode) })
    b.modeBtn.title = label
    b.modeBtn.setAttribute('aria-label', label)
    b.modeBtn.querySelector('[data-np-mode-order]')?.classList.toggle('hidden', mode !== 'order')
    b.modeBtn
      .querySelector('[data-np-mode-shuffle]')
      ?.classList.toggle('hidden', mode !== 'shuffle')
    b.modeBtn.querySelector('[data-np-mode-one]')?.classList.toggle('hidden', mode !== 'one')
  }
}

/** 听歌页的常驻曲名行（歌词行在别处，换句会变，曲名不能跟着变）+ CD 面的专辑封面 */
const updateTrackUI = () => {
  const track = tracks[cur]
  if (!track) return
  for (const b of binds) {
    if (b.title) b.title.textContent = track.title
    if (b.artist) b.artist.textContent = track.artist ?? ''
    if (b.cover) {
      // 没配上封面的歌藏起来露出纯盘面；换曲时先藏再换 src —— 否则新图解码前
      // 会露出上一首的封面在新歌上转
      const url = track.cover ? musicUrl(track.cover) : ''
      if (!url) {
        b.cover.hidden = true
        b.cover.removeAttribute('src')
      } else if (b.cover.getAttribute('src') !== url) {
        b.cover.hidden = true
        b.cover.src = url
        // decode() 等图真正可画再露脸（缓存命中时同一帧就好，不会闪）
        b.cover
          .decode?.()
          .then(() => {
            if (tracks[cur]?.cover && musicUrl(tracks[cur]!.cover!) === url) b.cover!.hidden = false
          })
          .catch(() => {
            b.cover!.hidden = false // 不支持 decode / 解码失败也照常显示
          })
      } else {
        b.cover.hidden = false
      }
    }
  }
}

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** 时间读数：preload='none' 时元数据要等开播才有，没有就先摆 --:--。
 *  timeupdate 一秒来四次而文本一秒才变一次 —— textContent 重复赋同值也会
 *  换掉文本节点、触发整卡布局重绘，跳写（换页重绑时 lastTime 清空强制全写） */
let lastTime = ''
let lastDur = ''
const updateTimeUI = () => {
  const at = fmtTime(player.currentTime)
  const known = Number.isFinite(player.duration) && player.duration > 0
  const total = known ? fmtTime(player.duration) : '--:--'
  if (at === lastTime && total === lastDur) return
  lastTime = at
  lastDur = total
  for (const b of binds) {
    if (b.time) b.time.textContent = at
    if (b.dur) b.dur.textContent = total
  }
}

/** 切到第 i 首（取模循环）。autoplay 用于自动接歌与「上/下一首」「列表点歌」 */
const setTrack = (i: number, autoplay: boolean) => {
  cur = ((i % tracks.length) + tracks.length) % tracks.length
  const track = tracks[cur]!
  lrcLines = []
  shownText = ''
  lastProgress = -1 // 上一曲的进度别挡住新曲的首次写入
  player.src = musicUrl(track.src)
  for (const b of binds) {
    if (b.progress) b.progress.style.transform = 'scaleX(0)'
    b.card.setAttribute('aria-label', fill(text('npTPlay'), { title: trackLabel(track) }))
  }
  markCurrent()
  updateTrackUI()
  updateTimeUI()
  renderLyrics()
  // 有词的曲先亮曲名等第一句；纯音乐整曲就这一行 —— 直接说清楚，别挂一整首歌的标题
  swapLine(track.lrc ? trackLabel(track) : text('npTInstrumental'))
  loadLrc(track)
  if (autoplay) player.play().catch(() => setLive(false))
}

const toggle = () => {
  const el = audio()
  if (el.paused) {
    ensureSource()
    ensureGraph(el)
    el.play().catch(() => setLive(false))
  } else {
    el.pause()
  }
}

document.addEventListener('astro:page-load', () => {
  binds = [...document.querySelectorAll<HTMLElement>('[data-np]')].map((card) => ({
    card,
    line: card.querySelector<HTMLElement>('[data-np-line]'),
    lineText: card.querySelector<HTMLElement>('[data-np-text]'),
    bars: [...card.querySelectorAll<HTMLElement>('[data-eq] > span')],
    progress: card.querySelector<HTMLElement>('[data-np-progress]'),
    list: card.querySelector<HTMLElement>('[data-np-list]'),
    items: [...card.querySelectorAll<HTMLElement>('[data-np-item]')],
    icons: [...card.querySelectorAll<HTMLElement>('[data-np-icon] > span')],
    disc: card.querySelector<HTMLElement>('[data-np-disc]'),
    cover: card.querySelector<HTMLImageElement>('[data-np-cover]'),
    modeBtn: card.querySelector<HTMLElement>('[data-np-mode]'),
    vol: card.querySelector<HTMLElement>('[data-np-vol]'),
    volRange: card.querySelector<HTMLInputElement>('[data-np-vol-range]'),
    volPct: card.querySelector<HTMLElement>('[data-np-vol-pct]'),
    volOn: card.querySelector<HTMLElement>('[data-np-vol-on]'),
    volOff: card.querySelector<HTMLElement>('[data-np-vol-off]'),
    title: card.querySelector<HTMLElement>('[data-np-title]'),
    artist: card.querySelector<HTMLElement>('[data-np-artist]'),
    time: card.querySelector<HTMLElement>('[data-np-time]'),
    dur: card.querySelector<HTMLElement>('[data-np-dur]'),
    lyricBox: card.querySelector<HTMLElement>('[data-np-lyricbox]'),
    lyricRows: [],
    lyricKey: '',
    textW: 0,
    boxW: 0,
    over: 0,
    shift: 0,
    visible: card.checkVisibility ? card.checkVisibility() : true,
  }))
  shownText = ''
  lastTime = '' // 新页的读数是服务端渲的初始值，跳写缓存必须作废
  lastDur = ''
  lastProgress = -1

  if (binds.length === 0) return

  // 回到首页时同步一次正在播放的状态、当前曲名、列表高亮与音量/模式 UI
  setLive(!player.paused)
  markCurrent()
  updateVolUI()
  updateModeUI()
  updateTrackUI()
  updateTimeUI()
  renderLyrics()
  // 有整篇歌词区（听歌页）就先把当前曲的 .lrc 取来铺上，不然一进来是一片空的，
  // 要等按下播放才出字。首页只有单行唱歌态，不播就不发这个请求
  if (!player.paused || binds.some((b) => b.lyricBox)) loadLrc(tracks[cur]!)
  if (!player.paused) swapLine(trackLabel(tracks[cur]!))

  for (const b of binds) {
    const { card } = b
    // 听歌页整卡不切播放（页面那么大，点歌词点搜索框都会误触）—— 那边给
    // data-np-no-toggle，改由显式的大播放钮负责；首页没这个属性，行为不变
    if (!card.hasAttribute('data-np-no-toggle')) {
      card.addEventListener('click', toggle)
      card.addEventListener('keydown', (e) => {
        // 只认卡本身的回车/空格 —— 里面按钮的按键事件冒泡上来不该顺手切播放
        if (e.target !== card) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      })
    }

    card.querySelector<HTMLElement>('[data-np-play]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggle()
    })

    // 整篇歌词点句跳转（委托到容器，行由 renderLyrics 按曲重建）。
    // 必须先 ensureSource：直达听歌页时 preload='none' 还没给 <audio> 挂 src，
    // 只设 currentTime 再 play() 会以 NotSupportedError 被拒 —— 早先没这一步，
    // 「整篇歌词铺好了、点哪句都没反应」就是它。HAVE_NOTHING 下赋的 currentTime
    // 会记成默认起播位置，随后 play() 正好从那句开始
    b.lyricBox?.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('p')
      const idx = row ? b.lyricRows.indexOf(row) : -1
      const line = lrcLines[idx]
      if (!line) return
      ensureSource()
      ensureGraph(player)
      player.currentTime = Math.max(0, line.t)
      if (player.paused) player.play().catch(() => setLive(false))
    })

    card.querySelector<HTMLElement>('[data-np-prev]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      ensureGraph(player)
      // 上一首固定走列表序 —— 随机模式下也能确定地「回头」，不再抽签
      setTrack(cur - 1, true)
    })

    card.querySelector<HTMLElement>('[data-np-next]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      ensureGraph(player)
      setTrack(mode === 'shuffle' ? randIndex() : cur + 1, true)
    })

    b.modeBtn?.addEventListener('click', (e) => {
      e.stopPropagation()
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]!
      store.set(MODE_KEY, mode)
      player.loop = mode === 'one'
      updateModeUI()
    })

    // 播放列表：开在卡下方；打开时给卡提 z-index（backdrop-filter 让每张卡
    // 都是独立层叠上下文，不提的话弹层会被后面的卡压住）。与音量弹层互斥
    card.querySelector<HTMLElement>('[data-np-toggle-list]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!b.list) return
      const opening = b.list.hidden
      closePanels()
      if (opening) {
        b.list.hidden = false
        card.style.zIndex = '40'
        // 把当前曲滚进弹层可视区 —— 只动弹层自己的 scrollTop。scrollIntoView 会
        // 连祖先一起滚：卡在视口下缘时点开列表，整个页面会往下跳一段
        const item = b.items[cur]
        if (item) {
          const lr = b.list.getBoundingClientRect()
          const ir = item.getBoundingClientRect()
          if (ir.top < lr.top) b.list.scrollTop += ir.top - lr.top
          else if (ir.bottom > lr.bottom) b.list.scrollTop += ir.bottom - lr.bottom
        }
      }
    })

    card.querySelector<HTMLElement>('[data-np-vol-btn]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!b.vol) return
      const opening = b.vol.hidden
      closePanels()
      if (opening) {
        b.vol.hidden = false
        card.style.zIndex = '40'
      }
    })

    // 弹层自身的点击别冒泡成整卡的播放切换；点行切歌开播并收起面板 ——
    // 选完就开唱，面板继续摊着挡内容反而多一步手动关（用户点名要自动收）
    b.list?.addEventListener('click', (e) => e.stopPropagation())
    for (const item of b.items)
      item.addEventListener('click', () => {
        ensureGraph(player)
        setTrack(Number(item.dataset.npItem), true)
        closePanels()
      })

    b.vol?.addEventListener('click', (e) => e.stopPropagation())
    b.volRange?.addEventListener('input', () => {
      player.volume = Number(b.volRange!.value) / 100
      store.set(VOLUME_KEY, String(player.volume))
      updateVolUI()
    })

    // 进度条：点击与拖动都走 pointer 事件；阻止冒泡以免触发整卡的播放切换
    const seek = card.querySelector<HTMLElement>('[data-np-seek]')
    if (seek) {
      const seekTo = (clientX: number) => {
        const a = audio()
        if (!Number.isFinite(a.duration) || a.duration <= 0) return
        const rect = seek.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        a.currentTime = ratio * a.duration
      }
      seek.addEventListener('click', (e) => e.stopPropagation())
      seek.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        try {
          seek.setPointerCapture(e.pointerId)
        } catch {
          // 合成事件（测试）没有真实 pointerId，捕获不了也不影响点击跳转
        }
        seekTo(e.clientX)
        const move = (ev: PointerEvent) => seekTo(ev.clientX)
        // 收尾要同时挂在 pointerup / pointercancel / lostpointercapture 上：触屏上手势
        // 一旦被判成滚动，浏览器只发 pointercancel 并释放捕获，pointerup 永远不来 ——
        // 只解 up 的话 move 会留在元素上，拖几次就叠几份，每次真拖都触发 N 次 seekTo
        //（[data-np-seek] 的 touch-action:none 在 global.css，让手势一开始就归进度条）
        const up = () => {
          seek.removeEventListener('pointermove', move)
          seek.removeEventListener('pointerup', up)
          seek.removeEventListener('pointercancel', up)
          seek.removeEventListener('lostpointercapture', up)
        }
        seek.addEventListener('pointermove', move)
        seek.addEventListener('pointerup', up)
        seek.addEventListener('pointercancel', up)
        seek.addEventListener('lostpointercapture', up)
      })
    }
  }
})

// 音频实体是模块级常驻对象，事件只在模块层挂一次
player.addEventListener('play', () => {
  // 来电 / Siri 打断后 iOS 会把 AudioContext 挂起：<audio> 自己恢复了，声音却全过
  // 一个 suspended 的 context —— 自动接歌那条路不经过 ensureGraph，在这里统一唤醒
  audioCtx?.resume().catch(() => {})
  setLive(true)
  loadLrc(tracks[cur]!)
})
// 自然播完时规范规定先 fire pause 再 fire ended：这一拍里 ended 已经是 true。
// 此时别 setLive(false) —— 接歌马上 play 又 setLive(true)，中间那一帧等化条会闪回
// 定格假谱、唱针抬起又落下（[data-np-arm] 靠 data-playing 做一次性过渡）
player.addEventListener('pause', () => {
  if (player.ended) return
  setLive(false)
})
// 放完接歌按模式分流：随机抽签 / 顺序接下一首（到底回头）；
// 单曲循环由原生 loop 兜住，根本不触发 ended
player.addEventListener('ended', () => setTrack(mode === 'shuffle' ? randIndex() : cur + 1, true))
// 歌词句切换和渐变推进都在 tick（rAF）里做；timeupdate 只管进度条 ——
// 它在暂停状态下拖进度时也会触发，进度不会失同步。
// 进度用 transform: scaleX 而不是 width：width 变化要布局+整卡重绘，
// scaleX 在 will-change 层上只走属性树更新（ReadingProgress 同款修复）。
// 量化到 0.1%（几百 px 的条上一步 ~0.4px），同值跳写
let lastProgress = -1
player.addEventListener('timeupdate', () => {
  updateTimeUI()
  if (!Number.isFinite(player.duration) || player.duration <= 0) return
  const ratio = Math.round((player.currentTime / player.duration) * 1000) / 1000
  if (ratio === lastProgress) return
  lastProgress = ratio
  // display:none 的那张卡（断点互斥）跳过，与 tick 同规矩；切回可见时下一次 timeupdate
  //（每秒 4 次）就补上
  for (const b of binds) if (b.visible && b.progress) b.progress.style.transform = `scaleX(${ratio})`
})
// preload='none' 下总时长要等真正加载才知道 —— 拿到就补上读数
player.addEventListener('loadedmetadata', updateTimeUI)
player.addEventListener('durationchange', updateTimeUI)

// 拖进度条（含暂停状态）立即重定位歌词 —— 播放中由 tick 驱动，这里兜暂停的底
player.addEventListener('seeked', () => syncLyric(player.currentTime))

// 点卡外任意处 / Esc 收起弹层（模块级挂一次，binds 是活引用）
document.addEventListener('click', (e) => {
  for (const b of binds) {
    const open = (b.list && !b.list.hidden) || (b.vol && !b.vol.hidden)
    if (open && !b.card.contains(e.target as Node)) {
      if (b.list) b.list.hidden = true
      if (b.vol) b.vol.hidden = true
      b.card.style.zIndex = ''
    }
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanels()
})

// 窗口宽度变了重量跑马溢出（防抖 150ms），不溢出的把位移清干净；
// 桌面/移动两张卡断点互斥，顺手重量谁可见（tick 的逐帧写入按它跳过）
let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    for (const b of binds) {
      const wasVisible = b.visible
      b.visible = b.card.checkVisibility ? b.card.checkVisibility() : true
      // 刚从隐藏切成可见的卡：进度条在隐藏期间被跳写了，暂停中又没有 timeupdate 来补，这里补一笔
      if (b.visible && !wasVisible && b.progress && lastProgress >= 0)
        b.progress.style.transform = `scaleX(${lastProgress})`
      if (!b.line || !b.lineText) continue
      b.textW = b.lineText.offsetWidth
      b.boxW = b.line.clientWidth
      b.over = b.lineText.hasAttribute('data-karaoke') ? Math.max(0, b.textW - b.boxW) : 0
      if (b.over === 0) {
        b.lineText.style.transform = ''
        b.shift = 0
      }
      b.line.toggleAttribute('data-scroll', b.over > 0)
    }
  }, 150)
})
