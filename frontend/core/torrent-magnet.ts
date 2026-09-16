
import { failure, success, type ToolResult } from './tool-result'

/** Torrent 首版允许读取的最大文件字节数。 */
export const TORRENT_MAX_FILE_BYTES = 10 * 1024 * 1024

/** Torrent 首版允许的最大 Bencode 嵌套深度。 */
export const TORRENT_MAX_DEPTH = 64

/** Torrent 首版允许解析的最大节点数量。 */
export const TORRENT_MAX_NODES = 100_000

/** Torrent 首版允许的单个字节字符串最大长度。 */
export const TORRENT_MAX_STRING_BYTES = 8 * 1024 * 1024

/** Torrent 多文件摘要最多保留的文件条目数。 */
export const TORRENT_MAX_DISPLAY_FILES = 2_000

/** v1 info-hash 的小写十六进制长度。 */
export const TORRENT_INFO_HASH_HEX_LENGTH = 40

export type TorrentFormat = 'v1'
export type TorrentMode = 'single' | 'multi'

export interface TorrentFileSummary {
  path: string
  length: number
}

export interface TorrentTracker {
  display: string
  uri?: string
}

export interface TorrentMetadata {
  format: TorrentFormat
  name: string
  magnetName?: string
  mode: TorrentMode
  totalSize: number
  fileCount: number
  pieceLength: number
  pieceCount: number
  files: readonly TorrentFileSummary[]
  filesTruncated: boolean
  trackers: readonly TorrentTracker[]
  omittedTrackerCount: number
  hasEncodingWarning: boolean
  infoBytes: Uint8Array
}

type BencodeIntegerValue = number | null

interface BencodeBytesNode {
  type: 'bytes'
  bytes: Uint8Array
  start: number
  end: number
}

interface BencodeIntegerNode {
  type: 'integer'
  value: BencodeIntegerValue
  start: number
  end: number
}

interface BencodeListNode {
  type: 'list'
  values: readonly BencodeNode[]
  start: number
  end: number
}

interface BencodeDictionaryEntry {
  key: Uint8Array
  value: BencodeNode
}

interface BencodeDictionaryNode {
  type: 'dictionary'
  entries: readonly BencodeDictionaryEntry[]
  start: number
  end: number
}

type BencodeNode =
  | BencodeBytesNode
  | BencodeIntegerNode
  | BencodeListNode
  | BencodeDictionaryNode

type TorrentParserErrorCode = 'invalid-input' | 'out-of-range'

class TorrentParserError extends Error {
  readonly code: TorrentParserErrorCode

  constructor(code: TorrentParserErrorCode, message: string) {
    super(message)
    this.name = 'TorrentParserError'
    this.code = code
  }
}

interface ParserContext {
  bytes: Uint8Array
  index: number
  nodeCount: number
}

interface DecodedTorrentText {
  display: string
  uri?: string
  valid: boolean
}

interface TorrentPathValue {
  display: string
  hasEncodingWarning: boolean
}

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

/** 将 ASCII 字段名转换为字节序列。 */
function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index)
  }

  return bytes
}

/** 比较两个 Bencode 字节字符串，供字典键严格排序校验使用。 */
function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    if (left[index]! !== right[index]!) {
      return left[index]! - right[index]!
    }
  }

  return left.length - right.length
}

/** 判断字节序列是否与 ASCII 字段名完全相同。 */
function isAsciiBytes(bytes: Uint8Array, value: string): boolean {
  return compareBytes(bytes, asciiBytes(value)) === 0
}

/** 为一个 Bencode 节点执行深度和总节点数限制。 */
function countNode(context: ParserContext, depth: number): void {
  if (depth > TORRENT_MAX_DEPTH) {
    throw new TorrentParserError(
      'out-of-range',
      'Torrent 嵌套结构超过 64 层限制，无法安全分析。',
    )
  }

  context.nodeCount += 1
  if (context.nodeCount > TORRENT_MAX_NODES) {
    throw new TorrentParserError(
      'out-of-range',
      'Torrent 解析节点超过 100,000 个限制，无法安全分析。',
    )
  }
}

/** 解析 Bencode 字节字符串长度，并拒绝前导零或超出上限的声明。 */
function readByteStringLength(context: ParserContext): number {
  const { bytes } = context
  const start = context.index

  if (start >= bytes.length || bytes[start]! < 0x30 || bytes[start]! > 0x39) {
    throw new TorrentParserError('invalid-input', 'Bencode 字节字符串长度无效。')
  }

  if (bytes[start]! === 0x30) {
    context.index += 1
    if (context.index < bytes.length && bytes[context.index]! >= 0x30 && bytes[context.index]! <= 0x39) {
      throw new TorrentParserError('invalid-input', 'Bencode 字节字符串长度不能包含前导零。')
    }
  } else {
    let length = 0

    while (context.index < bytes.length) {
      const byte = bytes[context.index]!
      if (byte < 0x30 || byte > 0x39) {
        break
      }

      const digit = byte - 0x30
      if (length > Math.floor((TORRENT_MAX_STRING_BYTES - digit) / 10)) {
        throw new TorrentParserError(
          'out-of-range',
          'Torrent 字节字符串超过 8 MiB 限制。',
        )
      }

      length = length * 10 + digit
      context.index += 1
    }

    if (context.index >= bytes.length || bytes[context.index] !== 0x3a) {
      throw new TorrentParserError('invalid-input', 'Bencode 字节字符串缺少长度分隔符。')
    }

    context.index += 1
    return length
  }

  if (context.index >= bytes.length || bytes[context.index] !== 0x3a) {
    throw new TorrentParserError('invalid-input', 'Bencode 字节字符串缺少长度分隔符。')
  }

  context.index += 1
  return 0
}

/** 解析 Bencode 字节字符串。 */
function parseByteString(context: ParserContext, depth: number): BencodeBytesNode {
  countNode(context, depth)

  const start = context.index
  const length = readByteStringLength(context)
  const dataStart = context.index
  const dataEnd = dataStart + length

  if (dataEnd > context.bytes.length) {
    throw new TorrentParserError('invalid-input', 'Bencode 字节字符串超出文件范围。')
  }

  context.index = dataEnd
  return {
    type: 'bytes',
    bytes: context.bytes.subarray(dataStart, dataEnd),
    start,
    end: dataEnd,
  }
}

/** 解析 Bencode 整数并保留安全范围内的数值。 */
function parseInteger(context: ParserContext, depth: number): BencodeIntegerNode {
  countNode(context, depth)

  const start = context.index
  context.index += 1

  if (context.index >= context.bytes.length) {
    throw new TorrentParserError('invalid-input', 'Bencode 整数缺少结束标记。')
  }

  let negative = false
  if (context.bytes[context.index] === 0x2d) {
    negative = true
    context.index += 1
    if (context.index >= context.bytes.length) {
      throw new TorrentParserError('invalid-input', 'Bencode 整数符号后缺少数字。')
    }
  }

  const firstDigit = context.bytes[context.index]!
  if (firstDigit < 0x30 || firstDigit > 0x39) {
    throw new TorrentParserError('invalid-input', 'Bencode 整数只能包含十进制数字。')
  }

  if (firstDigit === 0x30) {
    context.index += 1
    if (negative) {
      throw new TorrentParserError('invalid-input', 'Bencode 整数不能包含前导零或负零。')
    }
    if (context.index < context.bytes.length && context.bytes[context.index]! >= 0x30 && context.bytes[context.index]! <= 0x39) {
      throw new TorrentParserError('invalid-input', 'Bencode 整数不能包含前导零或负零。')
    }
  } else {
    let safeValue = 0
    let isSafe = true

    while (context.index < context.bytes.length) {
      const byte = context.bytes[context.index]!
      if (byte === 0x65) {
        break
      }

      if (byte < 0x30 || byte > 0x39) {
        throw new TorrentParserError('invalid-input', 'Bencode 整数只能包含十进制数字。')
      }

      if (isSafe) {
        const digit = byte - 0x30
        if (safeValue > Math.floor((MAX_SAFE_INTEGER - digit) / 10)) {
          isSafe = false
        } else {
          safeValue = safeValue * 10 + digit
        }
      }

      context.index += 1
    }

    if (context.index >= context.bytes.length || context.bytes[context.index] !== 0x65) {
      throw new TorrentParserError('invalid-input', 'Bencode 整数缺少结束标记。')
    }

    context.index += 1
    const value = isSafe
      ? negative ? -safeValue : safeValue
      : null

    return {
      type: 'integer',
      value,
      start,
      end: context.index,
    }
  }

  if (context.index >= context.bytes.length || context.bytes[context.index] !== 0x65) {
    throw new TorrentParserError('invalid-input', 'Bencode 整数缺少结束标记。')
  }

  context.index += 1
  return {
    type: 'integer',
    value: negative ? 0 : 0,
    start,
    end: context.index,
  }
}

/** 解析 Bencode 列表。 */
function parseList(context: ParserContext, depth: number): BencodeListNode {
  countNode(context, depth)

  const start = context.index
  context.index += 1
  const values: BencodeNode[] = []

  while (context.index < context.bytes.length && context.bytes[context.index] !== 0x65) {
    values.push(parseNode(context, depth + 1))
  }

  if (context.index >= context.bytes.length) {
    throw new TorrentParserError('invalid-input', 'Bencode 列表缺少结束标记。')
  }

  context.index += 1
  return {
    type: 'list',
    values,
    start,
    end: context.index,
  }
}

/** 解析 Bencode 字典并严格校验键排序和重复键。 */
function parseDictionary(context: ParserContext, depth: number): BencodeDictionaryNode {
  countNode(context, depth)

  const start = context.index
  context.index += 1
  const entries: BencodeDictionaryEntry[] = []
  let previousKey: Uint8Array | null = null

  while (context.index < context.bytes.length && context.bytes[context.index] !== 0x65) {
    const key = parseNode(context, depth + 1)
    if (key.type !== 'bytes') {
      throw new TorrentParserError('invalid-input', 'Bencode 字典键必须是字节字符串。')
    }

    if (previousKey && compareBytes(previousKey, key.bytes) >= 0) {
      throw new TorrentParserError(
        'invalid-input',
        'Bencode 字典键必须严格升序且不能重复。',
      )
    }

    previousKey = key.bytes
    const value = parseNode(context, depth + 1)
    entries.push({ key: key.bytes, value })
  }

  if (context.index >= context.bytes.length) {
    throw new TorrentParserError('invalid-input', 'Bencode 字典缺少结束标记。')
  }

  context.index += 1
  return {
    type: 'dictionary',
    entries,
    start,
    end: context.index,
  }
}

/** 解析一个 Bencode 节点。 */
function parseNode(context: ParserContext, depth: number): BencodeNode {
  if (context.index >= context.bytes.length) {
    throw new TorrentParserError('invalid-input', 'Bencode 节点超出文件范围。')
  }

  const marker = context.bytes[context.index]!
  if (marker === 0x69) {
    return parseInteger(context, depth)
  }

  if (marker === 0x6c) {
    return parseList(context, depth)
  }

  if (marker === 0x64) {
    return parseDictionary(context, depth)
  }

  if (marker >= 0x30 && marker <= 0x39) {
    return parseByteString(context, depth)
  }

  throw new TorrentParserError('invalid-input', 'Bencode 节点类型或编码无效。')
}

/** 严格解析完整 Bencode 根字典。 */
function parseRoot(bytes: Uint8Array): ToolResult<BencodeDictionaryNode> {
  if (bytes.byteLength > TORRENT_MAX_FILE_BYTES) {
    return failure('out-of-range', 'Torrent 文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  if (!bytes.byteLength) {
    return failure('invalid-input', 'Torrent 文件为空或不是有效的 Bencode 文件。')
  }

  const context: ParserContext = {
    bytes,
    index: 0,
    nodeCount: 0,
  }

  try {
    const root = parseNode(context, 0)
    if (root.type !== 'dictionary') {
      return failure('invalid-input', 'Torrent 根节点必须是 Bencode 字典。')
    }

    if (context.index !== bytes.length) {
      return failure('invalid-input', 'Torrent 文件包含未消费的尾随字节。')
    }

    return success(root)
  } catch (error) {
    if (error instanceof TorrentParserError) {
      return failure(error.code, error.message)
    }

    return failure('invalid-input', 'Torrent Bencode 解析失败，请更换文件后重试。')
  }
}

/** 在字典中查找指定 ASCII 键。 */
function findDictionaryValue(
  dictionary: BencodeDictionaryNode,
  key: string,
): BencodeNode | undefined {
  return dictionary.entries.find((entry) => isAsciiBytes(entry.key, key))?.value
}

/** 读取可选的字节字符串字段，并检查字段类型。 */
function readOptionalBytes(
  dictionary: BencodeDictionaryNode,
  key: string,
): ToolResult<BencodeBytesNode | undefined> {
  const value = findDictionaryValue(dictionary, key)

  if (value === undefined) {
    return success(undefined)
  }

  return value.type === 'bytes'
    ? success(value)
    : failure('invalid-input', 'Torrent 字段 ' + key + ' 必须是字节字符串。')
}

/** 读取必需的字节字符串字段。 */
function readRequiredBytes(
  dictionary: BencodeDictionaryNode,
  key: string,
): ToolResult<BencodeBytesNode> {
  const value = findDictionaryValue(dictionary, key)

  if (!value) {
    return failure('invalid-input', 'Torrent 缺少必需字段 ' + key + '。')
  }

  return value.type === 'bytes'
    ? success(value)
    : failure('invalid-input', 'Torrent 字段 ' + key + ' 必须是字节字符串。')
}

/** 读取必需的非负安全整数。 */
function readRequiredNonNegativeInteger(
  dictionary: BencodeDictionaryNode,
  key: string,
  allowZero = true,
): ToolResult<number> {
  const value = findDictionaryValue(dictionary, key)

  if (!value || value.type !== 'integer') {
    return failure('invalid-input', 'Torrent 字段 ' + key + ' 必须是整数。')
  }

  if (value.value === null || value.value < 0 || (!allowZero && value.value === 0)) {
    return failure(
      value.value === null || value.value < 0 ? 'out-of-range' : 'invalid-input',
      'Torrent 字段 ' + key + ' 必须是非负安全整数。',
    )
  }

  return success(value.value)
}

/** 严格读取可选的字节字符串列表。 */
function readOptionalBytesList(
  dictionary: BencodeDictionaryNode,
  key: string,
): ToolResult<readonly BencodeBytesNode[] | undefined> {
  const value = findDictionaryValue(dictionary, key)

  if (value === undefined) {
    return success(undefined)
  }

  if (value.type !== 'list') {
    return failure('invalid-input', 'Torrent 字段 ' + key + ' 必须是字节字符串列表。')
  }

  const items: BencodeBytesNode[] = []
  for (const item of value.values) {
    if (item.type !== 'bytes') {
      return failure('invalid-input', 'Torrent 字段 ' + key + ' 必须是字节字符串列表。')
    }
    items.push(item)
  }

  return success(items)
}

/** 使用严格 UTF-8 解码文本，失败时返回替换字符展示值但不提供 URI 值。 */
function decodeTorrentText(bytes: Uint8Array): DecodedTorrentText {
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return {
      display: value,
      uri: value || undefined,
      valid: true,
    }
  } catch {
    try {
      return {
        display: new TextDecoder('utf-8').decode(bytes),
        valid: false,
      }
    } catch {
      return {
        display: '�',
        valid: false,
      }
    }
  }
}

/** 按 UTF-8 扩展字段优先顺序读取文本字段。 */
function readPreferredText(
  dictionary: BencodeDictionaryNode,
  utf8Key: string,
  standardKey: string,
): ToolResult<DecodedTorrentText> {
  const utf8 = readOptionalBytes(dictionary, utf8Key)
  if (!utf8.ok) {
    return utf8
  }

  const standard = readOptionalBytes(dictionary, standardKey)
  if (!standard.ok) {
    return standard
  }

  const selected = utf8.value ?? standard.value
  if (!selected) {
    return failure('invalid-input', 'Torrent 缺少名称或路径字段。')
  }

  return success(decodeTorrentText(selected.bytes))
}

/** 读取一个文件字典中的路径，并生成页面展示文本。 */
function readFilePath(file: BencodeDictionaryNode): ToolResult<TorrentPathValue> {
  const utf8 = readOptionalBytesList(file, 'path.utf-8')
  if (!utf8.ok) {
    return utf8
  }

  const standard = readOptionalBytesList(file, 'path')
  if (!standard.ok) {
    return standard
  }

  const selected = utf8.value ?? standard.value
  if (!selected || selected.length === 0) {
    return failure('invalid-input', 'Torrent 多文件条目缺少有效 path 字段。')
  }

  let hasEncodingWarning = false
  const segments = selected.map((segment) => {
    const decoded = decodeTorrentText(segment.bytes)
    if (!decoded.valid) {
      hasEncodingWarning = true
    }
    return decoded.display
  })

  return success({
    display: segments.join('/'),
    hasEncodingWarning,
  })
}

/** 将两个安全整数相加，防止总大小溢出。 */
function addSafeIntegers(left: number, right: number): ToolResult<number> {
  if (right > MAX_SAFE_INTEGER - left) {
    return failure('out-of-range', 'Torrent 文件总大小超过安全整数范围。')
  }

  return success(left + right)
}

/** 读取 v1 文件摘要并计算总大小。 */
function readFileSummary(
  info: BencodeDictionaryNode,
): ToolResult<{
  mode: TorrentMode
  totalSize: number
  fileCount: number
  files: TorrentFileSummary[]
  filesTruncated: boolean
  hasEncodingWarning: boolean
}> {
  const length = findDictionaryValue(info, 'length')
  const files = findDictionaryValue(info, 'files')

  if (length !== undefined && files !== undefined) {
    return failure('invalid-input', 'Torrent v1 不能同时包含单文件 length 和多文件 files。')
  }

  if (length !== undefined) {
    const singleLength = readRequiredNonNegativeInteger(info, 'length')
    if (!singleLength.ok) {
      return singleLength
    }

    const name = readPreferredText(info, 'name.utf-8', 'name')
    if (!name.ok) {
      return name
    }

    return success({
      mode: 'single',
      totalSize: singleLength.value,
      fileCount: 1,
      files: [{ path: name.value.display, length: singleLength.value }],
      filesTruncated: false,
      hasEncodingWarning: !name.value.valid,
    })
  }

  if (!files) {
    return failure('invalid-input', 'Torrent v1 必须包含 length 或 files 字段。')
  }

  if (files.type !== 'list') {
    return failure('invalid-input', 'Torrent 字段 files 必须是字典列表。')
  }

  const summaries: TorrentFileSummary[] = []
  let totalSize = 0
  let hasEncodingWarning = false

  for (const item of files.values) {
    if (item.type !== 'dictionary') {
      return failure('invalid-input', 'Torrent 多文件 files 列表中的条目必须是字典。')
    }

    const fileLength = readRequiredNonNegativeInteger(item, 'length')
    if (!fileLength.ok) {
      return fileLength
    }

    const path = readFilePath(item)
    if (!path.ok) {
      return path
    }

    const nextTotal = addSafeIntegers(totalSize, fileLength.value)
    if (!nextTotal.ok) {
      return nextTotal
    }

    totalSize = nextTotal.value
    hasEncodingWarning = hasEncodingWarning || path.value.hasEncodingWarning

    if (summaries.length < TORRENT_MAX_DISPLAY_FILES) {
      summaries.push({
        path: path.value.display,
        length: fileLength.value,
      })
    }
  }

  return success({
    mode: 'multi',
    totalSize,
    fileCount: files.values.length,
    files: summaries,
    filesTruncated: files.values.length > TORRENT_MAX_DISPLAY_FILES,
    hasEncodingWarning,
  })
}

/** 从 announce 和 announce-list 读取并去重 Tracker。 */
function readTrackers(root: BencodeDictionaryNode): ToolResult<{
  trackers: TorrentTracker[]
  omittedTrackerCount: number
  hasEncodingWarning: boolean
}> {
  const announce = readOptionalBytes(root, 'announce')
  if (!announce.ok) {
    return announce
  }

  const announceList = findDictionaryValue(root, 'announce-list')
  if (
    announceList !== undefined
    && announceList.type !== 'list'
  ) {
    return failure('invalid-input', 'Torrent 字段 announce-list 必须是 Tracker 列表。')
  }

  const trackers: TorrentTracker[] = []
  const seen = new Set<string>()
  let omittedTrackerCount = 0
  let hasEncodingWarning = false

  const addTracker = (value: BencodeBytesNode) => {
    const key = Array.from(value.bytes).join(',')
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    const decoded = decodeTorrentText(value.bytes)
    if (!decoded.valid) {
      omittedTrackerCount += 1
      hasEncodingWarning = true
    }

    trackers.push({
      display: decoded.display,
      ...(decoded.uri ? { uri: decoded.uri } : {}),
    })
  }

  if (announce.value) {
    addTracker(announce.value)
  }

  if (announceList?.type === 'list') {
    for (const tier of announceList.values) {
      if (tier.type !== 'list') {
        return failure('invalid-input', 'Torrent announce-list 必须由 Tracker 列表组成。')
      }

      for (const tracker of tier.values) {
        if (tracker.type !== 'bytes') {
          return failure('invalid-input', 'Torrent announce-list 中的 Tracker 必须是字节字符串。')
        }
        addTracker(tracker)
      }
    }
  }

  return success({
    trackers,
    omittedTrackerCount,
    hasEncodingWarning,
  })
}

/** 判断 metainfo 是否包含 v2 或混合 Torrent 标记。 */
function hasTorrentV2Marker(info: BencodeDictionaryNode): boolean {
  return Boolean(
    findDictionaryValue(info, 'meta version')
    || findDictionaryValue(info, 'file tree')
    || findDictionaryValue(info, 'piece layers')
    || findDictionaryValue(info, 'pieces root'),
  )
}

/** 解析并提取首版支持的 v1 Torrent 元数据。 */
export function parseTorrent(bytes: Uint8Array): ToolResult<TorrentMetadata> {
  if (!(bytes instanceof Uint8Array)) {
    return failure('invalid-input', 'Torrent 输入必须是字节数据。')
  }

  const root = parseRoot(bytes)
  if (!root.ok) {
    return root
  }

  const info = findDictionaryValue(root.value, 'info')
  if (!info || info.type !== 'dictionary') {
    return failure('invalid-input', 'Torrent 根字典缺少有效的 info 字典。')
  }

  if (hasTorrentV2Marker(info)) {
    return failure('unsupported-input', '暂不支持 v2 或混合 Torrent，不会生成 Magnet。')
  }

  const name = readPreferredText(info, 'name.utf-8', 'name')
  if (!name.ok) {
    return name
  }

  const pieceLength = readRequiredNonNegativeInteger(info, 'piece length', false)
  if (!pieceLength.ok) {
    return pieceLength
  }

  const pieces = readRequiredBytes(info, 'pieces')
  if (!pieces.ok) {
    return pieces
  }

  if (pieces.value.bytes.length % 20 !== 0) {
    return failure('invalid-input', 'Torrent v1 的 pieces 长度必须是 20 的整数倍。')
  }

  const fileSummary = readFileSummary(info)
  if (!fileSummary.ok) {
    return fileSummary
  }

  const trackers = readTrackers(root.value)
  if (!trackers.ok) {
    return trackers
  }

  return success({
    format: 'v1',
    name: name.value.display,
    ...(name.value.uri ? { magnetName: name.value.uri } : {}),
    mode: fileSummary.value.mode,
    totalSize: fileSummary.value.totalSize,
    fileCount: fileSummary.value.fileCount,
    pieceLength: pieceLength.value,
    pieceCount: pieces.value.bytes.length / 20,
    files: fileSummary.value.files,
    filesTruncated: fileSummary.value.filesTruncated,
    trackers: trackers.value.trackers,
    omittedTrackerCount: trackers.value.omittedTrackerCount,
    hasEncodingWarning: name.value.valid === false
      || fileSummary.value.hasEncodingWarning
      || trackers.value.hasEncodingWarning,
    infoBytes: bytes.slice(info.start, info.end),
  })
}

/** 将一个已确认的 v1 元数据和 40 位 info-hash 组装为确定性 Magnet。 */
export function createTorrentMagnet(
  metadata: TorrentMetadata,
  infoHashHex: string,
): ToolResult<string> {
  if (
    !metadata
    || metadata.format !== 'v1'
    || !/^[0-9a-f]{40}$/iu.test(infoHashHex)
  ) {
    return failure('invalid-input', 'Torrent v1 info-hash 无效，无法生成 Magnet。')
  }

  const parameters = ['xt=urn:btih:' + infoHashHex.toLowerCase()]
  if (metadata.magnetName) {
    parameters.push('dn=' + encodeURIComponent(metadata.magnetName))
  }

  for (const tracker of metadata.trackers) {
    if (tracker.uri) {
      parameters.push('tr=' + encodeURIComponent(tracker.uri))
    }
  }

  return success('magnet:?' + parameters.join('&'))
}
