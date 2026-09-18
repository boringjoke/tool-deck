import { describe, expect, it } from 'vitest'

import {
  formatPaperDimension,
  formatPaperSize,
  getPaperSeriesLabel,
  getPaperStandardLabel,
  normalizePaperSearchText,
  PAPER_SIZE_CATALOG,
  PAPER_SIZE_DATASET_METADATA,
  searchPaperSizes,
  validatePaperSizeCatalog,
} from '../../core/paper-size'

describe('paper-size core', () => {
  it('contains the confirmed ISO and North American catalog scope', () => {
    expect(PAPER_SIZE_CATALOG).toHaveLength(25)
    expect(PAPER_SIZE_CATALOG.filter((record) => record.standard === 'iso-216')).toHaveLength(22)
    expect(PAPER_SIZE_CATALOG.filter((record) => record.standard === 'north-america')).toHaveLength(3)
    expect(new Set(PAPER_SIZE_CATALOG.map((record) => record.id)).size).toBe(PAPER_SIZE_CATALOG.length)
    expect(PAPER_SIZE_DATASET_METADATA.version).toBe('paper-size-v1')
    expect(PAPER_SIZE_DATASET_METADATA.sources.length).toBe(3)
  })

  it('keeps the confirmed dimensions and standard labels', () => {
    expect(PAPER_SIZE_CATALOG.find((record) => record.id === 'iso-a4')).toMatchObject({
      shortEdgeMm: 210,
      longEdgeMm: 297,
      series: 'A',
    })
    expect(PAPER_SIZE_CATALOG.find((record) => record.id === 'north-america-letter')).toMatchObject({
      shortEdgeMm: 215.9,
      longEdgeMm: 279.4,
      series: 'US',
    })
    expect(getPaperStandardLabel('iso-216')).toBe('ISO 216')
    expect(getPaperSeriesLabel('US')).toBe('北美尺寸')
  })

  it('normalizes search text and searches names, aliases, standards, and series', () => {
    expect(normalizePaperSearchText('  ISO   A4  ')).toBe('iso a4')
    expect(searchPaperSizes({ query: 'A4 纸' }).map((record) => record.id)).toEqual(['iso-a4'])
    expect(searchPaperSizes({ query: 'LETTER' }).map((record) => record.id)).toEqual(['north-america-letter'])
    expect(searchPaperSizes({ query: '11x17' }).map((record) => record.id)).toEqual(['north-america-tabloid'])
    expect(searchPaperSizes({ query: '北美' }).map((record) => record.id)).toEqual([
      'north-america-letter',
      'north-america-legal',
      'north-america-tabloid',
    ])
    expect(searchPaperSizes({ query: 'not-a-paper' })).toEqual([])
  })

  it('filters by standard and series without changing catalog order', () => {
    expect(searchPaperSizes({ standard: 'iso-216', series: 'A' }).map((record) => record.nameEn)).toEqual([
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
    ])
    expect(searchPaperSizes({ standard: 'north-america' }).map((record) => record.nameEn)).toEqual([
      'Letter', 'Legal', 'Tabloid',
    ])
    expect(searchPaperSizes({ series: 'US', query: 'size' }).map((record) => record.id)).toEqual([
      'north-america-letter',
      'north-america-legal',
      'north-america-tabloid',
    ])
  })

  it('formats millimeters, inches, and short-edge by long-edge dimensions', () => {
    const a4 = PAPER_SIZE_CATALOG.find((record) => record.id === 'iso-a4')!

    expect(formatPaperDimension(210, 'mm')).toBe('210 mm')
    expect(formatPaperDimension(210, 'in')).toBe('8.27 in')
    expect(formatPaperSize(a4, 'mm')).toBe('210 mm × 297 mm')
    expect(formatPaperSize(a4, 'in')).toBe('8.27 in × 11.69 in')
  })

  it('validates the static catalog and rejects invalid records', () => {
    expect(validatePaperSizeCatalog()).toEqual({ ok: true, value: true })

    const invalid = validatePaperSizeCatalog([
      {
        ...PAPER_SIZE_CATALOG[0]!,
        id: 'broken',
        shortEdgeMm: 1200,
        longEdgeMm: 100,
      },
    ])

    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
  })
})
