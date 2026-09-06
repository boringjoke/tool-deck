import { failure, success, type ToolResult } from './tool-result'

export const MIN_BASE = 2
export const MAX_BASE = 36
export const MAX_INPUT_LENGTH = 1024

export interface BaseConversionOptions {
  value: string
  fromBase: number
  toBase: number
  uppercase: boolean
  addPrefix: boolean
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PREFIX_TO_BASE: Readonly<Record<string, number>> = {
  '0b': 2,
  '0o': 8,
  '0x': 16,
}
const BASE_TO_PREFIX: Readonly<Record<number, string>> = {
  2: '0b',
  8: '0o',
  16: '0x',
}

function validateBase(value: number, label: string): ToolResult<void> {
  if (!Number.isInteger(value) || value < MIN_BASE || value > MAX_BASE) {
    return failure('out-of-range', `${label}必须是 ${MIN_BASE}–${MAX_BASE} 之间的整数。`)
  }

  return success(undefined)
}

function getDigitValue(character: string): number {
  return DIGITS.indexOf(character.toUpperCase())
}

function parseInteger(value: string, fromBase: number): ToolResult<bigint> {
  let input = value
  let sign = 1n

  if (input.startsWith('+') || input.startsWith('-')) {
    if (input.startsWith('-')) {
      sign = -1n
    }
    input = input.slice(1)
  }

  const prefix = input.slice(0, 2).toLowerCase()

  if (prefix in PREFIX_TO_BASE) {
    if (PREFIX_TO_BASE[prefix] !== fromBase) {
      return failure(
        'invalid-input',
        `输入前缀 ${prefix} 与源进制不匹配，请选择 ${PREFIX_TO_BASE[prefix]} 进制或移除前缀。`,
      )
    }
    input = input.slice(2)
  }

  if (!input) {
    return failure('invalid-input', '请输入至少一个有效数字。')
  }

  let result = 0n

  for (let index = 0; index < input.length; index += 1) {
    const character = input.charAt(index)
    const digitValue = getDigitValue(character)

    if (digitValue < 0 || digitValue >= fromBase) {
      return failure(
        'invalid-input',
        `第 ${index + 1} 个字符“${character}”不是 ${fromBase} 进制的有效数字。`,
      )
    }

    result = result * BigInt(fromBase) + BigInt(digitValue)
  }

  return success(sign * result)
}

function formatInteger(value: bigint, toBase: number, uppercase: boolean, addPrefix: boolean): string {
  const isNegative = value < 0n
  let absolute = isNegative ? -value : value
  let digits = ''

  if (absolute === 0n) {
    digits = '0'
  } else {
    const base = BigInt(toBase)

    while (absolute > 0n) {
      digits = DIGITS.charAt(Number(absolute % base)) + digits
      absolute /= base
    }
  }

  if (!uppercase) {
    digits = digits.toLowerCase()
  }

  const prefix = addPrefix ? BASE_TO_PREFIX[toBase] ?? '' : ''
  return `${isNegative ? '-' : ''}${uppercase ? prefix.toUpperCase() : prefix}${digits}`
}

export function convertBase(options: BaseConversionOptions): ToolResult<string> {
  const fromBaseResult = validateBase(options.fromBase, '源进制')

  if (!fromBaseResult.ok) {
    return fromBaseResult
  }

  const toBaseResult = validateBase(options.toBase, '目标进制')

  if (!toBaseResult.ok) {
    return toBaseResult
  }

  const input = options.value.trim()

  if (!input) {
    return failure('empty-input', '请输入需要转换的整数。')
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return failure('out-of-range', `输入长度不能超过 ${MAX_INPUT_LENGTH} 个字符。`)
  }

  const parsedResult = parseInteger(input, options.fromBase)

  if (!parsedResult.ok) {
    return parsedResult
  }

  return success(formatInteger(parsedResult.value, options.toBase, options.uppercase, options.addPrefix))
}
