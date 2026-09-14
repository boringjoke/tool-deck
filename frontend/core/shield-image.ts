import { failure, success, type ToolResult } from './tool-result'

export const SHIELD_TEXT_MAX_LENGTH = 32
export const SHIELD_HEIGHT = 24
export const SHIELD_FONT_SIZE = 12
export const SHIELD_HORIZONTAL_PADDING = 8
export const DEFAULT_SHIELD_LEFT_COLOR = '#555555'
export const DEFAULT_SHIELD_RIGHT_COLOR = '#4c1'

export interface ShieldImageOptions {
  leftText: string
  rightText: string
  leftColor?: string
  rightColor?: string
}

export interface ShieldImageValue {
  leftText: string
  rightText: string
  leftColor: string
  rightColor: string
  width: number
  height: number
  svg: string
  previewSource: string
}

/** 根据左右文字和背景色生成本地 Shield SVG 结果。 */
export function generateShieldImage(
  options: ShieldImageOptions,
): ToolResult<ShieldImageValue> {
  const leftTextResult = normalizeShieldText(options?.leftText, '左侧文字')
  if (!leftTextResult.ok) {
    return leftTextResult
  }

  const rightTextResult = normalizeShieldText(options?.rightText, '右侧文字')
  if (!rightTextResult.ok) {
    return rightTextResult
  }

  const leftColorResult = normalizeShieldColor(
    options?.leftColor ?? DEFAULT_SHIELD_LEFT_COLOR,
    '左侧背景色',
  )
  if (!leftColorResult.ok) {
    return leftColorResult
  }

  const rightColorResult = normalizeShieldColor(
    options?.rightColor ?? DEFAULT_SHIELD_RIGHT_COLOR,
    '右侧背景色',
  )
  if (!rightColorResult.ok) {
    return rightColorResult
  }

  const leftWidth = calculateShieldSegmentWidth(leftTextResult.value)
  const rightWidth = calculateShieldSegmentWidth(rightTextResult.value)
  const width = leftWidth + rightWidth
  const svg = createShieldSvg({
    leftText: leftTextResult.value,
    rightText: rightTextResult.value,
    leftColor: leftColorResult.value,
    rightColor: rightColorResult.value,
    leftWidth,
    rightWidth,
    width,
  })

  return success({
    leftText: leftTextResult.value,
    rightText: rightTextResult.value,
    leftColor: leftColorResult.value,
    rightColor: rightColorResult.value,
    width,
    height: SHIELD_HEIGHT,
    svg,
    previewSource: createShieldSvgDataUrl(svg),
  })
}

/** 将用户输入文字去除首尾空白并校验 Shield 单侧文字边界。 */
function normalizeShieldText(value: unknown, fieldLabel: string): ToolResult<string> {
  if (typeof value !== 'string') {
    return failure('invalid-input', `${fieldLabel}必须是文本。`)
  }

  const normalized = value.trim()

  if (!normalized) {
    return failure('empty-input', `请输入${fieldLabel}。`)
  }

  if (Array.from(normalized).length > SHIELD_TEXT_MAX_LENGTH) {
    return failure(
      'out-of-range',
      `${fieldLabel}不能超过 ${SHIELD_TEXT_MAX_LENGTH} 个 Unicode 字符。`,
    )
  }

  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    return failure('invalid-input', `${fieldLabel}不能包含换行或控制字符。`)
  }

  return success(normalized)
}

/** 将 Shield 背景色校验并规范化为六位小写十六进制颜色。 */
function normalizeShieldColor(value: unknown, fieldLabel: string): ToolResult<string> {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/iu.test(value.trim())) {
    return failure('invalid-input', `${fieldLabel}必须使用 #RGB 或 #RRGGBB 格式。`)
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 4) {
    return success(`#${normalized.slice(1).split('').map((character) => character.repeat(2)).join('')}`)
  }

  return success(normalized)
}

/** 根据 Shield 文字内容估算单侧宽度，避免文字在固定画布中被裁切。 */
function calculateShieldSegmentWidth(text: string): number {
  const textWidth = Array.from(text).reduce(
    (total, character) => total + getShieldCharacterWidth(character),
    0,
  )

  return Math.max(30, textWidth + SHIELD_HORIZONTAL_PADDING * 2)
}

/** 按字符类别估算适用于 Shield 默认字体的显示宽度。 */
function getShieldCharacterWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0

  if (character === ' ') {
    return 4
  }

  if (
    codePoint >= 0x1100
    && (
      codePoint <= 0x115f
      || codePoint === 0x2329
      || codePoint === 0x232a
      || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
      || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
      || codePoint >= 0x1f300
    )
  ) {
    return 12
  }

  return 7
}

/** 根据背景色亮度选择黑色或白色文字，保持固定 Shield 样式的可读性。 */
function getShieldTextColor(backgroundColor: string): '#111111' | '#ffffff' {
  const red = Number.parseInt(backgroundColor.slice(1, 3), 16)
  const green = Number.parseInt(backgroundColor.slice(3, 5), 16)
  const blue = Number.parseInt(backgroundColor.slice(5, 7), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000

  return luminance > 160 ? '#111111' : '#ffffff'
}

/** 对用户文字执行 XML 转义，避免文字破坏 SVG 结构。 */
function escapeShieldText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }

    return entities[character] ?? character
  })
}

/** 生成固定扁平样式的 Shield SVG 文本。 */
function createShieldSvg(input: {
  leftText: string
  rightText: string
  leftColor: string
  rightColor: string
  leftWidth: number
  rightWidth: number
  width: number
}): string {
  const leftCenter = input.leftWidth / 2
  const rightCenter = input.leftWidth + input.rightWidth / 2
  const centerY = SHIELD_HEIGHT / 2
  const leftTextColor = getShieldTextColor(input.leftColor)
  const rightTextColor = getShieldTextColor(input.rightColor)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${SHIELD_HEIGHT}" viewBox="0 0 ${input.width} ${SHIELD_HEIGHT}" role="img" aria-label="Shield 图片">`,
    `  <defs><clipPath id="shield-clip"><rect width="${input.width}" height="${SHIELD_HEIGHT}" rx="3" /></clipPath></defs>`,
    `  <g clip-path="url(#shield-clip)">`,
    `    <rect width="${input.leftWidth}" height="${SHIELD_HEIGHT}" fill="${input.leftColor}" />`,
    `    <rect x="${input.leftWidth}" width="${input.rightWidth}" height="${SHIELD_HEIGHT}" fill="${input.rightColor}" />`,
    `  </g>`,
    `  <text x="${leftCenter}" y="${centerY}" fill="${leftTextColor}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="${SHIELD_FONT_SIZE}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeShieldText(input.leftText)}</text>`,
    `  <text x="${rightCenter}" y="${centerY}" fill="${rightTextColor}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="${SHIELD_FONT_SIZE}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeShieldText(input.rightText)}</text>`,
    '</svg>',
  ].join('\n')
}

/** 将 Shield SVG 文本转换为可直接用于图片预览的 data URL。 */
export function createShieldSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
