import { TOOL_CATEGORIES } from '../registry/categories'
import { TOOL_REGISTRY } from '../registry/tools'
import type { ToolCategory, ToolDefinition } from '../types/tool'

const STATIC_PUBLIC_ROUTE_PATHS = ['/', '/about', '/privacy'] as const

export function getPublicRoutePaths(
  categories: readonly Pick<ToolCategory, 'slug'>[] = TOOL_CATEGORIES,
  tools: readonly Pick<ToolDefinition, 'slug' | 'status'>[] = TOOL_REGISTRY,
): string[] {
  return [
    ...STATIC_PUBLIC_ROUTE_PATHS,
    ...categories.map((category) => `/categories/${category.slug}`),
    ...tools
      .filter((tool) => tool.status === 'enabled')
      .map((tool) => `/tools/${tool.slug}`),
  ]
}
