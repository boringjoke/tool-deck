import { describe, expect, it } from 'vitest'
import {
  convertSimplifiedTraditional,
  type SimplifiedTraditionalMode,
} from '../../core/simplified-traditional'

/** 断言工具结果成功并返回结果值。 */
async function expectSuccess(mode: SimplifiedTraditionalMode, value: string): Promise<string> {
  const result = await convertSimplifiedTraditional({ mode, value })

  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value
}

describe('convertSimplifiedTraditional', () => {
  it('converts simplified Chinese phrases to OpenCC standard traditional Chinese', async () => {
    expect(await expectSuccess(
      'simplified-to-traditional',
      '开发软件、后台和头发。',
    )).toBe('開發軟件、後臺和頭髮。')
  })

  it('converts OpenCC standard traditional Chinese back to simplified Chinese', async () => {
    expect(await expectSuccess(
      'traditional-to-simplified',
      '開發軟件、後臺和頭髮。',
    )).toBe('开发软件、后台和头发。')
  })

  it('preserves non-Chinese text, whitespace, punctuation and emoji', async () => {
    const input = '  简体中文\nTool Deck 2.0 · JSON\n123! 😀  '

    expect(await expectSuccess('simplified-to-traditional', input))
      .toBe('  簡體中文\nTool Deck 2.0 · JSON\n123! 😀  ')
  })

  it('accepts mixed text and leaves already-target characters unchanged', async () => {
    expect(await expectSuccess(
      'simplified-to-traditional',
      '简体與繁體混合。',
    )).toBe('簡體與繁體混合。')
  })

  it('keeps a successful result when the input contains no convertible characters', async () => {
    expect(await expectSuccess('simplified-to-traditional', 'Tool Deck 123 😀')).toBe('Tool Deck 123 😀')
  })

  it('returns an empty-input error for blank text', async () => {
    const result = await convertSimplifiedTraditional({
      mode: 'simplified-to-traditional',
      value: ' \n\t ',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'empty-input',
        message: '请输入需要转换的中文文本。',
      },
    })
  })

  it('is stable when the same direction is applied repeatedly', async () => {
    const first = await expectSuccess('simplified-to-traditional', '开发工具和用户界面。')

    expect(await expectSuccess('simplified-to-traditional', first)).toBe(first)
  })
})
