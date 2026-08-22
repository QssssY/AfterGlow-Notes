/**
 * 站点级图片（博主头像 / 首页画卡大图 / 三张快照）—— 可在管理端替换。
 *
 * 管理端「站点信息」页签的上传按固定名落进 images/site/
 * （avatar / art / snapshot-1..3，扩展名随传随换），这里 glob 按名匹配；
 * 没传过的用仓库自带的默认图兜底 —— 和友链头像、项目配图同一套路子。
 */
import type { ImageMetadata } from 'astro'
import defaultArt from '../../images/bg.png'
import defaultAvatar from '../../images/cat001.jpg'
import snapDusk from '../../images/snapshot-dusk.png'
import snapField from '../../images/snapshot-field.png'
import snapLantern from '../../images/snapshot-lantern.png'

const files = import.meta.glob<ImageMetadata>(
  '../../images/site/*.{png,jpg,jpeg,webp,avif,gif}',
  { eager: true, import: 'default' },
)

const byName = new Map<string, ImageMetadata>()
for (const [path, img] of Object.entries(files)) {
  const base = path.split('/').pop()!.replace(/\.(png|jpe?g|webp|avif|gif)$/i, '')
  byName.set(base, img)
}

/** 博主头像（侧栏 / 图标条 / 首页问候卡 / 关于页共用） */
export const siteAvatar = byName.get('avatar') ?? defaultAvatar

/** 首页画卡大图 */
export const siteArt = byName.get('art') ?? defaultArt

/** 首页三张快照（黄昏 / 田野 / 灯笼是默认图） */
export const siteSnapshots: [ImageMetadata, ImageMetadata, ImageMetadata] = [
  byName.get('snapshot-1') ?? snapDusk,
  byName.get('snapshot-2') ?? snapField,
  byName.get('snapshot-3') ?? snapLantern,
]
