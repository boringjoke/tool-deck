import { failure, success, type ToolError, type ToolResult } from './tool-result'

export type ColorFormat = 'HEX' | 'RGB' | 'HSL'

export const COLOR_FORMATS = ['HEX', 'RGB', 'HSL'] as const satisfies readonly ColorFormat[]

export const COLOR_FORMAT_LABELS: Readonly<Record<ColorFormat, string>> = {
  HEX: 'HEX',
  RGB: 'RGB / RGBA',
  HSL: 'HSL / HSLA',
}

export const DEFAULT_COLOR_FORMAT: ColorFormat = 'HEX'

export interface ColorValue {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export interface ColorInputOptions {
  format: ColorFormat
  value: string
}

export interface ColorOutputs {
  readonly hex: string
  readonly rgb: string
  readonly hsl: string
}

export interface ColorConversion {
  readonly input: string
  readonly format: ColorFormat
  readonly color: ColorValue
  readonly outputs: ColorOutputs
}

export interface ColorSource {
  format: ColorFormat
  value: string
}

export interface ColorContrastOptions {
  foreground: ColorSource
  background: ColorSource
}

export interface ColorContrast {
  readonly foreground: ColorValue
  readonly background: ColorValue
  readonly ratio: number
  readonly ratioText: string
  readonly normalAa: boolean
  readonly largeAa: boolean
  readonly normalAaa: boolean
  readonly largeAaa: boolean
}

const DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/u
const HEX_PATTERN = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu
const RGB_FUNCTION_PATTERN = /^(rgb|rgba)\(([\s\S]*)\)$/iu
const HSL_FUNCTION_PATTERN = /^(hsl|hsla)\(([\s\S]*)\)$/iu

/** 判断未知值是否属于颜色工具支持的格式。 */
export function isColorFormat(value: unknown): value is ColorFormat {
  return typeof value === 'string' && (COLOR_FORMATS as readonly string[]).includes(value)
}

/** 获取颜色格式的中文展示名称。 */
export function getColorFormatLabel(format: ColorFormat): string {
  return COLOR_FORMAT_LABELS[format]
}

/** 创建颜色核心使用的结构化失败结果。 */
function colorFailure<T>(code: ToolError['code'], message: string): ToolResult<T> {
  return failure(code, message)
}

/** 解析十进制有限数值文本。 */
function parseDecimal(text: string): number | undefined {
  if (!DECIMAL_PATTERN.test(text)) {
    return undefined
  }

  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** 解析并校验 RGB 通道整数。 */
function parseRgbChannel(text: string, channel: string): ToolResult<number> {
  if (!/^\d+$/u.test(text)) {
    return colorFailure('invalid-input', `${channel} 通道必须是 0–255 的整数。`)
  }

  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    return colorFailure('out-of-range', `${channel} 通道必须在 0–255 范围内。`)
  }

  return success(value)
}

/** 解析并校验 HSL 百分比数值。 */
function parsePercentage(text: string, field: string): ToolResult<number> {
  if (!text.endsWith('%')) {
    return colorFailure('invalid-input', `${field} 必须使用带 % 的百分比。`)
  }

  const value = parseDecimal(text.slice(0, -1).trim())
  if (value === undefined) {
    return colorFailure('invalid-input', `${field} 必须是有效的百分比数值。`)
  }

  if (value < 0 || value > 100) {
    return colorFailure('out-of-range', `${field} 必须在 0–100% 范围内。`)
  }

  return success(value)
}

/** 解析并校验透明度数值。 */
function parseAlpha(text: string): ToolResult<number> {
  const value = parseDecimal(text)
  if (value === undefined) {
    return colorFailure('invalid-input', '透明度必须是 0–1 之间的小数。')
  }

  if (value < 0 || value > 1) {
    return colorFailure('out-of-range', '透明度必须在 0–1 范围内。')
  }

  return success(value)
}

/** 将单个十六进制字符扩展为一个字节。 */
function expandHexChannel(value: string): number {
  return Number.parseInt(`${value}${value}`, 16)
}

/** 将十六进制颜色文本解析为 RGBA 颜色值。 */
function parseHexColor(input: string): ToolResult<ColorValue> {
  if (!HEX_PATTERN.test(input)) {
    return colorFailure('invalid-input', '请输入 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA 格式的 HEX 颜色。')
  }

  const digits = input.slice(1)
  const expanded = digits.length <= 4
    ? Array.from(digits, expandHexChannel)
    : [
        Number.parseInt(digits.slice(0, 2), 16),
        Number.parseInt(digits.slice(2, 4), 16),
        Number.parseInt(digits.slice(4, 6), 16),
        ...(digits.length === 8 ? [Number.parseInt(digits.slice(6, 8), 16)] : []),
      ]

  return success({
    red: expanded[0]!,
    green: expanded[1]!,
    blue: expanded[2]!,
    alpha: expanded.length === 4 ? expanded[3]! / 255 : 1,
  })
}

/** 将函数式颜色文本拆分为函数名和逗号分隔参数。 */
function parseFunctionComponents(
  input: string,
  pattern: RegExp,
  field: string,
): ToolResult<{ name: string; components: string[] }> {
  const match = input.match(pattern)
  if (!match) {
    return colorFailure('invalid-input', `${field}格式不正确，请检查函数名和逗号分隔参数。`)
  }

  return success({
    name: match[1]!.toLowerCase(),
    components: match[2]!.split(',').map((component) => component.trim()),
  })
}

/** 将 RGB/RGBA 函数文本解析为 RGBA 颜色值。 */
function parseRgbColor(input: string): ToolResult<ColorValue> {
  const parsed = parseFunctionComponents(input, RGB_FUNCTION_PATTERN, 'RGB')
  if (!parsed.ok) {
    return parsed
  }

  const expectedLength = parsed.value.name === 'rgba' ? 4 : 3
  if (parsed.value.components.length !== expectedLength) {
    return colorFailure('invalid-input', 'RGB 只接受 rgb(r, g, b) 或 rgba(r, g, b, a) 格式。')
  }

  const red = parseRgbChannel(parsed.value.components[0]!, '红')
  const green = parseRgbChannel(parsed.value.components[1]!, '绿')
  const blue = parseRgbChannel(parsed.value.components[2]!, '蓝')
  if (!red.ok) return red
  if (!green.ok) return green
  if (!blue.ok) return blue

  const alpha = parsed.value.name === 'rgba'
    ? parseAlpha(parsed.value.components[3]!)
    : success(1)
  if (!alpha.ok) {
    return alpha
  }

  return success({
    red: red.value,
    green: green.value,
    blue: blue.value,
    alpha: alpha.value,
  })
}

/** 将 HSL/HSLA 函数文本解析并转换为 RGBA 颜色值。 */
function parseHslColor(input: string): ToolResult<ColorValue> {
  const parsed = parseFunctionComponents(input, HSL_FUNCTION_PATTERN, 'HSL')
  if (!parsed.ok) {
    return parsed
  }

  const expectedLength = parsed.value.name === 'hsla' ? 4 : 3
  if (parsed.value.components.length !== expectedLength) {
    return colorFailure('invalid-input', 'HSL 只接受 hsl(h, s%, l%) 或 hsla(h, s%, l%, a) 格式。')
  }

  const hue = parseDecimal(parsed.value.components[0]!)
  if (hue === undefined) {
    return colorFailure('invalid-input', '色相必须是 0–小于 360 的数值。')
  }
  if (hue < 0 || hue >= 360) {
    return colorFailure('out-of-range', '色相必须在 0–小于 360 的范围内。')
  }

  const saturation = parsePercentage(parsed.value.components[1]!, '饱和度')
  const lightness = parsePercentage(parsed.value.components[2]!, '亮度')
  if (!saturation.ok) return saturation
  if (!lightness.ok) return lightness

  const alpha = parsed.value.name === 'hsla'
    ? parseAlpha(parsed.value.components[3]!)
    : success(1)
  if (!alpha.ok) {
    return alpha
  }

  const rgb = hslToRgb(hue, saturation.value, lightness.value)
  return success({ ...rgb, alpha: alpha.value })
}

/** 将 HSL 数值转换为 RGB 通道。 */
function hslToRgb(hue: number, saturation: number, lightness: number): Omit<ColorValue, 'alpha'> {
  const h = hue / 360
  const s = saturation / 100
  const l = lightness / 100

  if (s === 0) {
    const channel = Math.round(l * 255)
    return { red: channel, green: channel, blue: channel }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    red: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    green: Math.round(hueToRgb(p, q, h) * 255),
    blue: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  }
}

/** 计算 HSL 转 RGB 时的单个色相通道。 */
function hueToRgb(p: number, q: number, value: number): number {
  let normalized = value
  if (normalized < 0) normalized += 1
  if (normalized > 1) normalized -= 1
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized
  if (normalized < 1 / 2) return q
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6
  return p
}

/** 将 RGB 通道转换为 HSL 数值。 */
function rgbToHsl(color: ColorValue): { hue: number; saturation: number; lightness: number } {
  const red = color.red / 255
  const green = color.green / 255
  const blue = color.blue / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness: lightness * 100 }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number

  if (max === red) {
    hue = ((green - blue) / delta) % 6
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  hue *= 60
  if (hue < 0) hue += 360

  return {
    hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
  }
}

/** 将小数格式化为固定精度并移除无意义尾随零。 */
function formatNumber(value: number, decimals: number): string {
  if (value === 0 || Object.is(value, -0)) {
    return '0'
  }

  return value.toFixed(decimals)
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '')
}

/** 将 RGB 通道格式化为两位大写十六进制文本。 */
function formatHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0').toUpperCase()
}

/** 将 RGBA 颜色值格式化为规范化 HEX 文本。 */
function formatHexColor(color: ColorValue): string {
  const base = `#${formatHexChannel(color.red)}${formatHexChannel(color.green)}${formatHexChannel(color.blue)}`
  return color.alpha === 1 ? base : `${base}${formatHexChannel(color.alpha * 255)}`
}

/** 将 RGBA 颜色值格式化为规范化 RGB/RGBA 文本。 */
function formatRgbColor(color: ColorValue): string {
  const channels = `${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)}`
  return color.alpha === 1
    ? `rgb(${channels})`
    : `rgba(${channels}, ${formatNumber(color.alpha, 3)})`
}

/** 将 RGBA 颜色值格式化为规范化 HSL/HSLA 文本。 */
function formatHslColor(color: ColorValue): string {
  const hsl = rgbToHsl(color)
  const values = `${formatNumber(hsl.hue, 2)}, ${formatNumber(hsl.saturation, 2)}%, ${formatNumber(hsl.lightness, 2)}%`
  return color.alpha === 1
    ? `hsl(${values})`
    : `hsla(${values}, ${formatNumber(color.alpha, 3)})`
}

/** 将 RGBA 颜色值转换为指定格式的规范化文本。 */
export function formatColorValue(color: ColorValue, format: ColorFormat): string {
  if (format === 'HEX') return formatHexColor(color)
  if (format === 'RGB') return formatRgbColor(color)
  if (format === 'HSL') return formatHslColor(color)
  return ''
}

/** 将用户选择的颜色格式解析为统一 RGBA 颜色值。 */
export function parseColorInput(
  value: string,
  format: ColorFormat,
): ToolResult<ColorValue> {
  if (!isColorFormat(format)) {
    return colorFailure('invalid-input', '请选择受支持的颜色格式。')
  }

  if (typeof value !== 'string' || !value.trim()) {
    return colorFailure('empty-input', '请输入颜色值。')
  }

  const input = value.trim()
  if (format === 'HEX') return parseHexColor(input)
  if (format === 'RGB') return parseRgbColor(input)
  return parseHslColor(input)
}

/** 执行颜色格式转换并生成三类规范化输出。 */
export function convertColor(options: ColorInputOptions): ToolResult<ColorConversion> {
  const parsed = parseColorInput(options.value, options.format)
  if (!parsed.ok) {
    return parsed
  }

  return success({
    input: options.value,
    format: options.format,
    color: parsed.value,
    outputs: {
      hex: formatHexColor(parsed.value),
      rgb: formatRgbColor(parsed.value),
      hsl: formatHslColor(parsed.value),
    },
  })
}

/** 将单个 sRGB 通道转换为相对亮度通道。 */
function toRelativeLuminanceChannel(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

/** 计算不透明 RGB 颜色的 WCAG 相对亮度。 */
function calculateRelativeLuminance(color: ColorValue): number {
  return 0.2126 * toRelativeLuminanceChannel(color.red)
    + 0.7152 * toRelativeLuminanceChannel(color.green)
    + 0.0722 * toRelativeLuminanceChannel(color.blue)
}

/** 将颜色解析错误附加到具体的对比度输入字段。 */
function withColorField(error: ToolError, field: string): ToolError {
  return {
    ...error,
    message: `${field}：${error.message}`,
  }
}

/** 计算前景色与背景色的 WCAG 对比度及等级提示。 */
export function calculateColorContrast(
  options: ColorContrastOptions,
): ToolResult<ColorContrast> {
  const foreground = parseColorInput(options.foreground.value, options.foreground.format)
  if (!foreground.ok) {
    return { ok: false, error: withColorField(foreground.error, '前景色') }
  }

  const background = parseColorInput(options.background.value, options.background.format)
  if (!background.ok) {
    return { ok: false, error: withColorField(background.error, '背景色') }
  }

  if (foreground.value.alpha !== 1 || background.value.alpha !== 1) {
    return colorFailure('invalid-input', '对比度检查只支持不透明颜色，请移除透明度后重试。')
  }

  const foregroundLuminance = calculateRelativeLuminance(foreground.value)
  const backgroundLuminance = calculateRelativeLuminance(background.value)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  const ratio = (lighter + 0.05) / (darker + 0.05)

  return success({
    foreground: foreground.value,
    background: background.value,
    ratio,
    ratioText: `${formatNumber(ratio, 2)}:1`,
    normalAa: ratio >= 4.5,
    largeAa: ratio >= 3,
    normalAaa: ratio >= 7,
    largeAaa: ratio >= 4.5,
  })
}
