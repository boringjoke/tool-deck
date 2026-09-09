import QRCode from 'qrcode'
import type { ClipboardOperationResult } from './clipboard'
import { downloadBlob } from './download'
import {
  QR_CODE_ERROR_CORRECTION_LEVEL,
  QR_CODE_MARGIN,
  type QrCodeExportFormat,
  type QrCodeSize,
} from '~/core/qr-code'

/** 生成二维码导出文件名，避免将用户输入写入本地文件名。 */
export function createQrCodeDownloadFileName(
  format: QrCodeExportFormat,
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

  return `qr-code-${timestamp}.${format}`
}

/** 将二维码 SVG 内容作为图片文件下载。 */
export function downloadQrCodeSvg(
  svg: string,
  fileName: string,
): ClipboardOperationResult {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  return downloadBlob(blob, fileName, 'SVG 文件已开始下载。')
}

/** 将二维码内容渲染为 PNG 并触发浏览器本地下载。 */
export async function downloadQrCodePng(
  content: string,
  size: QrCodeSize,
  fileName: string,
): Promise<ClipboardOperationResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      ok: false,
      message: '当前环境不支持图片下载。',
    }
  }

  try {
    const dataUrl = await QRCode.toDataURL(content, {
      type: 'image/png',
      errorCorrectionLevel: QR_CODE_ERROR_CORRECTION_LEVEL,
      margin: QR_CODE_MARGIN,
      width: size,
      color: {
        dark: '#000000ff',
        light: '#ffffffff',
      },
    })
    const blob = decodePngDataUrl(dataUrl)

    if (!blob) {
      return {
        ok: false,
        message: 'PNG 导出失败，请重试。',
      }
    }

    return downloadBlob(blob, fileName, 'PNG 文件已开始下载。')
  } catch {
    return {
      ok: false,
      message: 'PNG 导出失败，请检查浏览器下载权限。',
    }
  }
}

/** 将二维码库生成的 PNG data URL 转换为浏览器 Blob。 */
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
