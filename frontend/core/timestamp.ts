import { failure, success, type ToolResult } from './tool-result'

export type TimestampUnit = 'seconds' | 'milliseconds'
export type TimezoneMode = 'local' | 'utc'

export interface TimestampConversion {
  timestampSeconds: string
  timestampMilliseconds: string
  iso: string
  local: string
  utc: string
  notice?: string
}

const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000

function formatMilliseconds(value: number): string {
  return String(Object.is(value, -0) ? 0 : value)
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function formatLocalInputValue(date: Date): string {
  return [
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`,
  ].join('T')
}

function formatLocalDisplayValue(date: Date): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${pad(date.getMilliseconds(), 3)}`
}

function createDateFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  mode: TimezoneMode,
): Date | null {
  const date = new Date(0)

  if (mode === 'utc') {
    date.setUTCFullYear(year, month - 1, day)
    date.setUTCHours(hour, minute, second, millisecond)
  } else {
    date.setFullYear(year, month - 1, day)
    date.setHours(hour, minute, second, millisecond)
  }

  if (!Number.isFinite(date.getTime()) || Math.abs(date.getTime()) > MAX_DATE_MILLISECONDS) {
    return null
  }

  return date
}

function parseIsoWithoutTimezone(value: string, mode: TimezoneMode): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:(?:T|\s)(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/u.exec(value)

  if (!match) {
    return null
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = hourText === undefined ? 0 : Number(hourText)
  const minute = minuteText === undefined ? 0 : Number(minuteText)
  const second = secondText === undefined ? 0 : Number(secondText)
  const millisecond = fractionText === undefined
    ? 0
    : Number(fractionText.padEnd(3, '0').slice(0, 3))

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) {
    return null
  }

  const date = createDateFromParts(year, month, day, hour, minute, second, millisecond, mode)

  if (!date) {
    return null
  }

  const matchesCalendar = mode === 'utc'
    ? date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      date.getUTCHours() === hour &&
      date.getUTCMinutes() === minute &&
      date.getUTCSeconds() === second &&
      date.getUTCMilliseconds() === millisecond
    : date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      date.getHours() === hour &&
      date.getMinutes() === minute &&
      date.getSeconds() === second &&
      date.getMilliseconds() === millisecond

  return matchesCalendar ? date : null
}

function parseIsoInput(value: string, mode: TimezoneMode): ToolResult<Date> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入 ISO 8601 日期时间。')
  }

  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(input)
  const date = hasExplicitTimezone
    ? new Date(Date.parse(input))
    : parseIsoWithoutTimezone(input, mode)

  if (!date || Number.isNaN(date.getTime()) || Math.abs(date.getTime()) > MAX_DATE_MILLISECONDS) {
    return failure(
      'invalid-input',
      '日期时间格式无效，请使用 ISO 8601，例如 2024-01-01T08:00:00、2024-01-01T00:00:00Z 或带时区偏移的值。',
    )
  }

  return success(date)
}

function createConversion(date: Date, notice?: string): TimestampConversion {
  const milliseconds = date.getTime()
  const seconds = Math.trunc(milliseconds / 1000)

  return {
    timestampSeconds: formatMilliseconds(seconds),
    timestampMilliseconds: formatMilliseconds(milliseconds),
    iso: date.toISOString(),
    local: formatLocalDisplayValue(date),
    utc: date.toISOString(),
    ...(notice ? { notice } : {}),
  }
}

export function convertTimestamp(
  value: string,
  unit: TimestampUnit,
): ToolResult<TimestampConversion> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入时间戳。')
  }

  if (!/^[+-]?\d+$/u.test(input)) {
    return failure('invalid-input', '时间戳必须是整数，不能包含小数、字母或其他符号。')
  }

  const numericValue = Number(input)

  if (!Number.isSafeInteger(numericValue)) {
    return failure('out-of-range', '时间戳超出安全整数范围，请输入 JavaScript 可以准确处理的整数。')
  }

  const milliseconds = unit === 'seconds' ? numericValue * 1000 : numericValue

  if (!Number.isSafeInteger(milliseconds) || Math.abs(milliseconds) > MAX_DATE_MILLISECONDS) {
    return failure('out-of-range', '时间戳超出浏览器 Date 可以表示的范围。')
  }

  const date = new Date(milliseconds)

  if (Number.isNaN(date.getTime())) {
    return failure('out-of-range', '时间戳无法转换为有效日期。')
  }

  return success(createConversion(
    date,
    '本地时间按当前浏览器时区显示；夏令时边界可能存在本地时间歧义。',
  ))
}

export function convertIsoToTimestamp(
  value: string,
  mode: TimezoneMode,
): ToolResult<TimestampConversion> {
  const dateResult = parseIsoInput(value, mode)

  if (!dateResult.ok) {
    return dateResult
  }

  return success(createConversion(
    dateResult.value,
    mode === 'local'
      ? '无时区标识的输入按当前浏览器时区解释；夏令时边界可能存在歧义。'
      : '无时区标识的输入按 UTC 解释；带 Z 或显式偏移的 ISO 输入按自身时区语义解析。',
  ))
}

export function getCurrentTimeInput(mode: TimezoneMode, now = new Date()): string {
  return mode === 'utc' ? now.toISOString() : formatLocalInputValue(now)
}
