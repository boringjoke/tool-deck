import { failure, success, type ToolResult } from './tool-result'

export const IMAGE_WATERMARK_MAX_FILE_BYTES = 10 * 1024 * 1024
export const IMAGE_WATERMARK_MAX_PIXELS = 20_000_000
export const IMAGE_WATERMARK_MAX_DIMENSION = 8_192
export const IMAGE_WATERMARK_MAX_TEXT_LENGTH = 64
export const IMAGE_WATERMARK_MARGIN_RATIO = 0.04
export const IMAGE_WATERMARK_DEFAULT_COLOR = '#ffffff'
export const IMAGE_WATERMARK_DEFAULT_OPACITY = 0.55
export const IMAGE_WATERMARK_JPEG_QUALITY = 0.92
export const IMAGE_WATERMARK_WEBP_QUALITY = 0.90

export const IMAGE_WATERMARK_FORMATS = ['png', 'jpeg', 'webp'] as const
export type ImageWatermarkFormat = typeof IMAGE_WATERMARK_FORMATS[number]

export const IMAGE_WATERMARK_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const
export type ImageWatermarkPosition = typeof IMAGE_WATERMARK_POSITIONS[number]

export const IMAGE_WATERMARK_SIZES = ['small', 'medium', 'large'] as const
export type ImageWatermarkSize = typeof IMAGE_WATERMARK_SIZES[number]

export type ImageWatermarkTextAlign = 'left' | 'center' | 'right'

export interface ImageWatermarkOptions {
  text: string
  position?: ImageWatermarkPosition
  size?: ImageWatermarkSize
  color?: string
  opacity?: number
}

export interface NormalizedImageWatermarkOptions {
  text: string
  position: ImageWatermarkPosition
  size: ImageWatermarkSize
  color: string
  opacity: number
}

export interface ImageWatermarkSourceDimensions {
  format: ImageWatermarkFormat
  width: number
  height: number
  byteLength: number
}

export interface ImageWatermarkPlacement {
  x: number
  y: number
  margin: number
  textAlign: ImageWatermarkTextAlign
  textBaseline: 'middle'
}

export interface ImageWatermarkColor {
  red: number
  green: number
  blue: number
}

const MIME_TYPE_BY_FORMAT: Record<ImageWatermarkFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const EXTENSION_BY_FORMAT: Record<ImageWatermarkFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

const FORMAT_BY_MIME_TYPE: Record<string, ImageWatermarkFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp',
}

const SIZE_RATIO_BY_VALUE: Record<ImageWatermarkSize, number> = {
  small: 0.02,
  medium: 0.03,
  large: 0.04,
}

/** 判断格式是否属于图片加水印首版支持范围。 */
export function isImageWatermarkFormat(value: unknown): value is ImageWatermarkFormat {
  return typeof value === 'string'
    && (IMAGE_WATERMARK_FORMATS as readonly string[]).includes(value)
}

/** 将 MIME 值转换为图片加水印首版格式。 */
export function getImageWatermarkFormatFromMimeType(
  value: unknown,
): ImageWatermarkFormat | null {
  if (typeof value !== 'string') {
    return null
  }

  return FORMAT_BY_MIME_TYPE[value.trim().toLowerCase()] ?? null
}

/** 获取格式对应的 MIME 值。 */
export function getImageWatermarkMimeType(format: ImageWatermarkFormat): string {
  return MIME_TYPE_BY_FORMAT[format]
}

/** 获取格式对应的下载扩展名。 */
export function getImageWatermarkExtension(format: ImageWatermarkFormat): string {
  return EXTENSION_BY_FORMAT[format]
}

/** 将用户输入文本规范化并校验 Unicode 字符和控制字符边界。 */
export function normalizeImageWatermarkText(value: unknown): ToolResult<string> {
  if (typeof value !== 'string') {
    return failure('invalid-input', '水印文字必须是文本。')
  }

  const normalized = value.trim()
  if (!normalized) {
    return failure('empty-input', '请输入水印文字。')
  }

  if (Array.from(normalized).length > IMAGE_WATERMARK_MAX_TEXT_LENGTH) {
    return failure(
      'out-of-range',
      `水印文字不能超过 ${IMAGE_WATERMARK_MAX_TEXT_LENGTH} 个 Unicode 字符。`,
    )
  }

  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    return failure('invalid-input', '水印文字不能包含换行或控制字符。')
  }

  return success(normalized)
}

/** 将颜色输入规范化为六位十六进制颜色。 */
export function normalizeImageWatermarkColor(value: unknown): ToolResult<string> {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/iu.test(value.trim())) {
    return failure('invalid-input', '水印颜色必须使用 #RGB 或 #RRGGBB 格式。')
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 4) {
    return success(`#${normalized.slice(1).split('').map((character) => character.repeat(2)).join('')}`)
  }

  return success(normalized)
}

/** 校验并规范化 10%–100% 的透明度值。 */
export function normalizeImageWatermarkOpacity(value: unknown): ToolResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return failure('invalid-input', '水印透明度必须是数字。')
  }

  if (value < 0.1 || value > 1) {
    return failure('out-of-range', '水印透明度必须在 10% 到 100% 之间。')
  }

  return success(Math.round(value * 100) / 100)
}

/** 校验并补全图片加水印的全部参数。 */
export function normalizeImageWatermarkOptions(
  options: ImageWatermarkOptions,
): ToolResult<NormalizedImageWatermarkOptions> {
  const text = normalizeImageWatermarkText(options?.text)
  if (!text.ok) {
    return text
  }

  const position = options?.position ?? 'bottom-right'
  if (!(IMAGE_WATERMARK_POSITIONS as readonly string[]).includes(position)) {
    return failure('invalid-input', '水印位置不在支持范围内。')
  }

  const size = options?.size ?? 'medium'
  if (!(IMAGE_WATERMARK_SIZES as readonly string[]).includes(size)) {
    return failure('invalid-input', '水印字号不在支持范围内。')
  }

  const color = normalizeImageWatermarkColor(options?.color ?? IMAGE_WATERMARK_DEFAULT_COLOR)
  if (!color.ok) {
    return color
  }

  const opacity = normalizeImageWatermarkOpacity(
    options?.opacity ?? IMAGE_WATERMARK_DEFAULT_OPACITY,
  )
  if (!opacity.ok) {
    return opacity
  }

  return success({
    text: text.value,
    position: position as ImageWatermarkPosition,
    size: size as ImageWatermarkSize,
    color: color.value,
    opacity: opacity.value,
  })
}

/** 校验浏览器解码后的图片尺寸和文件大小。 */
export function validateImageWatermarkSource(
  source: ImageWatermarkSourceDimensions,
): ToolResult<ImageWatermarkSourceDimensions> {
  if (!isImageWatermarkFormat(source?.format)) {
    return failure('unsupported-input', '仅支持 PNG、JPEG 和 WebP 图片。')
  }

  if (!Number.isInteger(source.width) || !Number.isInteger(source.height)
    || source.width <= 0 || source.height <= 0) {
    return failure('operation-failed', '无法读取图片尺寸，请重新选择图片。')
  }

  if (source.byteLength > IMAGE_WATERMARK_MAX_FILE_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  if (source.width > IMAGE_WATERMARK_MAX_DIMENSION
    || source.height > IMAGE_WATERMARK_MAX_DIMENSION) {
    return failure('out-of-range', '图片最长边不能超过 8,192 px。')
  }

  if (source.width * source.height > IMAGE_WATERMARK_MAX_PIXELS) {
    return failure('out-of-range', '图片像素总数不能超过 20 MP。')
  }

  return success(source)
}

/** 根据图片短边和字号档位计算 Canvas 字号。 */
export function getImageWatermarkFontSize(
  width: number,
  height: number,
  size: ImageWatermarkSize,
): number {
  const ratio = SIZE_RATIO_BY_VALUE[size]
  return Math.max(1, Math.round(Math.min(width, height) * ratio))
}

/** 根据图片短边计算水印安全边距。 */
export function getImageWatermarkMargin(width: number, height: number): number {
  return Math.max(1, Math.round(Math.min(width, height) * IMAGE_WATERMARK_MARGIN_RATIO))
}

/** 根据九宫格位置计算水印文本锚点。 */
export function calculateImageWatermarkPlacement(
  width: number,
  height: number,
  fontSize: number,
  position: ImageWatermarkPosition,
): ImageWatermarkPlacement {
  const margin = getImageWatermarkMargin(width, height)
  const horizontal = position.endsWith('left')
    ? { x: margin, textAlign: 'left' as const }
    : position.endsWith('right')
      ? { x: width - margin, textAlign: 'right' as const }
      : { x: width / 2, textAlign: 'center' as const }
  const y = position.startsWith('top')
    ? margin + fontSize / 2
    : position.startsWith('bottom')
      ? height - margin - fontSize / 2
      : height / 2

  return {
    x: horizontal.x,
    y,
    margin,
    textAlign: horizontal.textAlign,
    textBaseline: 'middle',
  }
}

/** 解析六位十六进制颜色，供 Canvas 适配器生成 rgba。 */
export function parseImageWatermarkColor(value: string): ImageWatermarkColor {
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  }
}
