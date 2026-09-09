import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QR_CODE_SIZE,
  generateQrCode,
  getQrCodeUtf8ByteLength,
  mapQrCodeGenerationError,
  QR_CODE_MAX_BYTES,
  QR_CODE_SIZES,
} from '../../core/qr-code'

describe('QR code core', () => {
  it('generates a deterministic SVG preview with the confirmed defaults', async () => {
    const first = await generateQrCode('https://example.com/二维码')
    const second = await generateQrCode('https://example.com/二维码')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.value.size).toBe(DEFAULT_QR_CODE_SIZE)
    expect(first.value.byteLength).toBe(getQrCodeUtf8ByteLength(first.value.content))
    expect(first.value.moduleCount).toBeGreaterThanOrEqual(21)
    expect(first.value.version).toBeGreaterThanOrEqual(1)
    expect(first.value.svg).toContain('<svg')
    expect(first.value.svg).toContain('width="512" height="512"')
    expect(first.value.svg).toBe(second.value.svg)
  })

  it('keeps original whitespace and newline content while validating non-empty input', async () => {
    const result = await generateQrCode('  第一行\n第二行  ')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.content).toBe('  第一行\n第二行  ')
  })

  it('supports Unicode, emoji, URLs and the confirmed export sizes', async () => {
    expect(getQrCodeUtf8ByteLength('中文😀')).toBe(10)

    for (const size of QR_CODE_SIZES) {
      const result = await generateQrCode('中文、English、123、😀', { size })

      expect(result.ok).toBe(true)
      if (!result.ok) continue

      expect(result.value.size).toBe(size)
      expect(result.value.svg).toContain(`width="${size}" height="${size}"`)
    }
  })

  it('rejects empty, oversized and invalid-size input without a partial result', async () => {
    const empty = await generateQrCode(' \n\t ')
    const oversized = await generateQrCode('a'.repeat(QR_CODE_MAX_BYTES + 1))
    const invalidSize = await generateQrCode('valid', { size: 300 as never })
    const nonIntegerSize = await generateQrCode('valid', { size: 512.5 as never })

    expect(empty).toMatchObject({ ok: false, error: { code: 'empty-input' } })
    expect(oversized).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
    expect(invalidSize).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
    expect(nonIntegerSize).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })

  it('maps generator failures to user-safe project errors', () => {
    expect(mapQrCodeGenerationError(new Error('The amount of data is too big to fit in a QR Code'))).toEqual({
      code: 'out-of-range',
      message: '输入内容超过二维码容量，请减少内容后重试。',
    })
    expect(mapQrCodeGenerationError(new Error('invalid mode'))).toEqual({
      code: 'unsupported-input',
      message: '当前内容无法编码为二维码，请修改内容后重试。',
    })
    expect(mapQrCodeGenerationError(new Error('unexpected renderer failure'))).toEqual({
      code: 'operation-failed',
      message: '二维码生成失败，请稍后重试。',
    })
  })
})
