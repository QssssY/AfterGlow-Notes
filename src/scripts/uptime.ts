/*
 * 运行天数实时化 —— [data-uptime-days] 的数字在浏览器里按当前时间重算，
 * 挂着过夜跨天也会自动 +1，不依赖重新部署。服务端渲染进 HTML 的数字
 * 只是无 JS 时的兜底；口径与 utils/post.ts 的 calendarDaysSince 完全一致：
 * 按访客本地时区数「跨过几个午夜」（8/21 → 8/24 = 3），不是满 24 小时才 +1 ——
 * 旧口径起点钉 UTC 零点，北京用户每天早上 8 点数字才动，被用户点名修正。
 * since 以 data 属性传构建起点的绝对时间戳，不 import config（会把整包
 * 站点数据带进客户端 bundle）；带 data-uptime-ordinal 的显示「第 N 天」（差值 +1）。
 */

const DAY = 86_400_000

const mid = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function update() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-uptime-days]')) {
    const since = Number(el.dataset.uptimeDays)
    if (!Number.isFinite(since)) continue
    const days =
      Math.round((mid(Date.now()) - mid(since)) / DAY) + (el.hasAttribute('data-uptime-ordinal') ? 1 : 0)
    if (days > 0) el.textContent = days.toLocaleString('en-US')
  }
}

update()
// 客户端路由换页后 DOM 是新的，跟着再刷一遍
document.addEventListener('astro:page-load', update)
// 长开页面跨天自增
setInterval(update, 60_000)
