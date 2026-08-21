/**
 * 点赞的心形爆裂 —— 参考 YYsuni/2025-blog-public 的 like-button：
 * 6 颗小心从中心向随机方向飞出（±30px），scale 0 → 1.2 → 0.8 淡出 0.8s；
 * 主心同时 scale [1, 1.4, 1] + rotate [0, -10°, 10°, 0] 摇一下。
 *
 * 用 WAAPI 就地生成、放完即删，不留 DOM 也不留样式。
 */

const HEART =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

export function likeBurst(button: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const host = button.querySelector<HTMLElement>('[data-like-burst]') ?? button

  for (let i = 0; i < 6; i += 1) {
    const x = Math.random() * 60 - 30
    const y = Math.random() * 60 - 30

    const p = document.createElement('span')
    p.innerHTML = HEART
    p.style.cssText =
      'position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;' +
      'color:var(--like-ink);pointer-events:none;'
    host.appendChild(p)

    p.animate(
      [
        { opacity: 1, transform: 'translate(0,0) scale(0)' },
        { opacity: 1, transform: `translate(${x * 0.7}px,${y * 0.7}px) scale(1.2)`, offset: 0.5 },
        { opacity: 0, transform: `translate(${x}px,${y}px) scale(0.8)` },
      ],
      { duration: 800, easing: 'ease-out' },
    ).finished.finally(() => p.remove())
  }

  const heart = button.querySelector('svg[data-icon="lucide:heart"]')
  heart?.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.4) rotate(-10deg)', offset: 0.3 },
      { transform: 'scale(1.2) rotate(10deg)', offset: 0.6 },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 600, easing: 'ease-out' },
  )
}
