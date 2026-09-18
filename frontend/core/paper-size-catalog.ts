import type { PaperSizeDatasetMetadata, PaperSizeRecord } from './paper-size'

const ISO_A_SIZES = [
  [0, 841, 1189],
  [1, 594, 841],
  [2, 420, 594],
  [3, 297, 420],
  [4, 210, 297],
  [5, 148, 210],
  [6, 105, 148],
  [7, 74, 105],
  [8, 52, 74],
  [9, 37, 52],
  [10, 26, 37],
] as const

const ISO_B_SIZES = [
  [0, 1000, 1414],
  [1, 707, 1000],
  [2, 500, 707],
  [3, 353, 500],
  [4, 250, 353],
  [5, 176, 250],
  [6, 125, 176],
  [7, 88, 125],
  [8, 62, 88],
  [9, 44, 62],
  [10, 31, 44],
] as const

/** 创建 ISO A/B 系列的稳定静态记录。 */
function createIsoRecord(
  series: 'A' | 'B',
  level: number,
  shortEdgeMm: number,
  longEdgeMm: number,
): PaperSizeRecord {
  const name = `${series}${level}`

  return {
    id: `iso-${series.toLowerCase()}${level}`,
    standard: 'iso-216',
    series,
    nameZh: name,
    nameEn: name,
    aliases: [`${name}纸`, `${name} 纸`, `iso ${name}`],
    shortEdgeMm,
    longEdgeMm,
    notes: 'ISO 216 A/B 系列参考尺寸。',
  }
}

export const PAPER_SIZE_DATASET_METADATA: PaperSizeDatasetMetadata = {
  id: 'paper-size-v1',
  name: '纸张尺寸参考目录',
  version: 'paper-size-v1',
  checkedAt: '2026-09-17',
  coverage: 'ISO 216 A0–A10、B0–B10，以及北美 Letter、Legal、Tabloid。',
  validation: '检查稳定标识、标准与系列关系、短边/长边顺序、来源尺寸和毫米/英寸换算。',
  sources: [
    {
      name: 'ISO 216:2007 官方记录',
      url: 'https://www.iso.org/standard/36631.html',
      scope: 'ISO A/B 系列标准范围、版本和状态',
      citation: '仅引用标准范围和公开元信息，不复制标准全文。',
    },
    {
      name: '纽约州政府 Office of General Services 白色复印纸规格',
      url: 'https://ogs.ny.gov/greenny/white-copy-paper',
      scope: 'Letter、Legal 和 Ledger/Tabloid 的常用办公尺寸语义',
      citation: '政府公开规格页面，用于交叉核对常用尺寸。',
    },
    {
      name: 'NIST Metric Bookmark',
      url: 'https://www.nist.gov/pml/owm/metric-bookmark',
      scope: 'Tabloid/Ledger 的英寸与毫米换算参考',
      citation: 'NIST 公制参考页面，用于交叉核对换算值。',
    },
  ],
}

export const PAPER_SIZE_CATALOG: readonly PaperSizeRecord[] = [
  ...ISO_A_SIZES.map(([level, shortEdgeMm, longEdgeMm]) => createIsoRecord('A', level, shortEdgeMm, longEdgeMm)),
  ...ISO_B_SIZES.map(([level, shortEdgeMm, longEdgeMm]) => createIsoRecord('B', level, shortEdgeMm, longEdgeMm)),
  {
    id: 'north-america-letter',
    standard: 'north-america',
    series: 'US',
    nameZh: 'Letter',
    nameEn: 'Letter',
    aliases: ['Letter 纸', '信纸', 'letter size', '8.5 x 11', '8.5x11'],
    shortEdgeMm: 215.9,
    longEdgeMm: 279.4,
    notes: '北美常用办公纸张尺寸；地区和设备规格可能存在差异。',
  },
  {
    id: 'north-america-legal',
    standard: 'north-america',
    series: 'US',
    nameZh: 'Legal',
    nameEn: 'Legal',
    aliases: ['Legal 纸', 'legal size', '8.5 x 14', '8.5x14'],
    shortEdgeMm: 215.9,
    longEdgeMm: 355.6,
    notes: '北美常用办公纸张尺寸；地区和设备规格可能存在差异。',
  },
  {
    id: 'north-america-tabloid',
    standard: 'north-america',
    series: 'US',
    nameZh: 'Tabloid',
    nameEn: 'Tabloid',
    aliases: ['Tabloid 纸', 'Ledger', 'Tabloid/Ledger', 'tabloid size', '11 x 17', '11x17'],
    shortEdgeMm: 279.4,
    longEdgeMm: 431.8,
    notes: '北美常用办公纸张尺寸；Ledger 常用于表示相同的 11 × 17 英寸尺寸。',
  },
]
