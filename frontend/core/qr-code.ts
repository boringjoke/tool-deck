import QRCode from 'qrcode'
import { failure, success, type ToolError, type ToolResult } from './tool-result'

export const QR_CODE_MAX_BYTES = 2048
export const QR_CODE_MARGIN = 4
export const QR_CODE_ERROR_CORRECTION_LEVEL = 'M' as const
export const QR_CODE_SIZES = [256, 512, 1024] as const
export const DEFAULT_QR_CODE_SIZE = 512

export type QrCodeSize = typeof QR_CODE_SIZES[number]
export type QrCodeExportFormat = 'png' | 'svg'

export interface QrCodeOptions {
  size?: QrCodeSize
}

export interface QrCodeValue {
  content: string
  byteLength: number
  size: QrCodeSize
  moduleCount: number
  version: number
  svg: string
}

/** 计算文本按 UTF-8 编码后的字节数。 */
export function getQrCodeUtf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).length
}

/** 判断一个值是否为二维码工具支持的导出尺寸。 */
export function isQrCodeSize(value: unknown): value is QrCodeSize {
  return typeof value === 'number'
    && Number.isInteger(value)
    && (QR_CODE_SIZES as readonly number[]).includes(value)
}

/** 将二维码生成器异常转换为项目统一的结构化错误。 */
export function mapQrCodeGenerationError(error: unknown): ToolError {
  const message = error instanceof Error ? error.message : String(error)

  if (/too big|fit in a qr code|amount of data/i.test(message)) {
    return {
      code: 'out-of-range',
      message: '输入内容超过二维码容量，请减少内容后重试。',
    }
  }

  if (/cannot be encoded|invalid|unsupported/i.test(message)) {
    return {
      code: 'unsupported-input',
      message: '当前内容无法编码为二维码，请修改内容后重试。',
    }
  }

  return {
    code: 'operation-failed',
    message: '二维码生成失败，请稍后重试。',
  }
}

/** 校验二维码导出尺寸并返回规范化后的尺寸。 */
function resolveQrCodeSize(size: unknown): ToolResult<QrCodeSize> {
  if (typeof size !== 'number' || !Number.isFinite(size) || !Number.isInteger(size)) {
    return failure('invalid-input', '导出尺寸必须是整数。')
  }

  if (!isQrCodeSize(size)) {
    return failure('out-of-range', '导出尺寸只能选择 256、512 或 1024 像素。')
  }

  return success(size)
}

/** 在浏览器本地生成二维码 SVG 预览及其元数据。 */
export async function generateQrCode(
  content: string,
  options: QrCodeOptions = {},
): Promise<ToolResult<QrCodeValue>> {
  if (typeof content !== 'string') {
    return failure('invalid-input', '二维码内容必须是文本。')
  }

  if (!content.trim()) {
    return failure('empty-input', '请输入需要编码的文本或 URL。')
  }

  const byteLength = getQrCodeUtf8ByteLength(content)

  if (byteLength > QR_CODE_MAX_BYTES) {
    return failure('out-of-range', `输入内容不能超过 ${QR_CODE_MAX_BYTES} 个 UTF-8 字节。`)
  }

  const sizeResult = resolveQrCodeSize(options.size ?? DEFAULT_QR_CODE_SIZE)

  if (!sizeResult.ok) {
    return sizeResult
  }

  try {
    const generated = QRCode.create(content, {
      errorCorrectionLevel: QR_CODE_ERROR_CORRECTION_LEVEL,
    })
    const svg = await QRCode.toString(content, {
      type: 'svg',
      errorCorrectionLevel: QR_CODE_ERROR_CORRECTION_LEVEL,
      margin: QR_CODE_MARGIN,
      width: sizeResult.value,
    })

    return success({
      content,
      byteLength,
      size: sizeResult.value,
      moduleCount: generated.modules.size,
      version: generated.version,
      svg,
    })
  } catch (error) {
    return {
      ok: false,
      error: mapQrCodeGenerationError(error),
    }
  }
}
