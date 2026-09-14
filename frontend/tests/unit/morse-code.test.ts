import { describe, expect, it } from 'vitest'
import {
  convertMorse,
  getMorseInputLength,
  MORSE_MAX_INPUT_LENGTH,
} from '../../core/morse-code'

/** 断言摩斯码转换成功并返回输出文本。 */
function expectSuccess(input: string, direction: 'text-to-morse' | 'morse-to-text'): string {
  const result = convertMorse(input, { direction })

  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value.output
}

describe('convertMorse', () => {
  it('encodes letters, digits and common punctuation', () => {
    expect(expectSuccess('SOS 123!?', 'text-to-morse'))
      .toBe('... --- ... / .---- ..--- ...-- -.-.-- ..--..')
  })

  it('encodes lowercase input as uppercase international Morse code', () => {
    expect(expectSuccess('Hello', 'text-to-morse')).toBe('.... . .-.. .-.. ---')
  })

  it('normalizes repeated whitespace into word separators', () => {
    expect(expectSuccess('  HELLO\t WORLD\nAGAIN  ', 'text-to-morse'))
      .toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -.. / .- --. .- .. -.')
  })

  it('decodes character and word separators', () => {
    expect(expectSuccess('.... . .-.. .-.. --- / .-- --- .-. .-.. -..', 'morse-to-text'))
      .toBe('HELLO WORLD')
  })

  it('decodes supported punctuation and normalizes output to uppercase', () => {
    expect(expectSuccess('... --- ... --..-- / .... ..', 'morse-to-text')).toBe('SOS, HI')
  })

  it('supports representative round trips', () => {
    const input = 'Hello, World!'
    const morse = expectSuccess(input, 'text-to-morse')

    expect(expectSuccess(morse, 'morse-to-text')).toBe('HELLO, WORLD!')
  })

  it('returns an empty-input error for blank input', () => {
    expect(convertMorse(' \n\t ', { direction: 'text-to-morse' })).toEqual({
      ok: false,
      error: {
        code: 'empty-input',
        message: '请输入需要转换的文本或摩斯码。',
      },
    })
  })

  it('rejects unsupported text characters without producing partial output', () => {
    expect(convertMorse('HELLO 中文', { direction: 'text-to-morse' })).toEqual({
      ok: false,
      error: {
        code: 'unsupported-input',
        message: '第 6 个字符“中”不在首版支持范围内。',
        details: '仅支持英文字母、数字和已列出的常用标点，不支持中文、Emoji 或其他符号。',
      },
    })
  })

  it('rejects malformed Morse separators', () => {
    expect(convertMorse('.... / / .-', { direction: 'morse-to-text' })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: '摩斯码分隔结构无效。',
        details: '单词分隔符两侧必须包含有效的摩斯码。字符代码使用空格分隔，单词使用“/”分隔。',
      },
    })
  })

  it('rejects non-Morse characters in a code token', () => {
    expect(convertMorse('.... .-x', { direction: 'morse-to-text' })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: '摩斯码分隔结构无效。',
        details: '代码“.-x”只能包含点号和短横线。字符代码使用空格分隔，单词使用“/”分隔。',
      },
    })
  })

  it('rejects unknown Morse codes', () => {
    expect(convertMorse('......', { direction: 'morse-to-text' })).toEqual({
      ok: false,
      error: {
        code: 'unsupported-input',
        message: '摩斯码“......”不在首版支持范围内。',
        details: '请检查点号、短横线和字符分隔是否正确。',
      },
    })
  })

  it('rejects an empty Morse word', () => {
    expect(convertMorse('/ ....', { direction: 'morse-to-text' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('validates the Unicode code point length boundary', () => {
    const withinLimit = 'A'.repeat(MORSE_MAX_INPUT_LENGTH)
    const overLimit = `${withinLimit}A`

    expect(getMorseInputLength(withinLimit)).toBe(MORSE_MAX_INPUT_LENGTH)
    expect(convertMorse(withinLimit, { direction: 'text-to-morse' }).ok).toBe(true)
    expect(convertMorse(overLimit, { direction: 'text-to-morse' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('rejects an invalid conversion direction', () => {
    expect(convertMorse('SOS', { direction: 'invalid' as 'text-to-morse' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })
})
