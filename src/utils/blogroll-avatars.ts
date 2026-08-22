/**
 * 友链头像 —— 按域名从 images/blogroll/ 里找图。
 *
 * 之前是每个页面手写六个 import，管理端加新友链就断了头像这条路。
 * 现在改成 glob：文件名（去扩展名）== 域名即命中，友链页和关于页共用；
 * 管理端的「上传头像」把图按域名存进这个目录，dev 下 Vite 会热更新。
 * 没有对应文件时返回 undefined，组件退回首字 / 图标 + 渐变。
 */
import type { ImageMetadata } from 'astro'

const files = import.meta.glob<ImageMetadata>(
  '../../images/blogroll/*.{png,jpg,jpeg,webp,avif,gif}',
  { eager: true, import: 'default' },
)

const byDomain = new Map<string, ImageMetadata>()
for (const [path, img] of Object.entries(files)) {
  const base = path.split('/').pop()!.replace(/\.(png|jpe?g|webp|avif|gif)$/i, '')
  byDomain.set(base, img)
}

export const blogrollAvatar = (domain: string): ImageMetadata | undefined =>
  byDomain.get(domain)
