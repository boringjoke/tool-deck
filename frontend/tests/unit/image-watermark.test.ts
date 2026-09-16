import { describe, expect, it } from 'vitest'
import {
  IMAGE_WATERMARK_DEFAULT_COLOR,
  IMAGE_WATERMARK_DEFAULT_OPACITY,
  IMAGE_WATERMARK_MAX_DIMENSION,
  IMAGE_WATERMARK_MAX_FILE_BYTES,
  IMAGE_WATERMARK_MAX_PIXELS,
  IMAGE_WATERMARK_JPEG_QUALITY,
  IMAGE_WATERMARK_WEBP_QUALITY,
  calculateImageWatermarkPlacement,
  getImageWatermarkFontSize,
  getImageWatermarkMargin,
  getImageWatermarkMimeType,
  normalizeImageWatermarkOptions,
  normalizeImageWatermarkText,
  normalizeImageWatermarkOpacity,
  parseImageWatermarkColor,
  validateImageWatermarkSource,
} from '../../core/image-watermark'

describe('image-watermark core', () => {
  it('normalizes text and enforces the Unicode/control-character boundary', () => {
    expect(normalizeImageWatermarkText('  Tool Deck  ')).toEqual({
      ok: true,
      value: 'Tool Deck',
    })
    expect(normalizeImageWatermarkText('')).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(normalizeImageWatermarkText('line\nfeed')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(normalizeImageWatermarkText('界'.repeat(65))).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('fills defaults and rejects invalid color, position, size and opacity', () => {
    const normalized = normalizeImageWatermarkOptions({ text: '© Tool Deck' })
    expect(normalized).toEqual({
      ok: true,
      value: {
        text: '© Tool Deck',
        position: 'bottom-right',
        size: 'medium',
        color: IMAGE_WATERMARK_DEFAULT_COLOR,
        opacity: IMAGE_WATERMARK_DEFAULT_OPACITY,
      },
    })
    expect(normalizeImageWatermarkOptions({ text: 'ok', color: '#12' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(normalizeImageWatermarkOptions({ text: 'ok', position: 'free-drag' as never })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(normalizeImageWatermarkOpacity(0.05)).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseImageWatermarkColor('#aabbcc')).toEqual({ red: 170, green: 187, blue: 204 })
  })

  it('enforces file, pixel and longest-side limits', () => {
    expect(validateImageWatermarkSource({
      format: 'png',
      width: 1600,
      height: 1200,
      byteLength: 100,
    })).toMatchObject({ ok: true })
    expect(validateImageWatermarkSource({
      format: 'gif' as never,
      width: 100,
      height: 100,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
    expect(validateImageWatermarkSource({
      format: 'png',
      width: IMAGE_WATERMARK_MAX_DIMENSION + 1,
      height: 1,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateImageWatermarkSource({
      format: 'png',
      width: 5000,
      height: 5000,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateImageWatermarkSource({
      format: 'png',
      width: 100,
      height: 100,
      byteLength: IMAGE_WATERMARK_MAX_FILE_BYTES + 1,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(IMAGE_WATERMARK_MAX_PIXELS).toBe(20_000_000)
  })

  it('calculates relative typography, safe margin, nine-grid anchors and fixed output quality', () => {
    expect(getImageWatermarkFontSize(1000, 500, 'small')).toBe(10)
    expect(getImageWatermarkFontSize(1000, 500, 'medium')).toBe(15)
    expect(getImageWatermarkFontSize(1000, 500, 'large')).toBe(20)
    expect(getImageWatermarkMargin(1000, 500)).toBe(20)
    expect(calculateImageWatermarkPlacement(1000, 500, 15, 'bottom-right')).toEqual({
      x: 980,
      y: 472.5,
      margin: 20,
      textAlign: 'right',
      textBaseline: 'middle',
    })
    expect(calculateImageWatermarkPlacement(1000, 500, 15, 'center')).toMatchObject({
      x: 500,
      y: 250,
      textAlign: 'center',
    })
    expect(getImageWatermarkMimeType('jpeg')).toBe('image/jpeg')
    expect(IMAGE_WATERMARK_JPEG_QUALITY).toBe(0.92)
    expect(IMAGE_WATERMARK_WEBP_QUALITY).toBe(0.90)
  })
})
