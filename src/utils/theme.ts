/**
 * 主题色覆盖 —— 管理台「主题」页写 src/data/theme.json，这里编译成一段
 * 内联 CSS 盖在 global.css 的设计 token 上（色彩配置的思路抄 YYsuni 的
 * 网站设置，落地方式换成我们的 git-as-CMS：文件进仓库、构建期生效）。
 *
 * 选择器故意比 global.css 的 :root / .dark 高一级特异性（html:root），
 * 不依赖样式表插入顺序；theme.json 留空（默认）= 一个字节都不输出。
 * 只放行白名单里的 token 和合法 hex —— 这段会被 set:html 进页面。
 */
import themeData from '~/data/theme.json'

const VARS: Record<string, string> = {
  brand: '--brand',
  brandInk: '--brand-ink',
  fireWarm: '--fire-warm',
  leaf: '--leaf',
  leafDeep: '--leaf-deep',
  cream: '--cream',
  ink: '--ink',
  inkSoft: '--ink-soft',
  // 从主题色自动衍生的两枚（管理台保存时算好写入）
  fireTint: '--fire-tint',
  glowFire: '--glow-fire',
}

const HEX = /^#[0-9a-fA-F]{3,8}$/

function block(selector: string, set: unknown): string {
  if (!set || typeof set !== 'object') return ''
  const lines = Object.entries(set as Record<string, unknown>)
    .filter(([k, v]) => VARS[k] && typeof v === 'string' && HEX.test(v))
    .map(([k, v]) => `${VARS[k]}:${v}`)
  return lines.length > 0 ? `${selector}{${lines.join(';')}}` : ''
}

/** 空覆盖返回 ''，布局层据此决定要不要输出 <style> */
export function themeCss(): string {
  const t = themeData as { light?: unknown; dark?: unknown }
  return block('html:root', t.light) + block('html:root.dark', t.dark)
}
