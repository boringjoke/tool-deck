import type { ToolDefinition } from '../types/tool'

export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

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
