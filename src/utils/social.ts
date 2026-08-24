/**
 * 社交地址 → 展示用的账号名。
 *
 * 存在的理由：账号名曾被写死在两个组件里（侧栏按钮的 title、关于页的联系方式行），
 * 于是 fork 的人在管理台把社交链接改成自己的之后，页面上还挂着原作者的账号 ——
 * 管理台点不到、只能翻代码。改成从 socials.json 的地址现推，那份 JSON 是管理台
 * 「社交链接」页签的写入目标，改完即生效。
 *
 * 只做保守的字符串处理，不认平台、不查网络：
 *   https://github.com/QssssY          → github.com/QssssY
 *   https://space.bilibili.com/5483577 → space.bilibili.com/5483577
 * 认不出来（mailto: 之类）就原样返回，宁可显示得笨一点，也不要显示错。
 */

/** 去掉协议与末尾斜杠的完整展示形（关于页联系方式那行用） */
export function socialDisplay(href: string): string {
  return href
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/+$/, '')
}

/** 末段账号名（侧栏按钮 title 用）；路径为空时退回域名 */
export function handleOf(href: string): string {
  const shown = socialDisplay(href)
  const last = shown.split('/').filter(Boolean).pop()
  return last ?? shown
}
