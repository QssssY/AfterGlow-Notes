/*
 * copyText：统一的复制入口。
 * navigator.clipboard 只在安全上下文（HTTPS / localhost）存在，本站纯 IP
 * HTTP 部署下它是 undefined —— 直接调用必抛。退化路径：隐藏 textarea +
 * document.execCommand('copy')（已废弃但在所有浏览器可用，且不挑上下文）。
 * 返回是否真的复制成功，调用方各自给反馈。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 拒绝授权或超时：落到 execCommand 再试一次
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.readOnly = true
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
