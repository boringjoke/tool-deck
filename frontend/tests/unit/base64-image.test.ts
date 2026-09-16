import { describe, expect, it } from 'vitest'
import {
  BASE64_IMAGE_MAX_BYTES,
  detectBase64ImageFormat,
  getBase64DecodedByteLength,
  getBase64ImageExtension,
  getBase64ImageFormatFromMimeType,
  isBase64ImageMimeMatchingFormat,
  isValidStandardBase64,
  normalizeBase64ImageMimeType,
  parseBase64ImageText,
} from '../../core/base64-image'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

describe('base64-image core', () => {
  it('parses a Data URL and removes ordinary whitespace from its Base64 body', () => {
    const parsed = parseBase64ImageText('data:image/png;base64, iVBORw0K\nGgo=')

    expect(parsed).toEqual({
      ok: true,
      value: {
        base64: 'iVBORw0KGgo=',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        format: 'png',
        byteLength: 8,
      },
    })
  })

  it('requires a selected format for raw Base64 and builds the matching Data URL', () => {
    const missingFormat = parseBase64ImageText('iVBORw0KGgo=')
    const parsed = parseBase64ImageText('iVBORw0KGgo=', 'png')

    expect(missingFormat).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        mimeType: 'image/png',
        format: 'png',
        byteLength: 8,
      },
    })
  })

  it('rejects URL-safe or malformed Base64', () => {
    expect(isValidStandardBase64('abcd')).toBe(true)
    expect(isValidStandardBase64('ab-c')).toBe(false)
    expect(isValidStandardBase64('a===')).toBe(false)
    expect(getBase64DecodedByteLength('AAA')).toBeNull()

    expect(parseBase64ImageText('ab-c', 'png')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('rejects decoded content beyond the 10 MiB limit before decoding', () => {
    const oversized = 'A'.repeat(Math.ceil((BASE64_IMAGE_MAX_BYTES + 1) / 3) * 4)
    const parsed = parseBase64ImageText(oversized, 'png')

    expect(parsed).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('recognizes PNG, JPEG, GIF and WebP file signatures', () => {
    expect(detectBase64ImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({
      ok: true,
      value: 'png',
    })
    expect(detectBase64ImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      ok: true,
      value: 'jpeg',
    })
    expect(detectBase64ImageFormat(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toEqual({
      ok: true,
      value: 'gif',
    })
    expect(detectBase64ImageFormat(bytes(
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ))).toEqual({
      ok: true,
      value: 'webp',
    })
    expect(detectBase64ImageFormat(bytes(0x00, 0x01, 0x02))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
  })

  it('keeps MIME, extension and signature matching rules explicit', () => {
    expect(normalizeBase64ImageMimeType(' image/jpg ')).toBe('image/jpeg')
    expect(getBase64ImageFormatFromMimeType('image/webp')).toBe('webp')
    expect(getBase64ImageExtension('jpeg')).toBe('jpg')
    expect(isBase64ImageMimeMatchingFormat('image/png', 'png')).toBe(true)
    expect(isBase64ImageMimeMatchingFormat('image/png', 'jpeg')).toBe(false)
  })
})
