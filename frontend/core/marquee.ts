import { failure, success, type ToolResult } from './tool-result'

export const MARQUEE_MAX_TEXT_LENGTH = 200
export const MARQUEE_MIN_FONT_SIZE = 24
export const MARQUEE_MAX_FONT_SIZE = 160
export const MARQUEE_MIN_SPEED = 1
export const MARQUEE_MAX_SPEED = 5
export const MARQUEE_DEFAULT_FONT_SIZE = 64
export const MARQUEE_DEFAULT_TEXT_COLOR = '#FFFFFF'
export const MARQUEE_DEFAULT_BACKGROUND_COLOR = '#111827'
export const MARQUEE_DEFAULT_SPEED: MarqueeSpeed = 3
export const MARQUEE_MIN_ANIMATION_DURATION_MS = 1_000

export type MarqueeSpeed = 1 | 2 | 3 | 4 | 5

export interface MarqueeInput {
  text: string
  fontSize: number
  textColor: string
  backgroundColor: string
  speed: number
}

export interface MarqueeConfig {
  readonly text: string
  readonly fontSize: number
  readonly textColor: string
  readonly backgroundColor: string
  readonly speed: MarqueeSpeed
}

const MARQUEE_SPEED_PIXELS_PER_SECOND: Record<MarqueeSpeed, number> = {
  1: 80,
  2: 120,
  3: 160,
  4: 220,
  5: 300,
}

/** 将用户输入中的换行转换为空格，并去除首尾空白。 */
export function normalizeMarqueeText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ').trim()
}

/** 统计文本中的 Unicode 码点数量，避免直接使用 UTF-16 长度。 */
function countUnicodeCodePoints(text: string): number {
  return Array.from(text).length
}

/** 判断输入是否为六位十六进制颜色。 */
function isValidMarqueeColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

/** 判断输入是否为当前手持弹幕支持的速度等级。 */
function isValidMarqueeSpeed(speed: number): speed is MarqueeSpeed {
  return Number.isSafeInteger(speed)
    && speed >= MARQUEE_MIN_SPEED
    && speed <= MARQUEE_MAX_SPEED
}

/** 校验字号、颜色和速度等展示配置是否满足核心边界。 */
function validateMarqueeVisualConfig(input: MarqueeInput): ToolResult<void> {
  if (!Number.isSafeInteger(input.fontSize)) {
    return failure('invalid-input', '字号必须是整数。')
  }

  if (input.fontSize < MARQUEE_MIN_FONT_SIZE || input.fontSize > MARQUEE_MAX_FONT_SIZE) {
    return failure('out-of-range', `字号必须是 ${MARQUEE_MIN_FONT_SIZE}–${MARQUEE_MAX_FONT_SIZE} 像素。`)
  }

  if (!isValidMarqueeColor(input.textColor) || !isValidMarqueeColor(input.backgroundColor)) {
    return failure('invalid-input', '文字颜色和背景颜色必须使用六位十六进制颜色。')
  }

  if (!isValidMarqueeSpeed(input.speed)) {
    return failure('out-of-range', `滚动速度必须是 ${MARQUEE_MIN_SPEED}–${MARQUEE_MAX_SPEED} 之间的整数等级。`)
  }

  return success(undefined)
}

/** 校验并生成一份不可变的手持弹幕展示配置。 */
export function validateMarqueeConfig(input: MarqueeInput): ToolResult<MarqueeConfig> {
  if (!input || typeof input.text !== 'string') {
    return failure('invalid-input', '展示文字必须是文本。')
  }

  const text = normalizeMarqueeText(input.text)

  if (!text) {
    return failure('empty-input', '请输入需要展示的文字。')
  }

  if (countUnicodeCodePoints(text) > MARQUEE_MAX_TEXT_LENGTH) {
    return failure('out-of-range', `展示文字不能超过 ${MARQUEE_MAX_TEXT_LENGTH} 个 Unicode 字符。`)
  }

  const visualResult = validateMarqueeVisualConfig(input)

  if (!visualResult.ok) {
    return visualResult
  }

  return success({
    text,
    fontSize: input.fontSize,
    textColor: input.textColor.toUpperCase(),
    backgroundColor: input.backgroundColor.toUpperCase(),
    speed: input.speed as MarqueeSpeed,
  })
}

/** 将速度等级转换为稳定的滚动像素速度。 */
export function getMarqueeSpeedPixelsPerSecond(speed: MarqueeSpeed): number {
  return MARQUEE_SPEED_PIXELS_PER_SECOND[speed]
}

/** 根据文字宽度、展示区域宽度和速度计算一轮滚动所需时间。 */
export function calculateMarqueeDurationMs(
  textWidthPx: number,
  viewportWidthPx: number,
  speed: number,
): ToolResult<number> {
  if (!Number.isFinite(textWidthPx) || textWidthPx <= 0 || !Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) {
    return failure('operation-failed', '无法测量手持弹幕展示区域，请重试。')
  }

  if (!isValidMarqueeSpeed(speed)) {
    return failure('out-of-range', `滚动速度必须是 ${MARQUEE_MIN_SPEED}–${MARQUEE_MAX_SPEED} 之间的整数等级。`)
  }

  const durationMs = Math.ceil(
    ((textWidthPx + viewportWidthPx) / getMarqueeSpeedPixelsPerSecond(speed)) * 1_000,
  )

  if (!Number.isSafeInteger(durationMs) || durationMs < MARQUEE_MIN_ANIMATION_DURATION_MS) {
    return failure('operation-failed', '无法计算手持弹幕滚动时间，请重试。')
  }

  return success(durationMs)
}
