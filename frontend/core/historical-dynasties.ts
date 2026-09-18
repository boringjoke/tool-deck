import { failure, success, type ToolResult } from './tool-result'
import {
  HISTORICAL_DYNASTY_CATALOG,
  HISTORICAL_DYNASTY_DATASET_METADATA,
  HISTORICAL_PERIOD_OPTIONS,
} from './historical-dynasties-catalog'

export type HistoricalDatePrecision = 'exact' | 'approximate' | 'range' | 'traditional'

export type HistoricalTrack = 'mainline' | 'parallel'

export type HistoricalPeriodKey =
  | 'pre-qin'
  | 'qin-han'
  | 'six-dynasties'
  | 'sui-tang'
  | 'five-song'
  | 'yuan-ming-qing'

export type HistoricalPeriodFilter = HistoricalPeriodKey | 'all'

export type HistoricalTrackFilter = HistoricalTrack | 'all'

export interface HistoricalDynastyRecord {
  readonly id: string
  readonly nameZh: string
  readonly aliases: readonly string[]
  readonly startYear: number | null
  readonly endYear: number | null
  readonly startLabel: string
  readonly endLabel: string
  readonly datePrecision: HistoricalDatePrecision
  readonly periodKey: HistoricalPeriodKey
  readonly track: HistoricalTrack
  readonly note: string
  readonly sourceRefs: readonly string[]
}

export interface HistoricalPeriodOption {
  readonly value: HistoricalPeriodKey
  readonly label: string
  readonly rangeLabel: string
}

export interface HistoricalDynastySearchOptions {
  readonly query?: string
  readonly period?: HistoricalPeriodFilter
  readonly track?: HistoricalTrackFilter
}

export interface HistoricalTimelineSection extends HistoricalPeriodOption {
  readonly mainline: readonly HistoricalDynastyRecord[]
  readonly parallel: readonly HistoricalDynastyRecord[]
}

export interface HistoricalDynastySource {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly scope: string
}

export interface HistoricalDynastyDatasetMetadata extends HistoricalDynastyDatasetMetadataBase {
  readonly sources: readonly HistoricalDynastySource[]
}

interface HistoricalDynastyDatasetMetadataBase {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly checkedAt: string
  readonly coverage: string
  readonly validation: string
  readonly recordCount: number
  readonly mainlineCount: number
  readonly parallelCount: number
}

export const HISTORICAL_TRACK_OPTIONS: readonly {
  readonly value: HistoricalTrackFilter
  readonly label: string
}[] = [
  { value: 'all', label: '全部轨道' },
  { value: 'mainline', label: '主线朝代' },
  { value: 'parallel', label: '并行政权' },
]

const HISTORICAL_PERIOD_LABELS: Record<HistoricalPeriodKey, string> = {
  'pre-qin': '先秦',
  'qin-han': '秦汉',
  'six-dynasties': '三国两晋南北朝',
  'sui-tang': '隋唐',
  'five-song': '五代宋辽金夏',
  'yuan-ming-qing': '元明清',
}

const HISTORICAL_TRACK_LABELS: Record<HistoricalTrack, string> = {
  mainline: '主线朝代',
  parallel: '并行政权',
}

const HISTORICAL_DATE_PRECISION_LABELS: Record<HistoricalDatePrecision, string> = {
  exact: '通行纪年',
  approximate: '约略年代',
  range: '区间或口径差异',
  traditional: '传统纪年',
}

/** 规范化历史名称和别名，统一空白及常见连接符。 */
export function normalizeHistoricalDynastySearchText(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .replace(/[’'`·•、，。/|]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('zh-CN')
}

/** 获取历史阶段的用户可读名称。 */
export function getHistoricalPeriodLabel(period: HistoricalPeriodKey): string {
  return HISTORICAL_PERIOD_LABELS[period]
}

/** 获取主线或并行政权的用户可读名称。 */
export function getHistoricalTrackLabel(track: HistoricalTrack): string {
  return HISTORICAL_TRACK_LABELS[track]
}

/** 获取年代精度标记的用户可读名称。 */
export function getHistoricalDatePrecisionLabel(precision: HistoricalDatePrecision): string {
  return HISTORICAL_DATE_PRECISION_LABELS[precision]
}

/** 将内部的负数年份格式化为公元前/公元显示文本。 */
export function formatHistoricalYear(year: number | null): string {
  if (year === null) {
    return '年代不详'
  }

  return year < 0 ? `前${Math.abs(year)}年` : `公元${year}年`
}

/** 使用目录中保留的显示口径格式化一条历史记录的年代范围。 */
export function formatHistoricalRange(record: HistoricalDynastyRecord): string {
  return `${record.startLabel}—${record.endLabel}`
}

function createHistoricalDynastySearchText(record: HistoricalDynastyRecord): string {
  return [
    record.id,
    record.nameZh,
    ...record.aliases,
    getHistoricalPeriodLabel(record.periodKey),
    getHistoricalTrackLabel(record.track),
    record.startLabel,
    record.endLabel,
    record.note,
  ]
    .map(normalizeHistoricalDynastySearchText)
    .join(' ')
}

function compareHistoricalDynastyRecords(
  left: HistoricalDynastyRecord,
  right: HistoricalDynastyRecord,
): number {
  const startCompare = (left.startYear ?? Number.POSITIVE_INFINITY) - (right.startYear ?? Number.POSITIVE_INFINITY)

  if (startCompare !== 0) {
    return startCompare
  }

  const trackCompare = left.track === right.track ? 0 : left.track === 'mainline' ? -1 : 1

  return trackCompare
    || ((left.endYear ?? Number.POSITIVE_INFINITY) - (right.endYear ?? Number.POSITIVE_INFINITY))
    || left.id.localeCompare(right.id, 'en')
}

/** 在静态目录中按名称、别名、阶段和主线/并行轨道执行稳定查询。 */
export function searchHistoricalDynasties(
  options: HistoricalDynastySearchOptions = {},
  catalog: readonly HistoricalDynastyRecord[] = HISTORICAL_DYNASTY_CATALOG,
): readonly HistoricalDynastyRecord[] {
  const query = normalizeHistoricalDynastySearchText(options.query ?? '')
  const period = options.period ?? 'all'
  const track = options.track ?? 'all'

  return catalog
    .filter((record) => {
      const matchesQuery = !query || createHistoricalDynastySearchText(record).includes(query)
      const matchesPeriod = period === 'all' || record.periodKey === period
      const matchesTrack = track === 'all' || record.track === track

      return matchesQuery && matchesPeriod && matchesTrack
    })
    .sort(compareHistoricalDynastyRecords)
}

/** 把查询结果分配到阶段、主线和并行政权轨道，供时间轴页面渲染。 */
export function getHistoricalTimelineLayout(
  catalog: readonly HistoricalDynastyRecord[] = HISTORICAL_DYNASTY_CATALOG,
): readonly HistoricalTimelineSection[] {
  return HISTORICAL_PERIOD_OPTIONS.map((period) => {
    const records = catalog
      .filter((record) => record.periodKey === period.value)
      .sort(compareHistoricalDynastyRecords)

    return {
      ...period,
      mainline: records.filter((record) => record.track === 'mainline'),
      parallel: records.filter((record) => record.track === 'parallel'),
    }
  })
}

/** 校验静态历史目录的唯一性、年代、阶段、轨道和来源引用。 */
export function validateHistoricalDynastyCatalog(
  catalog: readonly HistoricalDynastyRecord[] = HISTORICAL_DYNASTY_CATALOG,
  metadata: HistoricalDynastyDatasetMetadata = HISTORICAL_DYNASTY_DATASET_METADATA,
): ToolResult<true> {
  const errors: string[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  const sourceIds = new Set(metadata.sources.map((source) => source.id))
  let mainlineCount = 0
  let parallelCount = 0

  if (catalog.length !== metadata.recordCount) {
    errors.push(`历史目录应包含 ${metadata.recordCount} 条记录，实际为 ${catalog.length} 条`)
  }

  for (const record of catalog) {
    if (ids.has(record.id)) {
      errors.push(`重复的历史记录标识：${record.id}`)
    }
    ids.add(record.id)

    if (names.has(record.nameZh)) {
      errors.push(`重复的历史记录名称：${record.nameZh}`)
    }
    names.add(record.nameZh)

    if (!record.nameZh.trim() || !record.startLabel.trim() || !record.endLabel.trim()) {
      errors.push(`历史记录 ${record.id} 缺少名称或年代显示文本`)
    }

    if (record.startYear === null || record.endYear === null || record.startYear > record.endYear) {
      errors.push(`历史记录 ${record.id} 的年代范围无效`)
    }

    if (!HISTORICAL_PERIOD_LABELS[record.periodKey]) {
      errors.push(`历史记录 ${record.id} 的阶段无效`)
    }

    if (!HISTORICAL_TRACK_LABELS[record.track]) {
      errors.push(`历史记录 ${record.id} 的轨道无效`)
    }

    if (!HISTORICAL_DATE_PRECISION_LABELS[record.datePrecision]) {
      errors.push(`历史记录 ${record.id} 的年代精度无效`)
    }

    if (!record.note.trim() || record.sourceRefs.length === 0) {
      errors.push(`历史记录 ${record.id} 缺少范围说明或来源引用`)
    }

    if (record.sourceRefs.some((sourceId) => !sourceIds.has(sourceId))) {
      errors.push(`历史记录 ${record.id} 引用了未知来源`)
    }

    if (record.track === 'mainline') {
      mainlineCount += 1
    } else {
      parallelCount += 1
    }
  }

  if (mainlineCount !== metadata.mainlineCount) {
    errors.push(`主线记录数应为 ${metadata.mainlineCount}，实际为 ${mainlineCount}`)
  }

  if (parallelCount !== metadata.parallelCount) {
    errors.push(`并行记录数应为 ${metadata.parallelCount}，实际为 ${parallelCount}`)
  }

  if (errors.length > 0) {
    return failure('invalid-state', '历史朝代表目录暂不可用。', errors.join('；'))
  }

  return success(true)
}

export {
  HISTORICAL_DYNASTY_CATALOG,
  HISTORICAL_DYNASTY_DATASET_METADATA,
  HISTORICAL_PERIOD_OPTIONS,
}
