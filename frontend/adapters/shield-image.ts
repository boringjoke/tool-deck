import type { ClipboardOperationResult } from './clipboard'
import { downloadBlob } from './download'

export type ShieldExportFormat = 'svg' | 'png'

/** 生成 Shield 导出文件名，避免将用户输入写入本地文件名。 */
export function createShieldDownloadFileName(
  format: ShieldExportFormat,
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

  return `shield-image-${timestamp}.${format}`
}

/** 将 Shield SVG 内容作为图片文件下载。 */
export function downloadShieldSvg(
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

/** 将 Shield SVG 在浏览器本地渲染为 PNG 并触发文件下载。 */
export async function downloadShieldPng(
  svg: string,
  width: number,
  height: number,
  fileName: string,
): Promise<ClipboardOperationResult> {
  const blob = await renderShieldPngBlob(svg, width, height)

  if (!blob) {
    return {
      ok: false,
      message: 'PNG 导出失败，请检查浏览器图片或下载权限。',
    }
  }

  return downloadBlob(blob, fileName, 'PNG 文件已开始下载。')
}

/** 使用浏览器图片和 Canvas 能力将 Shield SVG 转为 PNG Blob。 */
function renderShieldPngBlob(
  svg: string,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof Blob === 'undefined'
  ) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let objectUrl = ''
    const image = document.createElement('img')

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')

        if (!context) {
          cleanup()
          resolve(null)
          return
        }

        context.drawImage(image, 0, 0, width, height)
        canvas.toBlob((blob) => {
          cleanup()
          resolve(blob)
        }, 'image/png')
      } catch {
        cleanup()
        resolve(null)
      }
    }

    image.onerror = () => {
      cleanup()
      resolve(null)
    }

    try {
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      objectUrl = window.URL.createObjectURL(svgBlob)
      image.decoding = 'async'
      image.src = objectUrl
    } catch {
      cleanup()
      resolve(null)
    }
  })
}
