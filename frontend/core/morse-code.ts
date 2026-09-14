import { failure, success, type ToolResult } from './tool-result'

export const MORSE_MAX_INPUT_LENGTH = 10_000

export type MorseDirection = 'text-to-morse' | 'morse-to-text'

export interface MorseConvertOptions {
  direction: MorseDirection
}

export interface MorseConversionOutput {
  direction: MorseDirection
  inputLength: number
  output: string
}

const MORSE_CODE_TABLE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
} as const

type MorseCharacter = keyof typeof MORSE_CODE_TABLE

const MORSE_CODE_TO_CHARACTER = Object.fromEntries(
  Object.entries(MORSE_CODE_TABLE).map(([character, code]) => [code, character]),
) as Record<string, MorseCharacter>

/** 计算文本按 Unicode code point 计数的输入长度。 */
export function getMorseInputLength(value: string): number {
  return Array.from(value).length
}

/** 判断转换方向是否为摩斯码工具支持的方向。 */
function isMorseDirection(value: unknown): value is MorseDirection {
  return value === 'text-to-morse' || value === 'morse-to-text'
}

/** 创建摩斯码输入为空的统一错误结果。 */
function emptyInputError(): ToolResult<never> {
  return failure('empty-input', '请输入需要转换的文本或摩斯码。')
}

/** 创建摩斯码输入超限的统一错误结果。 */
function inputLengthError(): ToolResult<never> {
  return failure(
    'out-of-range',
    `输入内容不能超过 ${MORSE_MAX_INPUT_LENGTH} 个 Unicode 字符。`,
    '工具不会自动截断输入，请减少内容后重试。',
  )
}

/** 将普通文本中的单个字符转换为摩斯码。 */
function encodeTextCharacter(character: string, position: number): ToolResult<string> {
  const normalizedCharacter = /^[A-Za-z]$/u.test(character)
    ? character.toUpperCase()
    : character
  const code = MORSE_CODE_TABLE[normalizedCharacter as MorseCharacter]

  if (!code) {
    return failure(
      'unsupported-input',
      `第 ${position} 个字符“${character}”不在首版支持范围内。`,
      '仅支持英文字母、数字和已列出的常用标点，不支持中文、Emoji 或其他符号。',
    )
  }

  return success(code)
}

/** 将普通文本按已确认的空白和单词规则转换为摩斯码。 */
function encodeText(value: string): ToolResult<string> {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return emptyInputError()
  }

  const words = trimmedValue.split(/\s+/u)
  const encodedWords: string[] = []
  let characterPosition = 0

  for (const word of words) {
    const encodedCharacters: string[] = []

    for (const character of Array.from(word)) {
      characterPosition += 1
      const encodedCharacter = encodeTextCharacter(character, characterPosition)

      if (!encodedCharacter.ok) {
        return encodedCharacter
      }

      encodedCharacters.push(encodedCharacter.value)
    }

    encodedWords.push(encodedCharacters.join(' '))
  }

  return success(encodedWords.join(' / '))
}

/** 创建摩斯码结构非法的统一错误结果。 */
function invalidMorseStructureError(details: string): ToolResult<never> {
  return failure(
    'invalid-input',
    '摩斯码分隔结构无效。',
    `${details}字符代码使用空格分隔，单词使用“/”分隔。`,
  )
}

/** 将单个摩斯码代码转换为对应字符。 */
function decodeMorseToken(token: string): ToolResult<string> {
  if (!/^[.-]+$/u.test(token)) {
    return invalidMorseStructureError(`代码“${token}”只能包含点号和短横线。`)
  }

  const character = MORSE_CODE_TO_CHARACTER[token]

  if (!character) {
    return failure(
      'unsupported-input',
      `摩斯码“${token}”不在首版支持范围内。`,
      '请检查点号、短横线和字符分隔是否正确。',
    )
  }

  return success(character)
}

/** 将符合分隔规则的摩斯码文本转换为普通文本。 */
function decodeMorse(value: string): ToolResult<string> {
  const normalizedValue = value.trim().replace(/\s+/gu, ' ')

  if (!normalizedValue) {
    return emptyInputError()
  }

  const words = normalizedValue.split('/')

  if (words.some((word) => !word.trim())) {
    return invalidMorseStructureError('单词分隔符两侧必须包含有效的摩斯码。')
  }

  const decodedWords: string[] = []

  for (const word of words) {
    const tokens = word.trim().split(' ')
    const decodedCharacters: string[] = []

    for (const token of tokens) {
      const decodedToken = decodeMorseToken(token)

      if (!decodedToken.ok) {
        return decodedToken
      }

      decodedCharacters.push(decodedToken.value)
    }

    decodedWords.push(decodedCharacters.join(''))
  }

  return success(decodedWords.join(' '))
}

/** 在浏览器本地执行文本与国际摩斯码之间的双向转换。 */
export function convertMorse(
  input: string,
  options: MorseConvertOptions,
): ToolResult<MorseConversionOutput> {
  if (typeof input !== 'string') {
    return failure('invalid-input', '输入内容必须是文本。')
  }

  if (!isMorseDirection(options?.direction)) {
    return failure('invalid-input', '摩斯码转换方向无效，请重新选择后重试。')
  }

  const inputLength = getMorseInputLength(input)

  if (inputLength > MORSE_MAX_INPUT_LENGTH) {
    return inputLengthError()
  }

  const converted = options.direction === 'text-to-morse'
    ? encodeText(input)
    : decodeMorse(input)

  if (!converted.ok) {
    return converted
  }

  return success({
    direction: options.direction,
    inputLength,
    output: converted.value,
  })
}
