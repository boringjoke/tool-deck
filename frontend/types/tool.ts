export type ToolStatus = 'draft' | 'enabled' | 'disabled'

export type ToolUiStatus = 'idle' | 'processing' | 'success' | 'error'

export type ToolPlatform = 'web'

export type ToolCategorySlug =
  | 'interactive'
  | 'date-conversion'
  | 'developer-text'
  | 'content-generation'
  | 'knowledge'

export interface ToolCapabilities {
  canvas?: boolean
  audio?: boolean
  file?: boolean
  worker?: boolean
  fullscreen?: boolean
}

export interface ToolDefinition {
  id: string
  slug: string
  title: string
  description: string
  category: ToolCategorySlug
  keywords: readonly string[]
  status: ToolStatus
  requiresNetwork: boolean
  localOnly: boolean
  platforms: readonly ToolPlatform[]
  capabilities: ToolCapabilities
}

export interface ToolCategory {
  slug: ToolCategorySlug
  title: string
  description: string
  order: number
}
