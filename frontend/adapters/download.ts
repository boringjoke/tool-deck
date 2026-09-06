import type { ClipboardOperationResult } from './clipboard'

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
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.URL.revokeObjectURL(url)

    return {
      ok: true,
      message: '文本文件已开始下载。',
    }
  } catch {
    return {
      ok: false,
      message: '下载失败，请检查浏览器下载权限。',
    }
  }
}
