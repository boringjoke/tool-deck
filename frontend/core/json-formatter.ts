import { failure, success, type ToolResult } from './tool-result'

export type JsonIndent = 2 | 4 | 'tab'

export interface JsonFormatOptions {
  indent: JsonIndent
}

export interface JsonFormatOutput {
  formatted: string
}

interface JsonErrorLocation {
  line: number
  column: number
  position?: number
}

function resolveIndent(indent: JsonIndent): number | string | null {
  if (indent === 2 || indent === 4) {
    return indent
  }

  if (indent === 'tab') {
    return '\t'
  }

  return null
}

function getLineAndColumn(value: string, position: number): Pick<JsonErrorLocation, 'line' | 'column'> {
  const safePosition = Math.max(0, Math.min(position, value.length))
  const lines = value.slice(0, safePosition).split(/\r\n|\r|\n/u)

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function getJsonErrorLocation(message: string, rawInput: string): JsonErrorLocation | null {
  const positionMatch = message.match(/\bposition\s+(\d+)\b/iu)

  if (positionMatch) {
    const normalizedPosition = Number(positionMatch[1])
    const leadingWhitespaceLength = rawInput.length - rawInput.trimStart().length
    const position = normalizedPosition + leadingWhitespaceLength

    return {
      position,
      ...getLineAndColumn(rawInput, position),
    }
  }

  const lineColumnMatch = message.match(/\bline\s+(\d+)\s+column\s+(\d+)\b/iu)

  if (lineColumnMatch) {
    return {
      line: Number(lineColumnMatch[1]),
      column: Number(lineColumnMatch[2]),
    }
  }

  return null
}

function createParseError(error: unknown, rawInput: string): ToolResult<JsonFormatOutput> {
  const message = error instanceof Error ? error.message : ''
  const location = getJsonErrorLocation(message, rawInput)

  if (!location) {
    return failure(
      'invalid-input',
      'JSON 语法有误，无法进一步定位。',
      '请检查逗号、冒号、双引号、括号以及是否误用了注释、单引号或尾逗号。',
    )
  }

  const position = location.position === undefined ? '' : `字符偏移 ${location.position + 1}。`

  return failure(
    'invalid-input',
    `JSON 语法有误：第 ${location.line} 行、第 ${location.column} 列附近。`,
    `${position}${position ? ' ' : ''}请检查逗号、冒号、双引号、括号以及是否误用了注释、单引号或尾逗号。`,
  )
}

export function formatJson(
  value: string,
  options: JsonFormatOptions,
): ToolResult<JsonFormatOutput> {
  if (typeof value !== 'string') {
    return failure('invalid-input', '请输入文本格式的 JSON。')
  }

  const normalizedInput = value.trim()

  if (!normalizedInput) {
    return failure('empty-input', '请输入 JSON 内容。')
  }

  const indentation = resolveIndent(options.indent)

  if (indentation === null) {
    return failure('operation-failed', '缩进配置无效，请重新选择后重试。')
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(normalizedInput) as unknown
  } catch (error: unknown) {
    return createParseError(error, value)
  }

  try {
    const formatted = JSON.stringify(parsed, null, indentation)

    if (typeof formatted !== 'string') {
      return failure('operation-failed', 'JSON 格式化失败，请检查输入后重试。')
    }

    return success({ formatted })
  } catch {
    return failure('operation-failed', 'JSON 格式化失败，请检查输入后重试。')
  }
}
