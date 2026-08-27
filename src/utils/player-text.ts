import type { Translate } from '~/i18n'

/**
 * 播放器脚本要用的那几句文案 —— 首页那张 Now Playing 卡和听歌页的播放台共用。
 *
 * 为什么绕这一道：scripts/player.ts 是客户端模块，不能 import i18n/content.ts
 * （那模块 eager 引入三种语言的全部内容 JSON，会把 29KB 站点内容打进浏览器包，
 * 而脚本一个字都用不上，见 config.ts 顶部的说明）。所以换曲时要重算的
 * aria-label、切模式时要报的模式名、纯音乐的提示，都由服务端渲成 data-* 摆在
 * 卡上，脚本用 dataset 取（见 player.ts 的 text()）。
 *
 * 带 {} 的是模板，脚本用 scripts/i18n.ts 的 fill() 填。
 * 键名要与 player.ts 的 text('npTXxx') 一一对应，改名两边一起改。
 */
export function playerScriptText(t: Translate) {
  return {
    'data-np-t-play': t('player.play', { title: '{title}' }),
    'data-np-t-mode': t('player.modeState', { mode: '{mode}' }),
    'data-np-t-order': t('player.modeOrder'),
    'data-np-t-shuffle': t('player.modeShuffle'),
    'data-np-t-one': t('player.modeOne'),
    'data-np-t-instrumental': t('player.instrumental'),
  }
}
