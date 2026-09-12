import { describe, expect, it } from 'vitest'
import { mergeQuickTools } from '../../utils/quick-tools'
import type { ToolDefinition } from '../../types/tool'

/** 创建测试使用的工具定义并应用覆盖字段。 */
function createTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    id: 'test-tool',
    slug: 'test-tool',
    title: '测试工具',
    description: '用于测试首页快捷工具排序。',
    category: 'developer-text',
    keywords: [],
    status: 'enabled',
    requiresNetwork: false,
    localOnly: true,
    platforms: ['web'],
    capabilities: {},
    ...overrides,
  }
}

describe('mergeQuickTools', () => {
  it('places favorites first and appends recent-only tools', () => {
    const favoriteTools = [
      createTool({ id: 'favorite-one', slug: 'favorite-one', title: '收藏一' }),
      createTool({ id: 'favorite-two', slug: 'favorite-two', title: '收藏二' }),
    ]
    const recentTools = [
      createTool({ id: 'recent-one', slug: 'recent-one', title: '最近一' }),
      createTool({ id: 'favorite-two', slug: 'favorite-two', title: '收藏二' }),
      createTool({ id: 'recent-two', slug: 'recent-two', title: '最近二' }),
    ]

    expect(mergeQuickTools(favoriteTools, recentTools).map((item) => item.tool.slug)).toEqual([
      'favorite-one',
      'favorite-two',
      'recent-one',
      'recent-two',
    ])
  })

  it('marks duplicated tools with both states without mutating inputs', () => {
    const favoriteTool = createTool({ id: 'shared', slug: 'shared', title: '共同工具' })
    const recentTool = createTool({ id: 'shared', slug: 'shared', title: '共同工具' })

    const result = mergeQuickTools([favoriteTool], [recentTool])

    expect(result).toEqual([
      {
        tool: favoriteTool,
        isFavorite: true,
        isRecent: true,
      },
    ])
    expect(favoriteTool).toEqual(createTool({ id: 'shared', slug: 'shared', title: '共同工具' }))
    expect(recentTool).toEqual(createTool({ id: 'shared', slug: 'shared', title: '共同工具' }))
  })

  it('returns an empty list when both sources are empty', () => {
    expect(mergeQuickTools([], [])).toEqual([])
  })
})
