import { failure, success, type ToolResult } from './tool-result'

export const COORDINATE_SYSTEMS = [
  { key: 'wgs84', label: 'WGS84', description: '全球常用地理坐标基准' },
  { key: 'gcj02', label: 'GCJ-02', description: '中国地图服务常见的加密偏移坐标' },
  { key: 'bd09', label: 'BD-09', description: '百度地图常见的二次偏移坐标' },
] as const

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[number]['key']

export interface CoordinatePoint {
  latitude: number
  longitude: number
}

export interface CoordinateConversionOptions {
  latitude: string
  longitude: string
  source: CoordinateSystem
  target: CoordinateSystem
}

export interface CoordinateConversionValue extends CoordinatePoint {
  source: CoordinateSystem
  target: CoordinateSystem
  latitudeText: string
  longitudeText: string
  copyText: string
}

export const COORDINATE_DISPLAY_DECIMALS = 6

export const COORDINATE_LIMITS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
} as const

/** 参考公式的适用范围矩形，不等同于行政区或法律边界。 */
export const TRANSFORMATION_BOUNDS = {
  latitude: { min: 3.86, max: 53.55 },
  longitude: { min: 73.66, max: 135.05 },
} as const

const DECIMAL_DEGREES_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/
const PI = Math.PI
const X_PI = (PI * 3000) / 180
const SEMI_MAJOR_AXIS = 6378245
const ECCENTRICITY_SQUARED = 0.00669342162296594323
const INVERSE_TOLERANCE_DEGREES = 1e-10
const MAX_INVERSE_ITERATIONS = 30

/** 判断输入是否为首版支持的坐标系标识。 */
export function isCoordinateSystem(value: unknown): value is CoordinateSystem {
  return COORDINATE_SYSTEMS.some((system) => system.key === value)
}

/** 获取坐标系的中文说明标签。 */
export function getCoordinateSystemLabel(system: CoordinateSystem): string {
  return COORDINATE_SYSTEMS.find((item) => item.key === system)?.label ?? system
}

/** 判断坐标点是否处于全球经纬度数值范围内。 */
export function isValidCoordinatePoint(point: unknown): point is CoordinatePoint {
  if (!point || typeof point !== 'object') {
    return false
  }

  const candidate = point as Partial<CoordinatePoint>
  return (
    typeof candidate.latitude === 'number'
    && Number.isFinite(candidate.latitude)
    && candidate.latitude >= COORDINATE_LIMITS.latitude.min
    && candidate.latitude <= COORDINATE_LIMITS.latitude.max
    && typeof candidate.longitude === 'number'
    && Number.isFinite(candidate.longitude)
    && candidate.longitude >= COORDINATE_LIMITS.longitude.min
    && candidate.longitude <= COORDINATE_LIMITS.longitude.max
  )
}

/** 判断坐标点是否处于 GCJ-02/BD-09 参考公式的适用范围内。 */
export function isWithinTransformationBounds(point: CoordinatePoint): boolean {
  return (
    point.latitude >= TRANSFORMATION_BOUNDS.latitude.min
    && point.latitude <= TRANSFORMATION_BOUNDS.latitude.max
    && point.longitude >= TRANSFORMATION_BOUNDS.longitude.min
    && point.longitude <= TRANSFORMATION_BOUNDS.longitude.max
  )
}

/** 将单个经纬度文本解析为有限数字并校验范围。 */
function parseCoordinateValue(
  value: unknown,
  label: '纬度' | '经度',
  limits: { min: number; max: number },
): ToolResult<number> {
  if (typeof value !== 'string' || !value.trim()) {
    return failure('empty-input', `请输入${label}。`)
  }

  const input = value.trim()
  if (!DECIMAL_DEGREES_PATTERN.test(input)) {
    return failure('invalid-input', `${label}必须是十进制度数，不支持逗号、指数或单位。`)
  }

  const parsed = Number(input)
  if (!Number.isFinite(parsed)) {
    return failure('out-of-range', `${label}超出可稳定表示范围。`)
  }

  if (parsed < limits.min || parsed > limits.max) {
    return failure('out-of-range', `${label}必须在 ${limits.min} 至 ${limits.max} 之间。`)
  }

  return success(Object.is(parsed, -0) ? 0 : parsed)
}

/** 将 WGS84 坐标转换为 GCJ-02 坐标；调用方负责适用范围校验。 */
function wgs84ToGcj02(point: CoordinatePoint): CoordinatePoint {
  const deltaLatitude = transformLatitude(point.longitude - 105, point.latitude - 35)
  const deltaLongitude = transformLongitude(point.longitude - 105, point.latitude - 35)
  const latitudeRadians = (point.latitude / 180) * PI
  const sine = Math.sin(latitudeRadians)
  const magic = 1 - ECCENTRICITY_SQUARED * sine * sine
  const squareRootMagic = Math.sqrt(magic)
  const adjustedLatitude = (deltaLatitude * 180) / ((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * squareRootMagic) * PI)
  const adjustedLongitude = (deltaLongitude * 180) / (SEMI_MAJOR_AXIS / squareRootMagic * Math.cos(latitudeRadians) * PI)

  return {
    latitude: point.latitude + adjustedLatitude,
    longitude: point.longitude + adjustedLongitude,
  }
}

/** 将 GCJ-02 坐标反向迭代到 WGS84；调用方负责适用范围校验。 */
function gcj02ToWgs84(point: CoordinatePoint): CoordinatePoint {
  let estimate = { ...point }

  for (let iteration = 0; iteration < MAX_INVERSE_ITERATIONS; iteration += 1) {
    const projected = wgs84ToGcj02(estimate)
    const latitudeError = projected.latitude - point.latitude
    const longitudeError = projected.longitude - point.longitude

    if (
      Math.abs(latitudeError) <= INVERSE_TOLERANCE_DEGREES
      && Math.abs(longitudeError) <= INVERSE_TOLERANCE_DEGREES
    ) {
      return estimate
    }

    estimate = {
      latitude: estimate.latitude - latitudeError,
      longitude: estimate.longitude - longitudeError,
    }
  }

  return estimate
}

/** 将 GCJ-02 坐标转换为 BD-09 坐标；调用方负责适用范围校验。 */
function gcj02ToBd09(point: CoordinatePoint): CoordinatePoint {
  const radius = Math.sqrt(point.longitude * point.longitude + point.latitude * point.latitude)
    + 0.00002 * Math.sin(point.latitude * X_PI)
  const theta = Math.atan2(point.latitude, point.longitude)
    + 0.000003 * Math.cos(point.longitude * X_PI)

  return {
    longitude: radius * Math.cos(theta) + 0.0065,
    latitude: radius * Math.sin(theta) + 0.006,
  }
}

/** 将 BD-09 坐标转换为 GCJ-02 坐标；调用方负责适用范围校验。 */
function bd09ToGcj02(point: CoordinatePoint): CoordinatePoint {
  const x = point.longitude - 0.0065
  const y = point.latitude - 0.006
  const radius = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI)

  return {
    longitude: radius * Math.cos(theta),
    latitude: radius * Math.sin(theta),
  }
}

/** 对已校验的点执行坐标系转换。 */
function convertPoint(
  point: CoordinatePoint,
  source: CoordinateSystem,
  target: CoordinateSystem,
): CoordinatePoint {
  if (source === target) {
    return point
  }

  if (source === 'wgs84' && target === 'gcj02') {
    return wgs84ToGcj02(point)
  }

  if (source === 'gcj02' && target === 'wgs84') {
    return gcj02ToWgs84(point)
  }

  if (source === 'gcj02' && target === 'bd09') {
    return gcj02ToBd09(point)
  }

  if (source === 'bd09' && target === 'gcj02') {
    return bd09ToGcj02(point)
  }

  if (source === 'wgs84' && target === 'bd09') {
    return gcj02ToBd09(wgs84ToGcj02(point))
  }

  return gcj02ToWgs84(bd09ToGcj02(point))
}

/** 格式化坐标结果，避免负零显示。 */
export function formatCoordinate(value: number): string {
  const formatted = value.toFixed(COORDINATE_DISPLAY_DECIMALS)
  return formatted === '-0.000000' ? '0.000000' : formatted
}

/** 格式化可复制的带标签坐标文本。 */
export function formatCoordinateCopy(point: CoordinatePoint): string {
  return `纬度: ${formatCoordinate(point.latitude)}\n经度: ${formatCoordinate(point.longitude)}`
}

/** 在浏览器本地完成一个坐标点的转换。 */
export function convertCoordinate(
  options: CoordinateConversionOptions,
): ToolResult<CoordinateConversionValue> {
  if (!isCoordinateSystem(options.source) || !isCoordinateSystem(options.target)) {
    return failure('unsupported-input', '当前仅支持 WGS84、GCJ-02 和 BD-09 坐标系。')
  }

  if (options.source === options.target) {
    return failure('invalid-input', '源坐标系和目标坐标系不能相同，请选择不同的坐标系。')
  }

  const latitudeResult = parseCoordinateValue(
    options.latitude,
    '纬度',
    COORDINATE_LIMITS.latitude,
  )
  if (!latitudeResult.ok) {
    return latitudeResult
  }

  const longitudeResult = parseCoordinateValue(
    options.longitude,
    '经度',
    COORDINATE_LIMITS.longitude,
  )
  if (!longitudeResult.ok) {
    return longitudeResult
  }

  const input = {
    latitude: latitudeResult.value,
    longitude: longitudeResult.value,
  }

  if (!isWithinTransformationBounds(input)) {
    return failure(
      'out-of-range',
      '该坐标超出 GCJ-02/BD-09 参考公式的适用范围，未生成转换结果。',
      `纬度 ${TRANSFORMATION_BOUNDS.latitude.min}–${TRANSFORMATION_BOUNDS.latitude.max}，经度 ${TRANSFORMATION_BOUNDS.longitude.min}–${TRANSFORMATION_BOUNDS.longitude.max}`,
    )
  }

  const output = convertPoint(input, options.source, options.target)
  if (!isValidCoordinatePoint(output)) {
    return failure('operation-failed', '坐标转换结果不可用，请检查输入后重试。')
  }

  const latitudeText = formatCoordinate(output.latitude)
  const longitudeText = formatCoordinate(output.longitude)

  return success({
    source: options.source,
    target: options.target,
    latitude: output.latitude,
    longitude: output.longitude,
    latitudeText,
    longitudeText,
    copyText: formatCoordinateCopy(output),
  })
}

/** 计算 GCJ-02 纬度方向的偏移量。 */
function transformLatitude(x: number, y: number): number {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  value += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  value += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return value
}

/** 计算 GCJ-02 经度方向的偏移量。 */
function transformLongitude(x: number, y: number): number {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  value += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  value += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return value
}
