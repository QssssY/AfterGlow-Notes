/**
 * 生成站内占位图 —— 萤火虫主题的品牌插画，配色取自 global.css 的设计 token。
 *
 * 产物（提交进 images/，站内当真实资源 import）：
 *   snapshot-dusk / snapshot-field / snapshot-lantern  首页快照带的三格（3:2.05，同设计 120×82）
 *   placeholder-art                                    通用占位（2:1，项目卡 / 主推卡没有截图时用）
 *
 * 想换成真照片：直接覆盖同名文件重新构建即可。
 * 重新生成：node scripts/gen-placeholder-art.mjs
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = (name) => path.join(root, 'images', name)

/** 品牌色（浅色轴） */
const C = {
  cream: '#F7F1E7',
  brand: '#D9812B',
  fireWarm: '#C9741F',
  gold: '#EEC25E',
  leaf: '#2A7A66',
  leafDeep: '#1F5E4E',
  ink: '#5B423F',
}

/** 一只萤火虫：亮核 + 两圈光晕（不用 SVG filter，librsvg 下最稳） */
const firefly = (x, y, r, color = C.brand, alpha = 1) => `
  <circle cx="${x}" cy="${y}" r="${r * 3.2}" fill="${color}" opacity="${0.1 * alpha}"/>
  <circle cx="${x}" cy="${y}" r="${r * 1.9}" fill="${color}" opacity="${0.22 * alpha}"/>
  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${0.92 * alpha}"/>`

const svgs = {
  // 暮色山谷 —— 橙金天色，两重山，一串萤火
  'snapshot-dusk.png': `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="492" viewBox="0 0 720 492">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.gold}" stop-opacity=".55"/>
      <stop offset=".55" stop-color="${C.cream}"/>
      <stop offset="1" stop-color="${C.brand}" stop-opacity=".28"/>
    </linearGradient>
  </defs>
  <rect width="720" height="492" fill="${C.cream}"/>
  <rect width="720" height="492" fill="url(#sky)"/>
  <circle cx="540" cy="150" r="64" fill="${C.gold}" opacity=".5"/>
  <circle cx="540" cy="150" r="40" fill="#FFF6E3" opacity=".85"/>
  <path d="M0 340 Q180 250 360 330 T720 310 V492 H0 Z" fill="${C.ink}" opacity=".14"/>
  <path d="M0 400 Q240 320 480 396 T720 380 V492 H0 Z" fill="${C.ink}" opacity=".24"/>
  ${firefly(120, 300, 5)}${firefly(230, 250, 3.4)}${firefly(330, 296, 4.2)}
  ${firefly(430, 236, 3)}${firefly(620, 270, 4.6)}${firefly(90, 210, 2.6, C.gold)}
</svg>`,

  // 苔原野径 —— 叶绿色调，草丛剪影，几点浮光
  'snapshot-field.png': `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="492" viewBox="0 0 720 492">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.cream}"/>
      <stop offset=".6" stop-color="${C.leaf}" stop-opacity=".2"/>
      <stop offset="1" stop-color="${C.leafDeep}" stop-opacity=".42"/>
    </linearGradient>
  </defs>
  <rect width="720" height="492" fill="${C.cream}"/>
  <rect width="720" height="492" fill="url(#sky)"/>
  <circle cx="180" cy="140" r="90" fill="${C.gold}" opacity=".2"/>
  <path d="M0 380 Q160 330 340 372 T720 356 V492 H0 Z" fill="${C.leafDeep}" opacity=".34"/>
  <path d="M60 492 Q66 400 52 372 M120 492 Q132 420 118 386 M600 492 Q612 410 596 376 M660 492 Q668 428 656 400"
        stroke="${C.leafDeep}" stroke-width="6" fill="none" opacity=".3" stroke-linecap="round"/>
  ${firefly(240, 320, 4.4)}${firefly(400, 280, 3.2)}${firefly(520, 330, 5)}
  ${firefly(640, 250, 3)}${firefly(140, 260, 3.6, C.gold)}
</svg>`,

  // 夜灯 —— 墨色夜空，一盏暖灯，萤火最密
  'snapshot-lantern.png': `
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="492" viewBox="0 0 720 492">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink}" stop-opacity=".82"/>
      <stop offset="1" stop-color="${C.ink}" stop-opacity=".58"/>
    </linearGradient>
    <linearGradient id="post" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink}"/>
      <stop offset="1" stop-color="${C.ink}" stop-opacity=".7"/>
    </linearGradient>
  </defs>
  <rect width="720" height="492" fill="${C.cream}"/>
  <rect width="720" height="492" fill="url(#sky)"/>
  <circle cx="500" cy="176" r="120" fill="${C.brand}" opacity=".16"/>
  <circle cx="500" cy="176" r="66" fill="${C.gold}" opacity=".3"/>
  <rect x="492" y="150" width="16" height="270" rx="8" fill="url(#post)"/>
  <rect x="470" y="118" width="60" height="66" rx="16" fill="${C.gold}" opacity=".92"/>
  <rect x="482" y="130" width="36" height="42" rx="10" fill="#FFF3DC"/>
  <path d="M0 440 Q200 400 420 432 T720 420 V492 H0 Z" fill="#241C18" opacity=".6"/>
  ${firefly(150, 200, 4.2, C.gold)}${firefly(240, 300, 3, C.gold)}${firefly(330, 160, 3.6)}
  ${firefly(620, 300, 4.4)}${firefly(660, 130, 2.6, C.gold)}${firefly(80, 330, 3.2)}
</svg>`,

  // 通用占位 —— 复刻站里 aurora 的柔光语言：几团径向渐变 + 一只居中的萤火虫标记。
  // 出 webp：这张会真的进产物（项目卡兜底图），png 版 205KB、webp 同观感 ~40KB ——
  // 1M 带宽上省下的就是一秒多的加载
  'placeholder-art.webp': `
<svg xmlns="http://www.w3.org/2000/svg" width="1584" height="792" viewBox="0 0 1584 792">
  <defs>
    <radialGradient id="g1"><stop offset="0" stop-color="${C.brand}" stop-opacity=".2"/><stop offset="1" stop-color="${C.brand}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2"><stop offset="0" stop-color="${C.leaf}" stop-opacity=".18"/><stop offset="1" stop-color="${C.leaf}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3"><stop offset="0" stop-color="${C.gold}" stop-opacity=".26"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1584" height="792" fill="${C.cream}"/>
  <ellipse cx="300" cy="140" rx="560" ry="360" fill="url(#g1)"/>
  <ellipse cx="1330" cy="120" rx="520" ry="340" fill="url(#g2)"/>
  <ellipse cx="1000" cy="620" rx="700" ry="420" fill="url(#g3)"/>
  <ellipse cx="180" cy="680" rx="480" ry="320" fill="url(#g1)"/>
  <circle cx="792" cy="380" r="120" fill="${C.brand}" opacity=".07"/>
  <circle cx="792" cy="380" r="64" fill="${C.brand}" opacity=".12"/>
  ${firefly(792, 380, 13)}
  ${firefly(690, 316, 4, C.brand, 0.7)}${firefly(892, 336, 3.2, C.gold, 0.8)}
  ${firefly(722, 458, 3.4, C.gold, 0.7)}${firefly(876, 448, 4.4, C.brand, 0.6)}
</svg>`,
}

for (const [name, svg] of Object.entries(svgs)) {
  const img = sharp(Buffer.from(svg))
  if (name.endsWith('.webp')) await img.webp({ quality: 90 }).toFile(out(name))
  else await img.png({ compressionLevel: 9 }).toFile(out(name))
  console.log('written', name)
}
