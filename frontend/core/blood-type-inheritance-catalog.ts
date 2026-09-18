import type {
  BloodTypeDatasetMetadata,
  BloodTypeOption,
} from './blood-type-inheritance'

/** 常见 ABO + RhD 表现型目录，顺序同时作为结果展示的稳定顺序。 */
export const BLOOD_TYPE_OPTIONS: readonly BloodTypeOption[] = [
  { id: 'A+', abo: 'A', rhd: '+', labelZh: 'A+', description: 'A 型 · RhD 阳性' },
  { id: 'A-', abo: 'A', rhd: '-', labelZh: 'A−', description: 'A 型 · RhD 阴性' },
  { id: 'B+', abo: 'B', rhd: '+', labelZh: 'B+', description: 'B 型 · RhD 阳性' },
  { id: 'B-', abo: 'B', rhd: '-', labelZh: 'B−', description: 'B 型 · RhD 阴性' },
  { id: 'AB+', abo: 'AB', rhd: '+', labelZh: 'AB+', description: 'AB 型 · RhD 阳性' },
  { id: 'AB-', abo: 'AB', rhd: '-', labelZh: 'AB−', description: 'AB 型 · RhD 阴性' },
  { id: 'O+', abo: 'O', rhd: '+', labelZh: 'O+', description: 'O 型 · RhD 阳性' },
  { id: 'O-', abo: 'O', rhd: '-', labelZh: 'O−', description: 'O 型 · RhD 阴性' },
] as const

/** 血型遗传规律的静态来源、模型和覆盖范围说明。 */
export const BLOOD_TYPE_DATASET_METADATA: BloodTypeDatasetMetadata = {
  id: 'blood-type-inheritance',
  name: '常见 ABO + RhD 血型遗传教学模型',
  version: 'blood-type-inheritance-v1',
  checkedAt: '2026-09-17',
  coverage: '覆盖 A、B、AB、O 四种常见 ABO 表现型与 RhD 阳性/阴性组合，共 8 种常见血型。',
  model: 'ABO 使用 A/B 共显性、O 隐性的常见教学模型；RhD 使用 D/d 的简化模型。',
  validation: '结果只表示在本工具简化模型下的可能性，不表示概率、医学诊断或临床结论。',
  sources: [
    {
      name: 'NCBI Medical Genetics Summaries：ABO Blood Group',
      url: 'https://www.ncbi.nlm.nih.gov/books/NBK100894/',
      scope: '用于 ABO 等位基因、表现型以及 A/B 共显性、O 隐性的基础说明。',
    },
    {
      name: 'NHS：Blood groups',
      url: 'https://www.nhs.uk/tests-and-treatments/blood-groups/',
      scope: '用于常见 A、B、AB、O 与 RhD 阳性/阴性组合的用户说明。',
    },
    {
      name: 'NCBI Blood Groups and Red Cell Antigens：The Rh blood group',
      url: 'https://www.ncbi.nlm.nih.gov/books/NBK2269/',
      scope: '用于记录 Rh 系统复杂性，并界定 weak D、partial D 等内容不在首版范围。',
    },
    {
      name: 'MedlinePlus：Rh incompatibility',
      url: 'https://medlineplus.gov/rhincompatibility.html',
      scope: '用于孕产相关医学问题的排除提示；本工具不计算或判断相关风险。',
    },
  ],
}
