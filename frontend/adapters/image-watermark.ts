import {
  detectBase64ImageFormat,
  isBase64ImageMimeMatchingFormat,
  normalizeBase64ImageMimeType,
} from '../core/base64-image'
import { failure, success, type ToolResult } from '../core/tool-result'
import {
  calculateImageWatermarkPlacement,
  getImageWatermarkExtension,
  getImageWatermarkFontSize,
  getImageWatermarkFormatFromMimeType,
  getImageWatermarkMimeType,
  getImageWatermarkMargin,
  IMAGE_WATERMARK_JPEG_QUALITY,
  IMAGE_WATERMARK_MAX_FILE_BYTES,
  IMAGE_WATERMARK_WEBP_QUALITY,
  normalizeImageWatermarkOptions,
  parseImageWatermarkColor,
  type ImageWatermarkFormat,
  type ImageWatermarkOptions,
  type NormalizedImageWatermarkOptions,
  validateImageWatermarkSource,
} from '../core/image-watermark'
import { createDownloadFileName, downloadBlob } from './download'

export interface ImageWatermarkSource {
  fileName: string
  format: ImageWatermarkFormat
  mimeType: string
  byteLength: number
  width: number
  height: number
  previewSource: string
}

export interface ImageWatermarkResult {
  source: ImageWatermarkSource
  format: ImageWatermarkFormat
  mimeType: string
  width: number
  height: number
  text: string
  position: NormalizedImageWatermarkOptions['position']
  size: NormalizedImageWatermarkOptions['size']
  color: string
  opacity: number
  fontSize: number
  outputByteLength: number
  blob: Blob
  previewSource: string
  downloadFileName: string
}

interface LoadedImageWatermarkFile {
  source: ImageWatermarkSource
  image: HTMLImageElement
}

/** 将 Uint8Array 的有效范围复制为可安全放入 Blob 的 ArrayBuffer。 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** 检查当前环境是否具备本工具所需的图片和对象 URL 能力。 */
function hasImageBrowserSupport(): boolean {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof Blob !== 'undefined'
    && typeof window.URL?.createObjectURL === 'function'
}

/** 读取文件字节并检查文件大小。 */
async function readImageWatermarkBytes(
  file: File,
): Promise<ToolResult<Uint8Array>> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return failure('operation-failed', '当前浏览器不支持读取图片文件。')
  }

  if (file.size > IMAGE_WATERMARK_MAX_FILE_BYTES) {
    return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > IMAGE_WATERMARK_MAX_FILE_BYTES) {
      return failure('out-of-range', '图片文件超过 10 MiB 大小限制，请选择更小的文件。')
    }

    return success(bytes)
  } catch {
    return failure('operation-failed', '图片文件读取失败，请重新选择文件。')
  }
}

/** 根据文件字节和声明 MIME 检查首版支持格式。 */
function detectImageWatermarkFormat(
  bytes: Uint8Array,
  declaredMimeType: string,
): ToolResult<ImageWatermarkFormat> {
  const detected = detectBase64ImageFormat(bytes)
  if (!detected.ok) {
    return failure('unsupported-input', '无法识别图片格式，仅支持 PNG、JPEG 和 WebP。')
  }

  if (detected.value === 'gif') {
    return failure('unsupported-input', '暂不支持 GIF 图片，请选择 PNG、JPEG 或 WebP。')
  }

  if (declaredMimeType) {
    const normalizedMimeType = normalizeBase64ImageMimeType(declaredMimeType)
    if (!normalizedMimeType || !isBase64ImageMimeMatchingFormat(normalizedMimeType, detected.value)) {
      return failure('unsupported-input', '图片 MIME 类型与文件内容不匹配，无法安全处理。')
    }
  }

  const format = getImageWatermarkFormatFromMimeType(getImageWatermarkMimeType(detected.value))
  return format
    ? success(format)
    : failure('unsupported-input', '仅支持 PNG、JPEG 和 WebP 图片。')
}

/** 创建本地对象 URL，并把 Blob 创建失败统一转换为工具错误。 */
function createObjectUrl(blob: Blob): ToolResult<string> {
  if (!hasImageBrowserSupport()) {
    return failure('operation-failed', '当前浏览器不支持图片预览或导出。')
  }

  try {
    return success(window.URL.createObjectURL(blob))
  } catch {
    return failure('operation-failed', '图片预览创建失败，请检查浏览器图片能力。')
  }
}

/** 使用本地对象 URL 解码图片并读取自然尺寸。 */
function decodeImageObjectUrl(
  objectUrl: string,
): Promise<ToolResult<{ image: HTMLImageElement; width: number; height: number }>> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve(failure('operation-failed', '当前环境不支持图片解码。'))
  }

  return new Promise((resolve) => {
    let settled = false
    const image = document.createElement('img')
    const finish = (result: ToolResult<{ image: HTMLImageElement; width: number; height: number }>) => {
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

/** 读取、识别并解码一张本地图片，供预览和 Canvas 处理复用。 */
async function loadImageWatermarkFile(
  file: File,
): Promise<ToolResult<LoadedImageWatermarkFile>> {
  const bytesResult = await readImageWatermarkBytes(file)
  if (!bytesResult.ok) {
    return bytesResult
  }

  const formatResult = detectImageWatermarkFormat(bytesResult.value, file.type)
  if (!formatResult.ok) {
    return formatResult
  }

  if (!hasImageBrowserSupport()) {
    return failure('operation-failed', '当前浏览器不支持图片预览或导出。')
  }

  const format = formatResult.value
  const mimeType = getImageWatermarkMimeType(format)
  let sourceBlob: Blob
  try {
    sourceBlob = new Blob([toArrayBuffer(bytesResult.value)], { type: mimeType })
  } catch {
    return failure('operation-failed', '图片预览创建失败，请检查浏览器图片能力。')
  }
  const sourceUrl = createObjectUrl(sourceBlob)
  if (!sourceUrl.ok) {
    return sourceUrl
  }

  const decoded = await decodeImageObjectUrl(sourceUrl.value)
  if (!decoded.ok) {
    revokeImageWatermarkObjectUrl(sourceUrl.value)
    return decoded
  }

  const validated = validateImageWatermarkSource({
    format,
    width: decoded.value.width,
    height: decoded.value.height,
    byteLength: bytesResult.value.byteLength,
  })
  if (!validated.ok) {
    revokeImageWatermarkObjectUrl(sourceUrl.value)
    return validated
  }

  return success({
    source: {
      fileName: file.name,
      format,
      mimeType,
      byteLength: bytesResult.value.byteLength,
      width: decoded.value.width,
      height: decoded.value.height,
      previewSource: sourceUrl.value,
    },
    image: decoded.value.image,
  })
}

/** 读取本地图片并生成用于原图预览的元数据。 */
export async function readImageWatermarkFile(
  file: File,
): Promise<ToolResult<ImageWatermarkSource>> {
  const loaded = await loadImageWatermarkFile(file)
  return loaded.ok ? success(loaded.value.source) : loaded
}

/** 获取 Canvas 导出所需的固定编码质量。 */
function getOutputQuality(format: ImageWatermarkFormat): number | undefined {
  if (format === 'jpeg') {
    return IMAGE_WATERMARK_JPEG_QUALITY
  }

  if (format === 'webp') {
    return IMAGE_WATERMARK_WEBP_QUALITY
  }

  return undefined
}

/** 将规范化颜色和透明度转换为 Canvas rgba 字符串。 */
function getFillColor(color: string, opacity: number): string {
  const parsed = parseImageWatermarkColor(color)
  return `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${opacity})`
}

/** 在 Canvas 上绘制原图和单条文本水印。 */
function renderImageWatermarkCanvas(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: NormalizedImageWatermarkOptions,
  format: ImageWatermarkFormat,
): Promise<ToolResult<Blob>> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.resolve(failure('operation-failed', '当前环境不支持 Canvas 图片处理。'))
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
  } catch {
    return Promise.resolve(failure('operation-failed', 'Canvas 初始化失败，请重试。'))
  }

  const context = canvas.getContext('2d')
  if (!context) {
    return Promise.resolve(failure('operation-failed', '当前浏览器无法创建 Canvas 画布。'))
  }

  const fontSize = getImageWatermarkFontSize(width, height, options.size)
  const placement = calculateImageWatermarkPlacement(
    width,
    height,
    fontSize,
    options.position,
  )
  const color = getFillColor(options.color, options.opacity)

  try {
    context.drawImage(image, 0, 0, width, height)
    context.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`
    context.textAlign = placement.textAlign
    context.textBaseline = placement.textBaseline
    context.fillStyle = color
    context.shadowColor = `rgba(0, 0, 0, ${Math.min(options.opacity * 0.55, 0.35)})`
    context.shadowBlur = Math.max(1, Math.round(fontSize * 0.16))
    context.shadowOffsetX = 1
    context.shadowOffsetY = 1
    context.fillText(options.text, placement.x, placement.y)
  } catch {
    return Promise.resolve(failure('operation-failed', 'Canvas 水印绘制失败，请更换图片后重试。'))
  }

  if (typeof canvas.toBlob !== 'function') {
    return Promise.resolve(failure('operation-failed', '当前浏览器不支持图片导出。'))
  }

  const outputMimeType = getImageWatermarkMimeType(format)
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(failure('operation-failed', '图片编码失败，请重试。'))
            return
          }

          if (blob.type && blob.type.toLowerCase() !== outputMimeType) {
            resolve(failure('operation-failed', '当前浏览器无法按原格式导出图片。'))
            return
          }

          resolve(success(blob))
        },
        outputMimeType,
        getOutputQuality(format),
      )
    } catch {
      resolve(failure('operation-failed', '图片编码失败，请重试。'))
    }
  })
}

/** 将本地图片叠加文本水印并生成可预览、可下载的 Blob。 */
export async function processImageWatermark(
  file: File,
  options: ImageWatermarkOptions,
): Promise<ToolResult<ImageWatermarkResult>> {
  const normalized = normalizeImageWatermarkOptions(options)
  if (!normalized.ok) {
    return normalized
  }

  const loaded = await loadImageWatermarkFile(file)
  if (!loaded.ok) {
    return loaded
  }

  const format = loaded.value.source.format
  const rendered = await renderImageWatermarkCanvas(
    loaded.value.image,
    loaded.value.source.width,
    loaded.value.source.height,
    normalized.value,
    format,
  )
  if (!rendered.ok) {
    revokeImageWatermarkObjectUrl(loaded.value.source.previewSource)
    return rendered
  }

  const preview = createObjectUrl(rendered.value)
  if (!preview.ok) {
    revokeImageWatermarkObjectUrl(loaded.value.source.previewSource)
    return preview
  }

  const fontSize = getImageWatermarkFontSize(
    loaded.value.source.width,
    loaded.value.source.height,
    normalized.value.size,
  )

  return success({
    source: loaded.value.source,
    format,
    mimeType: getImageWatermarkMimeType(format),
    width: loaded.value.source.width,
    height: loaded.value.source.height,
    text: normalized.value.text,
    position: normalized.value.position,
    size: normalized.value.size,
    color: normalized.value.color,
    opacity: normalized.value.opacity,
    fontSize,
    outputByteLength: rendered.value.size,
    blob: rendered.value,
    previewSource: preview.value,
    downloadFileName: createImageWatermarkDownloadFileName(format),
  })
}

/** 生成图片加水印下载文件名。 */
export function createImageWatermarkDownloadFileName(
  format: ImageWatermarkFormat,
  now = new Date(),
): string {
  return createDownloadFileName(
    'watermarked-image',
    getImageWatermarkExtension(format),
    now,
  )
}

/** 下载已经生成的图片加水印结果。 */
export function downloadImageWatermark(
  result: ImageWatermarkResult,
): ToolResult<string> {
  const downloaded = downloadBlob(
    result.blob,
    result.downloadFileName,
    '加水印图片已开始下载。',
  )

  return downloaded.ok
    ? success(downloaded.message)
    : failure('operation-failed', downloaded.message)
}

/** 释放图片加水印使用的本地对象 URL。 */
export function revokeImageWatermarkObjectUrl(url: string): void {
  if (
    !url
    || typeof window === 'undefined'
    || typeof window.URL?.revokeObjectURL !== 'function'
  ) {
    return
  }

  window.URL.revokeObjectURL(url)
}

/** 返回当前格式对应的 Canvas 导出质量，供定向测试确认固定参数。 */
export function getImageWatermarkOutputQuality(
  format: ImageWatermarkFormat,
): number | undefined {
  return getOutputQuality(format)
}

/** 返回当前图片短边对应的固定水印边距，供页面摘要和测试使用。 */
export function getImageWatermarkDisplayMargin(width: number, height: number): number {
  return getImageWatermarkMargin(width, height)
}
