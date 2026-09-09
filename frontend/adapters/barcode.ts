import JsBarcode from 'jsbarcode'
import type { ClipboardOperationResult } from './clipboard'
import { downloadBlob } from './download'
import {
  mapBarcodeGenerationError,
  type BarcodeFormat,
  type BarcodeValue,
} from '~/core/barcode'
import { failure, success, type ToolResult } from '~/core/tool-result'

export type BarcodeExportFormat = 'svg' | 'png'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/**
 * 生成条形码导出文件名，避免将用户输入写入本地文件名。
 *
 * @param format 导出文件格式
 * @param now 用于生成时间戳的时间，便于测试时传入固定时间
 * @returns 条形码导出文件名
 */
export function createBarcodeDownloadFileName(
  format: BarcodeExportFormat,
  now = new Date(),
): string {
  const timestamp = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join('')
    + '-'
    + [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((value) => String(value).padStart(2, '0'))
      .join('')

  return `barcode-${timestamp}.${format}`
}

/**
 * 创建条形码渲染器的固定样式选项。
 *
 * @param format 条形码码制
 * @returns 供 JsBarcode 使用的渲染选项
 */
function createBarcodeRenderOptions(format: BarcodeFormat) {
  return {
    format,
    width: 2,
    height: 100,
    displayValue: true,
    background: '#ffffff',
    lineColor: '#000000',
    margin: 10,
  }
}

/**
 * 在浏览器中将规范化条形码值渲染为 SVG 字符串。
 *
 * @param value 已完成输入校验的条形码值
 * @returns SVG 字符串或统一渲染错误
 */
export function renderBarcodeSvg(value: BarcodeValue): ToolResult<string> {
  if (typeof document === 'undefined' || typeof XMLSerializer === 'undefined') {
    return failure('operation-failed', '当前环境不支持条形码预览。')
  }

  try {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
    JsBarcode(svg, value.encodedValue, createBarcodeRenderOptions(value.format))
    const svgText = new XMLSerializer().serializeToString(svg)

    if (!svgText.includes('<svg')) {
      return failure('operation-failed', '条形码预览生成失败，请稍后重试。')
    }

    return success(svgText)
  } catch (error) {
    const mappedError = mapBarcodeGenerationError(error)
    return failure(
      mappedError.code,
      mappedError.message,
    )
  }
}

/**
 * 将 SVG 文本编码为可直接用于图片预览的 data URL。
 *
 * @param svg SVG 文本
 * @returns SVG 图片 data URL
 */
export function createBarcodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * 在浏览器中将规范化条形码值渲染为 PNG data URL。
 *
 * @param value 已完成输入校验的条形码值
 * @returns PNG data URL 或统一渲染错误
 */
function renderBarcodePngDataUrl(value: BarcodeValue): ToolResult<string> {
  if (typeof document === 'undefined') {
    return failure('operation-failed', '当前环境不支持 PNG 导出。')
  }

  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, value.encodedValue, createBarcodeRenderOptions(value.format))
    return success(canvas.toDataURL('image/png'))
  } catch (error) {
    const mappedError = mapBarcodeGenerationError(error)
    return failure(
      mappedError.code,
      mappedError.message,
    )
  }
}

/**
 * 将条形码 SVG 内容作为图片文件下载。
 *
 * @param svg 已渲染的 SVG 内容
 * @param fileName 下载文件名
 * @returns 下载操作结果
 */
export function downloadBarcodeSvg(
  svg: string,
  fileName: string,
): ClipboardOperationResult {
  try {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    return downloadBlob(blob, fileName, 'SVG 文件已开始下载。')
  } catch {
    return {
      ok: false,
      message: 'SVG 导出失败，请检查浏览器下载权限。',
    }
  }
}

/**
 * 将条形码渲染为 PNG 并触发浏览器本地下载。
 *
 * @param value 已完成输入校验的条形码值
 * @param fileName 下载文件名
 * @returns 下载操作结果
 */
export function downloadBarcodePng(
  value: BarcodeValue,
  fileName: string,
): ClipboardOperationResult {
  const dataUrlResult = renderBarcodePngDataUrl(value)

  if (!dataUrlResult.ok) {
    return {
      ok: false,
      message: dataUrlResult.error.message,
    }
  }

  const blob = decodePngDataUrl(dataUrlResult.value)
  if (!blob) {
    return {
      ok: false,
      message: 'PNG 导出失败，请重试。',
    }
  }

  return downloadBlob(blob, fileName, 'PNG 文件已开始下载。')
}

/**
 * 将 PNG data URL 转换为浏览器 Blob。
 *
 * @param dataUrl PNG data URL
 * @returns 解码后的 Blob，无法解码时返回 null
 */
function decodePngDataUrl(dataUrl: string): Blob | null {
  const separatorIndex = dataUrl.indexOf(',')

  if (separatorIndex < 0 || !dataUrl.startsWith('data:image/png;base64,')) {
    return null
  }

  try {
    const binary = window.atob(dataUrl.slice(separatorIndex + 1))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: 'image/png' })
  } catch {
    return null
  }
}
