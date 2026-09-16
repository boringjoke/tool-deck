import { describe, expect, it } from 'vitest'

import {
  convertCoordinate,
  formatCoordinate,
  formatCoordinateCopy,
  isWithinTransformationBounds,
} from '../../core/coordinate-converter'

const BEIJING_WGS84 = {
  latitude: '39.915',
  longitude: '116.404',
  source: 'wgs84' as const,
  target: 'gcj02' as const,
}

describe('coordinate converter core', () => {
  it('converts the confirmed six directions for an in-range point', () => {
    const directions = [
      ['wgs84', 'gcj02'],
      ['gcj02', 'wgs84'],
      ['gcj02', 'bd09'],
      ['bd09', 'gcj02'],
      ['wgs84', 'bd09'],
      ['bd09', 'wgs84'],
    ] as const

    for (const [source, target] of directions) {
      const result = convertCoordinate({
        latitude: '39.915',
        longitude: '116.404',
        source,
        target,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(Number.isFinite(result.value.latitude)).toBe(true)
      expect(Number.isFinite(result.value.longitude)).toBe(true)
      expect(result.value.latitudeText).toMatch(/^-?\d+\.\d{6}$/)
      expect(result.value.longitudeText).toMatch(/^-?\d+\.\d{6}$/)
    }
  })

  it('matches the published MIT reference sample for forward and BD-09 conversion', () => {
    const wgs84ToGcj02 = convertCoordinate(BEIJING_WGS84)
    expect(wgs84ToGcj02).toMatchObject({ ok: true })
    if (!wgs84ToGcj02.ok) return

    expect(wgs84ToGcj02.value.longitude).toBeCloseTo(116.41024449916938, 12)
    expect(wgs84ToGcj02.value.latitude).toBeCloseTo(39.91640428150164, 12)

    const gcj02ToBd09 = convertCoordinate({
      latitude: '39.915',
      longitude: '116.404',
      source: 'gcj02',
      target: 'bd09',
    })
    expect(gcj02ToBd09).toMatchObject({ ok: true })
    if (!gcj02ToBd09.ok) return

    expect(gcj02ToBd09.value.longitude).toBeCloseTo(116.41036949371029, 12)
    expect(gcj02ToBd09.value.latitude).toBeCloseTo(39.92133699351021, 12)
  })

  it('keeps a WGS84 point close after a forward and iterative reverse conversion', () => {
    const forward = convertCoordinate(BEIJING_WGS84)
    expect(forward.ok).toBe(true)
    if (!forward.ok) return

    const reverse = convertCoordinate({
      latitude: String(forward.value.latitude),
      longitude: String(forward.value.longitude),
      source: 'gcj02',
      target: 'wgs84',
    })
    expect(reverse).toMatchObject({ ok: true })
    if (!reverse.ok) return

    expect(reverse.value.latitude).toBeCloseTo(Number(BEIJING_WGS84.latitude), 9)
    expect(reverse.value.longitude).toBeCloseTo(Number(BEIJING_WGS84.longitude), 9)
  })

  it('rejects empty, malformed, equal-system, and out-of-range input', () => {
    expect(convertCoordinate({ ...BEIJING_WGS84, latitude: ' ' })).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(convertCoordinate({ ...BEIJING_WGS84, longitude: '116,404' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(convertCoordinate({ ...BEIJING_WGS84, source: 'gcj02', target: 'gcj02' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(convertCoordinate({ ...BEIJING_WGS84, latitude: '90.1' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(convertCoordinate({ ...BEIJING_WGS84, longitude: '140' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('rejects points outside the transformation rectangle instead of returning the input unchanged', () => {
    expect(isWithinTransformationBounds({ latitude: 39.915, longitude: 116.404 })).toBe(true)
    expect(isWithinTransformationBounds({ latitude: 40, longitude: 140 })).toBe(false)

    expect(convertCoordinate({
      latitude: '40',
      longitude: '140',
      source: 'wgs84',
      target: 'gcj02',
    })).toEqual({
      ok: false,
      error: {
        code: 'out-of-range',
        message: '该坐标超出 GCJ-02/BD-09 参考公式的适用范围，未生成转换结果。',
        details: '纬度 3.86–53.55，经度 73.66–135.05',
      },
    })
  })

  it('formats six decimals and an explicitly labeled copy payload', () => {
    expect(formatCoordinate(31.2304)).toBe('31.230400')
    expect(formatCoordinate(-0.00000001)).toBe('0.000000')
    expect(formatCoordinateCopy({ latitude: 31.2304, longitude: 121.4737 })).toBe(
      '纬度: 31.230400\n经度: 121.473700',
    )
  })
})
