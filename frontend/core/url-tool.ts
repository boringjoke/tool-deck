import { failure, success, type ToolResult } from './tool-result'

export type UrlEncodingMode = 'component' | 'full'

export interface UrlQueryParameter {
  key: string
  value: string
  hasEquals: boolean
}

export interface ParsedUrl {
  href: string
  baseUrl: string
  origin: string
  protocol: string
  username: string
  host: string
  hostname: string
  port: string
  pathname: string
  queryString: string
  hash: string
  parameters: UrlQueryParameter[]
}

/** 解码 URL 查询参数片段并转换解码异常。 */
function decodeQueryPart(value: string, label: string): ToolResult<string> {
  try {
    return success(decodeURIComponent(value.replace(/\+/gu, ' ')))
  } catch {
    return failure(
      'invalid-input',
      `${label}包含非法百分号编码，请检查“%”后是否跟着两个十六进制字符。`,
    )
  }
}

/** 解析 URL 查询字符串为参数列表。 */
function parseQueryParameters(search: string): ToolResult<UrlQueryParameter[]> {
  const rawQuery = search.startsWith('?') ? search.slice(1) : search

  if (!rawQuery) {
    return success([])
  }

  const parameters: UrlQueryParameter[] = []

  for (const pair of rawQuery.split('&')) {
    if (!pair) {
      continue
    }

    const separatorIndex = pair.indexOf('=')
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1)
    const keyResult = decodeQueryPart(rawKey, '参数名')

    if (!keyResult.ok) {
      return keyResult
    }

    const valueResult = decodeQueryPart(rawValue, '参数值')

    if (!valueResult.ok) {
      return valueResult
    }

    parameters.push({
      key: keyResult.value,
      value: valueResult.value,
      hasEquals: separatorIndex !== -1,
    })
  }

  return success(parameters)
}

/** 解析并校验完整绝对 URL。 */
export function parseAbsoluteUrl(value: string): ToolResult<ParsedUrl> {
  const input = value.trim()

  if (!input) {
    return failure('empty-input', '请输入完整 URL 后再解析。')
  }

  let url: URL

  try {
    url = new URL(input)
  } catch {
    return failure('invalid-input', 'URL 格式无效，请输入包含协议的完整地址，例如 https://example.com/path。')
  }

  const parametersResult = parseQueryParameters(url.search)

  if (!parametersResult.ok) {
    return parametersResult
  }

  url.search = ''

  return success({
    href: input,
    baseUrl: url.toString(),
    origin: url.origin,
    protocol: url.protocol,
    username: url.username,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    queryString: input.includes('?') ? new URL(input).search : '',
    hash: url.hash,
    parameters: parametersResult.value,
  })
}

/** 按 URL 查询参数规则编码文本片段。 */
function encodeQueryPart(value: string): string {
  return encodeURIComponent(value)
}

/** 根据参数列表构建 URL 查询字符串。 */
export function buildQueryString(parameters: readonly UrlQueryParameter[]): string {
  return parameters
    .map((parameter) => {
      const key = encodeQueryPart(parameter.key)
      const value = encodeQueryPart(parameter.value)
      return parameter.hasEquals || parameter.value.length > 0 ? `${key}=${value}` : key
    })
    .join('&')
}

/** 根据已解析 URL 和参数重建完整地址。 */
export function rebuildUrl(
  parsed: Pick<ParsedUrl, 'baseUrl'>,
  parameters: readonly UrlQueryParameter[],
): ToolResult<string> {
  try {
    const url = new URL(parsed.baseUrl)
    const queryString = buildQueryString(parameters)
    url.search = queryString ? `?${queryString}` : ''
    return success(url.toString())
  } catch {
    return failure('operation-failed', '无法根据当前参数重新生成 URL，请重新解析原始地址。')
  }
}

/** 按指定模式编码 URL 文本。 */
export function encodeUrl(value: string, mode: UrlEncodingMode): ToolResult<string> {
  if (!value.length) {
    return failure('empty-input', '请输入需要编码的内容。')
  }

  try {
    return success(mode === 'component' ? encodeURIComponent(value) : encodeURI(value))
  } catch {
    return failure('operation-failed', 'URL 编码失败，请检查输入内容。')
  }
}

/** 按指定模式解码 URL 文本。 */
export function decodeUrl(value: string, mode: UrlEncodingMode): ToolResult<string> {
  if (!value.length) {
    return failure('empty-input', '请输入需要解码的内容。')
  }

  try {
    return success(mode === 'component' ? decodeURIComponent(value) : decodeURI(value))
  } catch {
    return failure(
      'invalid-input',
      'URL 解码失败，请检查是否存在不完整或非法的百分号编码。',
    )
  }
}

/** 转义 SQL 标识符中的特殊字符。 */
function escapeSqlIdentifier(value: string): string {
  return value.replace(/`/gu, '``')
}

/** 转义 SQL 字符串字面量中的特殊字符。 */
function escapeSqlString(value: string): string {
  return value.replace(/'/gu, "''")
}

/** 根据 URL 参数生成 SQL WHERE IN 条件。 */
export function generateWhereIn(parameters: readonly UrlQueryParameter[]): ToolResult<string> {
  if (!parameters.length) {
    return failure('empty-input', '当前 URL 没有查询参数，无法生成 WHERE IN。')
  }

  const grouped = new Map<string, string[]>()

  for (const parameter of parameters) {
    const values = grouped.get(parameter.key) ?? []
    values.push(parameter.value)
    grouped.set(parameter.key, values)
  }

  const conditions = Array.from(grouped.entries()).map(([key, values]) => {
    const sqlValues = values.map((value) => `'${escapeSqlString(value)}'`).join(', ')
    return `\`${escapeSqlIdentifier(key)}\` IN (${sqlValues})`
  })

  return success(conditions.join(' AND '))
}
