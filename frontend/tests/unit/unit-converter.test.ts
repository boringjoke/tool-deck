import { describe, expect, it } from 'vitest'
import {
  convertUnit,
  formatUnitValue,
  getUnitDefinition,
  UNIT_CATEGORIES,
} from '../../core/unit-converter'

describe('unit converter definitions', () => {
  it('contains the six confirmed categories and configured defaults', () => {
    expect(UNIT_CATEGORIES.map((category) => category.key)).toEqual([
      'length',
      'area',
      'volume',
      'mass',
      'temperature',
      'speed',
    ])

    for (const category of UNIT_CATEGORIES) {
      expect(getUnitDefinition(category.key, category.defaultFrom)).toBeDefined()
      expect(getUnitDefinition(category.key, category.defaultTo)).toBeDefined()
      expect(category.units.length).toBeGreaterThan(0)
    }
  })

  it('contains the confirmed unit sets without mixing categories', () => {
    expect(UNIT_CATEGORIES.find((category) => category.key === 'length')?.units.map((unit) => unit.key)).toEqual([
      'millimeter',
      'centimeter',
      'meter',
      'kilometer',
      'inch',
      'foot',
      'yard',
      'mile',
    ])
    expect(UNIT_CATEGORIES.find((category) => category.key === 'area')?.units.map((unit) => unit.key)).toEqual([
      'square-millimeter',
      'square-centimeter',
      'square-meter',
      'square-kilometer',
      'hectare',
      'acre',
      'square-foot',
    ])
    expect(UNIT_CATEGORIES.find((category) => category.key === 'volume')?.units.map((unit) => unit.key)).toEqual([
      'milliliter',
      'liter',
      'cubic-centimeter',
      'cubic-meter',
      'us-fluid-ounce',
      'us-gallon',
    ])
  })
})

describe('convertUnit', () => {
  it('converts length in both directions', () => {
    expect(convertUnit({
      category: 'length',
      value: '1',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toEqual({ ok: true, value: '3.28083989501' })

    expect(convertUnit({
      category: 'length',
      value: '3.28083989501',
      fromUnit: 'foot',
      toUnit: 'meter',
    })).toEqual({ ok: true, value: '0.999999999999' })
  })

  it('uses squared and cubed factors for area and volume', () => {
    expect(convertUnit({
      category: 'area',
      value: '1',
      fromUnit: 'square-meter',
      toUnit: 'square-centimeter',
    })).toEqual({ ok: true, value: '10000' })

    expect(convertUnit({
      category: 'volume',
      value: '1',
      fromUnit: 'cubic-meter',
      toUnit: 'liter',
    })).toEqual({ ok: true, value: '1000' })

    expect(convertUnit({
      category: 'volume',
      value: '1',
      fromUnit: 'liter',
      toUnit: 'us-gallon',
    })).toEqual({ ok: true, value: '0.264172052358' })
  })

  it('converts mass and speed using the confirmed constants', () => {
    expect(convertUnit({
      category: 'mass',
      value: '1',
      fromUnit: 'pound',
      toUnit: 'gram',
    })).toEqual({ ok: true, value: '453.59237' })

    expect(convertUnit({
      category: 'speed',
      value: '100',
      fromUnit: 'kilometer-per-hour',
      toUnit: 'mile-per-hour',
    })).toEqual({ ok: true, value: '62.1371192237' })
  })

  it('handles temperature offsets and negative temperatures', () => {
    expect(convertUnit({
      category: 'temperature',
      value: '0',
      fromUnit: 'celsius',
      toUnit: 'fahrenheit',
    })).toEqual({ ok: true, value: '32' })

    expect(convertUnit({
      category: 'temperature',
      value: '273.15',
      fromUnit: 'kelvin',
      toUnit: 'celsius',
    })).toEqual({ ok: true, value: '0' })

    expect(convertUnit({
      category: 'temperature',
      value: '-40',
      fromUnit: 'fahrenheit',
      toUnit: 'celsius',
    })).toEqual({ ok: true, value: '-40' })
  })

  it('accepts decimal forms, normalizes zero and trims display precision', () => {
    expect(convertUnit({
      category: 'length',
      value: '.5',
      fromUnit: 'meter',
      toUnit: 'centimeter',
    })).toEqual({ ok: true, value: '50' })

    expect(convertUnit({
      category: 'length',
      value: '-0',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toEqual({ ok: true, value: '0' })

    expect(formatUnitValue(1.23456789012345)).toBe('1.23456789012')
    expect(formatUnitValue(0.0000001)).toBe('1e-7')
  })

  it('returns structured errors for empty, malformed and unsupported values', () => {
    expect(convertUnit({
      category: 'length',
      value: '  ',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toEqual({
      ok: false,
      error: {
        code: 'empty-input',
        message: '请输入需要换算的数值。',
      },
    })

    expect(convertUnit({
      category: 'length',
      value: '1,000',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toMatchObject({ ok: false, error: { code: 'invalid-input' } })

    expect(convertUnit({
      category: 'length',
      value: '-1',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toMatchObject({ ok: false, error: { code: 'invalid-input' } })

    expect(convertUnit({
      category: 'length',
      value: '1e309',
      fromUnit: 'meter',
      toUnit: 'foot',
    })).toMatchObject({ ok: false, error: { code: 'invalid-input' } })

    expect(convertUnit({
      category: 'length',
      value: '1',
      fromUnit: 'gram' as never,
      toUnit: 'foot',
    })).toMatchObject({ ok: false, error: { code: 'operation-failed' } })
  })
})
