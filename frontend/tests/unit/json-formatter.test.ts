import { describe, expect, it } from 'vitest'

import { formatJson } from '../../core/json-formatter'

describe('json formatter core', () => {
  it.each([
    [2, '{\n  "name": "Tool Deck",\n  "items": [\n    1,\n    {\n      "enabled": true\n    }\n  ]\n}'],
    [4, '{\n    "name": "Tool Deck",\n    "items": [\n        1,\n        {\n            "enabled": true\n        }\n    ]\n}'],
    ['tab', '{\n\t"name": "Tool Deck",\n\t"items": [\n\t\t1,\n\t\t{\n\t\t\t"enabled": true\n\t\t}\n\t]\n}'],
  ] as const)('formats nested JSON with %s indentation', (indent, expected) => {
    const result = formatJson('{"name":"Tool Deck","items":[1,{"enabled":true}]}', { indent })

    expect(result).toEqual({
      ok: true,
      value: { formatted: expected },
    })
  })

  it('accepts top-level JSON values and normalizes surrounding whitespace', () => {
    const values = [
      ['[1,true,null]', '[\n  1,\n  true,\n  null\n]'],
      ['"中文 👋"', '"中文 👋"'],
      ['42', '42'],
      ['false', 'false'],
      ['null', 'null'],
    ] as const

    for (const [input, expected] of values) {
      const result = formatJson(`\r\n  ${input}  \r\n`, { indent: 2 })

      expect(result).toEqual({
        ok: true,
        value: { formatted: expected },
      })
    }
  })

  it('keeps output stable when formatting already formatted JSON', () => {
    const input = '{\n  "message": "你好",\n  "nested": {\n    "value": 1\n  }\n}'
    const first = formatJson(input, { indent: 2 })

    expect(first.ok).toBe(true)
    if (!first.ok) return

    expect(formatJson(first.value.formatted, { indent: 2 })).toEqual(first)
  })

  it('returns an empty-input error for empty or whitespace-only input', () => {
    expect(formatJson('', { indent: 2 })).toEqual({
      ok: false,
      error: { code: 'empty-input', message: '请输入 JSON 内容。' },
    })
    expect(formatJson(' \r\n\t ', { indent: 4 }).ok).toBe(false)
  })

  it('reports a useful line, column, and character offset for syntax errors', () => {
    const result = formatJson('{\r\n  "name" 1\r\n}', { indent: 2 })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error.code).toBe('invalid-input')
    expect(result.error.message).toContain('第 2 行、第 10 列附近')
    expect(result.error.details).toContain('字符偏移 13')
  })

  it('uses an explicit fallback when the parser provides no location', () => {
    const result = formatJson('{"name":', { indent: 2 })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'JSON 语法有误，无法进一步定位。',
        details: '请检查逗号、冒号、双引号、括号以及是否误用了注释、单引号或尾逗号。',
      },
    })
  })

  it('rejects JavaScript-only syntax instead of executing it', () => {
    for (const input of [
      "{'name': 'Tool Deck'}",
      '{"name": "Tool Deck",}',
      '{/* comment */"name":"Tool Deck"}',
      'undefined',
      'NaN',
      'Infinity',
    ]) {
      const result = formatJson(input, { indent: 2 })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-input')
      }
    }
  })

  it('follows native JSON semantics for duplicate keys and large integers', () => {
    const duplicate = formatJson('{"value":1,"value":2}', { indent: 2 })
    const largeInteger = formatJson('{"value":9007199254740993}', { indent: 2 })

    expect(duplicate).toEqual({
      ok: true,
      value: { formatted: '{\n  "value": 2\n}' },
    })
    expect(largeInteger).toEqual({
      ok: true,
      value: { formatted: '{\n  "value": 9007199254740992\n}' },
    })
  })

  it('does not impose an input length cap', () => {
    const result = formatJson(JSON.stringify({ text: 'x'.repeat(100_000) }), { indent: 2 })

    expect(result.ok).toBe(true)
  })
})
