import { describe, expect, it } from 'vitest'

import { convertBase } from '../../core/base-converter'

describe('base converter core', () => {
  it('converts between custom bases and supports source prefixes', () => {
    const result = convertBase({ value: '0xff', fromBase: 16, toBase: 2, uppercase: false, addPrefix: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toBe('0b11111111')
  })

  it('supports base 36 and output case conversion', () => {
    const result = convertBase({ value: 'Z', fromBase: 36, toBase: 10, uppercase: false, addPrefix: false })
    const uppercase = convertBase({ value: 'ff', fromBase: 16, toBase: 36, uppercase: true, addPrefix: false })

    expect(result.ok).toBe(true)
    expect(uppercase.ok).toBe(true)
    if (!result.ok || !uppercase.ok) return

    expect(result.value).toBe('35')
    expect(uppercase.value).toBe('73')
  })

  it('preserves negative values and adds prefixes only to supported output bases', () => {
    const binary = convertBase({ value: '-0b101', fromBase: 2, toBase: 16, uppercase: true, addPrefix: true })
    const decimal = convertBase({ value: '10', fromBase: 10, toBase: 10, uppercase: false, addPrefix: true })

    expect(binary.ok).toBe(true)
    expect(decimal.ok).toBe(true)
    if (!binary.ok || !decimal.ok) return

    expect(binary.value).toBe('-0X5')
    expect(decimal.value).toBe('10')
  })

  it('rejects invalid bases, digits, prefixes, and overlong input', () => {
    expect(convertBase({ value: '10', fromBase: 1, toBase: 10, uppercase: false, addPrefix: false }).ok).toBe(false)
    expect(convertBase({ value: '2', fromBase: 2, toBase: 10, uppercase: false, addPrefix: false }).ok).toBe(false)
    expect(convertBase({ value: '0x10', fromBase: 10, toBase: 2, uppercase: false, addPrefix: false }).ok).toBe(false)
    expect(convertBase({ value: '1'.repeat(1025), fromBase: 10, toBase: 2, uppercase: false, addPrefix: false }).ok).toBe(false)
  })
})
