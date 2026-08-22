/**
 * 代码块配色 —— 取自 blog.pen「Post 文章详情」的 Code Block。
 * 设计稿只画了 4 种 token 色，这里按语义把 Shiki 的 scope 归到这 4 色上：
 *   keyword  #FFC98B  const / storage / control
 *   value    #9FE0C8  字符串、数字、属性访问
 *   dim      #A2988E  标点、运算符、注释
 *   fg       #F0E6DA  标识符与其余文本
 * 底色两个模式下都是深色（$code-bg），所以只需要一个主题。
 */

const BG = '#2E2724'
const FG = '#F0E6DA'
const KEYWORD = '#FFC98B'
const VALUE = '#9FE0C8'
const DIM = '#A2988E'

export const afterglowCode = {
  name: 'afterglow',
  type: 'dark',
  colors: {
    'editor.background': BG,
    'editor.foreground': FG,
    'editorLineNumber.foreground': DIM,
    'editor.selectionBackground': '#F0E6DA1F',
  },
  tokenColors: [
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.other',
        'variable.language',
        'constant.language',
        'entity.name.tag',
      ],
      settings: { foreground: KEYWORD },
    },
    {
      scope: [
        'string',
        'string.quoted',
        'string.template',
        'constant.numeric',
        'constant.character',
        'support.constant',
        'variable.other.property',
        'meta.object-literal.key',
        'entity.other.attribute-name',
        'support.type.property-name',
      ],
      settings: { foreground: VALUE },
    },
    {
      scope: [
        'punctuation',
        'meta.brace',
        'keyword.operator',
        'comment',
        'comment.line',
        'comment.block',
      ],
      settings: { foreground: DIM },
    },
    {
      scope: ['comment', 'comment.line', 'comment.block'],
      settings: { foreground: DIM, fontStyle: 'italic' },
    },
    {
      scope: ['variable', 'entity.name.function', 'support.function', 'entity.name.type'],
      settings: { foreground: FG },
    },
  ],
}
