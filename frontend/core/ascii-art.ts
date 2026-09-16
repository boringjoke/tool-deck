import { failure, success, type ToolResult } from './tool-result'

/** ASCII 画首版允许的静态图片格式。 */
export const ASCII_ART_FORMATS = ['png', 'jpeg', 'webp'] as const
export type AsciiArtFormat = typeof ASCII_ART_FORMATS[number]

/** ASCII 画首版输入文件和解码尺寸限制。 */
export const ASCII_ART_MAX_FILE_BYTES = 10 * 1024 * 1024
export const ASCII_ART_MAX_PIXELS = 20_000_000
export const ASCII_ART_MAX_DIMENSION = 8_192

/** ASCII 画首版输出列数和网格限制。 */
export const ASCII_ART_COLUMN_OPTIONS = [40, 80, 120, 160] as const
export type AsciiArtColumns = typeof ASCII_ART_COLUMN_OPTIONS[number]
export const ASCII_ART_DEFAULT_COLUMNS: AsciiArtColumns = 80
export const ASCII_ART_ASPECT_RATIO = 0.5
export const ASCII_ART_MAX_ROWS = 240
export const ASCII_ART_MAX_CELLS = 32_000

/** 从深色到浅色的固定 ASCII 字符集，末尾空格代表最亮像素。 */
export const ASCII_ART_CHARACTER_SET = '@%#*+=-:. '

export type AsciiArtMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface AsciiArtSourceInfo {
  format: AsciiArtFormat
  width: number
  height: number
  byteLength: number
}

export interface AsciiArtGrid {
  columns: AsciiArtColumns
  rows: number
  cellCount: number
}

export interface AsciiArtRenderResult extends AsciiArtGrid {
  text: string
}

const MIME_TYPE_BY_FORMAT: Record<AsciiArtFormat, AsciiArtMimeType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** 判断值是否属于 ASCII 画首版允许的图片格式。 */
export function isAsciiArtFormat(value: unknown): value is AsciiArtFormat {
  return typeof value === 'string'
    && (ASCII_ART_FORMATS as readonly string[]).includes(value)
}

/** 获取图片格式对应的标准 MIME 类型。 */
export function getAsciiArtMimeType(format: AsciiArtFormat): AsciiArtMimeType {
  return MIME_TYPE_BY_FORMAT[format]
}

/** 判断值是否属于首版允许的输出列数。 */
export function isAsciiArtColumns(value: unknown): value is AsciiArtColumns {
  return typeof value === 'number'
    && (ASCII_ART_COLUMN_OPTIONS as readonly number[]).includes(value)
}

/** 将页面控件传入的列数规范化为受支持的固定档位。 */
export function normalizeAsciiArtColumns(
  value: unknown,
): ToolResult<AsciiArtColumns> {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  return isAsciiArtColumns(numericValue)
    ? success(numericValue)
    : failure('invalid-input', 'ASCII 画输出列数无效，请选择 40、80、120 或 160 列。')
}

/** 校验本地图片的格式、文件大小和解码尺寸。 */
export function validateAsciiArtSource(
  source: AsciiArtSourceInfo,
): ToolResult<AsciiArtSourceInfo> {
  if (!isAsciiArtFormat(source.format)) {
    return failure('unsupported-input', '仅支持 PNG、JPEG 或 WebP 静态图片。')
  }

  if (
    !Number.isInteger(source.width)
    || !Number.isInteger(source.height)
    || source.width <= 0
    || source.height <= 0
  ) {
    return failure('invalid-input', '无法读取图片的有效尺寸，请更换图片后重试。')
  }

  if (!Number.isInteger(source.byteLength) || source.byteLength < 0) {
    return failure('invalid-input', '无法读取图片文件大小，请重新选择图片。')
  }

  if (source.byteLength > ASCII_ART_MAX_FILE_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的图片。')
  }

  if (
    source.width > ASCII_ART_MAX_DIMENSION
    || source.height > ASCII_ART_MAX_DIMENSION
  ) {
    return failure('out-of-range', '图片最长边超过 8,192 px 限制，请选择更小的图片。')
  }

  if (source.width * source.height > ASCII_ART_MAX_PIXELS) {
    return failure('out-of-range', '图片解码后超过 20 MP 限制，请选择更小的图片。')
  }

  return success(source)
}

/** 根据原图尺寸和目标列数计算字符网格，并执行输出上限检查。 */
export function calculateAsciiArtGrid(
  width: number,
  height: number,
  columns: unknown,
): ToolResult<AsciiArtGrid> {
  const normalizedColumns = normalizeAsciiArtColumns(columns)
  if (!normalizedColumns.ok) {
    return normalizedColumns
  }

  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
  ) {
    return failure('invalid-input', '无法计算图片字符网格，请更换图片后重试。')
  }

  const rows = Math.max(
    1,
    Math.round(
      normalizedColumns.value
      * height
      / width
      * ASCII_ART_ASPECT_RATIO,
    ),
  )
  const cellCount = normalizedColumns.value * rows

  if (rows > ASCII_ART_MAX_ROWS || cellCount > ASCII_ART_MAX_CELLS) {
    return failure('out-of-range', '输出结果过大，请降低 ASCII 画输出列数。')
  }

  return success({
    columns: normalizedColumns.value,
    rows,
    cellCount,
  })
}

/** 将一个像素通道限制到 Canvas 的 0–255 范围。 */
function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value))
}

/** 将 RGBA 像素按白色背景合成并映射到固定 ASCII 字符集。 */
export function getAsciiArtCharacter(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): string {
  const normalizedAlpha = clampChannel(alpha) / 255
  const compositedRed = clampChannel(red) * normalizedAlpha + 255 * (1 - normalizedAlpha)
  const compositedGreen = clampChannel(green) * normalizedAlpha + 255 * (1 - normalizedAlpha)
  const compositedBlue = clampChannel(blue) * normalizedAlpha + 255 * (1 - normalizedAlpha)
  const luminance = 0.2126 * compositedRed
    + 0.7152 * compositedGreen
    + 0.0722 * compositedBlue
  const characterIndex = Math.min(
    ASCII_ART_CHARACTER_SET.length - 1,
    Math.max(
      0,
      Math.round(
        luminance / 255 * (ASCII_ART_CHARACTER_SET.length - 1),
      ),
    ),
  )

  return ASCII_ART_CHARACTER_SET[characterIndex] ?? ' '
}

/** 将已缩放到字符网格的 RGBA 像素生成固定宽度 ASCII 文本。 */
export function renderAsciiArt(
  pixels: ArrayLike<number>,
  columns: unknown,
  rows: number,
): ToolResult<AsciiArtRenderResult> {
  const normalizedColumns = normalizeAsciiArtColumns(columns)
  if (!normalizedColumns.ok) {
    return normalizedColumns
  }

  if (!Number.isInteger(rows) || rows <= 0) {
    return failure('invalid-input', 'ASCII 画输出行数无效。')
  }

  const cellCount = normalizedColumns.value * rows
  if (rows > ASCII_ART_MAX_ROWS || cellCount > ASCII_ART_MAX_CELLS) {
    return failure('out-of-range', '输出结果过大，请降低 ASCII 画输出列数。')
  }

  const expectedLength = cellCount * 4
  if (pixels.length !== expectedLength) {
    return failure('invalid-input', '图片像素采样结果无效，请重新生成。')
  }

  let text = ''
  for (let row = 0; row < rows; row += 1) {
    let line = ''
    for (let column = 0; column < normalizedColumns.value; column += 1) {
      const pixelOffset = (row * normalizedColumns.value + column) * 4
      const red = pixels[pixelOffset]
      const green = pixels[pixelOffset + 1]
      const blue = pixels[pixelOffset + 2]
      const alpha = pixels[pixelOffset + 3]

      if (
        red === undefined
        || green === undefined
        || blue === undefined
        || alpha === undefined
        || ![red, green, blue, alpha].every(Number.isFinite)
      ) {
        return failure('invalid-input', '图片像素采样结果无效，请重新生成。')
      }

      line += getAsciiArtCharacter(red, green, blue, alpha)
    }

    text += row === rows - 1 ? line : line + '\n'
  }

  return success({
    text,
    columns: normalizedColumns.value,
    rows,
    cellCount,
  })
}
