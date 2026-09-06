import { describe, expect, it } from 'vitest'

import {
  formatUuidCase,
  generateUuidList,
  UUID_MAX_COUNT,
  UUID_MIN_COUNT,
  type SecureRandomSource,
} from '../../core/uuid'

function createRandomSource(): SecureRandomSource {
  return {
    getRandomValues: ((array: Uint8Array | Uint32Array) => {
      array.fill(0)
      return array
    }) as SecureRandomSource['getRandomValues'],
  }
}

describe('UUID core', () => {
  it('generates version 4 UUIDs using the injected secure source', () => {
    const result = generateUuidList(2, createRandomSource())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toHaveLength(2)
    expect(result.value[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('supports the randomUUID source and output case conversion', () => {
    const result = generateUuidList(1, {
      ...createRandomSource(),
      randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const uuid = result.value[0]!

    expect(formatUuidCase(uuid, true)).toBe('550E8400-E29B-41D4-A716-446655440000')
    expect(formatUuidCase(uuid, false)).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('enforces the documented batch limits', () => {
    expect(generateUuidList(UUID_MIN_COUNT - 1, createRandomSource()).ok).toBe(false)
    expect(generateUuidList(UUID_MAX_COUNT + 1, createRandomSource()).ok).toBe(false)
  })

  it('returns a crypto error when no secure operation is available', () => {
    const result = generateUuidList(1, {
      getRandomValues: (() => {
        throw new Error('unavailable')
      }) as SecureRandomSource['getRandomValues'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('crypto-unavailable')
  })
})
