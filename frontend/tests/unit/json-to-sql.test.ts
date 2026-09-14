import { describe, expect, it } from 'vitest'

import { generateJsonToSql } from '../../core/json-to-sql'

describe('json-to-sql core', () => {
  it('generates stable MySQL multi-row INSERT output', () => {
    const result = generateJsonToSql(
      '[{"id":1,"name":"Ada","active":true},{"name":"Grace","id":2,"active":false}]',
      { tableName: 'users' },
    )

    expect(result).toEqual({
      ok: true,
      value: {
        sql: 'INSERT INTO `users` (`id`, `name`, `active`)\nVALUES\n  (1, \'Ada\', TRUE),\n  (2, \'Grace\', FALSE);',
        rowCount: 2,
        columnNames: ['id', 'name', 'active'],
      },
    })
  })

  it('maps scalar JSON values to MySQL literals', () => {
    const result = generateJsonToSql(
      JSON.stringify([{
        text: '你好 👋',
        quote: "a'b",
        slash: 'a\\b',
        line: 'a\nb',
        integer: -2,
        decimal: 1.25,
        enabled: false,
        missing: null,
      }]),
      { tableName: 'records' },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.sql).toBe([
      'INSERT INTO `records` (`text`, `quote`, `slash`, `line`, `integer`, `decimal`, `enabled`, `missing`)',
      'VALUES',
      "  ('你好 👋', 'a''b', 'a\\\\b', 'a",
      "b', -2, 1.25, FALSE, NULL);",
    ].join('\n'))
  })

  it('quotes MySQL identifiers without allowing SQL structure injection', () => {
    const result = generateJsonToSql('[{"a`b":"value"}]', { tableName: 'user`data' })

    expect(result).toEqual({
      ok: true,
      value: {
        sql: 'INSERT INTO `user``data` (`a``b`)\nVALUES\n  (\'value\');',
        rowCount: 1,
        columnNames: ['a`b'],
      },
    })
  })

  it('keeps duplicate-key and JavaScript number semantics from JSON.parse', () => {
    const result = generateJsonToSql('{"ignored":true}', { tableName: 'users' })

    expect(result.ok).toBe(false)

    const duplicate = generateJsonToSql('[{"value":1,"value":2}]', { tableName: 'users' })
    const largeInteger = generateJsonToSql('[{"value":9007199254740993}]', { tableName: 'users' })

    expect(duplicate).toEqual({
      ok: true,
      value: {
        sql: 'INSERT INTO `users` (`value`)\nVALUES\n  (2);',
        rowCount: 1,
        columnNames: ['value'],
      },
    })
    expect(largeInteger).toEqual({
      ok: true,
      value: {
        sql: 'INSERT INTO `users` (`value`)\nVALUES\n  (9007199254740992);',
        rowCount: 1,
        columnNames: ['value'],
      },
    })
  })

  it('reports empty and invalid JSON with structured errors', () => {
    expect(generateJsonToSql('  \r\n ', { tableName: 'users' })).toEqual({
      ok: false,
      error: { code: 'empty-input', message: '请输入 JSON 内容。' },
    })

    const result = generateJsonToSql('{\n  "name" 1\n}', { tableName: 'users' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-input')
      expect(result.error.message).toContain('第 2 行')
      expect(result.error.details).toContain('字符偏移')
    }
  })

  it.each([
    ['[]', 'JSON 数组不能为空'],
    ['{}', 'JSON 根值必须是非空数组'],
    ['[{}]', '第 1 条记录不能为空对象'],
    ['[1]', '第 1 条记录必须是 JSON 对象'],
    ['[{"id":1},{"id":2,"name":"extra"}]', '字段集合与第 1 条记录不一致'],
    ['[{"id":{"nested":true}}]', '不支持嵌套对象或数组'],
    ['[{"id":[1,2]}]', '不支持嵌套对象或数组'],
  ])('rejects unsupported input shape: %s', (input, message) => {
    const result = generateJsonToSql(input, { tableName: 'users' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain(message)
    }
  })

  it('rejects missing or extra fields without generating partial SQL', () => {
    const missing = generateJsonToSql('[{"id":1,"name":"Ada"},{"id":2}]', { tableName: 'users' })
    const extra = generateJsonToSql('[{"id":1},{"id":2,"name":"Grace"}]', { tableName: 'users' })

    for (const result of [missing, extra]) {
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-input')
      }
    }
  })

  it('rejects invalid table and field identifiers', () => {
    expect(generateJsonToSql('[{"id":1}]', { tableName: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: '请输入表名。' },
    })
    expect(generateJsonToSql('[{"id":1}]', { tableName: `x${'a'.repeat(64)}` }).ok).toBe(false)
    expect(generateJsonToSql('[{"id":1}]', { tableName: `users${'\u0000'}` }).ok).toBe(false)

    const nulKeyJson = '[{"' + '\\u0000' + 'id":1}]'
    expect(generateJsonToSql(nulKeyJson, { tableName: 'users' }).ok).toBe(false)
  })

  it('does not impose an input length cap for supported scalar data', () => {
    const result = generateJsonToSql(
      JSON.stringify([{ text: 'x'.repeat(100_000) }]),
      { tableName: 'records' },
    )

    expect(result.ok).toBe(true)
  })
})
