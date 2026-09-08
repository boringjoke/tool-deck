import { failure, success, type ToolResult } from './tool-result'

export type NumberChineseMode =
  | 'number-to-chinese'
  | 'amount-to-chinese'
  | 'chinese-to-number'

export interface NumberChineseOptions {
  mode: NumberChineseMode
  value: string
}

export const MAX_INTEGER_DIGITS = 48

const MAX_INTEGER_EXCLUSIVE = BigInt(`1${'0'.repeat(MAX_INTEGER_DIGITS)}`)
const CHINESE_DIGITS = '零壹贰叁肆伍陆柒捌玖'
const SMALL_UNIT_NAMES = ['仟', '佰', '拾', ''] as const
const LARGE_UNIT_NAMES = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'] as const
const LARGE_UNIT_VALUES = LARGE_UNIT_NAMES.map((_, index) => BigInt(`1${'0'.repeat(index * 4)}`))

const DIGIT_VALUES: Readonly<Record<string, bigint>> = {
  零: 0n,
  壹: 1n,
  贰: 2n,
  叁: 3n,
  肆: 4n,
  伍: 5n,
  陆: 6n,
  柒: 7n,
  捌: 8n,
  玖: 9n,
}

const SMALL_UNIT_VALUES: Readonly<Record<string, bigint>> = {
  拾: 10n,
  佰: 100n,
  仟: 1000n,
}

const LARGE_UNIT_VALUE_BY_NAME: Readonly<Record<string, bigint>> = LARGE_UNIT_NAMES.reduce(
  (result, name, index) => {
    if (name) {
      result[name] = LARGE_UNIT_VALUES[index]!
    }
    return result
  },
  {} as Record<string, bigint>,
)

const INVALID_ARABIC_FORMAT_MESSAGE = '请输入标准十进制数字，例如 123、-12.30 或 0.05。'

interface ParsedArabicNumber {
  integerDigits: string
  integerValue: bigint
  fractionDigits: string
  negative: boolean
}

interface ParsedChineseNumber {
  integerValue: bigint
  fractionDigits: string
  negative: boolean
}

interface ParsedChineseAmount {
  integerValue: bigint
  jiao: number
  fen: number
  negative: boolean
}

/** 创建数字转换输入无效时的结构化错误。 */
function invalid(message: string, details?: string): ToolResult<never> {
  return failure('invalid-input', message, details)
}

/** 校验大整数是否处于中文大写转换支持范围内。 */
function ensureIntegerRange(value: bigint): ToolResult<bigint> {
  if (value < 0n || value >= MAX_INTEGER_EXCLUSIVE) {
    return failure('out-of-range', `整数部分必须小于 10^${MAX_INTEGER_DIGITS}。`)
  }

  return success(value)
}

/** 解析阿拉伯数字文本并拆分整数和小数部分。 */
function parseArabicNumber(value: string): ToolResult<ParsedArabicNumber> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入需要转换的数字。')
  }

  if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(input)) {
    return failure('invalid-input', INVALID_ARABIC_FORMAT_MESSAGE, '不支持正号、千分位逗号、货币符号、指数表示法或内部空格。')
  }

  const negative = input.startsWith('-')
  const unsigned = negative ? input.slice(1) : input
  const [rawInteger = '', fractionDigits = ''] = unsigned.split('.')
  const integerDigits = rawInteger.replace(/^0+(?=\d)/, '')

  if (integerDigits.length > MAX_INTEGER_DIGITS) {
    return failure('out-of-range', `整数部分必须小于 10^${MAX_INTEGER_DIGITS}。`)
  }

  const integerValue = BigInt(integerDigits)
  const rangeResult = ensureIntegerRange(integerValue)

  if (!rangeResult.ok) {
    return rangeResult
  }

  const isZero = integerValue === 0n && /^0*$/.test(fractionDigits)

  return success({
    integerDigits: integerValue.toString(),
    integerValue,
    fractionDigits,
    negative: negative && !isZero,
  })
}

/** 将四位以内的整数分组转换为中文数字文本。 */
function formatFourDigitGroup(value: number): string {
  const digits = value.toString().padStart(4, '0')
  let output = ''
  let zeroPending = false

  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits.charAt(index))
    const unit = SMALL_UNIT_NAMES[index]

    if (digit === 0) {
      if (output) {
        zeroPending = true
      }
      continue
    }

    if (zeroPending && output && !output.endsWith('零')) {
      output += '零'
    }

    output += `${CHINESE_DIGITS.charAt(digit)}${unit}`
    zeroPending = false
  }

  return output
}

/** 将整数大数转换为中文大写数字文本。 */
function formatIntegerToChinese(value: bigint): ToolResult<string> {
  const rangeResult = ensureIntegerRange(value)

  if (!rangeResult.ok) {
    return rangeResult
  }

  if (value === 0n) {
    return success('零')
  }

  const groups: number[] = []
  let remaining = value

  while (remaining > 0n) {
    groups.unshift(Number(remaining % 10000n))
    remaining /= 10000n
  }

  if (groups.length > LARGE_UNIT_NAMES.length) {
    return failure('out-of-range', `整数部分必须小于 10^${MAX_INTEGER_DIGITS}。`)
  }

  let output = ''
  let zeroGroupPending = false

  groups.forEach((groupValue, index) => {
    const unitIndex = groups.length - index - 1

    if (groupValue === 0) {
      if (output) {
        zeroGroupPending = true
      }
      return
    }

    if (output && (zeroGroupPending || groupValue < 1000) && !output.endsWith('零')) {
      output += '零'
    }

    output += `${formatFourDigitGroup(groupValue)}${LARGE_UNIT_NAMES[unitIndex]}`
    zeroGroupPending = false
  })

  return success(output)
}

/** 为转换结果补充规范的正号或负号。 */
function formatSigned(value: string, negative: boolean): string {
  return negative && value !== '0' ? `负${value}` : value
}

/** 将阿拉伯数字文本转换为中文大写数字。 */
export function convertNumberToChinese(value: string): ToolResult<string> {
  const parsedResult = parseArabicNumber(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  const integerResult = formatIntegerToChinese(parsedResult.value.integerValue)

  if (!integerResult.ok) {
    return integerResult
  }

  const fraction = parsedResult.value.fractionDigits
    ? `点${[...parsedResult.value.fractionDigits].map((digit) => CHINESE_DIGITS.charAt(Number(digit))).join('')}`
    : ''

  return success(formatSigned(`${integerResult.value}${fraction}`, parsedResult.value.negative))
}

/** 将数字金额文本转换为中文大写金额。 */
export function convertAmountToChinese(value: string): ToolResult<string> {
  const parsedResult = parseArabicNumber(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  if (parsedResult.value.fractionDigits.length > 2) {
    return failure('out-of-range', '中文大写金额最多支持两位小数，不会自动截断或四舍五入。')
  }

  const integerResult = formatIntegerToChinese(parsedResult.value.integerValue)

  if (!integerResult.ok) {
    return integerResult
  }

  const jiao = Number(parsedResult.value.fractionDigits.charAt(0) || '0')
  const fen = Number(parsedResult.value.fractionDigits.charAt(1) || '0')
  let output = `${integerResult.value}元`

  if (jiao === 0 && fen === 0) {
    output += '整'
  } else {
    if (jiao > 0) {
      output += `${CHINESE_DIGITS.charAt(jiao)}角`
    } else if (fen > 0) {
      output += '零'
    }

    if (fen > 0) {
      output += `${CHINESE_DIGITS.charAt(fen)}分`
    }
  }

  return success(formatSigned(output, parsedResult.value.negative))
}

/** 判断对象是否直接拥有指定键。 */
function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/** 解析中文大写整数并转换为大整数。 */
function parseChineseInteger(value: string): ToolResult<bigint> {
  if (!value) {
    return invalid('中文大写数字不能为空。')
  }

  const normalized = value.startsWith('拾') ? `壹${value}` : value

  for (const character of normalized) {
    if (!hasOwn(DIGIT_VALUES, character) && !hasOwn(SMALL_UNIT_VALUES, character) && !hasOwn(LARGE_UNIT_VALUE_BY_NAME, character)) {
      return invalid(`不支持中文大写字符“${character}”。`)
    }
  }

  if (normalized.includes('零零')) {
    return invalid('中文大写数字中的“零”不能连续出现。')
  }

  let total = 0n
  let section = 0n
  let currentDigit: bigint | null = null
  let lastSmallUnit = 10000n
  let lastLargeUnit = MAX_INTEGER_EXCLUSIVE
  let sawDigit = false

  for (const character of normalized) {
    if (hasOwn(DIGIT_VALUES, character)) {
      if (currentDigit !== null && currentDigit !== 0n) {
        return invalid('中文大写数字的位值之间缺少单位。')
      }

      currentDigit = DIGIT_VALUES[character]!
      sawDigit = true
      continue
    }

    if (hasOwn(SMALL_UNIT_VALUES, character)) {
      const unitValue = SMALL_UNIT_VALUES[character]!

      if (currentDigit === null || currentDigit === 0n) {
        return invalid(`单位“${character}”前必须有非零数字。`)
      }

      if (unitValue >= lastSmallUnit) {
        return invalid('中文大写数字的小单位顺序不正确。')
      }

      section += currentDigit * unitValue
      currentDigit = null
      lastSmallUnit = unitValue
      continue
    }

    const unitValue = LARGE_UNIT_VALUE_BY_NAME[character]!

    if (currentDigit === null && section === 0n) {
      return invalid(`大单位“${character}”前必须有数字。`)
    }

    const groupValue = section + (currentDigit ?? 0n)

    if (groupValue === 0n) {
      return invalid(`大单位“${character}”前不能只有零。`)
    }

    if (unitValue >= lastLargeUnit) {
      return invalid('中文大写数字的大单位顺序不正确。')
    }

    total += groupValue * unitValue
    if (total >= MAX_INTEGER_EXCLUSIVE) {
      return failure('out-of-range', `整数部分必须小于 10^${MAX_INTEGER_DIGITS}。`)
    }

    section = 0n
    currentDigit = null
    lastSmallUnit = 10000n
    lastLargeUnit = unitValue
  }

  if (!sawDigit) {
    return invalid('请输入中文大写数字。')
  }

  const result = total + section + (currentDigit ?? 0n)
  const rangeResult = ensureIntegerRange(result)

  if (!rangeResult.ok) {
    return rangeResult
  }

  const canonicalResult = formatIntegerToChinese(result)

  if (!canonicalResult.ok) {
    return canonicalResult
  }

  if (canonicalResult.value !== normalized) {
    return invalid('中文大写数字的位值或零位表达不规范，请按标准大写数字重新输入。')
  }

  return success(result)
}

/** 解析中文大写数字并拆分整数和小数部分。 */
function parseChineseNumber(value: string): ToolResult<{ integerValue: bigint; fractionDigits: string }> {
  const pointIndex = value.indexOf('点')

  if (pointIndex < 0) {
    const integerResult = parseChineseInteger(value)

    return integerResult.ok
      ? success({ integerValue: integerResult.value, fractionDigits: '' })
      : integerResult
  }

  if (pointIndex !== value.lastIndexOf('点')) {
    return invalid('中文大写数字只能包含一个“点”。')
  }

  const integerText = value.slice(0, pointIndex)
  const fractionText = value.slice(pointIndex + 1)

  if (!integerText || !fractionText) {
    return invalid('“点”的前后都必须有中文大写数字。')
  }

  for (const character of fractionText) {
    if (!hasOwn(DIGIT_VALUES, character)) {
      return invalid('小数点后只能使用中文大写数字，不得包含单位。')
    }
  }

  const integerResult = parseChineseInteger(integerText)

  if (!integerResult.ok) {
    return integerResult
  }

  return success({
    integerValue: integerResult.value,
    fractionDigits: [...fractionText].map((character) => DIGIT_VALUES[character]!.toString()).join(''),
  })
}

/** 解析中文金额中的单个小数位。 */
function parseFractionDigit(value: string, label: string): ToolResult<number> {
  if (value.length === 1 && hasOwn(DIGIT_VALUES, value)) {
    return success(Number(DIGIT_VALUES[value]))
  }

  if (value.length === 2 && value.startsWith('零') && hasOwn(DIGIT_VALUES, value.charAt(1))) {
    return success(Number(DIGIT_VALUES[value.charAt(1)]))
  }

  return invalid(`${label}前只能有一位数字，或使用“零”加一位数字。`)
}

/** 解析中文大写金额并生成结构化金额数据。 */
function parseChineseAmount(value: string): ToolResult<ParsedChineseAmount> {
  if (value.includes('元') && value.indexOf('元') !== value.lastIndexOf('元')) {
    return invalid('金额只能包含一个“元”。')
  }

  const hasWhole = value.includes('整')
  let body = value

  if (hasWhole) {
    if (!value.endsWith('整') || !value.includes('元') || value.includes('角') || value.includes('分')) {
      return invalid('“整”只能放在完整金额末尾，且不能与角、分同时出现。')
    }
    body = value.slice(0, -1)
  }

  const yuanIndex = body.indexOf('元')
  let integerValue = 0n
  let remainder = body

  if (yuanIndex >= 0) {
    const integerText = body.slice(0, yuanIndex)

    if (!integerText) {
      return invalid('“元”前必须有中文大写数字。')
    }

    const integerResult = parseChineseInteger(integerText)

    if (!integerResult.ok) {
      return integerResult
    }

    integerValue = integerResult.value
    remainder = body.slice(yuanIndex + 1)
  }

  if (remainder.includes('元') || remainder.includes('整')) {
    return invalid('金额单位顺序不正确。')
  }

  const angleCount = [...remainder].filter((character) => character === '角').length
  const fenCount = [...remainder].filter((character) => character === '分').length

  if (angleCount > 1 || fenCount > 1) {
    return invalid('角和分不能重复出现。')
  }

  const angleIndex = remainder.indexOf('角')
  const fenIndex = remainder.indexOf('分')

  if (angleIndex >= 0 && fenIndex >= 0 && angleIndex > fenIndex) {
    return invalid('金额单位顺序必须是元、角、分。')
  }

  if (yuanIndex < 0 && angleIndex < 0 && fenIndex < 0) {
    return invalid('金额必须包含元、角或分单位。')
  }

  let jiao = 0
  let fen = 0

  if (angleIndex >= 0) {
    const angleText = remainder.slice(0, angleIndex)
    const angleResult = parseFractionDigit(angleText, '角')

    if (!angleResult.ok) {
      return angleResult
    }

    jiao = angleResult.value
    const afterAngle = remainder.slice(angleIndex + 1)

    if (fenIndex < 0 && afterAngle) {
      return invalid('角后不能继续出现未标明单位的数字。')
    }
  }

  if (fenIndex >= 0) {
    const fenStart = angleIndex >= 0 ? angleIndex + 1 : 0
    const fenText = remainder.slice(fenStart, fenIndex)
    const fenResult = parseFractionDigit(fenText, '分')

    if (!fenResult.ok) {
      return fenResult
    }

    fen = fenResult.value

    if (remainder.slice(fenIndex + 1)) {
      return invalid('分必须是金额的最后一个单位。')
    }
  }

  if (yuanIndex < 0 && jiao === 0 && fen === 0) {
    return invalid('角或分不能只表示零。')
  }

  return success({ integerValue, jiao, fen, negative: false })
}

/** 解析中文数字前的正负号并返回主体文本。 */
function parseSignedChinese(value: string): ToolResult<{ body: string; negative: boolean }> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入需要转换的中文大写数字或金额。')
  }

  const negative = input.startsWith('负')
  const body = negative ? input.slice(1) : input

  if (!body) {
    return invalid('“负”后必须有中文大写数字或金额。')
  }

  return success({ body, negative })
}

/** 将中文大写数字或金额转换为阿拉伯数字文本。 */
export function convertChineseToArabic(value: string): ToolResult<string> {
  const signedResult = parseSignedChinese(value)

  if (!signedResult.ok) {
    return signedResult
  }

  const { body, negative } = signedResult.value
  const isAmount = /[元角分整]/.test(body)

  if (isAmount) {
    const amountResult = parseChineseAmount(body)

    if (!amountResult.ok) {
      return amountResult
    }

    const integerText = amountResult.value.integerValue.toString()
    const fractionText = `${amountResult.value.jiao}${amountResult.value.fen}`.replace(/0+$/, '')
    const numericText = fractionText ? `${integerText}.${fractionText}` : integerText

    return success(formatSigned(numericText, negative && numericText !== '0'))
  }

  const numberResult = parseChineseNumber(body)

  if (!numberResult.ok) {
    return numberResult
  }

  const integerText = numberResult.value.integerValue.toString()
  const numericText = numberResult.value.fractionDigits
    ? `${integerText}.${numberResult.value.fractionDigits}`
    : integerText
  const isZero = numberResult.value.integerValue === 0n && /^0*$/.test(numberResult.value.fractionDigits)

  return success(formatSigned(numericText, negative && !isZero))
}

/** 根据当前模式执行数字与中文大写之间的转换。 */
export function convertNumberChinese(options: NumberChineseOptions): ToolResult<string> {
  switch (options.mode) {
    case 'number-to-chinese':
      return convertNumberToChinese(options.value)
    case 'amount-to-chinese':
      return convertAmountToChinese(options.value)
    case 'chinese-to-number':
      return convertChineseToArabic(options.value)
  }
}
