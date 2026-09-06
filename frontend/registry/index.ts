import { TOOL_CATEGORIES } from './categories'
import { TOOL_REGISTRY } from './tools'
import type { ToolCategory, ToolCategorySlug, ToolDefinition } from '~/types/tool'

export { TOOL_CATEGORIES } from './categories'
export { TOOL_REGISTRY } from './tools'

export function isPublicTool(tool: ToolDefinition): boolean {
  return tool.status === 'enabled'
}

export function getPublicTools(
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): readonly ToolDefinition[] {
  return tools.filter(isPublicTool)
}

export function getPublicToolsByCategory(
  category: ToolCategorySlug,
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): readonly ToolDefinition[] {
  return getPublicTools(tools).filter((tool) => tool.category === category)
}

export function findPublicToolBySlug(
  slug: string,
  tools: readonly ToolDefinition[] = TOOL_REGISTRY,
): ToolDefinition | undefined {
  return getPublicTools(tools).find((tool) => tool.slug === slug)
}

export function findCategoryBySlug(slug: string): ToolCategory | undefined {
  return TOOL_CATEGORIES.find((category) => category.slug === slug)
}
