import { glob } from 'astro/loaders'
import { defineCollection } from 'astro:content'
// z 从 astro/zod 直取：astro:content 的再导出已废弃，Astro 7 会移除
import { z } from 'astro/zod'

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      category: z.string().optional(),
      cover: image().optional(),
      draft: z.boolean().default(false),
    }),
})

export const collections = { posts }
