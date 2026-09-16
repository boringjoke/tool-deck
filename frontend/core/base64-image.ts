import { failure, success, type ToolResult } from './tool-result'

/** Base64 图片转换首版允许的最大原始/解码后字节数。 */
export const BASE64_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export const BASE64_IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'gif'] as const
export type Base64ImageFormat = typeof BASE64_IMAGE_FORMATS[number]

export type Base64ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'

export interface Base64ImageValue {
  base64: string
  dataUrl: string
  mimeType: Base64ImageMimeType
  format: Base64ImageFormat
  byteLength: number
}

const MIME_TYPE_BY_FORMAT: Record<Base64ImageFormat, Base64ImageMimeType> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

const EXTENSION_BY_FORMAT: Record<Base64ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
}

const FORMAT_BY_MIME_TYPE: Record<Base64ImageMimeType, Base64ImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** 判断格式是否属于首版支持范围。 */
export function isBase64ImageFormat(value: unknown): value is Base64ImageFormat {
  return typeof value === 'string'
    && (BASE64_IMAGE_FORMATS as readonly string[]).includes(value)
}

/** 将浏览器 MIME 值规范化为首版支持的图片 MIME。 */
export function normalizeBase64ImageMimeType(value: unknown): Base64ImageMimeType | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'image/jpg') {
    return 'image/jpeg'
  }

  return Object.prototype.hasOwnProperty.call(FORMAT_BY_MIME_TYPE, normalized)
    ? normalized as Base64ImageMimeType
    : null
}

/** 获取格式对应的标准 MIME 值。 */
export function getBase64ImageMimeType(format: Base64ImageFormat): Base64ImageMimeType {
  return MIME_TYPE_BY_FORMAT[format]
}

/** 获取格式对应的下载扩展名。 */
export function getBase64ImageExtension(format: Base64ImageFormat): string {
  return EXTENSION_BY_FORMAT[format]
}

/** 根据 MIME 值获取首版图片格式。 */
export function getBase64ImageFormatFromMimeType(
  value: unknown,
): Base64ImageFormat | null {
  const mimeType = normalizeBase64ImageMimeType(value)
  return mimeType ? FORMAT_BY_MIME_TYPE[mimeType] : null
}

/** 移除 Base64 中允许忽略的普通 ASCII 空白字符。 */
export function normalizeBase64(value: string): string {
  return value.replace(/[\t\n\f\r ]/gu, '')
}

/** 严格校验标准 Base64 的字母表、长度和填充位置。 */
export function isValidStandardBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) {
    return false
  }

  const firstPaddingIndex = value.indexOf('=')
  const content = firstPaddingIndex === -1
    ? value
    : value.slice(0, firstPaddingIndex)
  const paddingLength = firstPaddingIndex === -1
    ? 0
    : value.length - firstPaddingIndex

  if (
    paddingLength > 2
    || (firstPaddingIndex !== -1 && !/^=+$/u.test(value.slice(firstPaddingIndex)))
    || !/^[A-Za-z0-9+/]+$/u.test(content)
  ) {
    return false
  }

  return paddingLength === 0
    || (paddingLength === 1 && content.length % 4 === 3)
    || (paddingLength === 2 && content.length % 4 === 2)
}

/** 估算已通过校验的 Base64 解码字节数。 */
export function getBase64DecodedByteLength(value: string): number | null {
  const normalized = normalizeBase64(value)
  if (!isValidStandardBase64(normalized)) {
    return null
  }

  const padding = normalized.endsWith('==')
    ? 2
    : normalized.endsWith('=')
      ? 1
      : 0

  return (normalized.length / 4) * 3 - padding
}

/** 创建带标准 MIME 的 Base64 图片结果。 */
export function createBase64ImageValue(
  base64: string,
  mimeType: Base64ImageMimeType,
): ToolResult<Base64ImageValue> {
  const normalized = normalizeBase64(base64)
  const byteLength = getBase64DecodedByteLength(normalized)

  if (byteLength === null) {
    return failure('invalid-input', 'Base64 内容格式无效，请检查字母、长度和填充。')
  }

  if (byteLength > BASE64_IMAGE_MAX_BYTES) {
    return failure('out-of-range', '图片解码后超过 10 MiB 大小限制，请减少内容后重试。')
  }

  const format = getBase64ImageFormatFromMimeType(mimeType)
  if (!format) {
    return failure('unsupported-input', '仅支持 PNG、JPEG、WebP 和 GIF 图片。')
  }

  return success({
    base64: normalized,
    dataUrl: `data:${mimeType};base64,${normalized}`,
    mimeType,
    format,
    byteLength,
  })
}

/** 解析 Data URL 或带格式选择的纯 Base64 文本。 */
export function parseBase64ImageText(
  value: unknown,
  rawFormat?: unknown,
): ToolResult<Base64ImageValue> {
  if (typeof value !== 'string' || !value.trim()) {
    return failure('empty-input', '请输入 Data URL 或纯 Base64 图片内容。')
  }

  const source = value.trim()
  let mimeType: Base64ImageMimeType | null = null
  let base64 = source

  if (/^data:/iu.test(source)) {
    const separatorIndex = source.indexOf(',')
    if (separatorIndex <= 0) {
      return failure('invalid-input', 'Data URL 格式无效，请使用 data:image/...;base64,... 格式。')
    }

    const header = source.slice(0, separatorIndex)
    const headerMatch = /^data:([^;]+);base64$/iu.exec(header)
    if (!headerMatch?.[1]) {
      return failure('invalid-input', 'Data URL 格式无效，请确认包含 ;base64 标记。')
    }

    mimeType = normalizeBase64ImageMimeType(headerMatch[1])
    if (!mimeType) {
      return failure('unsupported-input', '仅支持 PNG、JPEG、WebP 和 GIF 图片。')
    }

    base64 = source.slice(separatorIndex + 1)
  } else {
    if (!isBase64ImageFormat(rawFormat)) {
      return failure('invalid-input', '纯 Base64 输入需要先选择 PNG、JPEG、WebP 或 GIF 格式。')
    }

    mimeType = getBase64ImageMimeType(rawFormat)
  }

  return createBase64ImageValue(base64, mimeType)
}

/** 判断字节序列是否以指定签名开头。 */
function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value)
}

/** 根据图片文件的魔数识别首版支持的格式。 */
export function detectBase64ImageFormat(
  bytes: Uint8Array,
): ToolResult<Base64ImageFormat> {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return success('png')
  }

  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return success('jpeg')
  }

  if (hasBytes(bytes, [0x47, 0x49, 0x46, 0x38])
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61) {
    return success('gif')
  }

  if (hasBytes(bytes, [0x52, 0x49, 0x46, 0x46])
    && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return success('webp')
  }

  return failure('unsupported-input', '无法识别图片文件格式，仅支持 PNG、JPEG、WebP 和 GIF。')
}

/** 检查图片 MIME 与文件签名是否对应。 */
export function isBase64ImageMimeMatchingFormat(
  mimeType: unknown,
  format: Base64ImageFormat,
): boolean {
  return getBase64ImageFormatFromMimeType(mimeType) === format
}
