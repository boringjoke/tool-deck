import { failure, success, type ToolResult } from './tool-result'
import {
  PAPER_SIZE_CATALOG,
  PAPER_SIZE_DATASET_METADATA,
} from './paper-size-catalog'

export type PaperStandard = 'iso-216' | 'north-america'

export type PaperSeries = 'A' | 'B' | 'US'

export type PaperSizeUnit = 'mm' | 'in'

export type PaperSizeView = 'table' | 'cards'

export type PaperStandardFilter = PaperStandard | 'all'

export type PaperSeriesFilter = PaperSeries | 'all'

export interface PaperSizeRecord {
  id: string
  standard: PaperStandard
  series: PaperSeries
  nameZh: string
  nameEn: string
  aliases: readonly string[]
  shortEdgeMm: number
  longEdgeMm: number
  notes: string
}

export interface PaperSizeSource {
  name: string
  url: string
  scope: string
  citation: string
}

export interface PaperSizeDatasetMetadata {
  id: string
  name: string
  version: string
  checkedAt: string
  coverage: string
  validation: string
  sources: readonly PaperSizeSource[]
}

export interface PaperSizeSearchOptions {
  query?: string
  standard?: PaperStandardFilter
  series?: PaperSeriesFilter
}

export const PAPER_SIZE_STANDARD_OPTIONS: readonly {
  value: PaperStandardFilter
  label: string
}[] = [
  { value: 'all', label: '全部标准' },
  { value: 'iso-216', label: 'ISO 216' },
  { value: 'north-america', label: '北美常用尺寸' },
]

export const PAPER_SIZE_SERIES_OPTIONS: readonly {
  value: PaperSeriesFilter
  label: string
}[] = [
  { value: 'all', label: '全部系列' },
  { value: 'A', label: 'A 系列' },
  { value: 'B', label: 'B 系列' },
  { value: 'US', label: '北美尺寸' },
]

const PAPER_STANDARD_LABELS: Record<PaperStandard, string> = {
  'iso-216': 'ISO 216',
  'north-america': '北美常用尺寸',
}

const PAPER_SERIES_LABELS: Record<PaperSeries, string> = {
  A: 'A 系列',
  B: 'B 系列',
  US: '北美尺寸',
}

/** 规范化纸张查询文本，统一空白并忽略拉丁字母大小写。 */
export function normalizePaperSearchText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

/** 获取纸张标准的用户可读名称。 */
export function getPaperStandardLabel(standard: PaperStandard): string {
  return PAPER_STANDARD_LABELS[standard]
}

/** 获取纸张系列的用户可读名称。 */
export function getPaperSeriesLabel(series: PaperSeries): string {
  return PAPER_SERIES_LABELS[series]
}

/** 在静态目录中按名称、标准、系列和别名执行稳定查询。 */
export function searchPaperSizes(
  options: PaperSizeSearchOptions = {},
  catalog: readonly PaperSizeRecord[] = PAPER_SIZE_CATALOG,
): readonly PaperSizeRecord[] {
  const query = normalizePaperSearchText(options.query ?? '')
  const standard = options.standard ?? 'all'
  const series = options.series ?? 'all'

  return catalog.filter((record) => {
    if (standard !== 'all' && record.standard !== standard) {
      return false
    }

    if (series !== 'all' && record.series !== series) {
      return false
    }

    if (!query) {
      return true
    }

    const searchText = [
      record.id,
      record.standard,
      getPaperStandardLabel(record.standard),
      record.series,
      getPaperSeriesLabel(record.series),
      record.nameZh,
      record.nameEn,
      ...record.aliases,
    ]
      .map(normalizePaperSearchText)
      .join(' ')

    return searchText.includes(query)
  })
}

/** 格式化尺寸数字并去除无意义的尾零。 */
function formatDimensionNumber(value: number, maximumFractionDigits: number): string {
  return value.toFixed(maximumFractionDigits).replace(/\.0+$/u, '').replace(/(\.\d*?)0+$/u, '$1')
}

/** 将毫米尺寸转换为已确认的显示单位。 */
export function formatPaperDimension(valueMm: number, unit: PaperSizeUnit): string {
  if (unit === 'mm') {
    return `${formatDimensionNumber(valueMm, 1)} mm`
  }

  return `${formatDimensionNumber(valueMm / 25.4, 2)} in`
}

/** 格式化纸张的短边 × 长边展示文本。 */
export function formatPaperSize(record: PaperSizeRecord, unit: PaperSizeUnit): string {
  return `${formatPaperDimension(record.shortEdgeMm, unit)} × ${formatPaperDimension(record.longEdgeMm, unit)}`
}

/** 校验静态目录，避免不完整或方向错误的数据进入页面。 */
export function validatePaperSizeCatalog(
  catalog: readonly PaperSizeRecord[] = PAPER_SIZE_CATALOG,
): ToolResult<true> {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const record of catalog) {
    if (ids.has(record.id)) {
      errors.push(`重复的纸张标识：${record.id}`)
    }
    ids.add(record.id)

    if (!record.nameZh.trim() || !record.nameEn.trim()) {
      errors.push(`纸张 ${record.id} 缺少名称`)
    }

    if (
      !Number.isFinite(record.shortEdgeMm)
      || !Number.isFinite(record.longEdgeMm)
      || record.shortEdgeMm <= 0
      || record.longEdgeMm <= 0
      || record.shortEdgeMm > record.longEdgeMm
    ) {
      errors.push(`纸张 ${record.id} 的短边/长边尺寸无效`)
    }

    if (record.standard === 'iso-216' && !['A', 'B'].includes(record.series)) {
      errors.push(`纸张 ${record.id} 的 ISO 系列无效`)
    }

    if (record.standard === 'north-america' && record.series !== 'US') {
      errors.push(`纸张 ${record.id} 的北美系列无效`)
    }
  }

  if (errors.length > 0) {
    return failure('invalid-state', '纸张尺寸目录暂不可用。', errors.join('；'))
  }

  return success(true)
}

export { PAPER_SIZE_CATALOG, PAPER_SIZE_DATASET_METADATA }
