import { describe, expect, it } from 'vitest'

import {
  compressJson,
  flattenJson,
  formatJson,
  getJsonErrorLocation,
  unflattenJson,
} from '../../core/json-formatter'

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

  it('anchors missing separators to the preceding value line', () => {
    const objectInput = '{\n  "user": {\n    "id": 1,\n    "name": "ComTools"\n    "active": true\n  },\n  "tags": [\n    "json",\n    "excel",\n    "image"\n  ]\n}'
    const arrayInput = '{\n  "tags": [\n    "json"\n    "excel"\n  ]\n}'

    for (const [input, expectedLine] of [[objectInput, 4], [arrayInput, 3]] as const) {
      const result = formatJson(input, { indent: 2 })

      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.code).toBe('invalid-input')
      expect(result.error.message).toContain(`第 ${expectedLine} 行`)
    }
  })

  it('exposes the localized error location for the page error context', () => {
    expect(getJsonErrorLocation('JSON 语法有误：第 3 行、第 5 列附近。', '{\n  1\n}')).toEqual({
      line: 3,
      column: 5,
    })
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

  it('compresses JSON to one line without structural whitespace', () => {
    expect(compressJson('\r\n { "name": "Tool Deck", "items": [1, true, null] } \r\n')).toEqual({
      ok: true,
      value: { compressed: '{"name":"Tool Deck","items":[1,true,null]}' },
    })
  })

  it('preserves whitespace inside JSON strings', () => {
    expect(compressJson('{"message": "hello world", "line": "a\\nb"}')).toEqual({
      ok: true,
      value: { compressed: '{"message":"hello world","line":"a\\nb"}' },
    })
  })

  it('accepts top-level values and keeps compression stable', () => {
    const first = compressJson('  [1, {"enabled": true}]  ')

    expect(first).toEqual({
      ok: true,
      value: { compressed: '[1,{"enabled":true}]' },
    })
    if (!first.ok) return

    expect(compressJson(first.value.compressed)).toEqual(first)
  })

  it('follows native JSON semantics for compression', () => {
    expect(compressJson('{"value":1,"value":2}')).toEqual({
      ok: true,
      value: { compressed: '{"value":2}' },
    })
    expect(compressJson('{"value":9007199254740993}')).toEqual({
      ok: true,
      value: { compressed: '{"value":9007199254740992}' },
    })
  })

  it('returns structured errors and no result for invalid compression input', () => {
    const result = compressJson('{"name": 1,}')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-input')
      expect(result.error.message).toContain('第 1 行')
    }
  })

  it('returns an empty-input error without producing compressed output', () => {
    expect(compressJson(' \r\n\t ')).toEqual({
      ok: false,
      error: { code: 'empty-input', message: '请输入 JSON 内容。' },
    })
  })

  it('does not impose an input length cap for compression', () => {
    const result = compressJson(JSON.stringify({ text: 'x'.repeat(100_000) }))

    expect(result.ok).toBe(true)
  })

  it('flattens nested objects and arrays into stable dot paths', () => {
    expect(flattenJson(
      '{"user":{"name":"Tool Deck"},"items":[{"id":1},{"id":2}],"enabled":true}',
      { indent: 2 },
    )).toEqual({
      ok: true,
      value: {
        flattened: '{\n  "user.name": "Tool Deck",\n  "items.0.id": 1,\n  "items.1.id": 2,\n  "enabled": true\n}',
      },
    })
  })

  it('unflattens dot paths back into nested objects and arrays', () => {
    expect(unflattenJson(
      '{"user.name":"Tool Deck","items.0.id":1,"items.1.id":2,"enabled":true}',
      { indent: 2 },
    )).toEqual({
      ok: true,
      value: {
        unflattened: '{\n  "user": {\n    "name": "Tool Deck"\n  },\n  "items": [\n    {\n      "id": 1\n    },\n    {\n      "id": 2\n    }\n  ],\n  "enabled": true\n}',
      },
    })
  })

  it('escapes dots and backslashes in object keys', () => {
    const input = String.raw`{"a.b":{"c\\d":"ok","中文.键":true}}`
    const result = flattenJson(input, { indent: 2 })

    expect(result).toEqual({
      ok: true,
      value: {
        flattened: String.raw`{
  "a\\.b.c\\\\d": "ok",
  "a\\.b.中文\\.键": true
}`,
      },
    })

    if (!result.ok) return

    expect(unflattenJson(result.value.flattened, { indent: 2 })).toEqual({
      ok: true,
      value: {
        unflattened: '{\n  "a.b": {\n    "c\\\\d": "ok",\n    "中文.键": true\n  }\n}',
      },
    })
  })

  it('supports non-empty root arrays through numeric path segments', () => {
    const flattened = flattenJson('[{"id":1},{"id":2}]', { indent: 2 })

    expect(flattened).toEqual({
      ok: true,
      value: { flattened: '{\n  "0.id": 1,\n  "1.id": 2\n}' },
    })

    if (!flattened.ok) return

    expect(unflattenJson(flattened.value.flattened, { indent: 2 })).toEqual({
      ok: true,
      value: { unflattened: '[\n  {\n    "id": 1\n  },\n  {\n    "id": 2\n  }\n]' },
    })
  })

  it('preserves empty objects and arrays as path values', () => {
    const input = '{"emptyObject":{},"emptyArray":[]}'

    expect(flattenJson(input, { indent: 2 })).toEqual({
      ok: true,
      value: { flattened: '{\n  "emptyObject": {},\n  "emptyArray": []\n}' },
    })

    expect(unflattenJson('{"emptyObject":{},"emptyArray":[]}', { indent: 2 })).toEqual({
      ok: true,
      value: { unflattened: '{\n  "emptyObject": {},\n  "emptyArray": []\n}' },
    })
    expect(flattenJson('[]', { indent: 2 })).toEqual({
      ok: true,
      value: { flattened: '[]' },
    })
    expect(unflattenJson('[]', { indent: 2 })).toEqual({
      ok: true,
      value: { unflattened: '[]' },
    })
  })

  it('rejects root scalar values for flattening and unflattening', () => {
    for (const input of ['"text"', '42', 'true', 'null']) {
      const flattened = flattenJson(input, { indent: 2 })
      const unflattened = unflattenJson(input, { indent: 2 })

      expect(flattened.ok).toBe(false)
      expect(unflattened.ok).toBe(false)
      if (!flattened.ok) expect(flattened.error.code).toBe('invalid-input')
      if (!unflattened.ok) expect(unflattened.error.code).toBe('invalid-input')
    }

    expect(unflattenJson('[1]', { indent: 2 })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: 'JSON 反扁平化需要路径键对象作为输入。',
        details: '根数组只能作为扁平化结果恢复，不能直接作为非空扁平输入。',
      },
    })
  })

  it('reuses JSON syntax errors and line locations for both transformations', () => {
    for (const result of [
      flattenJson('{\n  "value": 1,\n}', { indent: 2 }),
      unflattenJson('{\n  "value": 1,\n}', { indent: 2 }),
    ]) {
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-input')
        expect(result.error.message).toContain('第 3 行')
      }
    }
  })

  it('rejects path conflicts, array gaps, and mixed array/object siblings', () => {
    for (const input of [
      '{"a":1,"a.b":2}',
      '{"a.b":2,"a":1}',
      '{"items.0":"a","items.2":"c"}',
      '{"items.0":"a","items.name":"b"}',
    ]) {
      const result = unflattenJson(input, { indent: 2 })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-input')
      }
    }
  })

  it('rejects invalid escapes, unsafe path segments, and non-empty container values', () => {
    for (const input of [
      String.raw`{"a\q":1}`,
      '{"__proto__.value":1}',
      '{"nested":{"value":1}}',
    ]) {
      const result = unflattenJson(input, { indent: 2 })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('invalid-input')
      }
    }
  })

  it('keeps native JSON semantics and output stability for flattening', () => {
    const first = flattenJson('{"value":1,"value":2,"number":9007199254740993}', { indent: 4 })

    expect(first).toEqual({
      ok: true,
      value: {
        flattened: '{\n    "value": 2,\n    "number": 9007199254740992\n}',
      },
    })
    if (!first.ok) return

    expect(flattenJson(first.value.flattened, { indent: 4 })).toEqual(first)
    expect(first.value.flattened.endsWith('\n')).toBe(false)
  })

  it('does not impose an input length cap for flattening', () => {
    const result = flattenJson(JSON.stringify({ payload: { text: 'x'.repeat(100_000) } }), { indent: 2 })

    expect(result.ok).toBe(true)
  })
})
