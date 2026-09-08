import { describe, expect, it } from 'vitest'

import {
  generateCredentials,
  PASSWORD_CHARSETS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../core/password'
import type { SecureRandomSource } from '../../core/uuid'

type PasswordRandomSource = SecureRandomSource

/** 创建测试使用的可控随机数源。 */
function createRandomSource(): PasswordRandomSource {
  return {
    getRandomValues: ((array: Uint32Array) => {
      array.fill(0)
      return array
    }) as PasswordRandomSource['getRandomValues'],
  }
}

describe('password and account generator core', () => {
  it('generates the requested number of accounts and passwords', () => {
    const result = generateCredentials({
      length: 12,
      prefix: 'user_',
      suffix: '_x',
    }, {
      count: 2,
      length: 8,
      includeLowercase: true,
      includeUppercase: true,
      includeDigits: true,
      includeSymbols: true,
    }, createRandomSource())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const first = result.value[0]!

    expect(result.value).toHaveLength(2)
    expect(first.username).toHaveLength(12)
    expect(first.username.startsWith('user_')).toBe(true)
    expect(first.username.endsWith('_x')).toBe(true)
    expect(first.password).toHaveLength(8)
    const allowedCharacters = Object.values(PASSWORD_CHARSETS).join('')
    expect([...first.password].every((character) => allowedCharacters.includes(character))).toBe(true)
  })

  it('requires at least one password character type and covers each selected type', () => {
    const result = generateCredentials({
      length: 4,
      prefix: '',
      suffix: '',
    }, {
      count: 1,
      length: 4,
      includeLowercase: true,
      includeUppercase: true,
      includeDigits: true,
      includeSymbols: true,
    }, createRandomSource())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const password = result.value[0]!.password

    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{};:,.?]/)
  })

  it('rejects invalid lengths, prefixes, suffixes, and empty character sets', () => {
    const accountBase = {
      length: 8,
      prefix: '',
      suffix: '',
    }
    const passwordBase = {
      count: 1,
      length: PASSWORD_MIN_LENGTH,
      includeLowercase: true,
      includeUppercase: false,
      includeDigits: false,
      includeSymbols: false,
    }

    expect(generateCredentials(accountBase, { ...passwordBase, length: PASSWORD_MIN_LENGTH - 1 }, createRandomSource()).ok).toBe(false)
    expect(generateCredentials(accountBase, { ...passwordBase, length: PASSWORD_MAX_LENGTH + 1 }, createRandomSource()).ok).toBe(false)
    expect(generateCredentials(accountBase, { ...passwordBase, includeLowercase: false }, createRandomSource()).ok).toBe(false)
    expect(generateCredentials({ ...accountBase, prefix: 'bad space' }, passwordBase, createRandomSource()).ok).toBe(false)
    expect(generateCredentials({ ...accountBase, length: 4, prefix: 'abc', suffix: 'de' }, passwordBase, createRandomSource()).ok).toBe(false)
  })
})
