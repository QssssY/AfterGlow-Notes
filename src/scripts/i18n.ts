/**
 * 客户端脚本的取词方式。
 *
 * 不把整本字典打进浏览器（三语加起来几十 KB，为几句提示不值得）：
 * 需要文案的元素在服务端就把模板写进 data-* 属性，脚本读出来填占位符。
 * 好处是永远和页面语种一致 —— 连「换语种忘了同步脚本」这种可能性都不存在。
 *
 *   <span data-empty-text={t('share.empty')}>
 *   <nav data-page-info={t('share.pageInfo')}>   ← 模板带 {total} {current} {pages}
 *
 *   fill(el.dataset.pageInfo, { total, current, pages })
 */

/** 把 {名字} 占位符换成实际值；模板缺失时返回空串，不让 undefined 露到界面上 */
export function fill(
  template: string | undefined | null,
  params: Record<string, string | number> = {},
): string {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  )
}

/** 当前页面的语种标签（BaseLayout 写在 <html lang> 上），供 Intl 用 */
export const pageLocale = () => document.documentElement.lang || 'zh-CN'

/** 按页面语种格式化整数（千分位） */
export const localeNumber = (n: number) => n.toLocaleString(pageLocale())
