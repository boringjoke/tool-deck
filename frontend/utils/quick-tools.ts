import type { ToolDefinition } from '../types/tool'

export interface QuickToolItem {
  tool: ToolDefinition
  isFavorite: boolean
  isRecent: boolean
}

/** 合并收藏和最近使用工具，去除重复项并保留收藏优先、最近使用补充的顺序。 */
export function mergeQuickTools(
  favoriteTools: readonly ToolDefinition[],
  recentTools: readonly ToolDefinition[],
): QuickToolItem[] {
  const quickTools = new Map<string, QuickToolItem>()

  for (const tool of favoriteTools) {
    const existing = quickTools.get(tool.slug)

    if (existing) {
      existing.isFavorite = true
      continue
    }

    quickTools.set(tool.slug, {
      tool,
      isFavorite: true,
      isRecent: false,
    })
  }

  for (const tool of recentTools) {
    const existing = quickTools.get(tool.slug)

    if (existing) {
      existing.isRecent = true
      continue
    }

    quickTools.set(tool.slug, {
      tool,
      isFavorite: false,
      isRecent: true,
    })
  }

  return [...quickTools.values()]
}
