import { describe, expect, it } from 'vitest'
import type { SecureRandomSource } from '../../core/uuid'
import {
  distributeWheelWeightsEvenly,
  normalizeWheelOptions,
  removeSelectedWheelOption,
  selectWheelOption,
  type WheelOption,
} from '../../core/wheel'

/** 创建按顺序返回 Uint32 随机值的测试随机源。 */
function createRandomSource(values: number[]): SecureRandomSource {
  let index = 0

  /** 为测试随机源填充一个 Uint8Array 或 Uint32Array。 */
  function fillRandomValues(array: Uint8Array): Uint8Array
  function fillRandomValues(array: Uint32Array): Uint32Array
  function fillRandomValues(array: Uint8Array | Uint32Array): Uint8Array | Uint32Array {
    const value = values[Math.min(index, values.length - 1)]
    index += 1

    if (array instanceof Uint32Array) {
      array[0] = value ?? 0
    } else {
      array[0] = (value ?? 0) % 256
    }

    return array
  }

  return {
    getRandomValues: fillRandomValues,
  }
}

/** 创建用于核心测试的转盘选项。 */
function createOptions(): WheelOption[] {
  return [
    { id: 'a', label: '选项 A', weightTenths: 200 },
    { id: 'b', label: '选项 B', weightTenths: 300 },
    { id: 'c', label: '选项 C', weightTenths: 0 },
  ]
}

describe('wheel core', () => {
  it('computes the last option as the remaining weight', () => {
    const result = normalizeWheelOptions(createOptions())

    expect(result).toEqual({
      ok: true,
      value: [
        { id: 'a', label: '选项 A', weightTenths: 200 },
        { id: 'b', label: '选项 B', weightTenths: 300 },
        { id: 'c', label: '选项 C', weightTenths: 500 },
      ],
    })
  })

  it('validates empty, duplicate, long and overweight options', () => {
    expect(normalizeWheelOptions([])).toMatchObject({ ok: false, error: { code: 'empty-input' } })
    expect(normalizeWheelOptions([
      { id: 'a', label: '', weightTenths: 500 },
      { id: 'b', label: 'B', weightTenths: 0 },
    ])).toMatchObject({ ok: false, error: { code: 'empty-input' } })
    expect(normalizeWheelOptions([
      { id: 'a', label: '同名', weightTenths: 500 },
      { id: 'b', label: ' 同名 ', weightTenths: 0 },
    ])).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(normalizeWheelOptions([
      { id: 'a', label: 'a'.repeat(81), weightTenths: 500 },
      { id: 'b', label: 'b', weightTenths: 0 },
    ])).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
    expect(normalizeWheelOptions([
      { id: 'a', label: 'A', weightTenths: 1.5 },
      { id: 'b', label: 'B', weightTenths: 0 },
    ])).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(normalizeWheelOptions([
      { id: 'a', label: 'A', weightTenths: 700 },
      { id: 'b', label: 'B', weightTenths: 400 },
      { id: 'c', label: 'C', weightTenths: 0 },
    ])).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
    expect(normalizeWheelOptions(Array.from({ length: 21 }, (_, index) => ({
      id: `option-${index}`,
      label: `选项 ${index}`,
      weightTenths: 0,
    })))).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
  })

  it('supports up to twenty options and keeps zero-weight options available in the list', () => {
    const options = Array.from({ length: 20 }, (_, index) => ({
      id: `option-${index}`,
      label: `选项 ${index}`,
      weightTenths: index === 0 ? 1000 : 0,
    }))
    const result = normalizeWheelOptions(options)

    expect(result).toMatchObject({ ok: true, value: { length: 20 } })
    if (result.ok) {
      expect(result.value[0]?.weightTenths).toBe(1000)
      expect(result.value[19]?.weightTenths).toBe(0)
    }
  })

  it('distributes the current options evenly and leaves the remainder to the last option', () => {
    const result = distributeWheelWeightsEvenly(createOptions())
    const correctedResult = distributeWheelWeightsEvenly([
      { id: 'a', label: '选项 A', weightTenths: 700 },
      { id: 'b', label: '选项 B', weightTenths: 400 },
      { id: 'c', label: '选项 C', weightTenths: Number.NaN },
    ])

    expect(result).toEqual({
      ok: true,
      value: [
        { id: 'a', label: '选项 A', weightTenths: 333 },
        { id: 'b', label: '选项 B', weightTenths: 333 },
        { id: 'c', label: '选项 C', weightTenths: 334 },
      ],
    })
    expect(correctedResult).toEqual(result)
  })

  it('selects weighted ranges without using animation state', () => {
    const options = createOptions()
    const first = selectWheelOption(options, createRandomSource([0]))
    const second = selectWheelOption(options, createRandomSource([200]))
    const third = selectWheelOption(options, createRandomSource([999]))

    expect(first).toMatchObject({ ok: true, value: { index: 0, option: { label: '选项 A' } } })
    expect(second).toMatchObject({ ok: true, value: { index: 1, option: { label: '选项 B' } } })
    expect(third).toMatchObject({ ok: true, value: { index: 2, option: { label: '选项 C' } } })
  })

  it('never selects a zero-weight option', () => {
    const result = selectWheelOption([
      { id: 'a', label: 'A', weightTenths: 0 },
      { id: 'b', label: 'B', weightTenths: 1000 },
    ], createRandomSource([0]))

    expect(result).toMatchObject({ ok: true, value: { index: 1, option: { label: 'B' } } })
  })

  it('handles missing, throwing and repeatedly rejected random sources', () => {
    expect(selectWheelOption(createOptions(), undefined as unknown as SecureRandomSource))
      .toMatchObject({ ok: false, error: { code: 'crypto-unavailable' } })
    expect(selectWheelOption(createOptions(), {
      getRandomValues: (() => {
        throw new Error('blocked')
      }) as SecureRandomSource['getRandomValues'],
    })).toMatchObject({ ok: false, error: { code: 'crypto-unavailable' } })
    expect(selectWheelOption(createOptions(), {
      getRandomValues: ((array: Uint32Array | Uint8Array) => {
        array[0] = 4_294_967_295
        return array
      }) as SecureRandomSource['getRandomValues'],
    })).toMatchObject({ ok: false, error: { code: 'operation-failed' } })
  })

  it('removes the selected option and evenly distributes its weight', () => {
    const result = removeSelectedWheelOption(createOptions(), 0)

    expect(result).toEqual({
      ok: true,
      value: [
        { id: 'b', label: '选项 B', weightTenths: 400 },
        { id: 'c', label: '选项 C', weightTenths: 600 },
      ],
    })
  })

  it('distributes indivisible tenths in current order and supports depletion', () => {
    const options: WheelOption[] = [
      { id: 'a', label: 'A', weightTenths: 1 },
      { id: 'b', label: 'B', weightTenths: 0 },
      { id: 'c', label: 'C', weightTenths: 0 },
    ]
    const distributed = removeSelectedWheelOption(options, 0)
    const depleted = removeSelectedWheelOption([
      { id: 'last', label: '最后一个', weightTenths: 1000 },
    ], 0)

    expect(distributed).toEqual({
      ok: true,
      value: [
        { id: 'b', label: 'B', weightTenths: 1 },
        { id: 'c', label: 'C', weightTenths: 999 },
      ],
    })
    expect(depleted).toEqual({ ok: true, value: [] })
  })

  it('does not mutate the input options on normalization or removal', () => {
    const options = createOptions()
    const snapshot = structuredClone(options)

    normalizeWheelOptions(options)
    removeSelectedWheelOption(options, 1)

    expect(options).toEqual(snapshot)
  })
})
