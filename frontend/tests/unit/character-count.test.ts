import { describe, expect, it } from 'vitest'

import { analyzeText } from '../../core/character-count'

describe('character count core', () => {
  it('returns zeroed statistics for empty input', () => {
    expect(analyzeText('')).toEqual({
      charactersWithSpaces: 0,
      charactersWithoutSpaces: 0,
      wordCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      lineCount: 0,
      hanCount: 0,
      byteCount: 0,
    })
  })

  it('counts graphemes, whitespace, lines, paragraphs, Han characters, and bytes', () => {
    const stats = analyzeText('A 你好! 👨‍👩‍👧‍👦\n第二行。\n\n第三段')

    expect(stats.charactersWithSpaces).toBe(17)
    expect(stats.charactersWithoutSpaces).toBe(12)
    expect(stats.hanCount).toBe(8)
    expect(stats.paragraphCount).toBe(2)
    expect(stats.lineCount).toBe(4)
    expect(stats.wordCount).toBeGreaterThan(0)
    expect(stats.sentenceCount).toBeGreaterThan(0)
    expect(stats.byteCount).toBe(new TextEncoder().encode('A 你好! 👨‍👩‍👧‍👦\n第二行。\n\n第三段').length)
  })

  it('preserves a trailing empty line and excludes all Unicode whitespace from the second count', () => {
    const stats = analyzeText('a\u00a0b\n')

    expect(stats.charactersWithSpaces).toBe(4)
    expect(stats.charactersWithoutSpaces).toBe(2)
    expect(stats.lineCount).toBe(2)
    expect(stats.paragraphCount).toBe(1)
  })

  it('counts a family emoji as one character', () => {
    const stats = analyzeText('👨‍👩‍👧‍👦')

    expect(stats.charactersWithSpaces).toBe(1)
    expect(stats.charactersWithoutSpaces).toBe(1)
  })
})
