import { describe, expect, it } from 'vitest'
import {
  MAX_RECENT_TOOLS,
  parseFavoriteStorage,
  parseRecentStorage,
} from '../../adapters/storage'

describe('parseFavoriteStorage', () => {
  it('returns unique non-empty slugs and ignores malformed values', () => {
    expect(parseFavoriteStorage(JSON.stringify(['timer', 'timer', '', 42, 'uuid-generator']))).toEqual([
      'timer',
      'uuid-generator',
    ])
    expect(parseFavoriteStorage('{broken json')).toEqual([])
  })
})

describe('parseRecentStorage', () => {
  it('sorts by last used time and ignores invalid items', () => {
    const raw = JSON.stringify([
      { slug: 'older', lastUsedTime: '2026-01-01T00:00:00.000Z' },
      { slug: 'newer', lastUsedTime: '2026-02-01T00:00:00.000Z' },
      { slug: 'invalid', lastUsedTime: 'not-a-date' },
      { slug: 'missing-time' },
    ])

    expect(parseRecentStorage(raw).map((item) => item.slug)).toEqual(['newer', 'older'])
  })

  it('keeps at most the configured number of recent tools', () => {
    const items = Array.from({ length: MAX_RECENT_TOOLS + 2 }, (_, index) => ({
      slug: `tool-${index}`,
      lastUsedTime: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }))

    expect(parseRecentStorage(JSON.stringify(items))).toHaveLength(MAX_RECENT_TOOLS)
  })
})
