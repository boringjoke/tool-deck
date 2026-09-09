import { describe, expect, it } from 'vitest'

import {
  calculateMarqueeDurationMs,
  getMarqueeSpeedPixelsPerSecond,
  MARQUEE_DEFAULT_BACKGROUND_COLOR,
  MARQUEE_DEFAULT_FONT_SIZE,
  MARQUEE_DEFAULT_SPEED,
  MARQUEE_DEFAULT_TEXT_COLOR,
  MARQUEE_MAX_TEXT_LENGTH,
  normalizeMarqueeText,
  validateMarqueeConfig,
} from '../../core/marquee'

/** 创建一份用于核心测试的有效手持弹幕输入。 */
function createValidInput() {
  return {
    text: '  Tool Deck\n手持弹幕  ',
    fontSize: MARQUEE_DEFAULT_FONT_SIZE,
    textColor: MARQUEE_DEFAULT_TEXT_COLOR,
    backgroundColor: MARQUEE_DEFAULT_BACKGROUND_COLOR,
    speed: MARQUEE_DEFAULT_SPEED,
  }
}

describe('marquee core', () => {
  it('normalizes line breaks and validates a display configuration', () => {
    expect(normalizeMarqueeText('  第一行\r\n第二行  ')).toBe('第一行 第二行')
    expect(validateMarqueeConfig(createValidInput())).toEqual({
      ok: true,
      value: {
        text: 'Tool Deck 手持弹幕',
        fontSize: 64,
        textColor: '#FFFFFF',
        backgroundColor: '#111827',
        speed: 3,
      },
    })
  })

  it('rejects empty and overlong text without silently truncating it', () => {
    expect(validateMarqueeConfig({ ...createValidInput(), text: ' \n ' })).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(validateMarqueeConfig({
      ...createValidInput(),
      text: '字'.repeat(MARQUEE_MAX_TEXT_LENGTH + 1),
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('validates font size, colors, and speed boundaries', () => {
    expect(validateMarqueeConfig({ ...createValidInput(), fontSize: 23 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateMarqueeConfig({ ...createValidInput(), fontSize: 160.5 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateMarqueeConfig({ ...createValidInput(), textColor: '#fff' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateMarqueeConfig({ ...createValidInput(), speed: 6 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('maps speed levels deterministically and calculates a safe duration', () => {
    expect(getMarqueeSpeedPixelsPerSecond(1)).toBe(80)
    expect(getMarqueeSpeedPixelsPerSecond(3)).toBe(160)
    expect(getMarqueeSpeedPixelsPerSecond(5)).toBe(300)
    expect(calculateMarqueeDurationMs(800, 400, 3)).toEqual({ ok: true, value: 7_500 })
    expect(calculateMarqueeDurationMs(0, 400, 3)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })

  it('does not produce a configuration when any visual field is malformed', () => {
    expect(validateMarqueeConfig({ ...createValidInput(), backgroundColor: 'rgb(0,0,0)' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateMarqueeConfig({ ...createValidInput(), speed: 2.5 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })
})
