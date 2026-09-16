import { describe, expect, it } from 'vitest'
import {
  ASCII_ART_CHARACTER_SET,
  ASCII_ART_MAX_CELLS,
  ASCII_ART_MAX_DIMENSION,
  ASCII_ART_MAX_FILE_BYTES,
  ASCII_ART_MAX_PIXELS,
  calculateAsciiArtGrid,
  getAsciiArtCharacter,
  normalizeAsciiArtColumns,
  renderAsciiArt,
  validateAsciiArtSource,
} from '../../core/ascii-art'

describe('ascii-art core', () => {
  it('normalizes the confirmed output column options', () => {
    expect(normalizeAsciiArtColumns(80)).toEqual({ ok: true, value: 80 })
    expect(normalizeAsciiArtColumns('120')).toEqual({ ok: true, value: 120 })
    expect(normalizeAsciiArtColumns(100)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('validates the confirmed image file and decoded dimension limits', () => {
    expect(validateAsciiArtSource({
      format: 'png',
      width: 1600,
      height: 1200,
      byteLength: 100,
    })).toMatchObject({ ok: true })
    expect(validateAsciiArtSource({
      format: 'gif' as never,
      width: 100,
      height: 100,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
    expect(validateAsciiArtSource({
      format: 'png',
      width: ASCII_ART_MAX_DIMENSION + 1,
      height: 1,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateAsciiArtSource({
      format: 'png',
      width: 5000,
      height: 5000,
      byteLength: 100,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateAsciiArtSource({
      format: 'png',
      width: 100,
      height: 100,
      byteLength: ASCII_ART_MAX_FILE_BYTES + 1,
    })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(ASCII_ART_MAX_PIXELS).toBe(20_000_000)
  })

  it('calculates the fixed aspect-corrected character grid and output limits', () => {
    expect(calculateAsciiArtGrid(800, 400, 80)).toEqual({
      ok: true,
      value: {
        columns: 80,
        rows: 20,
        cellCount: 1600,
      },
    })
    expect(calculateAsciiArtGrid(100, 100, 160)).toEqual({
      ok: true,
      value: {
        columns: 160,
        rows: 80,
        cellCount: 12_800,
      },
    })
    expect(calculateAsciiArtGrid(1, 8192, 160)).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(ASCII_ART_MAX_CELLS).toBe(32_000)
  })

  it('maps dark, light, mid-tone and transparent pixels to the fixed ASCII ramp', () => {
    expect(getAsciiArtCharacter(0, 0, 0, 255)).toBe(ASCII_ART_CHARACTER_SET[0])
    expect(getAsciiArtCharacter(255, 255, 255, 255)).toBe(' ')
    expect(getAsciiArtCharacter(128, 128, 128, 255)).toBe('=')
    expect(getAsciiArtCharacter(0, 0, 0, 0)).toBe(' ')
  })

  it('renders a fixed-width multi-line result from sampled RGBA pixels', () => {
    const pixels = new Uint8ClampedArray(40 * 2 * 4)
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 0
      pixels[index + 1] = 0
      pixels[index + 2] = 0
      pixels[index + 3] = 255
    }

    const result = renderAsciiArt(pixels, 40, 2)

    expect(result).toEqual({
      ok: true,
      value: {
        text: '@'.repeat(40) + '\n' + '@'.repeat(40),
        columns: 40,
        rows: 2,
        cellCount: 80,
      },
    })
    if (result.ok) {
      expect(result.value.text.split('\n')).toHaveLength(2)
      expect(result.value.text.split('\n')[0]).toHaveLength(40)
    }
  })

  it('rejects an invalid sampled pixel buffer', () => {
    expect(renderAsciiArt(new Uint8ClampedArray(4), 40, 1)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(renderAsciiArt(new Float32Array(40 * 4).fill(Number.NaN), 40, 1)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })
})
