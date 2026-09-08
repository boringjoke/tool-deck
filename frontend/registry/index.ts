import { TOOL_CATEGORIES } from './categories'
import { TOOL_REGISTRY } from './tools'
import type { ToolCategory, ToolCategorySlug, ToolDefinition } from '~/types/tool'

export { TOOL_CATEGORIES } from './categories'
export { TOOL_REGISTRY } from './tools'

/** 判断工具是否处于正式公开状态。 */
export function isPublicTool(tool: ToolDefinition): boolean {
  return tool.status === 'enabled'
}

/** 获取所有正式公开的工具。 */
export function getPublicTools(
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): readonly ToolDefinition[] {
  return tools.filter(isPublicTool)
}

/** 获取指定分类下的正式公开工具。 */
export function getPublicToolsByCategory(
  category: ToolCategorySlug,
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): readonly ToolDefinition[] {
  return getPublicTools(tools).filter((tool) => tool.category === category)
}

/** 根据 slug 查找正式公开工具。 */
export function findPublicToolBySlug(
  slug: string,
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): ToolDefinition | undefined {
  return getPublicTools(tools).find((tool) => tool.slug === slug)
}

/** 根据 slug 查找工具分类。 */
export function findCategoryBySlug(slug: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((category) => category.slug === slug)
}
