import { describe, expect, it } from 'vitest'

import {
  buildQueryString,
  decodeUrl,
  encodeUrl,
  generateWhereIn,
  parseAbsoluteUrl,
  rebuildUrl,
} from '../../core/url-tool'

describe('URL tool core', () => {
  it('parses an absolute URL while preserving duplicate, empty, and valueless parameters', () => {
    const result = parseAbsoluteUrl('https://example.com/search?a=1&a=hello+world&flag=&empty#top')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.origin).toBe('https://example.com')
    expect(result.value.pathname).toBe('/search')
    expect(result.value.hash).toBe('#top')
    expect(result.value.parameters).toEqual([
      { key: 'a', value: '1', hasEquals: true },
      { key: 'a', value: 'hello world', hasEquals: true },
      { key: 'flag', value: '', hasEquals: true },
      { key: 'empty', value: '', hasEquals: false },
    ])
  })

  it('rejects relative URLs and malformed percent-encoding', () => {
    expect(parseAbsoluteUrl('/relative/path').ok).toBe(false)
    expect(parseAbsoluteUrl('https://example.com/?bad=%ZZ').ok).toBe(false)
  })

  it('rebuilds edited parameters and keeps the URL structure', () => {
    const parsed = parseAbsoluteUrl('https://example.com/search?a=1#top')

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const parameters = [
      ...parsed.value.parameters,
      { key: 'q', value: 'hello world', hasEquals: true },
    ]

    expect(buildQueryString(parameters)).toBe('a=1&q=hello%20world')
    const rebuilt = rebuildUrl(parsed.value, parameters)

    expect(rebuilt.ok).toBe(true)
    if (!rebuilt.ok) return

    expect(rebuilt.value).toBe('https://example.com/search?a=1&q=hello%20world#top')
  })

  it('supports component and full URL encoding modes', () => {
    const encodedComponent = encodeUrl('a b?', 'component')
    const encodedFull = encodeUrl('a b?', 'full')
    const decodedComponent = decodeUrl('a%20b%3F', 'component')
    const decodedFull = decodeUrl('https%3A%2F%2Fexample.com%2Fa%3Fx%3D1', 'full')

    expect(encodedComponent.ok).toBe(true)
    expect(encodedFull.ok).toBe(true)
    expect(decodedComponent.ok).toBe(true)
    expect(decodedFull.ok).toBe(true)
    if (!encodedComponent.ok || !encodedFull.ok || !decodedComponent.ok || !decodedFull.ok) return

    expect(encodedComponent.value).toBe('a%20b%3F')
    expect(encodedFull.value).toBe('a%20b?')
    expect(decodedComponent.value).toBe('a b?')
    expect(decodedFull.value).toBe('https%3A%2F%2Fexample.com%2Fa%3Fx%3D1')
  })

  it('generates grouped SQL WHERE IN conditions with escaped literals', () => {
    const result = generateWhereIn([
      { key: 'id', value: '1', hasEquals: true },
      { key: 'id', value: '2', hasEquals: true },
      { key: 'name', value: "O'Reilly", hasEquals: true },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toBe("`id` IN ('1', '2') AND `name` IN ('O''Reilly')")
  })
})
