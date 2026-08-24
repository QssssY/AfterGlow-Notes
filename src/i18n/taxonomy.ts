/**
 * 标签与分类的显示名翻译。
 *
 * 标签的**网址不变**（仍是 /tags/前端，三语共用），只翻显示名 —— 一个标签在三种
 * 语言下是同一个标签，网址是它的身份。改成 ASCII slug 会让已发出去的中文链接失效，
 * 换来的只是地址栏好看一点，不值得。
 *
 * 表里没有的词原样显示：新写文章加了新标签，英文站会先露出中文标签，
 * 而不是空白或报错 —— 补一行就好。技术专名（CSS / Go / Vue）本来就不用翻。
 */

import { defaultLocale, type Locale } from './locales'

type Dict = Partial<Record<string, string>>

const TAGS: Record<Locale, Dict> = {
  zh: {},
  en: {
    字体: 'Typography',
    性能: 'Performance',
    前端: 'Frontend',
    后端: 'Backend',
    架构: 'Architecture',
    建站: 'Site building',
    算法: 'Algorithms',
    源码: 'Source diving',
    动效: 'Motion',
    随笔: 'Notes',
  },
  ja: {
    字体: 'フォント',
    性能: 'パフォーマンス',
    前端: 'フロントエンド',
    后端: 'バックエンド',
    架构: 'アーキテクチャ',
    建站: 'サイト構築',
    算法: 'アルゴリズム',
    源码: 'ソースコード',
    动效: 'モーション',
    随笔: 'エッセイ',
  },
}

const CATEGORIES: Record<Locale, Dict> = {
  zh: {},
  en: {
    前端工程: 'Frontend',
    建站笔记: 'Site building',
    后端工程: 'Backend',
    杂记: 'Miscellany',
    未分类: 'Uncategorized',
  },
  ja: {
    前端工程: 'フロントエンド',
    建站笔记: 'サイト構築ノート',
    后端工程: 'バックエンド',
    杂记: '雑記',
    未分类: '未分類',
  },
}

/** 标签显示名（网址仍用原词） */
export const tagLabel = (tag: string, locale: Locale) =>
  (locale === defaultLocale ? undefined : TAGS[locale][tag]) ?? tag

/** 分类显示名 */
export const categoryLabel = (category: string, locale: Locale) =>
  (locale === defaultLocale ? undefined : CATEGORIES[locale][category]) ?? category
