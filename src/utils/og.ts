/**
 * OG 社交分享图 —— 用 satori 在构建时渲染，纯本地零联网。
 * 配色和字体取自 blog.pen，所以分享卡片和站点是同一套视觉。
 *
 * 注意 satori 不支持 WOFF2（只认 TTF/OTF/WOFF），所以这里取 fontsource 的 .woff。
 */

import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import satori from 'satori'
import { site } from '~/config'

const require = createRequire(import.meta.url)

const fontFile = (pkg: string, file: string) =>
  readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file))

const FONTS = [
  {
    name: 'Averia',
    data: fontFile('@fontsource/averia-gruesa-libre', 'averia-gruesa-libre-latin-400-normal.woff'),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Noto',
    data: fontFile('@fontsource/noto-sans-sc', 'noto-sans-sc-chinese-simplified-400-normal.woff'),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Noto',
    data: fontFile('@fontsource/noto-sans-sc', 'noto-sans-sc-chinese-simplified-700-normal.woff'),
    weight: 700 as const,
    style: 'normal' as const,
  },
]

/** 取自 blog.pen 的浅色 token */
const C = {
  cream: '#F7F1E7',
  ink: '#5B423F',
  inkSoft: '#7A6555',
  inkMuted: '#6E5B4C',
  brand: '#D9812B',
  brandInk: '#A85B12',
  leafDeep: '#1F5E4E',
  hairline: '#E5DDD2',
  card: '#FFFFFFCC',
} as const

/** 固定几何的萤火虫散点，复刻 Banner 的氛围 */
const FIREFLIES: [number, number, number, number][] = [
  [92, 96, 6, 0.5],
  [268, 62, 4, 0.7],
  [472, 128, 3, 0.55],
  [706, 78, 5, 0.45],
  [928, 148, 4, 0.6],
  [1064, 88, 3, 0.5],
  [168, 452, 4, 0.5],
  [560, 512, 3, 0.45],
  [1010, 470, 5, 0.5],
  [1132, 372, 4, 0.4],
]

interface OgOptions {
  title: string
  /** 副标题：文章用日期 + 分类，页面用一句说明 */
  subtitle?: string | undefined
  /** 右下角的标签行 */
  tags?: readonly string[]
}

export async function renderOgImage({ title, subtitle, tags = [] }: OgOptions) {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          padding: '72px',
          backgroundColor: C.cream,
          fontFamily: 'Noto',
          position: 'relative',
        },
        children: [
          // 萤火虫（satori 不支持 box-shadow 辉光，用一圈更淡的外环模拟）
          ...FIREFLIES.flatMap(([x, y, size, opacity]) => [
            {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  left: `${x - size * 2}px`,
                  top: `${y - size * 2}px`,
                  width: `${size * 5}px`,
                  height: `${size * 5}px`,
                  borderRadius: '9999px',
                  backgroundColor: C.brand,
                  opacity: opacity * 0.18,
                },
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: '9999px',
                  backgroundColor: C.brand,
                  opacity,
                },
              },
            },
          ]),

          // 站名
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', gap: '14px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      width: '34px',
                      height: '34px',
                      borderRadius: '9999px',
                      backgroundColor: '#D9812B2E',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    children: {
                      type: 'div',
                      props: {
                        style: {
                          width: '12px',
                          height: '12px',
                          borderRadius: '9999px',
                          backgroundColor: C.brand,
                        },
                      },
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '26px', color: C.ink, fontFamily: 'Averia' },
                    children: site.title,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '15px',
                      color: C.leafDeep,
                      fontWeight: 700,
                      letterSpacing: '2.6px',
                      paddingTop: '4px',
                    },
                    children: site.titleEn,
                  },
                },
              ],
            },
          },

          // 标题 + 副标题
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                justifyContent: 'center',
                gap: '24px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      fontSize: title.length > 26 ? '52px' : '64px',
                      lineHeight: 1.32,
                      fontWeight: 700,
                      color: C.ink,
                      maxWidth: '980px',
                    },
                    children: title,
                  },
                },
                ...(subtitle
                  ? [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            fontSize: '26px',
                            lineHeight: 1.6,
                            color: C.inkSoft,
                            maxWidth: '900px',
                          },
                          children: subtitle,
                        },
                      },
                    ]
                  : []),
              ],
            },
          },

          // 底部：分隔线 + 作者 + 标签
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '22px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', height: '1px', backgroundColor: C.hairline },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: '22px', color: C.inkMuted },
                          children: site.author,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '12px' },
                          children: tags.slice(0, 3).map((tag) => ({
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                padding: '8px 18px',
                                borderRadius: '9999px',
                                backgroundColor: C.card,
                                fontSize: '19px',
                                color: C.brandInk,
                                fontWeight: 700,
                              },
                              children: `#${tag}`,
                            },
                          })),
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    { width: 1200, height: 630, fonts: FONTS },
  )

  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}
