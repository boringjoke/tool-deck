import { failure, success, type ToolResult } from './tool-result'
import {
  WORLD_CAPITAL_CATALOG,
  WORLD_CAPITAL_DATASET_METADATA,
} from './world-capitals-catalog'

export type WorldCapitalRegion = '亚洲' | '欧洲' | '非洲' | '北美洲' | '南美洲' | '大洋洲'

export type WorldCapitalRegionFilter = WorldCapitalRegion | 'all'

export type CapitalRole = 'official' | 'seat-of-government' | 'legislative' | 'judicial' | 'other'

export type WorldCapitalView = 'table' | 'cards'

export interface CapitalEntry {
  readonly id: string
  readonly nameZh: string
  readonly nameEn: string
  readonly aliases: readonly string[]
  readonly role?: CapitalRole
  readonly note?: string
}

export interface CountryCapitalRecord {
  readonly id: string
  readonly nameZh: string
  readonly nameEn: string
  readonly aliases: readonly string[]
  readonly isoAlpha2: string
  readonly isoAlpha3: string
  readonly region: WorldCapitalRegion
  readonly capitals: readonly CapitalEntry[]
}

export interface WorldCapitalSource {
  readonly name: string
  readonly url: string
  readonly scope: string
  readonly citation: string
}

export interface WorldCapitalDatasetMetadata {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly checkedAt: string
  readonly coverage: string
  readonly validation: string
  readonly countryCount: number
  readonly capitalCount: number
  readonly sources: readonly WorldCapitalSource[]
}

export interface WorldCapitalSearchOptions {
  readonly query?: string
  readonly region?: WorldCapitalRegionFilter
}

export const WORLD_CAPITAL_REGION_OPTIONS: readonly {
  readonly value: WorldCapitalRegionFilter
  readonly label: string
}[] = [
  { value: 'all', label: '全部地区' },
  { value: '亚洲', label: '亚洲' },
  { value: '欧洲', label: '欧洲' },
  { value: '非洲', label: '非洲' },
  { value: '北美洲', label: '北美洲' },
  { value: '南美洲', label: '南美洲' },
  { value: '大洋洲', label: '大洋洲' },
]

const WORLD_CAPITAL_REGION_LABELS: Record<WorldCapitalRegion, string> = {
  亚洲: '亚洲',
  欧洲: '欧洲',
  非洲: '非洲',
  北美洲: '北美洲',
  南美洲: '南美洲',
  大洋洲: '大洋洲',
}

const CAPITAL_ROLE_LABELS: Record<CapitalRole, string> = {
  official: '法定首都',
  'seat-of-government': '政府所在地',
  legislative: '立法所在地',
  judicial: '司法所在地',
  other: '补充说明',
}

/** 规范化国家和首都搜索文本，统一连接符并忽略拉丁字母重音。 */
export function normalizeWorldCapitalSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’'`]/gu, '')
    .replace(/[-_/]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US')
}

/** 获取首都地区筛选值的用户可读名称。 */
export function getWorldCapitalRegionLabel(region: WorldCapitalRegion): string {
  return WORLD_CAPITAL_REGION_LABELS[region]
}

/** 获取首都角色的用户可读名称。 */
export function getWorldCapitalRoleLabel(role: CapitalRole): string {
  return CAPITAL_ROLE_LABELS[role]
}

/** 根据 ISO alpha-2 生成当前静态国旗资源路径。 */
export function getWorldCapitalFlagPath(isoAlpha2: string): string {
  return `/flags/${isoAlpha2.toLocaleLowerCase('en-US')}.svg`
}

/** 创建一个国家记录的稳定搜索文本。 */
function createWorldCapitalSearchText(record: CountryCapitalRecord): string {
  return [
    record.id,
    record.nameZh,
    record.nameEn,
    ...record.aliases,
    record.isoAlpha2,
    record.isoAlpha3,
    record.region,
    ...record.capitals.flatMap((capital) => [
      capital.id,
      capital.nameZh,
      capital.nameEn,
      ...capital.aliases,
      capital.role ? getWorldCapitalRoleLabel(capital.role) : '',
      capital.note ?? '',
    ]),
  ]
    .map(normalizeWorldCapitalSearchText)
    .join(' ')
}

/** 按国家英文名和稳定标识对首都目录排序。 */
function compareWorldCapitalRecords(left: CountryCapitalRecord, right: CountryCapitalRecord): number {
  return normalizeWorldCapitalSearchText(left.nameEn).localeCompare(
    normalizeWorldCapitalSearchText(right.nameEn),
    'en',
  ) || left.id.localeCompare(right.id, 'en')
}

/** 在静态目录中按国家、首都、别名、ISO 和地区执行稳定查询。 */
export function searchWorldCapitals(
  options: WorldCapitalSearchOptions = {},
  catalog: readonly CountryCapitalRecord[] = WORLD_CAPITAL_CATALOG,
): readonly CountryCapitalRecord[] {
  const query = normalizeWorldCapitalSearchText(options.query ?? '')
  const region = options.region ?? 'all'
  const exactIsoQuery = /^[a-z]{2,3}$/u.test(query)
  const hasExactIsoMatch = exactIsoQuery && catalog.some((record) => {
    if (region !== 'all' && record.region !== region) {
      return false
    }

    return record.isoAlpha2.toLocaleLowerCase('en-US') === query
      || record.isoAlpha3.toLocaleLowerCase('en-US') === query
  })

  return catalog
    .filter((record) => {
      const matchesRegion = region === 'all' || record.region === region
      const matchesIso = hasExactIsoMatch && (
        record.isoAlpha2.toLocaleLowerCase('en-US') === query
        || record.isoAlpha3.toLocaleLowerCase('en-US') === query
      )
      const matchesQuery = !query
        || matchesIso
        || (!hasExactIsoMatch && createWorldCapitalSearchText(record).includes(query))

      return matchesRegion && matchesQuery
    })
    .sort(compareWorldCapitalRecords)
}

/** 校验国家、首都、ISO、地区和数据集数量，阻止不完整目录进入页面。 */
export function validateWorldCapitalCatalog(
  catalog: readonly CountryCapitalRecord[] = WORLD_CAPITAL_CATALOG,
  metadata: WorldCapitalDatasetMetadata = WORLD_CAPITAL_DATASET_METADATA,
): ToolResult<true> {
  const errors: string[] = []
  const countryIds = new Set<string>()
  const isoAlpha2Codes = new Set<string>()
  const isoAlpha3Codes = new Set<string>()
  const capitalIds = new Set<string>()
  let capitalCount = 0

  if (catalog.length !== metadata.countryCount) {
    errors.push(`国家记录数应为 ${metadata.countryCount}，实际为 ${catalog.length}`)
  }

  for (const record of catalog) {
    if (countryIds.has(record.id)) {
      errors.push(`重复的国家标识：${record.id}`)
    }
    countryIds.add(record.id)

    if (!record.nameZh.trim() || !record.nameEn.trim()) {
      errors.push(`国家 ${record.id} 缺少名称`)
    }

    if (!/^[A-Z]{2}$/u.test(record.isoAlpha2) || !/^[A-Z]{3}$/u.test(record.isoAlpha3)) {
      errors.push(`国家 ${record.id} 的 ISO 标识无效`)
    }

    if (isoAlpha2Codes.has(record.isoAlpha2)) {
      errors.push(`重复的 ISO alpha-2：${record.isoAlpha2}`)
    }
    if (isoAlpha3Codes.has(record.isoAlpha3)) {
      errors.push(`重复的 ISO alpha-3：${record.isoAlpha3}`)
    }
    isoAlpha2Codes.add(record.isoAlpha2)
    isoAlpha3Codes.add(record.isoAlpha3)

    if (!WORLD_CAPITAL_REGION_LABELS[record.region]) {
      errors.push(`国家 ${record.id} 的地区无效`)
    }

    if (record.capitals.length === 0) {
      errors.push(`国家 ${record.id} 缺少首都条目`)
    }

    for (const capital of record.capitals) {
      capitalCount += 1

      if (capitalIds.has(capital.id)) {
        errors.push(`重复的首都标识：${capital.id}`)
      }
      capitalIds.add(capital.id)

      if (!capital.nameZh.trim() || !capital.nameEn.trim()) {
        errors.push(`首都 ${capital.id} 缺少名称`)
      }

      if (capital.role && !CAPITAL_ROLE_LABELS[capital.role]) {
        errors.push(`首都 ${capital.id} 的角色无效`)
      }
    }
  }

  if (capitalCount !== metadata.capitalCount) {
    errors.push(`首都条目数应为 ${metadata.capitalCount}，实际为 ${capitalCount}`)
  }

  if (errors.length > 0) {
    return failure('invalid-state', '各国首都目录暂不可用。', errors.join('；'))
  }

  return success(true)
}

export { WORLD_CAPITAL_CATALOG, WORLD_CAPITAL_DATASET_METADATA }
