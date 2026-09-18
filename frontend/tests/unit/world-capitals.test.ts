import { describe, expect, it } from 'vitest'

import {
  getWorldCapitalFlagPath,
  getWorldCapitalRegionLabel,
  getWorldCapitalRoleLabel,
  normalizeWorldCapitalSearchText,
  searchWorldCapitals,
  validateWorldCapitalCatalog,
  WORLD_CAPITAL_CATALOG,
  WORLD_CAPITAL_DATASET_METADATA,
} from '../../core/world-capitals'

describe('world-capitals core', () => {
  it('keeps the confirmed country and capital scope', () => {
    expect(WORLD_CAPITAL_CATALOG).toHaveLength(195)
    expect(WORLD_CAPITAL_CATALOG.reduce((total, record) => total + record.capitals.length, 0)).toBe(200)
    expect(new Set(WORLD_CAPITAL_CATALOG.map((record) => record.id)).size).toBe(195)
    expect(new Set(WORLD_CAPITAL_CATALOG.map((record) => record.isoAlpha3)).size).toBe(195)
    expect(WORLD_CAPITAL_DATASET_METADATA.version).toBe('world-capitals-v1')
    expect(WORLD_CAPITAL_DATASET_METADATA.sources).toHaveLength(5)
    expect(validateWorldCapitalCatalog()).toEqual({ ok: true, value: true })
    expect(getWorldCapitalFlagPath('CN')).toBe('/flags/cn.svg')
  })

  it('groups multiple capitals and keeps exception roles', () => {
    expect(searchWorldCapitals({ query: '玻利维亚' })[0]).toMatchObject({
      isoAlpha3: 'BOL',
      capitals: [
        { id: 'bolivia-sucre', role: 'official' },
        { id: 'bolivia-la-paz', role: 'seat-of-government' },
      ],
    })
    expect(searchWorldCapitals({ query: '瑙鲁' })[0]?.capitals[0]).toMatchObject({
      id: 'nauru-yaren',
      role: 'seat-of-government',
    })
    expect(getWorldCapitalRoleLabel('legislative')).toBe('立法所在地')
  })

  it('normalizes aliases, punctuation, ISO codes, and capital names', () => {
    expect(normalizeWorldCapitalSearchText("  Côte d’Ivoire  ")).toBe('cote divoire')
    expect(searchWorldCapitals({ query: 'USA' }).map((record) => record.isoAlpha3)).toEqual(['USA'])
    expect(searchWorldCapitals({ query: 'Peking' }).map((record) => record.isoAlpha3)).toEqual(['CHN'])
    expect(searchWorldCapitals({ query: 'La Paz' }).map((record) => record.isoAlpha3)).toEqual(['BOL'])
    expect(searchWorldCapitals({ query: 'not-a-country' })).toEqual([])
  })

  it('filters by the confirmed six-region taxonomy and sorts stably', () => {
    const asia = searchWorldCapitals({ region: '亚洲' })

    expect(asia.length).toBeGreaterThan(0)
    expect(asia.every((record) => record.region === '亚洲')).toBe(true)
    expect(asia[0]?.nameEn).toBe('Afghanistan')
    expect(getWorldCapitalRegionLabel('南美洲')).toBe('南美洲')
  })

  it('rejects incomplete static records', () => {
    const invalid = validateWorldCapitalCatalog(
      [{ ...WORLD_CAPITAL_CATALOG[0]!, capitals: [] }],
      { ...WORLD_CAPITAL_DATASET_METADATA, countryCount: 1, capitalCount: 0 },
    )

    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
  })
})
