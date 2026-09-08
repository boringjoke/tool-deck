import { describe, expect, it } from 'vitest'
import { normalizeSearchText, searchPublicTools } from '../../utils/tool-search'
import type { ToolDefinition } from '../../types/tool'

/** 创建测试使用的工具定义并应用覆盖字段。 */
function createTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    id: 'test-tool',
    slug: 'test-tool',
    title: '测试工具',
    description: '用于测试搜索逻辑。',
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

describe('normalizeSearchText', () => {
  it('trims, folds whitespace and lowercases latin characters', () => {
    expect(normalizeSearchText('  Unix   TIME  ')).toBe('unix time')
  })
})

describe('searchPublicTools', () => {
  it('returns public tools in registry order for an empty query', () => {
    const tools = [
      createTool({ id: 'first', slug: 'first', title: '第一个工具' }),
      createTool({ id: 'draft', slug: 'draft', title: '草稿工具', status: 'draft' }),
      createTool({ id: 'second', slug: 'second', title: '第二个工具' }),
    ]

    expect(searchPublicTools('', tools).map((tool) => tool.id)).toEqual(['first', 'second'])
  })

  it('ranks exact title, title contains, keyword and description matches in order', () => {
    const tools = [
      createTool({
        id: 'description-match',
        slug: 'description-match',
        title: '日常工具',
        description: '可以处理时间戳和日期。',
      }),
      createTool({
        id: 'keyword-match',
        slug: 'keyword-match',
        title: '开发工具',
        keywords: ['时间戳'],
      }),
      createTool({
        id: 'contains-match',
        slug: 'contains-match',
        title: '时间戳转换',
      }),
      createTool({
        id: 'exact-match',
        slug: 'exact-match',
        title: '时间戳',
      }),
    ]

    expect(searchPublicTools('时间戳', tools).map((tool) => tool.id)).toEqual([
      'exact-match',
      'contains-match',
      'keyword-match',
      'description-match',
    ])
  })

  it('supports aliases and keeps equal-rank results stable', () => {
    const tools = [
      createTool({
        id: 'timestamp',
        slug: 'timestamp',
        title: '时间戳转换',
        keywords: ['Unix', 'epoch'],
      }),
      createTool({
        id: 'first-random',
        slug: 'first-random',
        title: '第一个随机工具',
        keywords: ['random'],
      }),
      createTool({
        id: 'second-random',
        slug: 'second-random',
        title: '第二个随机工具',
        keywords: ['random'],
      }),
    ]

    expect(searchPublicTools('epoch', tools).map((tool) => tool.id)).toEqual(['timestamp'])
    expect(searchPublicTools('random', tools).map((tool) => tool.id)).toEqual([
      'first-random',
      'second-random',
    ])
  })

  it('does not return a draft tool even when it matches exactly', () => {
    const tools = [
      createTool({ id: 'draft', slug: 'draft', title: '密码生成器', status: 'draft' }),
    ]

    expect(searchPublicTools('密码生成器', tools)).toEqual([])
  })
})
