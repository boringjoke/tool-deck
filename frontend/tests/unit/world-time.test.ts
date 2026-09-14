import { describe, expect, it } from 'vitest'

import {
  addWorldTimeOption,
  createWorldTimeSnapshot,
  getBuiltinWorldTimeOptions,
  getDefaultWorldTimeOptions,
  getWorldTimeContinents,
  searchBuiltinWorldTimeOptions,
  validateIanaTimeZone,
  WORLD_TIME_MAX_OPTIONS,
} from '../../core/world-time'

/** 断言指定城市在固定时间点生成成功快照。 */
function expectSnapshot(timeZone: string, nowMilliseconds: number) {
  const option = getDefaultWorldTimeOptions().find((item) => item.timeZone === timeZone)

  if (!option) {
    throw new Error(`Missing test option: ${timeZone}`)
  }

  const result = createWorldTimeSnapshot(option, nowMilliseconds)

  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value
}

describe('world-time core', () => {
  it('provides the confirmed default cities in a stable order', () => {
    expect(getDefaultWorldTimeOptions().map((option) => [option.label, option.timeZone])).toEqual([
      ['北京', 'Asia/Shanghai'],
      ['东京', 'Asia/Tokyo'],
      ['新加坡', 'Asia/Singapore'],
      ['悉尼', 'Australia/Sydney'],
      ['迪拜', 'Asia/Dubai'],
      ['伦敦', 'Europe/London'],
      ['纽约', 'America/New_York'],
      ['洛杉矶', 'America/Los_Angeles'],
    ])
  })

  it('searches the built-in catalog by Chinese, English, and timezone text', () => {
    expect(searchBuiltinWorldTimeOptions('纽约').map((option) => option.id)).toEqual(['united-states-new-york'])
    expect(searchBuiltinWorldTimeOptions('los angeles').map((option) => option.id)).toEqual(['united-states-los-angeles'])
    expect(searchBuiltinWorldTimeOptions('Europe/London').map((option) => option.id)).toEqual(['united-kingdom-london'])
    expect(searchBuiltinWorldTimeOptions('Japan').map((option) => option.id)).toEqual(['japan-tokyo'])
    expect(searchBuiltinWorldTimeOptions('Asia', '亚洲').length).toBeGreaterThan(0)
    expect(searchBuiltinWorldTimeOptions('', '欧洲').every((option) => option.continent === '欧洲')).toBe(true)
    expect(searchBuiltinWorldTimeOptions('not-a-city')).toEqual([])
  })

  it('covers the confirmed member and observer state capital catalog', () => {
    const options = getBuiltinWorldTimeOptions()
    const capitalOptions = options.filter((option) => option.isCapital)
    const countryNames = new Set(capitalOptions.map((option) => option.countryName))

    expect(countryNames.size).toBe(195)
    expect(capitalOptions.length).toBeGreaterThan(195)
    expect(countryNames).toContain('梵蒂冈')
    expect(countryNames).toContain('巴勒斯坦国')
    expect(options.every((option) => option.cityNameZh && option.cityNameEn && option.countryName)).toBe(true)
    expect(new Set(options.map((option) => option.id)).size).toBe(options.length)
    expect(new Set(options.map((option) => option.timeZone)).size).toBeLessThan(options.length)
  })

  it('keeps the directory sorted and exposes all confirmed continent filters', () => {
    const options = getBuiltinWorldTimeOptions()
    const sortKeys = options.map((option) => `${option.cityNameEn.toLocaleLowerCase('en-US')}|${option.countryNameEn.toLocaleLowerCase('en-US')}|${option.id}`)

    expect(sortKeys).toEqual([...sortKeys].sort((left, right) => left.localeCompare(right, 'en')))
    expect(getWorldTimeContinents()).toEqual(['亚洲', '欧洲', '非洲', '北美洲', '南美洲', '大洋洲'])
    expect(searchBuiltinWorldTimeOptions('Pretoria').map((option) => option.countryName)).toEqual(['南非'])
    expect(searchBuiltinWorldTimeOptions('Los Angeles').map((option) => option.isCapital)).toEqual([false])
  })

  it('uses browser-supported IANA zones for every catalog entry', () => {
    const instant = Date.parse('2024-01-01T00:00:00.000Z')

    for (const option of getBuiltinWorldTimeOptions()) {
      expect(createWorldTimeSnapshot(option, instant), option.id).toMatchObject({ ok: true })
    }
  })

  it('validates custom IANA zones and rejects blank or unknown values', () => {
    const valid = validateIanaTimeZone(' Pacific/Auckland ')

    expect(valid).toMatchObject({
      ok: true,
      value: {
        label: 'Pacific/Auckland',
        timeZone: 'Pacific/Auckland',
        source: 'custom',
      },
    })
    expect(validateIanaTimeZone('   ')).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(validateIanaTimeZone('Mars/Crater')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('rejects duplicate zones and enforces the selection limit', () => {
    const defaults = getDefaultWorldTimeOptions()
    const firstDefault = defaults[0]
    const custom = validateIanaTimeZone('Pacific/Auckland')

    if (!firstDefault) {
      throw new Error('Missing default world-time option')
    }

    const duplicate = addWorldTimeOption(defaults, firstDefault)

    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(custom.ok).toBe(true)

    if (!custom.ok) return

    const atLimit = [...defaults, ...Array.from({ length: WORLD_TIME_MAX_OPTIONS - defaults.length - 1 }, (_, index) => ({
      id: `test-${index}`,
      label: `Test ${index}`,
      searchText: `test ${index}`,
      timeZone: `Etc/GMT-${index + 1}`,
      source: 'custom' as const,
    }))]
    const filled = addWorldTimeOption(atLimit, custom.value)
    const overLimit = filled.ok ? addWorldTimeOption(filled.value, {
      id: 'test-over-limit',
      label: 'Test over limit',
      searchText: 'test over limit',
      timeZone: 'Etc/GMT+12',
      source: 'custom',
    }) : filled

    expect(filled.ok).toBe(true)
    expect(overLimit).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('formats all confirmed default cities from one fixed instant', () => {
    const instant = Date.parse('2024-01-01T00:00:00.000Z')

    expect(expectSnapshot('Asia/Shanghai', instant)).toMatchObject({
      localDate: '2024-01-01',
      localTime: '08:00:00',
      utcOffset: 'UTC+08:00',
    })
    expect(expectSnapshot('Asia/Tokyo', instant)).toMatchObject({
      localDate: '2024-01-01',
      localTime: '09:00:00',
      utcOffset: 'UTC+09:00',
    })
    expect(expectSnapshot('Australia/Sydney', instant)).toMatchObject({
      localDate: '2024-01-01',
      localTime: '11:00:00',
      utcOffset: 'UTC+11:00',
    })
    expect(expectSnapshot('Europe/London', instant)).toMatchObject({
      localDate: '2024-01-01',
      localTime: '00:00:00',
      utcOffset: 'UTC+00:00',
    })
    expect(expectSnapshot('America/New_York', instant)).toMatchObject({
      localDate: '2023-12-31',
      localTime: '19:00:00',
      utcOffset: 'UTC-05:00',
    })
    expect(expectSnapshot('America/Los_Angeles', instant)).toMatchObject({
      localDate: '2023-12-31',
      localTime: '16:00:00',
      utcOffset: 'UTC-08:00',
    })
  })

  it('applies DST changes and preserves target-zone calendar dates', () => {
    const newYorkBeforeDst = expectSnapshot('America/New_York', Date.parse('2024-03-10T06:59:00.000Z'))
    const newYorkAfterDst = expectSnapshot('America/New_York', Date.parse('2024-03-10T07:00:00.000Z'))
    const londonAfterDst = expectSnapshot('Europe/London', Date.parse('2024-03-31T01:00:00.000Z'))
    const sydneyAfterDst = expectSnapshot('Australia/Sydney', Date.parse('2024-04-06T16:00:00.000Z'))

    expect(newYorkBeforeDst).toMatchObject({ localTime: '01:59:00', utcOffset: 'UTC-05:00' })
    expect(newYorkAfterDst).toMatchObject({ localTime: '03:00:00', utcOffset: 'UTC-04:00' })
    expect(londonAfterDst).toMatchObject({ localTime: '02:00:00', utcOffset: 'UTC+01:00' })
    expect(sydneyAfterDst).toMatchObject({ localTime: '02:00:00', utcOffset: 'UTC+10:00' })
  })

  it('does not create a result for an invalid instant or unsupported zone', () => {
    const option = getDefaultWorldTimeOptions()[0]

    if (!option) {
      throw new Error('Missing default world-time option')
    }

    expect(createWorldTimeSnapshot(option, Number.NaN)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
    expect(createWorldTimeSnapshot({
      ...option,
      timeZone: 'Mars/Crater',
    }, Date.now())).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
  })
})
