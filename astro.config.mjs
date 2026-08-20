import { unified } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import expressiveCode from 'astro-expressive-code'
import icon from 'astro-icon'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import { fireflyCode } from './src/styles/code-theme.ts'

// 上线前把 site 换成真实域名：sitemap 和 RSS 依赖它生成绝对链接
//
// 字体不走 Astro 的 fonts API：它需要构建时访问 fonts.google.com，
// 该域在本机网络不可达（挂代理后仍然不通）。改用 @fontsource 的 npm 包，
// 在 src/styles/global.css 里 @import —— 构建时零联网，换机器和接 CI 都不会挂。
export default defineConfig({
  site: 'http://localhost:4321',

  // 开发工具栏会浮在页面底部中央，挡住截图核对；需要时改回 true
  devToolbar: { enabled: false },

  integrations: [
    // expressiveCode 必须排在 mdx 之前
    // 设计稿的代码块在浅色和暗色下都是深色底，所以只挂一个主题
    expressiveCode({
      themes: [fireflyCode],
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: '18px',
        borderWidth: '0',
        codeFontFamily: 'var(--font-mono)',
        codeFontSize: '13px',
        codeLineHeight: '22px',
        codePaddingBlock: '22px',
        codePaddingInline: '22px',
        // 走 CSS 变量而不是写死 —— 设计稿的 code-bg 浅色是 #2E2724、暗色是 #0D0B0A，
        // 写死会让暗色模式下的代码块底色不跟着变
        codeBackground: 'var(--code-bg)',
        frames: {
          shadowColor: 'transparent',
        },
      },
    }),
    mdx(),
    sitemap(),
    // 设计稿的图标全部来自 lucide（@iconify-json/lucide）
    icon(),
  ],

  markdown: {
    processor: unified({
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          { behavior: 'append', properties: { className: ['heading-anchor'], ariaHidden: true, tabIndex: -1 } },
        ],
      ],
    }),
  },

  vite: {
    plugins: [tailwindcss()],
  },
})
