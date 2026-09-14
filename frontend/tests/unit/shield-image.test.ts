import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SHIELD_LEFT_COLOR,
  DEFAULT_SHIELD_RIGHT_COLOR,
  SHIELD_HEIGHT,
  SHIELD_TEXT_MAX_LENGTH,
  createShieldSvgDataUrl,
  generateShieldImage,
} from '../../core/shield-image'

describe('shield image core', () => {
  it('generates a deterministic SVG with the confirmed defaults', () => {
    const options = {
      leftText: 'build',
      rightText: 'passing',
    }
    const first = generateShieldImage(options)
    const second = generateShieldImage(options)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.value.leftColor).toBe(DEFAULT_SHIELD_LEFT_COLOR)
    expect(first.value.rightColor).toBe('#44cc11')
    expect(first.value.height).toBe(SHIELD_HEIGHT)
    expect(first.value.width).toBeGreaterThan(60)
    expect(first.value.svg).toContain('<svg')
    expect(first.value.svg).toContain('clip-path="url(#shield-clip)"')
    expect(first.value.svg).toContain('build')
    expect(first.value.svg).toContain('passing')
    expect(first.value.previewSource).toBe(createShieldSvgDataUrl(first.value.svg))
    expect(first.value.svg).toBe(second.value.svg)
  })

  it('trims only outer whitespace and preserves internal spaces', () => {
    const result = generateShieldImage({
      leftText: '  code quality  ',
      rightText: '  good  ',
      leftColor: '#abc',
      rightColor: '#123456',
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        leftText: 'code quality',
        rightText: 'good',
        leftColor: '#aabbcc',
        rightColor: '#123456',
      },
    })
  })

  it('escapes XML characters and supports Unicode text', () => {
    const result = generateShieldImage({
      leftText: '<构建>',
      rightText: '通过 & "好"',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.svg).toContain('&lt;构建&gt;')
    expect(result.value.svg).toContain('通过 &amp; &quot;好&quot;')
  })

  it('accepts the exact Unicode length boundary and rejects overflow', () => {
    const atLimit = generateShieldImage({
      leftText: '😀'.repeat(SHIELD_TEXT_MAX_LENGTH),
      rightText: 'ok',
    })
    const overLimit = generateShieldImage({
      leftText: '😀'.repeat(SHIELD_TEXT_MAX_LENGTH + 1),
      rightText: 'ok',
    })

    expect(atLimit.ok).toBe(true)
    expect(overLimit).toMatchObject({ ok: false, error: { code: 'out-of-range' } })
  })

  it('rejects empty, control-character and invalid-color input', () => {
    expect(generateShieldImage({ leftText: ' ', rightText: 'ok' })).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(generateShieldImage({ leftText: 'line\nbreak', rightText: 'ok' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(generateShieldImage({ leftText: 'build', rightText: 'ok', leftColor: 'red' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })
})
