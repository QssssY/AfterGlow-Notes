/**
 * 项目卡配图 —— 按仓库名从 images/projects/ 里找图。
 *
 * 管理端「项目」页签的「上传配图」按仓库名（小写、只留 a-z0-9-）落文件，
 * 这里 glob 同一规则匹配；没有对应文件时返回 undefined，
 * 组件退回品牌占位图（placeholder-art.webp）。机制同友链头像。
 */
import type { ImageMetadata } from 'astro'

const files = import.meta.glob<ImageMetadata>(
  '../../images/projects/*.{png,jpg,jpeg,webp,avif,gif}',
  { eager: true, import: 'default' },
)

const byName = new Map<string, ImageMetadata>()
for (const [path, img] of Object.entries(files)) {
  const base = path.split('/').pop()!.replace(/\.(png|jpe?g|webp|avif|gif)$/i, '')
  byName.set(base, img)
}

/** repo 传 owner/repo 或裸仓库名都行；按仓库名段小写归一后匹配 */
export const projectThumb = (repo: string): ImageMetadata | undefined =>
  byName.get(
    (repo.split('/').pop() ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  )
