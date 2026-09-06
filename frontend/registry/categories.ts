import type { ToolCategory } from '~/types/tool'

export const TOOL_CATEGORIES = [
  {
    slug: 'developer-text',
    title: '开发与文本',
    description: '面向开发和日常文本处理的格式化、解析与生成工具。',
    order: 1,
  },
  {
    slug: 'date-conversion',
    title: '日期与转换',
    description: '处理日期、时间、进制和常用单位之间的转换。',
    order: 2,
  },
  {
    slug: 'content-generation',
    title: '内容生成',
    description: '生成二维码、条形码和颜色相关结果，并方便复制或导出。',
    order: 3,
  },
  {
    slug: 'interactive',
    title: '互动与展示',
    description: '计时、随机决策和适合现场使用的轻量互动工具。',
    order: 4,
  },
] as const satisfies readonly ToolCategory[]
