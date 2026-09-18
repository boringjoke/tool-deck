import { failure, success, type ToolResult } from './tool-result'
import {
  BLOOD_TYPE_DATASET_METADATA,
  BLOOD_TYPE_OPTIONS,
} from './blood-type-inheritance-catalog'

export type ABOPhenotype = 'A' | 'B' | 'AB' | 'O'

export type RhDPhenotype = '+' | '-'

export type BloodTypeId = `${ABOPhenotype}${RhDPhenotype}`

export interface BloodTypeOption {
  id: BloodTypeId
  abo: ABOPhenotype
  rhd: RhDPhenotype
  labelZh: string
  description: string
}

export interface BloodTypeSource {
  name: string
  url: string
  scope: string
}

export interface BloodTypeDatasetMetadata {
  id: string
  name: string
  version: string
  checkedAt: string
  coverage: string
  model: string
  validation: string
  sources: readonly BloodTypeSource[]
}

export interface BloodTypeInheritanceQuery {
  parentA: BloodTypeId | null
  parentB: BloodTypeId | null
}

export interface BloodTypeInheritanceResult {
  possibleTypes: readonly BloodTypeId[]
  modelNote: string
}

type ABOAllele = 'A' | 'B' | 'O'
type ABOGenotype = readonly [ABOAllele, ABOAllele]
type RhDAllele = 'D' | 'd'
type RhDGenotype = readonly [RhDAllele, RhDAllele]

const BLOOD_TYPE_ORDER: readonly BloodTypeId[] = BLOOD_TYPE_OPTIONS.map((option) => option.id)

const ABO_PHENOTYPE_ORDER: readonly ABOPhenotype[] = ['A', 'B', 'AB', 'O']

const RHD_PHENOTYPE_ORDER: readonly RhDPhenotype[] = ['+', '-']

const ABO_GENOTYPES: Record<ABOPhenotype, readonly ABOGenotype[]> = {
  A: [['A', 'A'], ['A', 'O']],
  B: [['B', 'B'], ['B', 'O']],
  AB: [['A', 'B']],
  O: [['O', 'O']],
}

const RHD_GENOTYPES: Record<RhDPhenotype, readonly RhDGenotype[]> = {
  '+': [['D', 'D'], ['D', 'd']],
  '-': [['d', 'd']],
}

const BLOOD_TYPE_OPTION_BY_ID = new Map(
  BLOOD_TYPE_OPTIONS.map((option) => [option.id, option]),
)

/** 将表现型展开为其在常见教学模型中的兼容 ABO 基因型。 */
function getAboGenotypes(phenotype: ABOPhenotype): readonly ABOGenotype[] {
  return ABO_GENOTYPES[phenotype]
}

/** 将 ABO 等位基因组合归一化为表现型。 */
function getAboPhenotype(left: ABOAllele, right: ABOAllele): ABOPhenotype {
  if (left === 'A' && right === 'B' || left === 'B' && right === 'A') {
    return 'AB'
  }

  if (left === 'A' || right === 'A') {
    return 'A'
  }

  if (left === 'B' || right === 'B') {
    return 'B'
  }

  return 'O'
}

/** 将 RhD 等位基因组合归一化为阳性或阴性表现型。 */
function getRhDPhenotype(left: RhDAllele, right: RhDAllele): RhDPhenotype {
  return left === 'D' || right === 'D' ? '+' : '-'
}

/** 根据两位家长的 ABO 表现型枚举子代可能的 ABO 表现型。 */
function getPossibleAboPhenotypes(
  parentA: ABOPhenotype,
  parentB: ABOPhenotype,
): readonly ABOPhenotype[] {
  const possible = new Set<ABOPhenotype>()

  for (const genotypeA of getAboGenotypes(parentA)) {
    for (const genotypeB of getAboGenotypes(parentB)) {
      for (const alleleA of genotypeA) {
        for (const alleleB of genotypeB) {
          possible.add(getAboPhenotype(alleleA, alleleB))
        }
      }
    }
  }

  return ABO_PHENOTYPE_ORDER.filter((phenotype) => possible.has(phenotype))
}

/** 根据两位家长的 RhD 表现型枚举子代可能的 RhD 表现型。 */
function getPossibleRhDPhenotypes(
  parentA: RhDPhenotype,
  parentB: RhDPhenotype,
): readonly RhDPhenotype[] {
  const possible = new Set<RhDPhenotype>()

  for (const genotypeA of RHD_GENOTYPES[parentA]) {
    for (const genotypeB of RHD_GENOTYPES[parentB]) {
      for (const alleleA of genotypeA) {
        for (const alleleB of genotypeB) {
          possible.add(getRhDPhenotype(alleleA, alleleB))
        }
      }
    }
  }

  return RHD_PHENOTYPE_ORDER.filter((phenotype) => possible.has(phenotype))
}

/** 根据目录 ID 获取血型选项。 */
export function getBloodTypeOption(id: BloodTypeId): BloodTypeOption {
  return BLOOD_TYPE_OPTION_BY_ID.get(id)!
}

/** 计算两位家长在常见 ABO + RhD 教学模型下的子代可能血型。 */
export function getPossibleChildBloodTypes(
  parentA: BloodTypeId | null,
  parentB: BloodTypeId | null,
): readonly BloodTypeId[] {
  if (!parentA || !parentB) {
    return []
  }

  const optionA = getBloodTypeOption(parentA)
  const optionB = getBloodTypeOption(parentB)
  const possibleAbo = getPossibleAboPhenotypes(optionA.abo, optionB.abo)
  const possibleRhD = getPossibleRhDPhenotypes(optionA.rhd, optionB.rhd)
  const possible = new Set<BloodTypeId>()

  for (const abo of possibleAbo) {
    for (const rhd of possibleRhD) {
      possible.add(`${abo}${rhd}` as BloodTypeId)
    }
  }

  return BLOOD_TYPE_ORDER.filter((id) => possible.has(id))
}

/** 判断输入是否已完成两位家长的血型选择。 */
export function hasCompleteBloodTypeQuery(query: BloodTypeInheritanceQuery): boolean {
  return Boolean(query.parentA && query.parentB)
}

/** 校验常见血型静态目录，避免页面显示不完整或不一致的选项。 */
export function validateBloodTypeCatalog(
  catalog: readonly BloodTypeOption[] = BLOOD_TYPE_OPTIONS,
): ToolResult<true> {
  const errors: string[] = []
  const ids = new Set<string>()
  const expectedIds = new Set(BLOOD_TYPE_ORDER)

  if (catalog.length !== expectedIds.size) {
    errors.push(`血型目录应包含 ${expectedIds.size} 项，实际为 ${catalog.length} 项`)
  }

  for (const option of catalog) {
    if (ids.has(option.id)) {
      errors.push(`重复的血型标识：${option.id}`)
    }
    ids.add(option.id)

    if (!expectedIds.has(option.id)) {
      errors.push(`未知的血型标识：${option.id}`)
    }

    if (!option.labelZh.trim() || !option.description.trim()) {
      errors.push(`血型 ${option.id} 缺少显示名称或说明`)
    }

    if (`${option.abo}${option.rhd}` !== option.id) {
      errors.push(`血型 ${option.id} 的 ABO/RhD 字段不一致`)
    }
  }

  if (ids.size !== expectedIds.size) {
    errors.push('血型目录未覆盖全部常见 ABO + RhD 组合')
  }

  if (errors.length > 0) {
    return failure('invalid-state', '血型目录暂不可用。', errors.join('；'))
  }

  return success(true)
}

export {
  BLOOD_TYPE_DATASET_METADATA,
  BLOOD_TYPE_OPTIONS,
}
