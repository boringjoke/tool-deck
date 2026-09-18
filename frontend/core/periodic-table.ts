import { failure, success, type ToolResult } from './tool-result'
import {
  PERIODIC_ELEMENT_CATALOG,
  PERIODIC_TABLE_DATASET_METADATA,
} from './periodic-table-catalog'

export type ElementBlock = 's' | 'p' | 'd' | 'f'

export type ElementState = 'solid' | 'liquid' | 'gas' | 'unknown'

export type ElementCategory =
  | 'nonmetal'
  | 'noble-gas'
  | 'alkali-metal'
  | 'alkaline-earth-metal'
  | 'metalloid'
  | 'halogen'
  | 'post-transition-metal'
  | 'transition-metal'
  | 'lanthanide'
  | 'actinide'

export type PeriodicElementCategoryFilter = ElementCategory | 'all'
export type PeriodicElementBlockFilter = ElementBlock | 'all'
export type PeriodicElementStateFilter = ElementState | 'all'

export interface PeriodicElementRecord {
  readonly id: string
  readonly atomicNumber: number
  readonly symbol: string
  readonly nameZh: string
  readonly nameEn: string
  readonly atomicWeight: string
  readonly period: number
  readonly group: number | null
  readonly block: ElementBlock
  readonly category: ElementCategory
  readonly state: ElementState
}

export interface PeriodicElementSource {
  readonly name: string
  readonly url: string
  readonly scope: string
}

export interface PeriodicElementDatasetMetadata {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly checkedAt: string
  readonly coverage: string
  readonly validation: string
  readonly sources: readonly PeriodicElementSource[]
}

export interface PeriodicElementSearchOptions {
  readonly query?: string
  readonly category?: PeriodicElementCategoryFilter
  readonly block?: PeriodicElementBlockFilter
  readonly state?: PeriodicElementStateFilter
}

export type PeriodicTableArea = 'main' | 'lanthanides' | 'actinides'

export interface PeriodicElementGridPosition {
  readonly area: PeriodicTableArea
  readonly row: number
  readonly column: number
}

export const PERIODIC_ELEMENT_CATEGORY_OPTIONS: readonly {
  readonly value: PeriodicElementCategoryFilter
  readonly label: string
}[] = [
  { value: 'all', label: '全部分类' },
  { value: 'alkali-metal', label: '碱金属' },
  { value: 'alkaline-earth-metal', label: '碱土金属' },
  { value: 'transition-metal', label: '过渡金属' },
  { value: 'post-transition-metal', label: '后过渡金属' },
  { value: 'metalloid', label: '类金属' },
  { value: 'nonmetal', label: '非金属' },
  { value: 'halogen', label: '卤素' },
  { value: 'noble-gas', label: '稀有气体' },
  { value: 'lanthanide', label: '镧系元素' },
  { value: 'actinide', label: '锕系元素' },
] as const

export const PERIODIC_ELEMENT_BLOCK_OPTIONS: readonly {
  readonly value: PeriodicElementBlockFilter
  readonly label: string
}[] = [
  { value: 'all', label: '全部区块' },
  { value: 's', label: 's 区' },
  { value: 'p', label: 'p 区' },
  { value: 'd', label: 'd 区' },
  { value: 'f', label: 'f 区' },
] as const

export const PERIODIC_ELEMENT_STATE_OPTIONS: readonly {
  readonly value: PeriodicElementStateFilter
  readonly label: string
}[] = [
  { value: 'all', label: '全部状态' },
  { value: 'solid', label: '固体' },
  { value: 'liquid', label: '液体' },
  { value: 'gas', label: '气体' },
  { value: 'unknown', label: '未知/预测' },
] as const

const PERIODIC_ELEMENT_CATEGORY_LABELS: Record<ElementCategory, string> = {
  'nonmetal': '非金属',
  'noble-gas': '稀有气体',
  'alkali-metal': '碱金属',
  'alkaline-earth-metal': '碱土金属',
  'metalloid': '类金属',
  'halogen': '卤素',
  'post-transition-metal': '后过渡金属',
  'transition-metal': '过渡金属',
  'lanthanide': '镧系元素',
  'actinide': '锕系元素',
}

const PERIODIC_ELEMENT_STATE_LABELS: Record<ElementState, string> = {
  solid: '固体',
  liquid: '液体',
  gas: '气体',
  unknown: '未知/预测',
}

/** 规范化元素搜索文本，统一空白并忽略英文大小写和重音。 */
export function normalizePeriodicElementSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US')
}

/** 获取元素分类的用户可读名称。 */
export function getPeriodicElementCategoryLabel(category: ElementCategory): string {
  return PERIODIC_ELEMENT_CATEGORY_LABELS[category]
}

/** 获取元素区块的用户可读名称。 */
export function getPeriodicElementBlockLabel(block: ElementBlock): string {
  return `${block} 区`
}

/** 获取元素常温状态的用户可读名称。 */
export function getPeriodicElementStateLabel(state: ElementState): string {
  return PERIODIC_ELEMENT_STATE_LABELS[state]
}

function createPeriodicElementSearchText(record: PeriodicElementRecord): string {
  return [
    record.atomicNumber,
    record.symbol,
    record.nameZh,
    record.nameEn,
    getPeriodicElementCategoryLabel(record.category),
    record.category,
    getPeriodicElementBlockLabel(record.block),
    record.block,
    getPeriodicElementStateLabel(record.state),
  ]
    .map((value) => normalizePeriodicElementSearchText(String(value)))
    .join(' ')
}

/** 在静态元素目录中按名称、符号、原子序数和属性筛选。 */
export function searchPeriodicElements(
  options: PeriodicElementSearchOptions = {},
  catalog: readonly PeriodicElementRecord[] = PERIODIC_ELEMENT_CATALOG,
): readonly PeriodicElementRecord[] {
  const query = normalizePeriodicElementSearchText(options.query ?? '')
  const category = options.category ?? 'all'
  const block = options.block ?? 'all'
  const state = options.state ?? 'all'
  const numericQuery = /^\d+$/u.test(query) ? Number(query) : null
  const exactSymbolQuery = /^[a-z]{1,3}$/u.test(query)
  const hasExactSymbolMatch = exactSymbolQuery && catalog.some((record) => {
    if (category !== 'all' && record.category !== category) {
      return false
    }

    if (block !== 'all' && record.block !== block) {
      return false
    }

    if (state !== 'all' && record.state !== state) {
      return false
    }

    return normalizePeriodicElementSearchText(record.symbol) === query
  })

  return catalog
    .filter((record) => {
      const matchesQuery = !query
        || (numericQuery !== null
          ? record.atomicNumber === numericQuery
          : hasExactSymbolMatch
            ? normalizePeriodicElementSearchText(record.symbol) === query
            : createPeriodicElementSearchText(record).includes(query))
      const matchesCategory = category === 'all' || record.category === category
      const matchesBlock = block === 'all' || record.block === block
      const matchesState = state === 'all' || record.state === state

      return matchesQuery && matchesCategory && matchesBlock && matchesState
    })
    .sort((left, right) => left.atomicNumber - right.atomicNumber)
}

/** 获取元素在主周期表或镧系/锕系行中的位置。 */
export function getPeriodicElementGridPosition(
  record: PeriodicElementRecord,
): PeriodicElementGridPosition {
  if (record.group !== null) {
    return {
      area: 'main',
      row: record.period,
      column: record.group,
    }
  }

  if (record.category === 'lanthanide') {
    return {
      area: 'lanthanides',
      row: 1,
      column: record.atomicNumber - 56,
    }
  }

  return {
    area: 'actinides',
    row: 1,
    column: record.atomicNumber - 88,
  }
}

/** 获取镧系或锕系的独立展示行，保留 La/Ac 作为首项。 */
export function getPeriodicElementSeries(
  series: 'lanthanides' | 'actinides',
  catalog: readonly PeriodicElementRecord[] = PERIODIC_ELEMENT_CATALOG,
): readonly PeriodicElementRecord[] {
  const category = series === 'lanthanides' ? 'lanthanide' : 'actinide'

  return catalog
    .filter((record) => record.category === category)
    .sort((left, right) => left.atomicNumber - right.atomicNumber)
}

/** 校验静态元素目录的完整性、唯一性和周期表位置边界。 */
export function validatePeriodicElementCatalog(
  catalog: readonly PeriodicElementRecord[] = PERIODIC_ELEMENT_CATALOG,
): ToolResult<true> {
  const errors: string[] = []
  const atomicNumbers = new Set<number>()
  const symbols = new Set<string>()

  if (catalog.length !== 118) {
    errors.push(`元素目录应包含 118 条记录，实际为 ${catalog.length} 条`)
  }

  for (const record of catalog) {
    if (!Number.isInteger(record.atomicNumber) || record.atomicNumber < 1 || record.atomicNumber > 118) {
      errors.push(`元素 ${record.symbol} 的原子序数无效`)
    }

    if (atomicNumbers.has(record.atomicNumber)) {
      errors.push(`重复的原子序数：${record.atomicNumber}`)
    }
    atomicNumbers.add(record.atomicNumber)

    const normalizedSymbol = record.symbol.toLocaleLowerCase('en-US')
    if (symbols.has(normalizedSymbol)) {
      errors.push(`重复的元素符号：${record.symbol}`)
    }
    symbols.add(normalizedSymbol)

    if (!record.nameZh.trim() || !record.nameEn.trim() || !record.atomicWeight.trim()) {
      errors.push(`元素 ${record.atomicNumber} 缺少名称或原子量`)
    }

    if (!Number.isInteger(record.period) || record.period < 1 || record.period > 7) {
      errors.push(`元素 ${record.symbol} 的周期无效`)
    }

    if (record.group !== null && (!Number.isInteger(record.group) || record.group < 1 || record.group > 18)) {
      errors.push(`元素 ${record.symbol} 的族无效`)
    }

    if (
      record.group === null
      && record.category !== 'lanthanide'
      && record.category !== 'actinide'
    ) {
      errors.push(`元素 ${record.symbol} 缺少可定位的族或 f 区分类`)
    }

    if (record.category === 'lanthanide' && (record.atomicNumber < 57 || record.atomicNumber > 71)) {
      errors.push(`元素 ${record.symbol} 的镧系分类无效`)
    }

    if (record.category === 'actinide' && (record.atomicNumber < 89 || record.atomicNumber > 103)) {
      errors.push(`元素 ${record.symbol} 的锕系分类无效`)
    }
  }

  for (let atomicNumber = 1; atomicNumber <= 118; atomicNumber += 1) {
    if (!atomicNumbers.has(atomicNumber)) {
      errors.push(`缺少原子序数 ${atomicNumber}`)
    }
  }

  if (errors.length > 0) {
    return failure('invalid-state', '元素周期表目录暂不可用。', errors.join('；'))
  }

  return success(true)
}

export {
  PERIODIC_ELEMENT_CATALOG,
  PERIODIC_TABLE_DATASET_METADATA,
}
