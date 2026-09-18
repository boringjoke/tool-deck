import { describe, expect, it } from 'vitest'

import {
  formatHistoricalRange,
  formatHistoricalYear,
  getHistoricalPeriodLabel,
  getHistoricalTimelineLayout,
  searchHistoricalDynasties,
  validateHistoricalDynastyCatalog,
  HISTORICAL_DYNASTY_CATALOG,
  HISTORICAL_DYNASTY_DATASET_METADATA,
} from '../../core/historical-dynasties'

describe('historical dynasties core', () => {
  it('keeps the confirmed mainline and parallel catalog valid', () => {
    expect(validateHistoricalDynastyCatalog()).toEqual({ ok: true, value: true })
    expect(HISTORICAL_DYNASTY_CATALOG).toHaveLength(HISTORICAL_DYNASTY_DATASET_METADATA.recordCount)
    expect(new Set(HISTORICAL_DYNASTY_CATALOG.map((record) => record.id)).size).toBe(HISTORICAL_DYNASTY_CATALOG.length)
    expect(HISTORICAL_DYNASTY_DATASET_METADATA.mainlineCount).toBeGreaterThan(0)
    expect(HISTORICAL_DYNASTY_DATASET_METADATA.parallelCount).toBeGreaterThan(0)
  })

  it('searches names, aliases, and notes without losing chronological order', () => {
    expect(searchHistoricalDynasties({ query: '南朝宋' }).map((record) => record.id)).toEqual(['liu-song'])
    expect(searchHistoricalDynasties({ query: '战国七雄' }).map((record) => record.id)).toEqual(['warring-states'])
    expect(searchHistoricalDynasties({ query: '五代十国' }).map((record) => record.id)).toEqual(['ten-kingdoms'])
    expect(searchHistoricalDynasties({ query: '不存在的朝代' })).toEqual([])
  })

  it('combines period and track filters', () => {
    const parallelSongPeriod = searchHistoricalDynasties({
      period: 'five-song',
      track: 'parallel',
    })

    expect(parallelSongPeriod.length).toBeGreaterThan(0)
    expect(parallelSongPeriod.every((record) => record.periodKey === 'five-song' && record.track === 'parallel')).toBe(true)
    expect(searchHistoricalDynasties({ period: 'qin-han', track: 'mainline' }).map((record) => record.nameZh)).toEqual([
      '秦', '西汉', '新', '东汉',
    ])
  })

  it('builds explicit mainline and parallel timeline lanes', () => {
    const sections = getHistoricalTimelineLayout()
    const sixDynasties = sections.find((section) => section.value === 'six-dynasties')!

    expect(sections).toHaveLength(6)
    expect(getHistoricalPeriodLabel(sixDynasties.value)).toBe('三国两晋南北朝')
    expect(sixDynasties.mainline.map((record) => record.nameZh)).toEqual(['西晋', '东晋'])
    expect(sixDynasties.parallel.map((record) => record.nameZh)).toContain('曹魏')
    expect(sixDynasties.parallel.map((record) => record.nameZh)).toContain('北魏')
  })

  it('preserves BCE, approximate, and disputed range labels', () => {
    const qin = HISTORICAL_DYNASTY_CATALOG.find((record) => record.id === 'qin')!
    const qing = HISTORICAL_DYNASTY_CATALOG.find((record) => record.id === 'qing')!

    expect(formatHistoricalYear(-221)).toBe('前221年')
    expect(formatHistoricalYear(618)).toBe('公元618年')
    expect(formatHistoricalRange(qin)).toBe('前221年—前206年')
    expect(formatHistoricalRange(qing)).toContain('1636年（国号定为清）')
    expect(qing.datePrecision).toBe('range')
  })

  it('rejects a record that loses its source or date boundary', () => {
    const invalid = validateHistoricalDynastyCatalog(
      [{ ...HISTORICAL_DYNASTY_CATALOG[0]!, endYear: -2200, sourceRefs: [] }],
      { ...HISTORICAL_DYNASTY_DATASET_METADATA, recordCount: 1, mainlineCount: 1, parallelCount: 0 },
    )

    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
  })
})
