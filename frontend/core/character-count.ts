export interface CharacterStats {
  charactersWithSpaces: number
  charactersWithoutSpaces: number
  wordCount: number
  sentenceCount: number
  paragraphCount: number
  lineCount: number
  hanCount: number
  byteCount: number
}

type SegmenterGranularity = 'grapheme' | 'word' | 'sentence'

interface SegmentData {
  segment: string
  isWordLike?: boolean
}

interface Segmenter {
  segment(value: string): Iterable<SegmentData>
}

interface SegmenterConstructor {
  new (locales?: string | string[], options?: { granularity: SegmenterGranularity }): Segmenter
}

/** 获取指定粒度的浏览器文本分词器。 */
function getSegmenter(granularity: SegmenterGranularity): Segmenter | null {
  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: SegmenterConstructor
  }
  const Segmenter = intlWithSegmenter.Segmenter

  if (!Segmenter) {
    return null
  }

  try {
    return new Segmenter('zh-CN', { granularity })
  } catch {
    return null
  }
}

/** 使用浏览器分词器切分文本，不可用时返回空值。 */
function segmentText(value: string, granularity: SegmenterGranularity): SegmentData[] | null {
  const segmenter = getSegmenter(granularity)
  return segmenter ? Array.from(segmenter.segment(value)) : null
}

/** 判断字符是否为 Unicode 空白字符。 */
function isUnicodeWhitespace(value: string): boolean {
  return /^\s+$/u.test(value)
}

/** 按用户可见字素拆分文本。 */
function countGraphemes(value: string): string[] {
  return segmentText(value, 'grapheme')?.map(({ segment }) => segment) ?? Array.from(value)
}

/** 统计文本中的词数量。 */
function countWords(value: string): number {
  const segments = segmentText(value, 'word')

  if (segments) {
    return segments.filter((segment) => segment.isWordLike).length
  }

  // 回退规则只处理连续字母、数字和汉字，避免引入第三方词库。
  return value.match(/[\p{L}\p{N}]+/gu)?.length ?? 0
}

/** 统计文本中的句子数量。 */
function countSentences(value: string): number {
  const segments = segmentText(value, 'sentence')

  if (segments) {
    return segments.filter(({ segment }) => segment.trim().length > 0).length
  }

  const normalized = value.trim()

  if (!normalized) {
    return 0
  }

  return normalized
    .split(/[。！？!?]+|…+/u)
    .filter((segment) => segment.trim().length > 0).length
}

/** 统计文本中的段落数量。 */
function countParagraphs(value: string): number {
  const normalized = value.replace(/\r\n?/gu, '\n').trim()

  if (!normalized) {
    return 0
  }

  return normalized
    .split(/\n[\t \u00a0]*\n(?:[\t \u00a0]*\n)*/u)
    .filter((paragraph) => paragraph.trim().length > 0).length
}

/** 统计文本中的行数量。 */
function countLines(value: string): number {
  if (!value.length) {
    return 0
  }

  return value.replace(/\r\n?/gu, '\n').split('\n').length
}

/** 统计文本中的汉字数量。 */
function countHanCharacters(value: string): number {
  let count = 0

  for (const character of value) {
    if (/\p{Script=Han}/u.test(character)) {
      count += 1
    }
  }

  return count
}

/** 分析文本并生成字符、词、句子、段落和行统计结果。 */
export function analyzeText(value: string): CharacterStats {
  if (!value.length) {
    return {
      charactersWithSpaces: 0,
      charactersWithoutSpaces: 0,
      wordCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      lineCount: 0,
      hanCount: 0,
      byteCount: 0,
    }
  }

  const graphemes = countGraphemes(value)

  return {
    charactersWithSpaces: graphemes.length,
    charactersWithoutSpaces: graphemes.filter((grapheme) => !isUnicodeWhitespace(grapheme)).length,
    wordCount: countWords(value),
    sentenceCount: countSentences(value),
    paragraphCount: countParagraphs(value),
    lineCount: countLines(value),
    hanCount: countHanCharacters(value),
    byteCount: new TextEncoder().encode(value).length,
  }
}
