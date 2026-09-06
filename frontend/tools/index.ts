export const TOOL_COMPONENT_LOADERS = {
  'character-count': () => import('./character-count/CharacterCountTool.vue'),
  'url-tool': () => import('./url-tool/UrlTool.vue'),
  timestamp: () => import('./timestamp/TimestampTool.vue'),
  'uuid-generator': () => import('./uuid-generator/UuidGeneratorTool.vue'),
  'password-generator': () => import('./password-generator/PasswordGeneratorTool.vue'),
  'base-converter': () => import('./base-converter/BaseConverterTool.vue'),
  'json-workbench': () => import('./json-workbench/JsonWorkbenchTool.vue'),
} as const

export function getToolComponentLoader(slug: string) {
  return TOOL_COMPONENT_LOADERS[slug as keyof typeof TOOL_COMPONENT_LOADERS]
}
