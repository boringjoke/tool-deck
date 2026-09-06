import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl, resolveSiteUrl, toAbsoluteSiteUrl } from '../../utils/site-url'

describe('site URL utilities', () => {
  it('accepts HTTP(S) origins and removes query, fragment and trailing slash', () => {
    expect(normalizeSiteUrl(' https://example.com/tools/?preview=1#top ')).toBe('https://example.com/tools')
    expect(normalizeSiteUrl('http://localhost:3000/')).toBe('http://localhost:3000')
  })

  it('rejects unsafe or malformed site addresses', () => {
    expect(normalizeSiteUrl('javascript:alert(1)')).toBe('')
    expect(normalizeSiteUrl('https://user:password@example.com')).toBe('')
    expect(normalizeSiteUrl('not a URL')).toBe('')
  })

  it('uses the request origin only when the public site URL is absent or invalid', () => {
    expect(resolveSiteUrl('https://example.com', 'http://localhost:3000')).toBe('https://example.com')
    expect(resolveSiteUrl('', 'http://localhost:3000/')).toBe('http://localhost:3000')
    expect(toAbsoluteSiteUrl('https://example.com/tools', '/about')).toBe('https://example.com/tools/about')
  })
})
