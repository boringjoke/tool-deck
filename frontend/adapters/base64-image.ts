import {
  BASE64_IMAGE_MAX_BYTES,
  createBase64ImageValue,
  detectBase64ImageFormat,
  getBase64ImageExtension,
  getBase64ImageMimeType,
  isBase64ImageMimeMatchingFormat,
  normalizeBase64ImageMimeType,
  parseBase64ImageText,
  type Base64ImageFormat,
  type Base64ImageValue,
} from '../core/base64-image'
import { failure, success, type ToolResult } from '../core/tool-result'
import { createDownloadFileName, downloadBlob, downloadText } from './download'

export interface Base64ImageFileValue extends Base64ImageValue {
  previewSource: string
}

export interface DecodedBase64ImageValue extends Base64ImageValue {
  blob: Blob
  previewSource: string
}

export type Base64ImageTextRepresentation = 'data-url' | 'raw'

/** 使用浏览器 Base64 API 将图片字节编码为标准 Base64。 */
function encodeBytesToBase64(bytes: Uint8Array): ToolResult<string> {
  if (typeof window === 'undefined' || typeof window.btoa !== 'function') {
    return failure('operation-failed', '当前浏览器不支持 Base64 编码。')
  }

  try {
    let binary = ''
    const chunkSize = 0x8000

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))
      binary += String.fromCharCode(...chunk)
    }

    return success(window.btoa(binary))
  } catch {
    return failure('operation-failed', '图片 Base64 编码失败，请重试。')
  }
}

/** 使用浏览器 Base64 API 将文本解码为原始图片字节。 */
function decodeBase64ToBytes(base64: string): ToolResult<Uint8Array> {
  if (typeof window === 'undefined' || typeof window.atob !== 'function') {
    return failure('operation-failed', '当前浏览器不支持 Base64 解码。')
  }

  try {
    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return success(bytes)
  } catch {
    return failure('operation-failed', 'Base64 解码失败，请检查输入内容后重试。')
  }
}

/** 读取本地图片文件并保留原始字节生成 Base64 结果。 */
export async function readBase64ImageFile(
  file: File,
): Promise<ToolResult<Base64ImageFileValue>> {
  if (file.size > BASE64_IMAGE_MAX_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  if (typeof file.arrayBuffer !== 'function') {
    return failure('operation-failed', '当前浏览器不支持读取图片文件。')
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return failure('operation-failed', '图片文件读取失败，请重新选择文件。')
  }

  if (bytes.byteLength > BASE64_IMAGE_MAX_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  const detected = detectBase64ImageFormat(bytes)
  if (!detected.ok) {
    return detected
  }

  if (file.type) {
    const declaredMimeType = normalizeBase64ImageMimeType(file.type)
    if (!declaredMimeType) {
      return failure('unsupported-input', '仅支持 PNG、JPEG、WebP 和 GIF 图片文件。')
    }

    if (!isBase64ImageMimeMatchingFormat(declaredMimeType, detected.value)) {
      return failure('unsupported-input', '图片 MIME 类型与文件内容不匹配，无法安全预览。')
    }
  }

  const mimeType = getBase64ImageMimeType(detected.value)
  const encoded = encodeBytesToBase64(bytes)
  if (!encoded.ok) {
    return encoded
  }

  const result = createBase64ImageValue(encoded.value, mimeType)
  if (!result.ok) {
    return result
  }

  return success({
    ...result.value,
    previewSource: result.value.dataUrl,
  })
}

/** 将已解析的 Base64 图片解码为原始 Blob 和本地对象 URL。 */
export function decodeBase64Image(
  value: Base64ImageValue,
): ToolResult<DecodedBase64ImageValue> {
  if (
    typeof window === 'undefined'
    || typeof Blob === 'undefined'
    || typeof window.URL?.createObjectURL !== 'function'
  ) {
    return failure('operation-failed', '当前浏览器不支持图片预览。')
  }

  const decoded = decodeBase64ToBytes(value.base64)
  if (!decoded.ok) {
    return decoded
  }

  if (decoded.value.byteLength !== value.byteLength) {
    return failure('operation-failed', '图片字节长度校验失败，请重新转换。')
  }

  const detected = detectBase64ImageFormat(decoded.value)
  if (!detected.ok) {
    return detected
  }

  if (detected.value !== value.format) {
    return failure('unsupported-input', '图片 MIME 类型与文件内容不匹配，无法安全预览。')
  }

  try {
    const blob = new Blob([decoded.value.buffer as ArrayBuffer], { type: value.mimeType })
    const previewSource = window.URL.createObjectURL(blob)

    return success({
      ...value,
      blob,
      previewSource,
    })
  } catch {
    return failure('operation-failed', '图片预览创建失败，请检查浏览器图片能力。')
  }
}

/** 解析并解码 Data URL 或纯 Base64 图片文本。 */
export function decodeBase64ImageText(
  value: unknown,
  rawFormat?: unknown,
): ToolResult<DecodedBase64ImageValue> {
  const parsed = parseBase64ImageText(value, rawFormat)
  if (!parsed.ok) {
    return parsed
  }

  return decodeBase64Image(parsed.value)
}

/** 释放 Base64 图片预览使用的对象 URL。 */
export function revokeBase64ImageObjectUrl(url: string): void {
  if (
    !url
    || typeof window === 'undefined'
    || typeof window.URL?.revokeObjectURL !== 'function'
  ) {
    return
  }

  window.URL.revokeObjectURL(url)
}

/** 生成 Base64 图片文本下载文件名。 */
export function createBase64ImageTextDownloadFileName(
  representation: Base64ImageTextRepresentation,
  now = new Date(),
): string {
  return createDownloadFileName(
    representation === 'data-url' ? 'base64-image-data-url' : 'base64-image-raw',
    'txt',
    now,
  )
}

/** 生成 Base64 图片文件下载文件名。 */
export function createBase64ImageDownloadFileName(
  format: Base64ImageFormat,
  now = new Date(),
): string {
  return createDownloadFileName(
    'base64-image',
    getBase64ImageExtension(format),
    now,
  )
}

/** 下载 Data URL 或纯 Base64 文本。 */
export function downloadBase64ImageText(
  value: Base64ImageValue,
  representation: Base64ImageTextRepresentation,
): ToolResult<string> {
  const content = representation === 'data-url' ? value.dataUrl : value.base64
  const downloadResult = downloadText(
    content,
    createBase64ImageTextDownloadFileName(representation),
  )

  return downloadResult.ok
    ? success(downloadResult.message)
    : failure('operation-failed', downloadResult.message)
}

/** 下载解码后的原始图片 Blob。 */
export function downloadBase64Image(
  value: DecodedBase64ImageValue,
): ToolResult<string> {
  const downloadResult = downloadBlob(
    value.blob,
    createBase64ImageDownloadFileName(value.format),
    '图片文件已开始下载。',
  )

  return downloadResult.ok
    ? success(downloadResult.message)
    : failure('operation-failed', downloadResult.message)
}
