import type { ClipboardOperationResult } from './clipboard'

/** 根据工具标识和文件扩展名生成下载文件名。 */
export function createDownloadFileName(
  slug: string,
  extension: string,
  now = new Date(),
): string {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value) => String(value).padStart(2, '0'))
    .join('')

  return `${slug}-${date}.${extension.replace(/^\./u, '')}`
}

/** 将文本内容转换为文件并触发浏览器下载。 */
export function downloadText(
  content: string,
  fileName: string,
): ClipboardOperationResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      ok: false,
      message: '当前环境不支持文件下载。',
    }
  }

  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    return downloadBlob(blob, fileName, '文本文件已开始下载。')
  } catch {
    return {
      ok: false,
      message: '下载失败，请检查浏览器下载权限。',
    }
  }
}

/** 将 Blob 内容转换为文件并触发浏览器下载。 */
export function downloadBlob(
  blob: Blob,
  fileName: string,
  successMessage = '文件已开始下载。',
): ClipboardOperationResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      ok: false,
      message: '当前环境不支持文件下载。',
    }
  }

  try {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.URL.revokeObjectURL(url)

    return {
      ok: true,
      message: successMessage,
    }
  } catch {
    return {
      ok: false,
      message: '下载失败，请检查浏览器下载权限。',
    }
  }
}
