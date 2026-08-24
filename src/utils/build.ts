/**
 * 构建期元信息 —— 给关于页的 BUILD 面板用。
 *
 * 设计把「框架 Astro 5」「样式 Tailwind 4」「上次构建 08-21 09:14」都写成了
 * 静态文本。版本号写死会和 package.json 对不上（现在实际是 Astro 7），
 * 时间写死则每次构建后都过期。所以这两类值在构建时算出来。
 *
 * 模块顶层的代码在 SSG 下只在构建时跑一次，值会被烘进 HTML。
 */

import pkg from '../../package.json'

/** 把 "^7.2.4" / "~4.3.3" 这类范围前缀削掉，只留主版本号 */
function major(range: string | undefined) {
  if (!range) return ''
  const m = /(\d+)/.exec(range)
  return m ? m[1]! : ''
}

const deps: Record<string, string> = {
  ...(pkg.dependencies as Record<string, string> | undefined),
  ...(pkg.devDependencies as Record<string, string> | undefined),
}

/** 构建时刻 —— 设计的写法是 08-21 09:14 */
function stamp(date: Date) {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

export const buildInfo = {
  framework: `Astro ${major(deps['astro'])}`,
  styling: `Tailwind ${major(deps['tailwindcss'])}`,
  builtAt: stamp(new Date()),
} as const
