import { describe, expect, it } from 'vitest'

import {
  BARCODE_FORMATS,
  DEFAULT_BARCODE_FORMAT,
  getBarcodeFormatLabel,
  mapBarcodeGenerationError,
  validateBarcodeInput,
} from '../../core/barcode'

describe('barcode core', () => {
  it('exposes the confirmed formats and defaults to CODE128', () => {
    expect(BARCODE_FORMATS).toEqual(['CODE128', 'CODE39', 'EAN13', 'UPC'])
    expect(DEFAULT_BARCODE_FORMAT).toBe('CODE128')
    expect(getBarcodeFormatLabel('EAN13')).toBe('EAN-13')
    expect(getBarcodeFormatLabel('UPC')).toBe('UPC-A')
  })

  it('accepts visible ASCII CODE128 content and preserves spaces', () => {
    const content = `  ${'A'.repeat(76)}`
    const result = validateBarcodeInput(content)

    expect(result).toEqual({
      ok: true,
      value: {
        content,
        encodedValue: content,
        format: 'CODE128',
      },
    })
  })

  it('rejects non-visible CODE128 characters and content over the limit', () => {
    expect(validateBarcodeInput('line\nbreak')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateBarcodeInput('ABC\n')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateBarcodeInput('A'.repeat(81))).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('accepts the confirmed CODE39 character set and rejects lowercase input', () => {
    const valid = validateBarcodeInput('ABC 123-.$/+%', { format: 'CODE39' })
    const atLimit = validateBarcodeInput('A'.repeat(40), { format: 'CODE39' })
    const lowercase = validateBarcodeInput('abc', { format: 'CODE39' })
    const unsupported = validateBarcodeInput('ABC_', { format: 'CODE39' })

    expect(valid).toMatchObject({ ok: true, value: { encodedValue: 'ABC 123-.$/+%' } })
    expect(atLimit).toMatchObject({ ok: true, value: { encodedValue: 'A'.repeat(40) } })
    expect(lowercase).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(unsupported).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    expect(validateBarcodeInput('ABC\n', { format: 'CODE39' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateBarcodeInput('A'.repeat(41), { format: 'CODE39' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('normalizes a 12-digit EAN-13 body and validates a full checksum', () => {
    const body = validateBarcodeInput('400638133393', { format: 'EAN13' })
    const full = validateBarcodeInput('4006381333931', { format: 'EAN13' })
    const invalidChecksum = validateBarcodeInput('4006381333932', { format: 'EAN13' })

    expect(body).toMatchObject({
      ok: true,
      value: { encodedValue: '4006381333931', format: 'EAN13' },
    })
    expect(full).toMatchObject({ ok: true, value: { encodedValue: '4006381333931' } })
    expect(invalidChecksum).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('normalizes an 11-digit UPC-A body and validates a full checksum', () => {
    const body = validateBarcodeInput('03600029145', { format: 'UPC' })
    const full = validateBarcodeInput('036000291452', { format: 'UPC' })
    const invalidChecksum = validateBarcodeInput('036000291453', { format: 'UPC' })

    expect(body).toMatchObject({
      ok: true,
      value: { encodedValue: '036000291452', format: 'UPC' },
    })
    expect(full).toMatchObject({ ok: true, value: { encodedValue: '036000291452' } })
    expect(invalidChecksum).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('rejects empty input, numeric whitespace and numeric invalid lengths', () => {
    expect(validateBarcodeInput(' \n\t ')).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(validateBarcodeInput('400 638133393', { format: 'EAN13' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateBarcodeInput('40063813339\n', { format: 'EAN13' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateBarcodeInput('123', { format: 'UPC' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('maps renderer failures to user-safe project errors', () => {
    expect(mapBarcodeGenerationError(new Error('unknown format'))).toEqual({
      code: 'unsupported-input',
      message: '当前码制暂不支持生成。',
    })
    expect(mapBarcodeGenerationError(new Error('value too long'))).toEqual({
      code: 'out-of-range',
      message: '输入内容超过当前码制的长度限制。',
    })
    expect(mapBarcodeGenerationError(new Error('not a valid barcode'))).toEqual({
      code: 'invalid-input',
      message: '当前内容无法生成该条形码，请检查输入。',
    })
    expect(mapBarcodeGenerationError(new Error('unexpected renderer failure'))).toEqual({
      code: 'operation-failed',
      message: '条形码生成失败，请稍后重试。',
    })
  })

})
