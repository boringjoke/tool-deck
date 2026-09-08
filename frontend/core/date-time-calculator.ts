import { failure, success, type ToolResult } from './tool-result'

export type DateTimeMode = 'difference' | 'add-subtract'
export type DateTimeOperation = 'add' | 'subtract'
export type DateTimeUnit = 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds'

export interface DateTimeDifferenceResult {
  readonly mode: 'difference'
  readonly input: {
    readonly start: string
    readonly end: string
  }
  readonly startLocal: string
  readonly endLocal: string
  readonly startIso: string
  readonly endIso: string
  readonly totalMilliseconds: string
  readonly totalSeconds: string
  readonly totalMinutes: string
  readonly totalHours: string
  readonly totalDays: string
  readonly breakdown: {
    readonly sign: '-' | ''
    readonly days: number
    readonly hours: number
    readonly minutes: number
    readonly seconds: number
    readonly milliseconds: number
  }
  readonly notice: string
}

export interface DateTimeAdjustmentOptions {
  readonly base: string
  readonly operation: DateTimeOperation
  readonly amount: string
  readonly unit: DateTimeUnit
}

export interface DateTimeAdjustmentResult {
  readonly mode: 'add-subtract'
  readonly input: DateTimeAdjustmentOptions
  readonly baseLocal: string
  readonly resultLocal: string
  readonly resultIso: string
  readonly notice: string
}

const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000
const MAX_DATE_MILLISECONDS_BIGINT = 8_640_000_000_000_000n
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/u
const INTEGER_PATTERN = /^\d+$/u

const UNIT_MILLISECONDS: Record<Exclude<DateTimeUnit, 'years' | 'months' | 'days'>, bigint> = {
  hours: 3_600_000n,
  minutes: 60_000n,
  seconds: 1_000n,
}

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

interface ParsedDateTime {
  date: Date
  parts: DateParts
  normalized: string
}

const LOCAL_TIME_NOTICE = '按当前浏览器本地时区计算；夏令时边界可能影响实际时间差。'

/** 将数值转换为指定宽度的零填充文本。 */
function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** 将本地日期对象格式化为标准日期时间文本。 */
function formatLocalDateTime(date: Date): string | null {
  const year = date.getFullYear()

  if (year < 0 || year > 9999) {
    return null
  }

  return `${pad(year, 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** 将数值转换为不含负零的稳定文本。 */
function formatNumber(value: number): string {
  if (value === 0 || Object.is(value, -0)) {
    return '0'
  }

  return String(value)
}

/** 计算指定年份和月份的天数。 */
function daysInMonth(year: number, month: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  return date.getUTCDate()
}

/** 校验日期对象是否与目标日期时间字段完全一致。 */
function matchesParts(date: Date, parts: DateParts): boolean {
  return date.getFullYear() === parts.year
    && date.getMonth() === parts.month - 1
    && date.getDate() === parts.day
    && date.getHours() === parts.hour
    && date.getMinutes() === parts.minute
    && date.getSeconds() === parts.second
    && date.getMilliseconds() === parts.millisecond
}

/** 解析本地日期或日期时间文本并校验其有效性。 */
function parseDateTimeLocal(value: string): ToolResult<ParsedDateTime> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入日期；时间可以留空。')
  }

  const match = DATE_TIME_PATTERN.exec(input)

  if (!match) {
    return failure('invalid-input', '日期或日期时间格式无效，请使用日期和可选时间控件输入有效值。')
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match
  const parts: DateParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: hourText === undefined ? 0 : Number(hourText),
    minute: minuteText === undefined ? 0 : Number(minuteText),
    second: secondText === undefined ? 0 : Number(secondText),
    millisecond: fractionText === undefined
      ? 0
      : Number(fractionText.padEnd(3, '0')),
  }

  if (
    parts.month < 1 || parts.month > 12
    || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)
    || parts.hour > 23
    || parts.minute > 59
    || parts.second > 59
  ) {
    return failure('invalid-input', '日期时间不存在，请检查年月日和时分秒。')
  }

  const date = new Date(0)
  date.setFullYear(parts.year, parts.month - 1, parts.day)
  date.setHours(parts.hour, parts.minute, parts.second, parts.millisecond)

  if (!Number.isFinite(date.getTime()) || Math.abs(date.getTime()) > MAX_DATE_MILLISECONDS) {
    return failure('out-of-range', '日期时间超出浏览器 Date 可以表示的范围。')
  }

  if (!matchesParts(date, parts)) {
    return failure('invalid-input', '当前浏览器本地时区不存在这个时间，可能位于夏令时跳变区间，请换一个时间。')
  }

  const normalized = formatLocalDateTime(date)

  if (!normalized) {
    return failure('out-of-range', '日期时间无法格式化为有效结果。')
  }

  return success({ date, parts, normalized })
}

/** 生成日期计算结果所需的本地时间和 ISO 文本。 */
function createDateOutput(date: Date): ToolResult<{ local: string; iso: string }> {
  if (!Number.isFinite(date.getTime()) || Math.abs(date.getTime()) > MAX_DATE_MILLISECONDS) {
    return failure('out-of-range', '计算结果超出浏览器 Date 可以表示的范围。')
  }

  const local = formatLocalDateTime(date)

  if (!local) {
    return failure('out-of-range', '计算结果超出当前工具支持的日期范围。')
  }

  return success({
    local,
    iso: date.toISOString(),
  })
}

/** 根据两个已解析日期创建日期差结果。 */
function createDifferenceResult(
  start: ParsedDateTime,
  end: ParsedDateTime,
  startInput: string,
  endInput: string,
): DateTimeDifferenceResult {
  const difference = end.date.getTime() - start.date.getTime()
  const absolute = Math.abs(difference)
  const days = Math.floor(absolute / 86_400_000)
  const afterDays = absolute - days * 86_400_000
  const hours = Math.floor(afterDays / 3_600_000)
  const afterHours = afterDays - hours * 3_600_000
  const minutes = Math.floor(afterHours / 60_000)
  const afterMinutes = afterHours - minutes * 60_000
  const seconds = Math.floor(afterMinutes / 1_000)
  const milliseconds = afterMinutes - seconds * 1_000
  const sign = difference < 0 ? '-' : ''

  return {
    mode: 'difference',
    input: {
      start: startInput.trim(),
      end: endInput.trim(),
    },
    startLocal: start.normalized,
    endLocal: end.normalized,
    startIso: start.date.toISOString(),
    endIso: end.date.toISOString(),
    totalMilliseconds: formatNumber(difference),
    totalSeconds: formatNumber(difference / 1_000),
    totalMinutes: formatNumber(difference / 60_000),
    totalHours: formatNumber(difference / 3_600_000),
    totalDays: formatNumber(difference / 86_400_000),
    breakdown: {
      sign,
      days,
      hours,
      minutes,
      seconds,
      milliseconds,
    },
    notice: LOCAL_TIME_NOTICE,
  }
}

/** 计算结束日期时间减去开始日期时间的有符号差值。 */
export function calculateDateDifference(
  startValue: string,
  endValue: string,
): ToolResult<DateTimeDifferenceResult> {
  const startResult = parseDateTimeLocal(startValue)

  if (!startResult.ok) {
    return startResult
  }

  const endResult = parseDateTimeLocal(endValue)

  if (!endResult.ok) {
    return endResult
  }

  return success(createDifferenceResult(startResult.value, endResult.value, startValue, endValue))
}

/** 解析日期加减数量并校验其为非负整数。 */
function parseAmount(value: string): ToolResult<bigint> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入需要增加或减少的整数数值。')
  }

  if (!INTEGER_PATTERN.test(input)) {
    return failure('invalid-input', '增减数值必须是非负整数。')
  }

  const amount = BigInt(input)

  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    return failure('out-of-range', '增减数值过大，无法稳定计算。')
  }

  return success(amount)
}

/** 判断输入是否为支持的日期加减操作。 */
function isDateTimeOperation(value: string): value is DateTimeOperation {
  return value === 'add' || value === 'subtract'
}

/** 判断输入是否为支持的日期加减单位。 */
function isDateTimeUnit(value: string): value is DateTimeUnit {
  return value === 'years'
    || value === 'months'
    || value === 'days'
    || value === 'hours'
    || value === 'minutes'
    || value === 'seconds'
}

/** 按日历规则执行年或月的日期调整并处理月末钳制。 */
function createCalendarAdjustment(
  date: Date,
  parts: DateParts,
  operation: DateTimeOperation,
  amount: bigint,
  unit: 'years' | 'months',
): Date | null {
  const direction = operation === 'add' ? 1n : -1n
  const monthDelta = unit === 'years' ? amount * 12n : amount
  const currentMonthIndex = BigInt(parts.year) * 12n + BigInt(parts.month - 1)
  const targetMonthIndex = currentMonthIndex + direction * monthDelta

  if (targetMonthIndex < 0n) {
    return null
  }

  const targetYear = targetMonthIndex / 12n
  const targetMonthIndexInYear = targetMonthIndex % 12n

  if (targetYear > 9999n) {
    return null
  }

  const year = Number(targetYear)
  const month = Number(targetMonthIndexInYear) + 1
  const day = Math.min(parts.day, daysInMonth(year, month))
  const result = new Date(date.getTime())

  result.setDate(1)
  result.setFullYear(year, month - 1, day)
  result.setHours(parts.hour, parts.minute, parts.second, parts.millisecond)

  return result
}

/** 执行日期加减结果的范围校验和结果封装。 */
function createDateAdjustment(
  parsed: ParsedDateTime,
  options: DateTimeAdjustmentOptions,
  amount: bigint,
): Date | null {
  if (options.unit === 'years' || options.unit === 'months') {
    return createCalendarAdjustment(parsed.date, parsed.parts, options.operation, amount, options.unit)
  }

  if (options.unit === 'days') {
    const result = new Date(parsed.date.getTime())
    const signedAmount = options.operation === 'add' ? Number(amount) : -Number(amount)
    result.setDate(result.getDate() + signedAmount)
    return result
  }

  const signedAmount = options.operation === 'add' ? amount : -amount
  const delta = signedAmount * UNIT_MILLISECONDS[options.unit]
  const targetMilliseconds = BigInt(parsed.date.getTime()) + delta

  if (
    targetMilliseconds > MAX_DATE_MILLISECONDS_BIGINT
    || targetMilliseconds < -MAX_DATE_MILLISECONDS_BIGINT
  ) {
    return null
  }

  return new Date(Number(targetMilliseconds))
}

/** 在本地日期基础上执行年、月、日或时间单位的增减。 */
export function calculateDateTimeAdjustment(
  options: DateTimeAdjustmentOptions,
): ToolResult<DateTimeAdjustmentResult> {
  if (!isDateTimeOperation(options.operation) || !isDateTimeUnit(options.unit)) {
    return failure('unsupported-input', '不支持当前的日期增减方式或时间单位。')
  }

  const baseResult = parseDateTimeLocal(options.base)

  if (!baseResult.ok) {
    return baseResult
  }

  const amountResult = parseAmount(options.amount)

  if (!amountResult.ok) {
    return amountResult
  }

  const adjustedDate = createDateAdjustment(baseResult.value, options, amountResult.value)

  if (!adjustedDate) {
    return failure('out-of-range', '增减后的日期超出当前工具支持的范围。')
  }

  const output = createDateOutput(adjustedDate)

  if (!output.ok) {
    return output
  }

  const baseLocal = baseResult.value.normalized

  return success({
    mode: 'add-subtract',
    input: {
      base: options.base.trim(),
      operation: options.operation,
      amount: options.amount.trim(),
      unit: options.unit,
    },
    baseLocal,
    resultLocal: output.value.local,
    resultIso: output.value.iso,
    notice: LOCAL_TIME_NOTICE,
  })
}
