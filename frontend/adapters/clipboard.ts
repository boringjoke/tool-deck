export interface ClipboardOperationResult {
  ok: boolean
  message: string
}

/** 将文本复制到系统剪贴板，并返回复制结果。 */
export async function copyText(value: string): Promise<ClipboardOperationResult> {
  if (!value) {
    return {
      ok: false,
      message: '没有可复制的内容。',
    }
  }

  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return {
      ok: false,
      message: '当前浏览器不支持自动复制，请手动选择结果文本复制。',
    }
  }

  try {
    await navigator.clipboard.writeText(value)
    return {
      ok: true,
      message: '已复制到剪贴板。',
    }
  } catch {
    return {
      ok: false,
      message: '复制失败，请检查浏览器权限后重试，或手动选择结果文本复制。',
    }
  }
}
