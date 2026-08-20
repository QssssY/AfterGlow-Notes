import type { APIRoute, GetStaticPaths } from 'astro'
import { loadPosts } from '~/components/blog/data'
import { site } from '~/config'
import { renderOgImage } from '~/utils/og'

/**
 * 每篇文章一张 OG 图，外加一张站点默认图（slug = "site"）。
 * loadPosts 来自独立模块 —— getStaticPaths 被 Astro 抽出去后取不到本文件的局部函数。
 */
export const getStaticPaths = (async () => {
  const posts = await loadPosts()
  const pad = (n: number) => String(n).padStart(2, '0')

  return [
    {
      params: { slug: 'site' },
      props: { title: site.title, subtitle: site.description, tags: [] as string[] },
    },
    ...posts.map((post) => ({
      params: { slug: post.id },
      props: {
        title: post.title,
        subtitle: `${post.date.getFullYear()} · ${pad(post.date.getMonth() + 1)} · ${pad(post.date.getDate())}　·　${post.category}`,
        tags: [...post.tags],
      },
    })),
  ]
}) satisfies GetStaticPaths

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgImage({
    title: props.title as string,
    subtitle: props.subtitle as string,
    tags: props.tags as string[],
  })

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
