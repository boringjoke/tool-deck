export const TOOL_COMPONENT_LOADERS = {
  timer: () => import('./timer/TimerTool.vue'),
  'coin-flip': () => import('./coin-flip/CoinFlipTool.vue'),
  wheel: () => import('./wheel/WheelTool.vue'),
  dice: () => import('./dice/DiceTool.vue'),
  marquee: () => import('./marquee/MarqueeTool.vue'),
  'character-count': () => import('./character-count/CharacterCountTool.vue'),
  'url-tool': () => import('./url-tool/UrlTool.vue'),
  timestamp: () => import('./timestamp/TimestampTool.vue'),
  'date-time-calculator': () => import('./date-time-calculator/DateTimeCalculatorTool.vue'),
  'world-time': () => import('./world-time/WorldTimeTool.vue'),
  'uuid-generator': () => import('./uuid-generator/UuidGeneratorTool.vue'),
  'password-generator': () => import('./password-generator/PasswordGeneratorTool.vue'),
  'base-converter': () => import('./base-converter/BaseConverterTool.vue'),
  'unit-converter': () => import('./unit-converter/UnitConverterTool.vue'),
  'simplified-traditional': () => import('./simplified-traditional/SimplifiedTraditionalTool.vue'),
  'number-to-chinese': () => import('./number-to-chinese/NumberToChineseTool.vue'),
  'json-workbench': () => import('./json-workbench/JsonWorkbenchTool.vue'),
  'json-to-sql': () => import('./json-to-sql/JsonToSqlTool.vue'),
  'qr-code': () => import('./qr-code/QrCodeTool.vue'),
  barcode: () => import('./barcode/BarcodeTool.vue'),
  'color-tool': () => import('./color-tool/ColorTool.vue'),
  'morse-code': () => import('./morse-code/MorseCodeTool.vue'),
  'shield-image': () => import('./shield-image/ShieldImageTool.vue'),
} as const

/** 根据工具 slug 获取异步组件加载器。 */
export function getToolComponentLoader(slug: string) {
  return TOOL_COMPONENT_LOADERS[slug as keyof typeof TOOL_COMPONENT_LOADERS]
}
