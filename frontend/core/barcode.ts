import { failure, success, type ToolError, type ToolResult } from './tool-result'

/**
 * 条形码生成器支持的码制。
 */
export const BARCODE_FORMATS = ['CODE128', 'CODE39', 'EAN13', 'UPC'] as const

export type BarcodeFormat = (typeof BARCODE_FORMATS)[number]

/**
 * 条形码生成器的默认码制。
 */
export const DEFAULT_BARCODE_FORMAT: BarcodeFormat = 'CODE128'

/**
 * 条形码码制的中文展示名称。
 */
export const BARCODE_FORMAT_LABELS: Readonly<Record<BarcodeFormat, string>> = {
  CODE128: 'CODE128',
  CODE39: 'CODE39',
  EAN13: 'EAN-13',
  UPC: 'UPC-A',
}

const BARCODE_LENGTH_LIMITS: Partial<Record<BarcodeFormat, number>> = {
  CODE128: 80,
  CODE39: 40,
}

const CODE39_CHARACTERS = new Set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ .$/+%-'.split(''))

export interface BarcodeOptions {
  format?: BarcodeFormat
}

export interface BarcodeValue {
  content: string
  encodedValue: string
  format: BarcodeFormat
}

/**
 * 判断字符串是否只包含可见 ASCII 字符。
 *
 * @param content 待判断的字符串
 * @returns 字符串非空且每个字符位于 U+0020–U+007E 时返回 true
 */
function isVisibleAscii(content: string): boolean {
  return content.length > 0 && Array.from(content).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint >= 0x20 && codePoint <= 0x7e
  })
}

/**
 * 判断字符串是否只包含 ASCII 数字。
 *
 * @param content 待判断的字符串
 * @returns 字符串非空且每个字符均为 0–9 时返回 true
 */
function isAsciiDigits(content: string): boolean {
  return content.length > 0 && Array.from(content).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint >= 0x30 && codePoint <= 0x39
  })
}

/**
 * 判断字符串是否只包含确认的 CODE39 输入字符。
 *
 * @param content 待判断的字符串
 * @returns 字符串非空且每个字符均在 CODE39 输入字符集内时返回 true
 */
function isCode39Content(content: string): boolean {
  return content.length > 0 && Array.from(content).every((character) => CODE39_CHARACTERS.has(character))
}

/**
 * 判断未知值是否为条形码生成器支持的码制。
 *
 * @param value 待判断的未知值
 * @returns 值属于支持的码制时返回 true
 */
export function isBarcodeFormat(value: unknown): value is BarcodeFormat {
  return typeof value === 'string' && (BARCODE_FORMATS as readonly string[]).includes(value)
}

/**
 * 获取条形码码制的中文展示名称。
 *
 * @param format 已校验的条形码码制
 * @returns 码制展示名称
 */
export function getBarcodeFormatLabel(format: BarcodeFormat): string {
  return BARCODE_FORMAT_LABELS[format]
}

/**
 * 计算 EAN-13 前 12 位数字对应的校验位。
 *
 * @param body 由 12 位 ASCII 数字组成的 EAN-13 主体
 * @returns EAN-13 校验位
 */
function calculateEan13CheckDigit(body: string): string {
  let sum = 0

  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[index])
    sum += digit * (index % 2 === 0 ? 1 : 3)
  }

  return String((10 - (sum % 10)) % 10)
}

/**
 * 计算 UPC-A 前 11 位数字对应的校验位。
 *
 * @param body 由 11 位 ASCII 数字组成的 UPC-A 主体
 * @returns UPC-A 校验位
 */
function calculateUpcACheckDigit(body: string): string {
  let sum = 0

  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[index])
    sum += digit * (index % 2 === 0 ? 3 : 1)
  }

  return String((10 - (sum % 10)) % 10)
}

/**
 * 创建条形码输入校验失败结果。
 *
 * @param code 项目统一错误码
 * @param message 面向用户的中文错误信息
 * @returns 失败结果
 */
function barcodeFailure(code: ToolError['code'], message: string): ToolResult<BarcodeValue> {
  return failure(code, message)
}

/**
 * 校验并规范化数字型条形码输入。
 *
 * @param content 用户输入内容
 * @param format 数字型条形码码制
 * @returns 校验后的条形码值或失败结果
 */
function validateNumericBarcode(content: string, format: 'EAN13' | 'UPC'): ToolResult<BarcodeValue> {
  const expectedBodyLength = format === 'EAN13' ? 12 : 11
  const expectedFullLength = expectedBodyLength + 1

  if (!isAsciiDigits(content)) {
    return barcodeFailure('invalid-input', `${getBarcodeFormatLabel(format)} 仅支持 ASCII 数字。`)
  }

  if (content.length !== expectedBodyLength && content.length !== expectedFullLength) {
    const acceptedLengths = `${expectedBodyLength} 位主体或 ${expectedFullLength} 位完整编码`
    return barcodeFailure('invalid-input', `${getBarcodeFormatLabel(format)} 需要输入 ${acceptedLengths}。`)
  }

  const body = content.slice(0, expectedBodyLength)
  const checkDigit = format === 'EAN13'
    ? calculateEan13CheckDigit(body)
    : calculateUpcACheckDigit(body)
  const normalizedValue = `${body}${checkDigit}`

  if (content.length === expectedFullLength && content !== normalizedValue) {
    return barcodeFailure('invalid-input', `${getBarcodeFormatLabel(format)} 校验位不正确。`)
  }

  return success({
    content,
    encodedValue: normalizedValue,
    format,
  })
}

/**
 * 校验条形码输入，并生成供渲染器使用的规范化编码值。
 *
 * 该函数只处理本地字符串校验与校验位计算，不访问 DOM、网络或持久化能力。
 * 输入两端的空白只用于判断是否为空；文本型码制会保留原始空格，数字型码制不会接受空格或分隔符。
 *
 * @param content 用户输入的条形码内容
 * @param options 条形码码制选项
 * @returns 校验成功时返回规范化条形码值，失败时返回统一工具错误
 */
export function validateBarcodeInput(
  content: string,
  options: BarcodeOptions = {},
): ToolResult<BarcodeValue> {
  const format = options.format ?? DEFAULT_BARCODE_FORMAT

  if (typeof content !== 'string') {
    return barcodeFailure('invalid-input', '请输入条形码内容。')
  }

  if (!isBarcodeFormat(format)) {
    return barcodeFailure('invalid-input', '请选择受支持的条形码码制。')
  }

  if (!content.trim()) {
    return barcodeFailure('empty-input', '请输入条形码内容。')
  }

  const lengthLimit = BARCODE_LENGTH_LIMITS[format]
  if (lengthLimit !== undefined && content.length > lengthLimit) {
    return barcodeFailure(
      'out-of-range',
      `${getBarcodeFormatLabel(format)} 最多支持 ${lengthLimit} 个字符。`,
    )
  }

  if (format === 'CODE128') {
    if (!isVisibleAscii(content)) {
      return barcodeFailure('invalid-input', 'CODE128 仅支持可见 ASCII 字符（U+0020–U+007E）。')
    }

    return success({
      content,
      encodedValue: content,
      format,
    })
  }

  if (format === 'CODE39') {
    if (!isCode39Content(content)) {
      return barcodeFailure(
        'invalid-input',
        'CODE39 仅支持大写字母、数字、空格和 - . $ / + % 字符。',
      )
    }

    return success({
      content,
      encodedValue: content,
      format,
    })
  }

  if (format === 'EAN13' || format === 'UPC') {
    return validateNumericBarcode(content, format)
  }

  return barcodeFailure('unsupported-input', '当前码制暂不支持生成。')
}

/**
 * 将条形码渲染器的异常转换为项目统一错误语义。
 *
 * @param error 渲染器抛出的未知异常
 * @returns 面向用户的统一工具错误
 */
export function mapBarcodeGenerationError(error: unknown): ToolError {
  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('too long') || normalizedMessage.includes('too big')) {
    return {
      code: 'out-of-range',
      message: '输入内容超过当前码制的长度限制。',
    }
  }

  if (normalizedMessage.includes('unsupported') || normalizedMessage.includes('unknown format')) {
    return {
      code: 'unsupported-input',
      message: '当前码制暂不支持生成。',
    }
  }

  if (normalizedMessage.includes('valid') || normalizedMessage.includes('invalid')) {
    return {
      code: 'invalid-input',
      message: '当前内容无法生成该条形码，请检查输入。',
    }
  }

  return {
    code: 'operation-failed',
    message: '条形码生成失败，请稍后重试。',
  }
}
