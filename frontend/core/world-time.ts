import { failure, success, type ToolResult } from './tool-result'
import {
  WORLD_TIME_BUILTIN_OPTIONS,
  type WorldTimeBuiltinOption,
  type WorldTimeContinent,
} from './world-time-catalog'

export type { WorldTimeBuiltinOption, WorldTimeContinent } from './world-time-catalog'

export const WORLD_TIME_MAX_OPTIONS = 12

export interface WorldTimeOption {
  readonly id: string
  readonly label: string
  readonly searchText: string
  readonly timeZone: string
  readonly source: 'builtin' | 'custom'
}

export interface WorldTimeSnapshot {
  readonly option: WorldTimeOption
  readonly localDate: string
  readonly localTime: string
  readonly weekday: string
  readonly timeZone: string
  readonly utcOffset: string
}

interface DateTimeParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

const WORLD_TIME_CONTINENTS: readonly WorldTimeContinent[] = [
  '亚洲',
  '欧洲',
  '非洲',
  '北美洲',
  '南美洲',
  '大洋洲',
]

const DEFAULT_WORLD_TIME_OPTION_IDS = [
  'china-beijing',
  'japan-tokyo',
  'singapore-singapore',
  'australia-sydney',
  'united-arab-emirates-dubai',
  'united-kingdom-london',
  'united-states-new-york',
  'united-states-los-angeles',
] as const

/** 规范化城市目录排序所使用的可比较文本。 */
function normalizeSortValue(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('en-US')
}

/** 按英文城市名首字母、英文城市名和国家名稳定排序。 */
function compareBuiltinWorldTimeOptions(
  left: WorldTimeBuiltinOption,
  right: WorldTimeBuiltinOption,
): number {
  return normalizeSortValue(left.cityNameEn).localeCompare(normalizeSortValue(right.cityNameEn), 'en')
    || normalizeSortValue(left.countryNameEn).localeCompare(normalizeSortValue(right.countryNameEn), 'en')
    || left.id.localeCompare(right.id, 'en')
}

const SORTED_WORLD_TIME_BUILTIN_OPTIONS: readonly WorldTimeBuiltinOption[] = [...WORLD_TIME_BUILTIN_OPTIONS]
  .sort(compareBuiltinWorldTimeOptions)

/** 根据稳定标识获取一个已确认的默认世界时间城市。 */
function getRequiredBuiltinWorldTimeOption(id: string): WorldTimeBuiltinOption {
  const option = WORLD_TIME_BUILTIN_OPTIONS.find((item) => item.id === id)

  if (!option) {
    throw new Error('Missing world-time catalog option: ' + id)
  }

  return option
}

const DEFAULT_WORLD_TIME_OPTIONS: readonly WorldTimeBuiltinOption[] = DEFAULT_WORLD_TIME_OPTION_IDS.map(
  getRequiredBuiltinWorldTimeOption,
)

/** 获取世界时间工具的完整静态内置城市与首都目录。 */
export function getBuiltinWorldTimeOptions(): readonly WorldTimeBuiltinOption[] {
  return SORTED_WORLD_TIME_BUILTIN_OPTIONS
}

/** 获取世界时间工具支持的洲筛选选项。 */
export function getWorldTimeContinents(): readonly WorldTimeContinent[] {
  return WORLD_TIME_CONTINENTS
}

/** 获取世界时间工具的默认城市选项。 */
export function getDefaultWorldTimeOptions(): readonly WorldTimeBuiltinOption[] {
  return DEFAULT_WORLD_TIME_OPTIONS
}

/** 将搜索文本规范化为不区分大小写的可匹配值。 */
function normalizeSearchValue(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('zh-CN')
}

/** 在完整内置目录中按城市、国家、洲或 IANA 时区搜索并筛选。 */
export function searchBuiltinWorldTimeOptions(
  query: string,
  continent?: WorldTimeContinent,
): readonly WorldTimeBuiltinOption[] {
  const normalizedQuery = normalizeSearchValue(query)

  return SORTED_WORLD_TIME_BUILTIN_OPTIONS.filter((option) => {
    const matchesQuery = !normalizedQuery
      || normalizeSearchValue(option.searchText).includes(normalizedQuery)
    const matchesContinent = !continent || option.continent === continent

    return matchesQuery && matchesContinent
  })
}

/** 解析 IANA 时区并返回浏览器支持的规范化时区标识。 */
function resolveIanaTimeZone(value: string): string | null {
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: value })
      .resolvedOptions()
      .timeZone

    return resolved || null
  } catch {
    return null
  }
}

/** 校验自定义 IANA 时区并创建可加入列表的选项。 */
export function validateIanaTimeZone(value: string): ToolResult<WorldTimeOption> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入 IANA 时区，例如 Asia/Shanghai。')
  }

  const resolvedTimeZone = resolveIanaTimeZone(input)

  if (!resolvedTimeZone) {
    return failure(
      'invalid-input',
      'IANA 时区无效，请输入浏览器支持的时区名称。',
      '例如：Asia/Shanghai、Europe/London 或 America/New_York。',
    )
  }

  return success({
    id: `custom:${resolvedTimeZone}`,
    label: input,
    searchText: `${input} ${resolvedTimeZone}`,
    timeZone: resolvedTimeZone,
    source: 'custom',
  })
}

/** 将一个时区选项加入当前列表并执行重复项和数量上限校验。 */
export function addWorldTimeOption(
  currentOptions: readonly WorldTimeOption[],
  option: WorldTimeOption,
): ToolResult<readonly WorldTimeOption[]> {
  if (currentOptions.some((currentOption) => currentOption.timeZone === option.timeZone)) {
    return failure('invalid-input', '该时区已经在当前列表中。')
  }

  if (currentOptions.length >= WORLD_TIME_MAX_OPTIONS) {
    return failure(
      'out-of-range',
      `当前最多显示 ${WORLD_TIME_MAX_OPTIONS} 个城市或时区。`,
      '请先移除已有项目后再添加。',
    )
  }

  return success([...currentOptions, option])
}

/** 从 Intl 格式化片段中提取指定日期时间字段。 */
function readDateTimeParts(parts: readonly Intl.DateTimeFormatPart[]): DateTimeParts | null {
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = Number(values.get('year'))
  const month = Number(values.get('month'))
  const day = Number(values.get('day'))
  const hour = Number(values.get('hour'))
  const minute = Number(values.get('minute'))
  const second = Number(values.get('second'))

  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    return null
  }

  return { year, month, day, hour, minute, second }
}

/** 将本地时区字段转换为同一字段对应的 UTC 毫秒值。 */
function createUtcEquivalentMilliseconds(parts: DateTimeParts): number {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0)
  return date.getTime()
}

/** 将指定时区的本地字段格式化为稳定的 UTC 偏移文本。 */
function formatUtcOffset(parts: DateTimeParts, nowMilliseconds: number): string {
  const instantMilliseconds = Math.trunc(nowMilliseconds / 1000) * 1000
  const utcEquivalentMilliseconds = createUtcEquivalentMilliseconds(parts)
  const offsetMinutes = Math.round((utcEquivalentMilliseconds - instantMilliseconds) / 60_000)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absoluteMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60

  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** 在固定时间点生成单个城市或自定义时区的当前时间快照。 */
export function createWorldTimeSnapshot(
  option: WorldTimeOption,
  nowMilliseconds: number,
): ToolResult<WorldTimeSnapshot> {
  if (!Number.isFinite(nowMilliseconds)) {
    return failure('operation-failed', '当前时间无法读取，请稍后重试。')
  }

  const date = new Date(nowMilliseconds)

  if (Number.isNaN(date.getTime())) {
    return failure('operation-failed', '当前时间无法格式化，请稍后重试。')
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: option.timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const parts = readDateTimeParts(formatter.formatToParts(date))

    if (!parts) {
      return failure('operation-failed', '当前时区时间格式化失败，请稍后重试。')
    }

    const weekday = new Intl.DateTimeFormat('zh-CN', {
      timeZone: option.timeZone,
      weekday: 'long',
    }).format(date)

    return success({
      option,
      localDate: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
      localTime: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`,
      weekday,
      timeZone: option.timeZone,
      utcOffset: formatUtcOffset(parts, nowMilliseconds),
    })
  } catch {
    return failure(
      'unsupported-input',
      `当前浏览器不支持时区“${option.timeZone}”。`,
      '请更换现代浏览器或使用其他 IANA 时区。',
    )
  }
}
