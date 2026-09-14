import { getJsonErrorLocation } from './json-formatter'
import { failure, success, type ToolResult } from './tool-result'

/** JSON 转 SQL 核心函数的输入选项。 */
export interface JsonToSqlOptions {
  tableName: string
}

/** JSON 转 SQL 成功结果的元数据和 SQL 文本。 */
export interface JsonToSqlOutput {
  sql: string
  rowCount: number
  columnNames: string[]
}

type JsonScalar = string | number | boolean | null
type JsonRecord = Record<string, unknown>

const MYSQL_IDENTIFIER_MAX_LENGTH = 64

/** 将 JSON 解析异常转换为带行列定位的结构化错误。 */
function createJsonSyntaxError(error: unknown, rawInput: string): ToolResult<never> {
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

/** 解析标准 JSON 文本并保留空输入和语法错误语义。 */
function parseJsonInput(input: string): ToolResult<unknown> {
  if (typeof input !== 'string') {
    return failure('invalid-input', '请输入文本格式的 JSON。')
  }

  if (!input.trim()) {
    return failure('empty-input', '请输入 JSON 内容。')
  }

  try {
    return success(JSON.parse(input.trim()) as unknown)
  } catch (error: unknown) {
    return createJsonSyntaxError(error, input)
  }
}

/** 判断解析后的值是否为 JSON 记录对象。 */
function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 计算标识符的 Unicode 字符数量。 */
function countUnicodeCharacters(value: string): number {
  return Array.from(value).length
}

/** 校验并转义单个 MySQL 标识符。 */
function quoteMySqlIdentifier(value: string, label: string): ToolResult<string> {
  if (!value) {
    return failure('invalid-input', `${label}不能为空。`)
  }

  if (value.includes('\u0000')) {
    return failure('invalid-input', `${label}包含不支持的 NUL 字符。`)
  }

  if (countUnicodeCharacters(value) > MYSQL_IDENTIFIER_MAX_LENGTH) {
    return failure(
      'invalid-input',
      `${label}不能超过 ${MYSQL_IDENTIFIER_MAX_LENGTH} 个 Unicode 字符。`,
    )
  }

  return success(`\`${value.replace(/`/gu, '``')}\``)
}

/** 校验表名并规范化用户输入的首尾空白。 */
function quoteTableName(value: string): ToolResult<string> {
  if (typeof value !== 'string') {
    return failure('invalid-input', '请输入表名。')
  }

  const normalized = value.trim()

  if (!normalized) {
    return failure('invalid-input', '请输入表名。')
  }

  return quoteMySqlIdentifier(normalized, '表名')
}

/** 校验字段名并保留 JSON 对象键的原始文本。 */
function quoteColumnName(value: string): ToolResult<string> {
  return quoteMySqlIdentifier(value, `字段名“${value}”`)
}

/** 校验记录对象并返回稳定的字段顺序。 */
function getRecordColumns(value: unknown, rowNumber: number): ToolResult<string[]> {
  if (!isJsonRecord(value)) {
    return failure(
      'invalid-input',
      `第 ${rowNumber} 条记录必须是 JSON 对象。`,
      '首版只接受由对象组成的 JSON 数组，不接受数组、字符串、数字、布尔值或 null。',
    )
  }

  const columnNames = Object.keys(value)

  if (!columnNames.length) {
    return failure('invalid-input', `第 ${rowNumber} 条记录不能为空对象。`)
  }

  return success(columnNames)
}

/** 比较当前记录与第一条记录的字段集合。 */
function compareColumnSets(
  expectedColumns: readonly string[],
  actualColumns: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const expectedSet = new Set(expectedColumns)
  const actualSet = new Set(actualColumns)

  return {
    missing: expectedColumns.filter((column) => !actualSet.has(column)),
    unexpected: actualColumns.filter((column) => !expectedSet.has(column)),
  }
}

/** 校验单个 JSON 字段值是否属于首版支持的标量类型。 */
function validateJsonScalar(value: unknown, rowNumber: number, columnName: string): ToolResult<null> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return success(null)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return success(null)
  }

  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return failure(
      'invalid-input',
      `第 ${rowNumber} 条记录的字段“${columnName}”不支持嵌套对象或数组。`,
      '首版只接受字符串、数字、布尔值和 null。',
    )
  }

  return failure(
    'invalid-input',
    `第 ${rowNumber} 条记录的字段“${columnName}”包含不支持的值类型。`,
  )
}

/** 校验记录中的字段值并避免通过原型链读取数据。 */
function validateRecordValues(
  record: JsonRecord,
  columnNames: readonly string[],
  rowNumber: number,
): ToolResult<null> {
  for (const columnName of columnNames) {
    if (!Object.prototype.hasOwnProperty.call(record, columnName)) {
      return failure('invalid-input', `第 ${rowNumber} 条记录缺少字段“${columnName}”。`)
    }

    const result = validateJsonScalar(record[columnName], rowNumber, columnName)

    if (!result.ok) {
      return result
    }
  }

  return success(null)
}

/** 转义 MySQL 字符串字面量中的反斜线和单引号。 */
function escapeMySqlString(value: string): string {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "''")}'`
}

/** 将已校验的 JSON 标量转换为 MySQL 字面量。 */
function serializeMySqlValue(value: JsonScalar): ToolResult<string> {
  if (value === null) {
    return success('NULL')
  }

  if (typeof value === 'string') {
    return success(escapeMySqlString(value))
  }

  if (typeof value === 'boolean') {
    return success(value ? 'TRUE' : 'FALSE')
  }

  if (!Number.isFinite(value)) {
    return failure('invalid-input', 'JSON 数字超出浏览器可处理的有限数值范围。')
  }

  return success(String(value))
}

/** 生成固定格式的 MySQL 多行 INSERT 语句。 */
function buildInsertStatement(
  quotedTableName: string,
  quotedColumnNames: readonly string[],
  columnNames: readonly string[],
  records: readonly JsonRecord[],
): ToolResult<string> {
  const rows: string[] = []

  for (const record of records) {
    const values: string[] = []

    for (const columnName of columnNames) {
      const valueResult = serializeMySqlValue(record[columnName] as JsonScalar)

      if (!valueResult.ok) {
        return valueResult
      }

      values.push(valueResult.value)
    }

    rows.push(`  (${values.join(', ')})`)
  }

  return success([
    `INSERT INTO ${quotedTableName} (${quotedColumnNames.join(', ')})`,
    'VALUES',
    `${rows.join(',\n')};`,
  ].join('\n'))
}

/** 将非空扁平 JSON 对象数组转换为 MySQL 多行 INSERT 语句。 */
export function generateJsonToSql(
  input: string,
  options: JsonToSqlOptions,
): ToolResult<JsonToSqlOutput> {
  const parsedResult = parseJsonInput(input)

  if (!parsedResult.ok) {
    return parsedResult
  }

  if (!Array.isArray(parsedResult.value)) {
    return failure(
      'invalid-input',
      'JSON 根值必须是非空数组。',
      '首版只接受由扁平对象组成的 JSON 数组，不自动包装单个对象。',
    )
  }

  if (!parsedResult.value.length) {
    return failure('invalid-input', 'JSON 数组不能为空。')
  }

  const tableResult = quoteTableName(options?.tableName)

  if (!tableResult.ok) {
    return tableResult
  }

  const firstRecord = parsedResult.value[0]
  const firstColumnsResult = getRecordColumns(firstRecord, 1)

  if (!firstColumnsResult.ok) {
    return firstColumnsResult
  }

  const columnNames = firstColumnsResult.value
  const quotedColumnNames: string[] = []

  for (const columnName of columnNames) {
    const quotedColumnResult = quoteColumnName(columnName)

    if (!quotedColumnResult.ok) {
      return quotedColumnResult
    }

    quotedColumnNames.push(quotedColumnResult.value)
  }

  const records: JsonRecord[] = []

  for (let index = 0; index < parsedResult.value.length; index += 1) {
    const rowNumber = index + 1
    const record = parsedResult.value[index]
    const recordColumnsResult = getRecordColumns(record, rowNumber)

    if (!recordColumnsResult.ok) {
      return recordColumnsResult
    }

    const columnDifference = compareColumnSets(columnNames, recordColumnsResult.value)

    if (columnDifference.missing.length || columnDifference.unexpected.length) {
      const details = [
        columnDifference.missing.length ? `缺少字段：${columnDifference.missing.join('、')}` : '',
        columnDifference.unexpected.length ? `多出字段：${columnDifference.unexpected.join('、')}` : '',
      ].filter(Boolean).join('；')

      return failure(
        'invalid-input',
        `第 ${rowNumber} 条记录的字段集合与第 1 条记录不一致。`,
        details,
      )
    }

    if (!isJsonRecord(record)) {
      return failure('invalid-input', `第 ${rowNumber} 条记录必须是 JSON 对象。`)
    }

    const valuesResult = validateRecordValues(record, columnNames, rowNumber)

    if (!valuesResult.ok) {
      return valuesResult
    }

    records.push(record)
  }

  const sqlResult = buildInsertStatement(
    tableResult.value,
    quotedColumnNames,
    columnNames,
    records,
  )

  if (!sqlResult.ok) {
    return sqlResult
  }

  return success({
    sql: sqlResult.value,
    rowCount: records.length,
    columnNames: [...columnNames],
  })
}
