import { failure, success, type ToolResult } from './tool-result'

export const SIGNATURE_CANVAS_WIDTH = 1200
export const SIGNATURE_CANVAS_HEIGHT = 400
export const SIGNATURE_ASPECT_RATIO = 3
export const SIGNATURE_STROKE_WIDTH = 6
export const SIGNATURE_STROKE_COLOR = '#1c2230'

export interface SignaturePoint {
  x: number
  y: number
}

export interface SignatureStroke {
  points: readonly SignaturePoint[]
}

export type SignatureStrokes = readonly SignatureStroke[]

/** 将浏览器坐标规范化到固定逻辑画布范围内。 */
export function normalizeSignaturePoint(
  point: unknown,
  width = SIGNATURE_CANVAS_WIDTH,
  height = SIGNATURE_CANVAS_HEIGHT,
): ToolResult<SignaturePoint> {
  if (!isFinitePositiveNumber(width) || !isFinitePositiveNumber(height)) {
    return failure('invalid-input', '签名画布尺寸必须是正数。')
  }

  if (!isPointLike(point)) {
    return failure('invalid-input', '签名坐标必须是有限数字。')
  }

  return success({
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  })
}

/** 从一个有效坐标开始新的笔画。一个点也算有效笔画，可导出为圆点。 */
export function beginSignatureStroke(
  point: unknown,
): ToolResult<SignatureStroke> {
  const normalized = normalizeSignaturePoint(point)
  if (!normalized.ok) {
    return normalized
  }

  return success({ points: [normalized.value] })
}

/** 向当前笔画追加坐标，不修改传入的笔画对象。 */
export function appendSignatureStrokePoint(
  stroke: SignatureStroke,
  point: unknown,
): ToolResult<SignatureStroke> {
  if (!isSignatureStroke(stroke)) {
    return failure('invalid-state', '当前签名笔画无效。')
  }

  const normalized = normalizeSignaturePoint(point)
  if (!normalized.ok) {
    return normalized
  }

  const lastPoint = stroke.points[stroke.points.length - 1]
  if (lastPoint && lastPoint.x === normalized.value.x && lastPoint.y === normalized.value.y) {
    return success(stroke)
  }

  return success({ points: [...stroke.points, normalized.value] })
}

/** 将当前笔画提交到撤销栈，不修改已有笔画。 */
export function commitSignatureStroke(
  strokes: SignatureStrokes,
  stroke: SignatureStroke,
): ToolResult<SignatureStroke[]> {
  if (!Array.isArray(strokes) || !isSignatureStroke(stroke)) {
    return failure('invalid-state', '当前签名笔画无效，无法保存。')
  }

  return success([
    ...strokes,
    {
      points: stroke.points.map((point) => ({ ...point })),
    },
  ])
}

/** 撤销最近一条完整笔画；没有笔画时保持空状态。 */
export function undoSignatureStroke(strokes: SignatureStrokes): SignatureStroke[] {
  return strokes.slice(0, -1).map((stroke) => ({
    points: stroke.points.map((point) => ({ ...point })),
  }))
}

/** 清空所有已提交笔画。 */
export function clearSignatureStrokes(): SignatureStroke[] {
  return []
}

/** 判断当前状态是否包含可绘制的签名内容。 */
export function hasSignatureContent(strokes: SignatureStrokes): boolean {
  return strokes.some((stroke) => isSignatureStroke(stroke))
}

function isSignatureStroke(value: unknown): value is SignatureStroke {
  if (!value || typeof value !== 'object' || !Array.isArray((value as SignatureStroke).points)) {
    return false
  }

  const points = (value as SignatureStroke).points
  return points.length > 0 && points.every(isPointLike)
}

function isPointLike(value: unknown): value is SignaturePoint {
  if (!value || typeof value !== 'object') {
    return false
  }

  const point = value as SignaturePoint
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
