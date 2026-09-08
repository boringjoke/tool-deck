import type { ToolDefinition } from '../types/tool'

/** 规范化搜索文本以便进行无大小写匹配。 */
export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 计算工具与搜索关键词的匹配优先级。 */
function getMatchRank(tool: ToolDefinition, query: string): number | undefined {
  const title = normalizeSearchText(tool.title)
  const description = normalizeSearchText(tool.description)
  const keywords = tool.keywords.map(normalizeSearchText)

  if (title === query) {
    return 0
  }

  if (title.includes(query)) {
    return 1
  }

  if (keywords.some((keyword) => keyword.includes(query) || query.includes(keyword))) {
    return 2
  }

  if (description.includes(query)) {
    return 3
  }

  return undefined
}

/** 在公开工具集合中执行关键词搜索。 */
export function searchPublicTools(
  query: string,
  tools: readonly ToolDefinition[],
): readonly ToolDefinition[] {
  const normalizedQuery = normalizeSearchText(query)
  const publicTools = tools.filter((tool) => tool.status === 'enabled')

  if (!normalizedQuery) {
    return publicTools
  }

  return publicTools
    .map((tool, index) => ({
      tool,
      index,
      rank: getMatchRank(tool, normalizedQuery),
    }))
    .filter((result): result is { tool: ToolDefinition; index: number; rank: number } => result.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((result) => result.tool)
}
