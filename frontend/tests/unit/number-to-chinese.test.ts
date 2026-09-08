import { describe, expect, it } from 'vitest'

import {
  convertAmountToChinese,
  convertChineseToArabic,
  convertNumberChinese,
  convertNumberToChinese,
} from '../../core/number-to-chinese'

/** 断言工具结果成功并返回结果值。 */
function expectSuccess(result: ReturnType<typeof convertNumberToChinese>, value: string) {
  expect(result.ok).toBe(true)
  if (!result.ok) return

  expect(result.value).toBe(value)
}

describe('number to Chinese core', () => {
  it('converts Arabic integers and decimals to Chinese uppercase numbers', () => {
    expectSuccess(convertNumberToChinese('0'), '零')
    expectSuccess(convertNumberToChinese('10'), '壹拾')
    expectSuccess(convertNumberToChinese('101'), '壹佰零壹')
    expectSuccess(convertNumberToChinese('10001'), '壹万零壹')
    expectSuccess(convertNumberToChinese('10010001'), '壹仟零壹万零壹')
    expectSuccess(convertNumberToChinese('12.30'), '壹拾贰点叁零')
  })

  it('supports negative values, leading zeros, zero groups, and large units', () => {
    expectSuccess(convertNumberToChinese('-00012.05'), '负壹拾贰点零伍')
    expectSuccess(convertNumberToChinese('100000001'), '壹亿零壹')
    expectSuccess(convertNumberToChinese('1000000000001'), '壹兆零壹')

    const largest = convertNumberToChinese('9'.repeat(48))
    expect(largest.ok).toBe(true)
    if (largest.ok) {
      expect(largest.value).toContain('载')
    }
  })

  it('converts Arabic values to uppercase amount expressions', () => {
    expectSuccess(convertAmountToChinese('0'), '零元整')
    expectSuccess(convertAmountToChinese('12.30'), '壹拾贰元叁角')
    expectSuccess(convertAmountToChinese('12.03'), '壹拾贰元零叁分')
    expectSuccess(convertAmountToChinese('0.05'), '零元零伍分')
    expectSuccess(convertAmountToChinese('-10001.05'), '负壹万零壹元零伍分')
  })

  it('rejects unsupported Arabic formats and amount precision', () => {
    expect(convertNumberToChinese('')).toMatchObject({ ok: false, error: { code: 'empty-input' } })
    expect(convertNumberToChinese('1,000')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertNumberToChinese('1e3')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertAmountToChinese('1.234')).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
    expect(convertNumberToChinese(`1${'0'.repeat(48)}`)).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
  })

  it('converts Chinese uppercase numbers back to normalized Arabic values', () => {
    expectSuccess(convertChineseToArabic('零'), '0')
    expectSuccess(convertChineseToArabic('拾'), '10')
    expectSuccess(convertChineseToArabic('壹佰零壹'), '101')
    expectSuccess(convertChineseToArabic('壹万零壹'), '10001')
    expectSuccess(convertChineseToArabic('壹拾贰点叁零'), '12.30')
    expectSuccess(convertChineseToArabic('负壹拾贰'), '负12')
    expectSuccess(convertChineseToArabic('负零点零零'), '0.00')
  })

  it('converts Chinese uppercase amounts back to Arabic values', () => {
    expectSuccess(convertChineseToArabic('壹拾贰元叁角'), '12.3')
    expectSuccess(convertChineseToArabic('壹拾贰元零叁分'), '12.03')
    expectSuccess(convertChineseToArabic('零元零伍分'), '0.05')
    expectSuccess(convertChineseToArabic('壹万零壹元零伍分'), '10001.05')
    expectSuccess(convertChineseToArabic('伍分'), '0.05')
    expectSuccess(convertChineseToArabic('壹元整'), '1')
    expectSuccess(convertChineseToArabic('负壹元伍角'), '负1.5')
  })

  it('round-trips representative Chinese integer unit boundaries', () => {
    const values = [
      '1',
      '10',
      '11',
      '20',
      '100',
      '101',
      '110',
      '1000',
      '1001',
      '1010',
      '1100',
      '10000',
      '10001',
      '10010',
      '10100',
      '11000',
      '100000',
      '100001',
      '100010',
      '101000',
      '100100',
      '1000000',
      '100000001',
      '100010001',
      '100100000',
      '1000000000001',
    ]

    values.forEach((value) => {
      const chinese = convertNumberToChinese(value)
      expect(chinese.ok).toBe(true)
      if (!chinese.ok) return

      expectSuccess(convertChineseToArabic(chinese.value), value)
    })
  })

  it('rejects malformed Chinese numbers and amounts', () => {
    expect(convertChineseToArabic('一百')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertChineseToArabic('壹零壹')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertChineseToArabic('壹元整叁分')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertChineseToArabic('壹元叁角角')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(convertChineseToArabic('负')).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('dispatches the three confirmed modes through one entry point', () => {
    expectSuccess(convertNumberChinese({ mode: 'number-to-chinese', value: '8' }), '捌')
    expectSuccess(convertNumberChinese({ mode: 'amount-to-chinese', value: '8' }), '捌元整')
    expectSuccess(convertNumberChinese({ mode: 'chinese-to-number', value: '捌' }), '8')
  })
})
