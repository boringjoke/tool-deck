import { failure, success, type ToolResult } from './tool-result'

export type UnitCategory = 'length' | 'area' | 'volume' | 'mass' | 'temperature' | 'speed'

export type UnitKey =
  | 'millimeter'
  | 'centimeter'
  | 'meter'
  | 'kilometer'
  | 'inch'
  | 'foot'
  | 'yard'
  | 'mile'
  | 'square-millimeter'
  | 'square-centimeter'
  | 'square-meter'
  | 'square-kilometer'
  | 'hectare'
  | 'acre'
  | 'square-foot'
  | 'milliliter'
  | 'liter'
  | 'cubic-centimeter'
  | 'cubic-meter'
  | 'us-fluid-ounce'
  | 'us-gallon'
  | 'milligram'
  | 'gram'
  | 'kilogram'
  | 'metric-ton'
  | 'ounce'
  | 'pound'
  | 'celsius'
  | 'fahrenheit'
  | 'kelvin'
  | 'meter-per-second'
  | 'kilometer-per-hour'
  | 'mile-per-hour'
  | 'knot'

export interface UnitDefinition {
  readonly key: UnitKey
  readonly label: string
  readonly symbol: string
  readonly factorToBase: number
}

export interface UnitCategoryDefinition {
  readonly key: UnitCategory
  readonly label: string
  readonly baseUnit: UnitKey
  readonly allowsNegative: boolean
  readonly defaultFrom: UnitKey
  readonly defaultTo: UnitKey
  readonly units: readonly UnitDefinition[]
}

export interface UnitConversionOptions {
  category: UnitCategory
  value: string
  fromUnit: UnitKey
  toUnit: UnitKey
}

const LENGTH_UNITS = [
  { key: 'millimeter', label: '毫米', symbol: 'mm', factorToBase: 0.001 },
  { key: 'centimeter', label: '厘米', symbol: 'cm', factorToBase: 0.01 },
  { key: 'meter', label: '米', symbol: 'm', factorToBase: 1 },
  { key: 'kilometer', label: '千米', symbol: 'km', factorToBase: 1000 },
  { key: 'inch', label: '英寸', symbol: 'in', factorToBase: 0.0254 },
  { key: 'foot', label: '英尺', symbol: 'ft', factorToBase: 0.3048 },
  { key: 'yard', label: '码', symbol: 'yd', factorToBase: 0.9144 },
  { key: 'mile', label: '英里', symbol: 'mi', factorToBase: 1609.344 },
] as const satisfies readonly UnitDefinition[]

const AREA_UNITS = [
  { key: 'square-millimeter', label: '平方毫米', symbol: 'mm²', factorToBase: 1e-6 },
  { key: 'square-centimeter', label: '平方厘米', symbol: 'cm²', factorToBase: 1e-4 },
  { key: 'square-meter', label: '平方米', symbol: 'm²', factorToBase: 1 },
  { key: 'square-kilometer', label: '平方千米', symbol: 'km²', factorToBase: 1e6 },
  { key: 'hectare', label: '公顷', symbol: 'ha', factorToBase: 10000 },
  { key: 'acre', label: '英亩', symbol: 'acre', factorToBase: 4046.8564224 },
  { key: 'square-foot', label: '平方英尺', symbol: 'ft²', factorToBase: 0.09290304 },
] as const satisfies readonly UnitDefinition[]

const VOLUME_UNITS = [
  { key: 'milliliter', label: '毫升', symbol: 'mL', factorToBase: 0.001 },
  { key: 'liter', label: '升', symbol: 'L', factorToBase: 1 },
  { key: 'cubic-centimeter', label: '立方厘米', symbol: 'cm³', factorToBase: 0.001 },
  { key: 'cubic-meter', label: '立方米', symbol: 'm³', factorToBase: 1000 },
  { key: 'us-fluid-ounce', label: '美制液量盎司', symbol: 'US fl oz', factorToBase: 0.0295735295625 },
  { key: 'us-gallon', label: '美制加仑', symbol: 'US gal', factorToBase: 3.785411784 },
] as const satisfies readonly UnitDefinition[]

const MASS_UNITS = [
  { key: 'milligram', label: '毫克', symbol: 'mg', factorToBase: 1e-6 },
  { key: 'gram', label: '克', symbol: 'g', factorToBase: 0.001 },
  { key: 'kilogram', label: '千克', symbol: 'kg', factorToBase: 1 },
  { key: 'metric-ton', label: '公吨', symbol: 't', factorToBase: 1000 },
  { key: 'ounce', label: '盎司', symbol: 'oz', factorToBase: 0.028349523125 },
  { key: 'pound', label: '磅', symbol: 'lb', factorToBase: 0.45359237 },
] as const satisfies readonly UnitDefinition[]

const TEMPERATURE_UNITS = [
  { key: 'celsius', label: '摄氏度', symbol: '°C', factorToBase: 1 },
  { key: 'fahrenheit', label: '华氏度', symbol: '°F', factorToBase: 1 },
  { key: 'kelvin', label: '开尔文', symbol: 'K', factorToBase: 1 },
] as const satisfies readonly UnitDefinition[]

const SPEED_UNITS = [
  { key: 'meter-per-second', label: '米/秒', symbol: 'm/s', factorToBase: 1 },
  { key: 'kilometer-per-hour', label: '千米/小时', symbol: 'km/h', factorToBase: 1 / 3.6 },
  { key: 'mile-per-hour', label: '英里/小时', symbol: 'mph', factorToBase: 0.44704 },
  { key: 'knot', label: '节', symbol: 'kn', factorToBase: 0.514444 },
] as const satisfies readonly UnitDefinition[]

export const UNIT_CATEGORIES = [
  {
    key: 'length',
    label: '长度',
    baseUnit: 'meter',
    allowsNegative: false,
    defaultFrom: 'meter',
    defaultTo: 'foot',
    units: LENGTH_UNITS,
  },
  {
    key: 'area',
    label: '面积',
    baseUnit: 'square-meter',
    allowsNegative: false,
    defaultFrom: 'square-meter',
    defaultTo: 'square-foot',
    units: AREA_UNITS,
  },
  {
    key: 'volume',
    label: '体积',
    baseUnit: 'liter',
    allowsNegative: false,
    defaultFrom: 'liter',
    defaultTo: 'milliliter',
    units: VOLUME_UNITS,
  },
  {
    key: 'mass',
    label: '质量',
    baseUnit: 'kilogram',
    allowsNegative: false,
    defaultFrom: 'kilogram',
    defaultTo: 'pound',
    units: MASS_UNITS,
  },
  {
    key: 'temperature',
    label: '温度',
    baseUnit: 'celsius',
    allowsNegative: true,
    defaultFrom: 'celsius',
    defaultTo: 'fahrenheit',
    units: TEMPERATURE_UNITS,
  },
  {
    key: 'speed',
    label: '速度',
    baseUnit: 'meter-per-second',
    allowsNegative: false,
    defaultFrom: 'kilometer-per-hour',
    defaultTo: 'mile-per-hour',
    units: SPEED_UNITS,
  },
] as const satisfies readonly UnitCategoryDefinition[]

const DECIMAL_PATTERN = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/

/** 获取指定单位类别的定义。 */
export function getUnitCategory(category: UnitCategory): UnitCategoryDefinition | undefined {
  return UNIT_CATEGORIES.find((definition) => definition.key === category)
}

/** 获取类别中的指定单位定义。 */
export function getUnitDefinition(
  category: UnitCategory,
  unit: UnitKey,
): UnitDefinition | undefined {
  return getUnitCategory(category)?.units.find((definition) => definition.key === unit)
}

/** 解析单位换算输入并校验数值范围。 */
function parseValue(value: string, allowsNegative: boolean): ToolResult<number> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入需要换算的数值。')
  }

  if (!DECIMAL_PATTERN.test(input)) {
    return failure('invalid-input', '请输入不带单位、逗号或指数的十进制数值。')
  }

  const parsed = Number(input)

  if (!Number.isFinite(parsed)) {
    return failure('out-of-range', '数值过大或过小，无法稳定换算。')
  }

  if (!allowsNegative && parsed < 0) {
    return failure('invalid-input', '当前类别不接受负数，请输入零或正数。')
  }

  return success(parsed === 0 ? 0 : parsed)
}

/** 将温度值转换为摄氏度基准值。 */
function toCelsius(value: number, unit: UnitKey): number {
  if (unit === 'fahrenheit') {
    return (value - 32) * (5 / 9)
  }

  if (unit === 'kelvin') {
    return value - 273.15
  }

  return value
}

/** 将摄氏度基准值转换为目标温度单位。 */
function fromCelsius(value: number, unit: UnitKey): number {
  if (unit === 'fahrenheit') {
    return value * (9 / 5) + 32
  }

  if (unit === 'kelvin') {
    return value + 273.15
  }

  return value
}

/** 将输入值转换为类别对应的基准单位。 */
function convertToBase(value: number, category: UnitCategory, unit: UnitDefinition): number {
  if (category === 'temperature') {
    return toCelsius(value, unit.key)
  }

  return value * unit.factorToBase
}

/** 将基准单位值转换为目标单位。 */
function convertFromBase(value: number, category: UnitCategory, unit: UnitDefinition): number {
  if (category === 'temperature') {
    return fromCelsius(value, unit.key)
  }

  return value / unit.factorToBase
}

/** 移除十进制文本末尾无意义的零。 */
function trimDecimalZeros(value: string): string {
  if (!value.includes('.')) {
    return value
  }

  return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
}

/** 将单位换算数值格式化为可读文本。 */
function formatValue(value: number): string {
  if (value === 0 || Object.is(value, -0)) {
    return '0'
  }

  const formatted = value.toPrecision(12)

  if (!formatted.includes('e')) {
    return trimDecimalZeros(formatted)
  }

  const exponentIndex = formatted.indexOf('e')
  const coefficient = formatted.slice(0, exponentIndex)
  const exponent = formatted.slice(exponentIndex + 1)
  const normalizedExponent = exponent.replace(/^\+/, '')
  return `${trimDecimalZeros(coefficient)}e${normalizedExponent}`
}

/** 格式化单位换算结果数值。 */
export function formatUnitValue(value: number): string {
  return formatValue(value)
}

/** 执行单位类别和单位之间的数值换算。 */
export function convertUnit(options: UnitConversionOptions): ToolResult<string> {
  const category = getUnitCategory(options.category)
  const fromUnit = getUnitDefinition(options.category, options.fromUnit)
  const toUnit = getUnitDefinition(options.category, options.toUnit)

  if (!category || !fromUnit || !toUnit) {
    return failure('operation-failed', '当前单位定义不可用，请重试。')
  }

  const parsedResult = parseValue(options.value, category.allowsNegative)

  if (!parsedResult.ok) {
    return parsedResult
  }

  const baseValue = convertToBase(parsedResult.value, category.key, fromUnit)
  const convertedValue = convertFromBase(baseValue, category.key, toUnit)

  if (!Number.isFinite(baseValue) || !Number.isFinite(convertedValue)) {
    return failure('out-of-range', '换算结果超出可稳定表示范围。')
  }

  return success(formatValue(convertedValue))
}
