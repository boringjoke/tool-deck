import {
  detectBase64ImageFormat,
  isBase64ImageMimeMatchingFormat,
  normalizeBase64ImageMimeType,
} from '../core/base64-image'
import { failure, success, type ToolResult } from '../core/tool-result'
import {
  ASCII_ART_MAX_FILE_BYTES,
  calculateAsciiArtGrid,
  getAsciiArtMimeType,
  isAsciiArtFormat,
  normalizeAsciiArtColumns,
  renderAsciiArt,
  validateAsciiArtSource,
  type AsciiArtColumns,
  type AsciiArtFormat,
  type AsciiArtRenderResult,
} from '../core/ascii-art'
import { createDownloadFileName, downloadText } from './download'

export interface AsciiArtSource extends AsciiArtSourceInfo {
  fileName: string
  mimeType: string
}

export interface AsciiArtResult extends AsciiArtRenderResult {
  source: AsciiArtSource
  downloadFileName: string
}

interface AsciiArtSourceInfo {
  format: AsciiArtFormat
  width: number
  height: number
  byteLength: number
}

interface LoadedAsciiArtFile {
  source: AsciiArtSource
  image: HTMLImageElement
  objectUrl: string
}

/** 将 Uint8Array 的有效范围复制为可安全放入 Blob 的 ArrayBuffer。 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** 检查当前环境是否具备 ASCII 画所需的图片和对象 URL 能力。 */
function hasAsciiArtBrowserSupport(): boolean {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof Blob !== 'undefined'
    && typeof window.URL?.createObjectURL === 'function'
    && typeof window.URL?.revokeObjectURL === 'function'
}

/** 读取本地图片字节并检查首版文件大小限制。 */
async function readAsciiArtBytes(
  file: File,
): Promise<ToolResult<Uint8Array>> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return failure('operation-failed', '当前浏览器不支持读取图片文件。')
  }

  if (file.size > ASCII_ART_MAX_FILE_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的图片。')
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > ASCII_ART_MAX_FILE_BYTES) {
      return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的图片。')
    }

    return success(bytes)
  } catch {
    return failure('operation-failed', '图片文件读取失败，请重新选择文件。')
  }
}

/** 根据图片签名和声明 MIME 检查首版支持格式。 */
function detectAsciiArtFormat(
  bytes: Uint8Array,
  declaredMimeType: string,
): ToolResult<AsciiArtFormat> {
  const detected = detectBase64ImageFormat(bytes)
  if (!detected.ok) {
    return failure('unsupported-input', '无法识别图片格式，仅支持 PNG、JPEG 和 WebP。')
  }

  if (detected.value === 'gif' || !isAsciiArtFormat(detected.value)) {
    return failure('unsupported-input', '暂不支持 GIF 或其他图片格式，请选择 PNG、JPEG 或 WebP。')
  }

  if (declaredMimeType) {
    const normalizedMimeType = normalizeBase64ImageMimeType(declaredMimeType)
    if (
      !normalizedMimeType
      || !isBase64ImageMimeMatchingFormat(normalizedMimeType, detected.value)
    ) {
      return failure('unsupported-input', '图片 MIME 类型与文件内容不匹配，无法安全处理。')
    }
  }

  return success(detected.value)
}

/** 创建本地图片对象 URL。 */
function createAsciiArtObjectUrl(blob: Blob): ToolResult<string> {
  if (!hasAsciiArtBrowserSupport()) {
    return failure('operation-failed', '当前浏览器不支持图片预览或处理。')
  }

  try {
    return success(window.URL.createObjectURL(blob))
  } catch {
    return failure('operation-failed', '图片预览创建失败，请检查浏览器图片能力。')
  }
}

/** 释放 ASCII 画适配器创建的对象 URL。 */
export function revokeAsciiArtObjectUrl(objectUrl: string): void {
  if (
    typeof window === 'undefined'
    || typeof window.URL?.revokeObjectURL !== 'function'
  ) {
    return
  }

  try {
    window.URL.revokeObjectURL(objectUrl)
  } catch {
    // 对象 URL 已经失效时无需再次向页面抛出错误。
  }
}

/** 使用对象 URL 解码图片并读取自然尺寸。 */
function decodeAsciiArtImage(
  objectUrl: string,
): Promise<ToolResult<{ image: HTMLImageElement; width: number; height: number }>> {
  if (
    typeof document === 'undefined'
    || typeof document.createElement !== 'function'
  ) {
    return Promise.resolve(failure('operation-failed', '当前环境不支持图片解码。'))
  }

  return new Promise((resolve) => {
    let settled = false
    const image = document.createElement('img')
    const finish = (
      result: ToolResult<{ image: HTMLImageElement; width: number; height: number }>,
    ) => {
      if (settled) {
        return
      }

      settled = true
      image.onload = null
      image.onerror = null
      resolve(result)
    }

    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        finish(failure('unsupported-input', '浏览器无法读取图片尺寸，请更换图片后重试。'))
        return
      }

      finish(success({ image, width, height }))
    }
    image.onerror = () => {
      finish(failure('unsupported-input', '浏览器无法解码这张图片，请更换图片后重试。'))
    }

    try {
      image.decoding = 'async'
      image.src = objectUrl
    } catch {
      finish(failure('operation-failed', '图片加载失败，请重新选择文件。'))
    }
  })
}

/** 读取、识别并解码一张本地图片，供预览检查和生成复用。 */
async function loadAsciiArtFile(
  file: File,
): Promise<ToolResult<LoadedAsciiArtFile>> {
  const bytesResult = await readAsciiArtBytes(file)
  if (!bytesResult.ok) {
    return bytesResult
  }

  const formatResult = detectAsciiArtFormat(bytesResult.value, file.type)
  if (!formatResult.ok) {
    return formatResult
  }

  if (!hasAsciiArtBrowserSupport()) {
    return failure('operation-failed', '当前浏览器不支持图片预览或处理。')
  }

  const format = formatResult.value
  const mimeType = getAsciiArtMimeType(format)
  let sourceBlob: Blob
  try {
    sourceBlob = new Blob([toArrayBuffer(bytesResult.value)], { type: mimeType })
  } catch {
    return failure('operation-failed', '图片预览创建失败，请检查浏览器图片能力。')
  }

  const objectUrl = createAsciiArtObjectUrl(sourceBlob)
  if (!objectUrl.ok) {
    return objectUrl
  }

  const decoded = await decodeAsciiArtImage(objectUrl.value)
  if (!decoded.ok) {
    revokeAsciiArtObjectUrl(objectUrl.value)
    return decoded
  }

  const sourceValidation = validateAsciiArtSource({
    format,
    width: decoded.value.width,
    height: decoded.value.height,
    byteLength: bytesResult.value.byteLength,
  })
  if (!sourceValidation.ok) {
    revokeAsciiArtObjectUrl(objectUrl.value)
    return sourceValidation
  }

  return success({
    source: {
      fileName: file.name,
      format,
      mimeType,
      byteLength: bytesResult.value.byteLength,
      width: decoded.value.width,
      height: decoded.value.height,
    },
    image: decoded.value.image,
    objectUrl: objectUrl.value,
  })
}

/** 读取本地图片并返回文件名、格式和尺寸信息。 */
export async function readAsciiArtFile(
  file: File,
): Promise<ToolResult<AsciiArtSource>> {
  const loaded = await loadAsciiArtFile(file)
  if (!loaded.ok) {
    return loaded
  }

  revokeAsciiArtObjectUrl(loaded.value.objectUrl)
  return success(loaded.value.source)
}

/** 将一张本地图片缩放到字符网格并生成 ASCII 画文本。 */
export async function processAsciiArt(
  file: File,
  columns: AsciiArtColumns,
): Promise<ToolResult<AsciiArtResult>> {
  const normalizedColumns = normalizeAsciiArtColumns(columns)
  if (!normalizedColumns.ok) {
    return normalizedColumns
  }

  const loaded = await loadAsciiArtFile(file)
  if (!loaded.ok) {
    return loaded
  }

  try {
    const grid = calculateAsciiArtGrid(
      loaded.value.source.width,
      loaded.value.source.height,
      normalizedColumns.value,
    )
    if (!grid.ok) {
      return grid
    }

    if (
      typeof document === 'undefined'
      || typeof document.createElement !== 'function'
    ) {
      return failure('operation-failed', '当前环境不支持图片像素采样。')
    }

    const canvas = document.createElement('canvas')
    canvas.width = grid.value.columns
    canvas.height = grid.value.rows
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return failure('operation-failed', '当前浏览器不支持读取图片像素。')
    }

    try {
      context.imageSmoothingEnabled = true
      context.drawImage(
        loaded.value.image,
        0,
        0,
        grid.value.columns,
        grid.value.rows,
      )
      const pixels = context.getImageData(
        0,
        0,
        grid.value.columns,
        grid.value.rows,
      ).data
      const rendered = renderAsciiArt(
        pixels,
        grid.value.columns,
        grid.value.rows,
      )
      if (!rendered.ok) {
        return rendered
      }

      return success({
        source: loaded.value.source,
        text: rendered.value.text,
        columns: rendered.value.columns,
        rows: rendered.value.rows,
        cellCount: rendered.value.cellCount,
        downloadFileName: createDownloadFileName('ascii-art', 'txt'),
      })
    } catch {
      return failure('operation-failed', '图片像素读取失败，请更换图片或重试。')
    }
  } finally {
    revokeAsciiArtObjectUrl(loaded.value.objectUrl)
  }
}

/** 下载当前 ASCII 画文本结果。 */
export function downloadAsciiArt(result: AsciiArtResult) {
  return downloadText(result.text, result.downloadFileName)
}
