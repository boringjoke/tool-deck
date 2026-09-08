import { failure, success, type ToolResult } from './tool-result'

export type JsonIndent = 2 | 4 | 'tab'

export interface JsonFormatOptions {
  indent: JsonIndent
}

export interface JsonFormatOutput {
  formatted: string
}

export interface JsonCompressionOutput {
  compressed: string
}

export interface JsonFlattenOutput {
  flattened: string
}

export interface JsonUnflattenOutput {
  unflattened: string
}

export interface JsonErrorLocation {
  line: number
  column: number
  position?: number
}

type JsonContainer = Record<string, unknown> | unknown[]

interface JsonPathNode {
  children: Map<string, JsonPathNode>
  hasValue: boolean
  value?: unknown
}

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/** 将 JSON 缩进配置解析为序列化器可用的缩进参数。 */
function resolveIndent(indent: JsonIndent): number | string | null {
  if (indent === 2 || indent === 4) {
    return indent
  }

  if (indent === 'tab') {
    return '\t'
  }

  return null
}

/** 根据字符位置计算 JSON 输入中的行号和列号。 */
function getLineAndColumn(value: string, position: number): Pick<JsonErrorLocation, 'line' | 'column'> {
  const safePosition = Math.max(0, Math.min(position, value.length))
  const lines = value.slice(0, safePosition).split(/\r\n|\r|\n/u)

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

/** 查找指定位置之前的最后一个非空白字符。 */
function getPreviousNonWhitespacePosition(value: string, position: number): number | null {
  for (let index = Math.min(position - 1, value.length - 1); index >= 0; index -= 1) {
    if (!/\s/u.test(value[index] ?? '')) {
      return index
    }
  }

  return null
}

/** 判断解析错误是否属于缺少分隔符的场景。 */
function isMissingDelimiterError(message: string): boolean {
  return /Expected\s+','\s+or\s+'[}\]]'\s+after\s+(?:property value|array element)/iu.test(message)
}

/** 从 JSON 解析错误信息中提取可定位的行列位置。 */
export function getJsonErrorLocation(message: string, rawInput: string): JsonErrorLocation | null {
  const localizedLineColumnMatch = message.match(/第\s*(\d+)\s*行\s*[,，、]\s*第\s*(\d+)\s*列/iu)

  if (localizedLineColumnMatch) {
    return {
      line: Number(localizedLineColumnMatch[1]),
      column: Number(localizedLineColumnMatch[2]),
    }
  }

  const positionMatch = message.match(/\bposition\s+(\d+)\b/iu)

  if (positionMatch) {
    const normalizedPosition = Number(positionMatch[1])
    const leadingWhitespaceLength = rawInput.length - rawInput.trimStart().length
    let position = normalizedPosition + leadingWhitespaceLength

    if (isMissingDelimiterError(message)) {
      position = getPreviousNonWhitespacePosition(rawInput, position) ?? position
    }

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

/** 将 JSON 解析异常转换为带定位信息的结构化错误。 */
function createParseError<T>(error: unknown, rawInput: string): ToolResult<T> {
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

/** 解析并校验输入是否为标准 JSON。 */
function parseJson(value: string): ToolResult<unknown> {
  if (typeof value !== 'string') {
    return failure('invalid-input', '请输入文本格式的 JSON。')
  }

  const normalizedInput = value.trim()

  if (!normalizedInput) {
    return failure('empty-input', '请输入 JSON 内容。')
  }

  try {
    return success(JSON.parse(normalizedInput) as unknown)
  } catch (error: unknown) {
    return createParseError(error, value)
  }
}

/** 判断 JSON 值是否为对象或数组容器。 */
function isJsonContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null
}

/** 判断 JSON 容器是否为空。 */
function isEmptyJsonContainer(value: JsonContainer): boolean {
  return Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0
}

/** 判断路径片段是否包含禁止使用的危险键名。 */
function isUnsafePathSegment(segment: string): boolean {
  return UNSAFE_PATH_SEGMENTS.has(segment)
}

/** 转义扁平化路径中的点号和反斜线。 */
function encodePathSegment(segment: string): string {
  return segment.replace(/\\/gu, '\\\\').replace(/\./gu, '\\.')
}

/** 将路径片段组合为扁平化使用的点号路径。 */
function encodePath(segments: readonly string[]): string {
  return segments.map(encodePathSegment).join('.')
}

/** 创建 JSON 结构转换失败时的结构化错误。 */
function createTransformError(message: string, details?: string): ToolResult<never> {
  return failure('invalid-input', message, details)
}

/** 按指定缩进序列化 JSON 转换结果。 */
function serializeTransformedJson(
  value: unknown,
  options: JsonFormatOptions,
  operationLabel: string,
): ToolResult<string> {
  const indentation = resolveIndent(options.indent)

  if (indentation === null) {
    return failure('operation-failed', '缩进配置无效，请重新选择后重试。')
  }

  try {
    const serialized = JSON.stringify(value, null, indentation)

    if (typeof serialized !== 'string') {
      return failure('operation-failed', `JSON ${operationLabel}失败，请检查输入后重试。`)
    }

    return success(serialized)
  } catch {
    return failure('operation-failed', `JSON ${operationLabel}失败，请检查输入后重试。`)
  }
}

/** 递归遍历 JSON 容器并生成扁平化键值对。 */
function flattenValue(
  value: unknown,
  path: readonly string[],
  output: Record<string, unknown>,
): ToolResult<null> {
  if (!isJsonContainer(value)) {
    output[encodePath(path)] = value
    return success(null)
  }

  const entries = Array.isArray(value)
    ? Array.from(value.entries())
    : Object.entries(value)

  if (!entries.length) {
    if (path.length) {
      output[encodePath(path)] = value
    }

    return success(null)
  }

  for (const [key, child] of entries) {
    const segment = String(key)

    if (isUnsafePathSegment(segment)) {
      return createTransformError(
        `路径段“${segment}”不允许使用。`,
        '请移除 __proto__、constructor 或 prototype 后重试。',
      )
    }

    const childResult = flattenValue(child, [...path, segment], output)

    if (!childResult.ok) {
      return childResult
    }
  }

  return success(null)
}

/** 解析带转义规则的扁平化路径文本。 */
function parsePath(path: string): ToolResult<string[]> {
  const segments: string[] = []
  let segment = ''
  let isEscaped = false

  for (const character of path) {
    if (isEscaped) {
      if (character !== '.' && character !== '\\') {
        return createTransformError(
          `路径“${path}”包含无效转义。`,
          '点号和反斜线只能使用反斜线转义。',
        )
      }

      segment += character
      isEscaped = false
      continue
    }

    if (character === '\\') {
      isEscaped = true
      continue
    }

    if (character === '.') {
      segments.push(segment)
      segment = ''
      continue
    }

    segment += character
  }

  if (isEscaped) {
    return createTransformError(
      `路径“${path}”末尾的反斜线没有完成转义。`,
      '点号和反斜线只能使用反斜线转义。',
    )
  }

  segments.push(segment)

  for (const currentSegment of segments) {
    if (isUnsafePathSegment(currentSegment)) {
      return createTransformError(
        `路径段“${currentSegment}”不允许使用。`,
        '请移除 __proto__、constructor 或 prototype 后重试。',
      )
    }
  }

  return success(segments)
}

/** 创建反扁平化路径树节点。 */
function createJsonPathNode(): JsonPathNode {
  return {
    children: new Map(),
    hasValue: false,
  }
}

/** 创建路径冲突错误结果。 */
function pathConflict(path: string): ToolResult<never> {
  return createTransformError(
    `路径冲突：${path || '（空路径）'}。`,
    '同一路径不能同时作为值和对象/数组的父路径，请检查扁平 JSON 的键。',
  )
}

/** 将扁平化路径和值插入反扁平化路径树。 */
function insertPathValue(
  root: JsonPathNode,
  segments: readonly string[],
  value: unknown,
  path: string,
): ToolResult<null> {
  let node = root

  for (const segment of segments) {
    if (node.hasValue) {
      return pathConflict(path)
    }

    let child = node.children.get(segment)

    if (!child) {
      child = createJsonPathNode()
      node.children.set(segment, child)
    }

    node = child
  }

  if (node.hasValue || node.children.size) {
    return pathConflict(path)
  }

  node.hasValue = true
  node.value = value

  return success(null)
}

/** 判断路径片段是否为合法的非负整数索引。 */
function isIntegerPathSegment(segment: string): boolean {
  return /^\d+$/u.test(segment)
}

/** 解析数组路径片段并返回安全数组索引。 */
function getArrayIndex(segment: string): number | null {
  if (!isIntegerPathSegment(segment)) {
    return null
  }

  const index = Number(segment)

  if (!Number.isSafeInteger(index) || index < 0 || index > 4_294_967_294) {
    return null
  }

  return index
}

/** 将反扁平化路径树递归还原为 JSON 值。 */
function materializePathNode(node: JsonPathNode): ToolResult<unknown> {
  if (node.hasValue) {
    if (node.children.size) {
      return pathConflict('')
    }

    return success(node.value)
  }

  const keys = Array.from(node.children.keys())
  const numericKeyCount = keys.filter(isIntegerPathSegment).length

  if (numericKeyCount > 0 && numericKeyCount !== keys.length) {
    return createTransformError(
      '同一层级不能同时使用数组索引和对象键。',
      '请统一使用连续的数字路径段，或改用对象键。',
    )
  }

  if (numericKeyCount === keys.length && keys.length > 0) {
    const indexedKeys = keys
      .map((key) => ({ key, index: getArrayIndex(key) }))
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))

    if (indexedKeys.some(({ index }) => index === null)) {
      return createTransformError(
        '数组索引无效。',
        '数组索引必须是从 0 开始的非负整数。',
      )
    }

    for (const [expectedIndex, indexedKey] of indexedKeys.entries()) {
      if (indexedKey.index !== expectedIndex) {
        return createTransformError(
          '数组索引存在缺口。',
          '反扁平化要求数组索引从 0 开始连续排列。',
        )
      }
    }

    const arrayValue: unknown[] = []

    for (const { key, index } of indexedKeys) {
      const child = node.children.get(key)

      if (!child || index === null) {
        return failure('operation-failed', 'JSON 反扁平化失败，请检查输入后重试。')
      }

      const childResult = materializePathNode(child)

      if (!childResult.ok) {
        return childResult
      }

      arrayValue[index] = childResult.value
    }

    return success(arrayValue)
  }

  const objectValue = Object.create(null) as Record<string, unknown>

  for (const [key, child] of node.children) {
    if (isUnsafePathSegment(key)) {
      return createTransformError(
        `路径段“${key}”不允许使用。`,
        '请移除 __proto__、constructor 或 prototype 后重试。',
      )
    }

    const childResult = materializePathNode(child)

    if (!childResult.ok) {
      return childResult
    }

    objectValue[key] = childResult.value
  }

  return success(objectValue)
}

/** 解析并按指定缩进格式化 JSON 文本。 */
export function formatJson(
  value: string,
  options: JsonFormatOptions,
): ToolResult<JsonFormatOutput> {
  const indentation = resolveIndent(options.indent)

  if (indentation === null) {
    return failure('operation-failed', '缩进配置无效，请重新选择后重试。')
  }

  const parsedResult = parseJson(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  try {
    const formatted = JSON.stringify(parsedResult.value, null, indentation)

    if (typeof formatted !== 'string') {
      return failure('operation-failed', 'JSON 格式化失败，请检查输入后重试。')
    }

    return success({ formatted })
  } catch {
    return failure('operation-failed', 'JSON 格式化失败，请检查输入后重试。')
  }
}

/** 解析 JSON 并生成移除结构空白的压缩文本。 */
export function compressJson(value: string): ToolResult<JsonCompressionOutput> {
  const parsedResult = parseJson(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  try {
    const compressed = JSON.stringify(parsedResult.value)

    if (typeof compressed !== 'string') {
      return failure('operation-failed', 'JSON 压缩失败，请检查输入后重试。')
    }

    return success({ compressed })
  } catch {
    return failure('operation-failed', 'JSON 压缩失败，请检查输入后重试。')
  }
}

/** 解析 JSON 并生成点号路径格式的扁平化结果。 */
export function flattenJson(
  value: string,
  options: JsonFormatOptions,
): ToolResult<JsonFlattenOutput> {
  const parsedResult = parseJson(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  if (!isJsonContainer(parsedResult.value)) {
    return createTransformError(
      'JSON 扁平化只支持对象或数组作为根值。',
      '字符串、数字、布尔值和 null 不能生成路径键对象。',
    )
  }

  if (isEmptyJsonContainer(parsedResult.value)) {
    const emptyResult = serializeTransformedJson(parsedResult.value, options, '扁平化')

    if (!emptyResult.ok) {
      return emptyResult
    }

    return success({ flattened: emptyResult.value })
  }

  try {
    const flattened = Object.create(null) as Record<string, unknown>
    const flattenResult = flattenValue(parsedResult.value, [], flattened)

    if (!flattenResult.ok) {
      return flattenResult
    }

    const serializedResult = serializeTransformedJson(flattened, options, '扁平化')

    if (!serializedResult.ok) {
      return serializedResult
    }

    return success({ flattened: serializedResult.value })
  } catch {
    return failure('operation-failed', 'JSON 扁平化失败，请检查输入后重试。')
  }
}

/** 解析扁平化 JSON 并还原为嵌套对象或数组。 */
export function unflattenJson(
  value: string,
  options: JsonFormatOptions,
): ToolResult<JsonUnflattenOutput> {
  const parsedResult = parseJson(value)

  if (!parsedResult.ok) {
    return parsedResult
  }

  if (Array.isArray(parsedResult.value)) {
    if (parsedResult.value.length === 0) {
      const emptyResult = serializeTransformedJson(parsedResult.value, options, '反扁平化')

      if (!emptyResult.ok) {
        return emptyResult
      }

      return success({ unflattened: emptyResult.value })
    }

    return createTransformError(
      'JSON 反扁平化需要路径键对象作为输入。',
      '根数组只能作为扁平化结果恢复，不能直接作为非空扁平输入。',
    )
  }

  if (!isJsonContainer(parsedResult.value)) {
    return createTransformError(
      'JSON 反扁平化只支持路径键对象作为输入。',
      '字符串、数字、布尔值和 null 不能作为扁平 JSON 输入。',
    )
  }

  try {
    const flatObject = parsedResult.value as Record<string, unknown>
    const entries = Object.entries(flatObject)

    if (!entries.length) {
      const emptyResult = serializeTransformedJson(flatObject, options, '反扁平化')

      if (!emptyResult.ok) {
        return emptyResult
      }

      return success({ unflattened: emptyResult.value })
    }

    const root = createJsonPathNode()

    for (const [path, pathValue] of entries) {
      if (isJsonContainer(pathValue) && !isEmptyJsonContainer(pathValue)) {
        return createTransformError(
          `路径“${path || '（空路径）'}”的值不能是非空对象或数组。`,
          '扁平 JSON 的对象和数组值只能用于保留空容器。',
        )
      }

      const pathResult = parsePath(path)

      if (!pathResult.ok) {
        return pathResult
      }

      const insertResult = insertPathValue(root, pathResult.value, pathValue, path)

      if (!insertResult.ok) {
        return insertResult
      }
    }

    const materializedResult = materializePathNode(root)

    if (!materializedResult.ok) {
      return materializedResult
    }

    const serializedResult = serializeTransformedJson(materializedResult.value, options, '反扁平化')

    if (!serializedResult.ok) {
      return serializedResult
    }

    return success({ unflattened: serializedResult.value })
  } catch {
    return failure('operation-failed', 'JSON 反扁平化失败，请检查输入后重试。')
  }
}
