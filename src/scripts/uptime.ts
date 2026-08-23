/*
 * 运行天数实时化 —— [data-uptime-days] 的数字在浏览器里按当前时间重算，
 * 挂着过夜跨天也会自动 +1，不依赖重新部署。服务端渲染进 HTML 的数字
 * 只是无 JS 时的兜底；口径与 utils/post.ts 的 daysSince 完全一致：
 * Math.floor((now - since) / 86400000)。since 以 data 属性传构建起点
 * 的绝对时间戳，不 import config（会把整包站点数据带进客户端 bundle）。
 */

const DAY = 86_400_000

function update() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-uptime-days]')) {
    const since = Number(el.dataset.uptimeDays)
    if (!Number.isFinite(since)) continue
    const days = Math.floor((Date.now() - since) / DAY)
    if (days > 0) el.textContent = days.toLocaleString('en-US')
  }
}

update()
// 客户端路由换页后 DOM 是新的，跟着再刷一遍
document.addEventListener('astro:page-load', update)
// 长开页面跨天自增
setInterval(update, 60_000)
