import {
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
  SIGNATURE_STROKE_COLOR,
  SIGNATURE_STROKE_WIDTH,
  hasSignatureContent,
  type SignatureStroke,
  type SignatureStrokes,
} from '~/core/signature'
import { failure, success, type ToolResult } from '~/core/tool-result'
import { downloadBlob } from './download'

export interface SignatureRenderOptions {
  width?: number
  height?: number
  strokeColor?: string
  strokeWidth?: number
}

/** 按固定逻辑尺寸将笔画绘制到浏览器 Canvas。 */
export function renderSignatureCanvas(
  canvas: HTMLCanvasElement,
  strokes: SignatureStrokes,
  options: SignatureRenderOptions = {},
): ToolResult<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return failure('operation-failed', '当前浏览器不支持签名画布。')
  }

  try {
    const width = options.width ?? SIGNATURE_CANVAS_WIDTH
    const height = options.height ?? SIGNATURE_CANVAS_HEIGHT
    const strokeColor = options.strokeColor ?? SIGNATURE_STROKE_COLOR
    const strokeWidth = options.strokeWidth ?? SIGNATURE_STROKE_WIDTH

    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    if (!context) {
      return failure('operation-failed', '当前浏览器不支持 Canvas 绘制。')
    }

    context.clearRect(0, 0, width, height)
    context.save()
    context.strokeStyle = strokeColor
    context.fillStyle = strokeColor
    context.lineWidth = strokeWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (const stroke of strokes) {
      drawSignatureStroke(context, stroke, strokeWidth)
    }

    context.restore()
    return success(undefined)
  } catch {
    return failure('operation-failed', '签名预览失败，请检查浏览器 Canvas 能力。')
  }
}

/** 在固定尺寸的临时 Canvas 上生成透明 PNG Blob。 */
export function createSignaturePngBlob(
  strokes: SignatureStrokes,
  options: SignatureRenderOptions = {},
): Promise<ToolResult<Blob>> {
  if (!hasSignatureContent(strokes)) {
    return Promise.resolve(failure('invalid-state', '请先绘制签名后再导出 PNG。'))
  }

  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof Blob === 'undefined'
  ) {
    return Promise.resolve(failure('operation-failed', '当前浏览器不支持 PNG 导出。'))
  }

  try {
    const canvas = document.createElement('canvas')
    const rendered = renderSignatureCanvas(canvas, strokes, options)
    if (!rendered.ok) {
      return Promise.resolve(rendered)
    }

    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => {
          resolve(blob ? success(blob) : failure('operation-failed', 'PNG 导出失败，请重试。'))
        }, 'image/png')
      } catch {
        resolve(failure('operation-failed', 'PNG 导出失败，请检查浏览器图片权限。'))
      }
    })
  } catch {
    return Promise.resolve(failure('operation-failed', 'PNG 导出失败，请检查浏览器图片权限。'))
  }
}

/** 将签名导出为透明 PNG 并触发本地下载。 */
export async function downloadSignaturePng(
  strokes: SignatureStrokes,
  fileName: string,
  options: SignatureRenderOptions = {},
): Promise<ToolResult<string>> {
  const blobResult = await createSignaturePngBlob(strokes, options)
  if (!blobResult.ok) {
    return blobResult
  }

  const downloadResult = downloadBlob(blobResult.value, fileName, 'PNG 文件已开始下载。')
  if (!downloadResult.ok) {
    return failure('operation-failed', downloadResult.message)
  }

  return success(downloadResult.message)
}

function drawSignatureStroke(
  context: CanvasRenderingContext2D,
  stroke: SignatureStroke,
  strokeWidth: number,
): void {
  if (!stroke.points.length) {
    return
  }

  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    if (!point) {
      return
    }

    const radius = strokeWidth / 2
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
    return
  }

  context.beginPath()
  const firstPoint = stroke.points[0]
  if (!firstPoint) {
    return
  }

  context.moveTo(firstPoint.x, firstPoint.y)
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y)
  }
  context.stroke()
}
