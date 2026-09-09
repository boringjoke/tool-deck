import { describe, expect, it } from 'vitest'

import {
  calculateColorContrast,
  COLOR_FORMATS,
  COLOR_FORMAT_LABELS,
  convertColor,
  DEFAULT_COLOR_FORMAT,
  formatColorValue,
  parseColorInput,
} from '../../core/color'

describe('color core', () => {
  it('exposes the confirmed formats and default', () => {
    expect(COLOR_FORMATS).toEqual(['HEX', 'RGB', 'HSL'])
    expect(DEFAULT_COLOR_FORMAT).toBe('HEX')
    expect(COLOR_FORMAT_LABELS).toEqual({
      HEX: 'HEX',
      RGB: 'RGB / RGBA',
      HSL: 'HSL / HSLA',
    })
  })

  it('parses short and long HEX values with optional alpha', () => {
    expect(convertColor({ format: 'HEX', value: '#0f08' })).toEqual({
      ok: true,
      value: {
        input: '#0f08',
        format: 'HEX',
        color: { red: 0, green: 255, blue: 0, alpha: 136 / 255 },
        outputs: {
          hex: '#00FF0088',
          rgb: 'rgba(0, 255, 0, 0.533)',
          hsl: 'hsla(120, 100%, 50%, 0.533)',
        },
      },
    })

    expect(convertColor({ format: 'HEX', value: '#aBcDeF' })).toMatchObject({
      ok: true,
      value: { outputs: { hex: '#ABCDEF', rgb: 'rgb(171, 205, 239)' } },
    })
  })

  it('parses RGB/RGBA values and normalizes alpha output', () => {
    expect(convertColor({ format: 'RGB', value: 'rgba(255, 0, 0, 0.5)' })).toMatchObject({
      ok: true,
      value: {
        color: { red: 255, green: 0, blue: 0, alpha: 0.5 },
        outputs: {
          hex: '#FF000080',
          rgb: 'rgba(255, 0, 0, 0.5)',
          hsl: 'hsla(0, 100%, 50%, 0.5)',
        },
      },
    })

    expect(convertColor({ format: 'RGB', value: ' RGB(0, 128, 255) ' })).toMatchObject({
      ok: true,
      value: { outputs: { hex: '#0080FF', rgb: 'rgb(0, 128, 255)' } },
    })
  })

  it('parses HSL/HSLA values and converts primary colors', () => {
    expect(convertColor({ format: 'HSL', value: 'hsl(0, 100%, 50%)' })).toMatchObject({
      ok: true,
      value: {
        color: { red: 255, green: 0, blue: 0, alpha: 1 },
        outputs: { hex: '#FF0000', rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)' },
      },
    })

    expect(parseColorInput('hsla(120, 100%, 50%, 0.25)', 'HSL')).toMatchObject({
      ok: true,
      value: { red: 0, green: 255, blue: 0, alpha: 0.25 },
    })
  })

  it('formats a normalized color for the selected input format', () => {
    const color = { red: 12, green: 34, blue: 56, alpha: 1 } as const

    expect(formatColorValue(color, 'HEX')).toBe('#0C2238')
    expect(formatColorValue(color, 'RGB')).toBe('rgb(12, 34, 56)')
    expect(formatColorValue(color, 'HSL')).toBe('hsl(210, 64.71%, 13.33%)')
  })

  it('returns explicit errors for empty, malformed and out-of-range values', () => {
    expect(parseColorInput('  ', 'HEX')).toEqual({
      ok: false,
      error: { code: 'empty-input', message: '请输入颜色值。' },
    })
    expect(parseColorInput('#12345', 'HEX')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseColorInput('rgb(256, 0, 0)', 'RGB')).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseColorInput('rgb(1.5, 0, 0)', 'RGB')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseColorInput('hsl(360, 100%, 50%)', 'HSL')).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseColorInput('hsla(0, 100%, 50%, 1.1)', 'HSL')).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseColorInput('red', 'HEX')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('calculates WCAG contrast ratio and threshold prompts', () => {
    expect(calculateColorContrast({
      foreground: { format: 'HEX', value: '#000000' },
      background: { format: 'HEX', value: '#FFFFFF' },
    })).toMatchObject({
      ok: true,
      value: {
        ratio: 21,
        ratioText: '21:1',
        normalAa: true,
        largeAa: true,
        normalAaa: true,
        largeAaa: true,
      },
    })

    expect(calculateColorContrast({
      foreground: { format: 'HEX', value: '#777777' },
      background: { format: 'HEX', value: '#FFFFFF' },
    })).toMatchObject({
      ok: true,
      value: {
        ratioText: '4.48:1',
        normalAa: false,
        largeAa: true,
        normalAaa: false,
        largeAaa: false,
      },
    })
  })

  it('rejects transparent colors for contrast and identifies the field on parse errors', () => {
    expect(calculateColorContrast({
      foreground: { format: 'HEX', value: '#00000080' },
      background: { format: 'HEX', value: '#FFFFFF' },
    })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: '对比度检查只支持不透明颜色，请移除透明度后重试。',
      },
    })

    expect(calculateColorContrast({
      foreground: { format: 'HEX', value: '' },
      background: { format: 'HEX', value: '#FFFFFF' },
    })).toMatchObject({
      ok: false,
      error: { code: 'empty-input', message: '前景色：请输入颜色值。' },
    })
  })
})
