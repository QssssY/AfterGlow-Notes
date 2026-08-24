import { unified } from '@astrojs/markdown-remark'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import expressiveCode from 'astro-expressive-code'
import icon from 'astro-icon'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import { afterglowCode } from './src/styles/code-theme.ts'

// 上线前把 site 换成真实域名：sitemap 和 RSS 依赖它生成绝对链接
//
// 字体不走 Astro 的 fonts API：它需要构建时访问 fonts.google.com，
// 该域在本机网络不可达（挂代理后仍然不通）。改用 @fontsource 的 npm 包，
// 在 src/styles/global.css 里 @import —— 构建时零联网，换机器和接 CI 都不会挂。
// GitHub 直连模式（无服务器管理台）的仓库自动识别：一键托管平台的构建环境
// 自带仓库信息 —— Vercel 给 VERCEL_GIT_REPO_*，GitHub Actions 给 GITHUB_REPOSITORY，
// 烧进 PUBLIC_GITHUB_REPO 后登录页能预填仓库名；识别不到（如 CF Pages）就手填一次
process.env.PUBLIC_GITHUB_REPO ??=
  process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : (process.env.GITHUB_REPOSITORY ?? '')

export default defineConfig({
  // fork 一键托管（Vercel / CF Pages / GH Pages）时在构建环境变量里设
  // PUBLIC_SITE_URL=https://你的地址 即可，不用改代码；不设回落到本站生产地址
  site: process.env.PUBLIC_SITE_URL ?? 'http://106.12.72.232',

  // 开发工具栏会浮在页面底部中央，挡住截图核对；需要时改回 true
  devToolbar: { enabled: false },

  // 站内链接进入视口就预取整页 HTML：静态页都很小（首页 ~30KB），
  // 换页时 ClientRouter 直接命中缓存，点击 → 渲染几乎零等待。
  // 默认只在 hover 时预取，首跳仍要等一个往返，故改 viewport 策略。
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },

  integrations: [
    // expressiveCode 必须排在 mdx 之前
    // 设计的代码块在浅色和暗色下都是深色底，所以只挂一个主题
    expressiveCode({
      themes: [afterglowCode],
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: '18px',
        borderWidth: '0',
        codeFontFamily: 'var(--font-mono)',
        codeFontSize: '13px',
        codeLineHeight: '22px',
        codePaddingBlock: '22px',
        codePaddingInline: '22px',
        // 走 CSS 变量而不是写死 —— 设计的 code-bg 浅色是 #2E2724、暗色是 #0D0B0A，
        // 写死会让暗色模式下的代码块底色不跟着变
        codeBackground: 'var(--code-bg)',
        frames: {
          shadowColor: 'transparent',
        },
      },
    }),
    mdx(),
    // 管理台不进站点地图（页面本身无密可泄 —— 数据要 token 才拿得到，但也没必要被收录）
    sitemap({ filter: (page) => !page.includes('/overview') }),
    // 设计的图标全部来自 lucide（@iconify-json/lucide）
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
