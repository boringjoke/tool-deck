import { failure, success, type ToolResult } from './tool-result'
import type { SecureRandomSource } from './uuid'

export type PasswordCharacterType = 'lowercase' | 'uppercase' | 'digits' | 'symbols'

export interface PasswordOptions {
  length: number
  count: number
  includeLowercase: boolean
  includeUppercase: boolean
  includeDigits: boolean
  includeSymbols: boolean
}

export interface AccountOptions {
  length: number
  prefix: string
  suffix: string
}

export interface CredentialPair {
  username: string
  password: string
}

export const PASSWORD_MIN_LENGTH = 4
export const PASSWORD_MAX_LENGTH = 32
export const CREDENTIAL_MIN_COUNT = 1
export const CREDENTIAL_MAX_COUNT = 100
export const ACCOUNT_MIN_LENGTH = 4
export const ACCOUNT_MAX_LENGTH = 32

export const PASSWORD_CHARSETS: Readonly<Record<PasswordCharacterType, string>> = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
}

export const ACCOUNT_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const ACCOUNT_PART_PATTERN = /^[A-Za-z0-9._-]*$/u

function validateInteger(value: number, min: number, max: number, label: string): ToolResult<void> {
  if (!Number.isInteger(value) || value < min || value > max) {
    return failure('out-of-range', `${label}必须是 ${min}–${max} 之间的整数。`)
  }

  return success(undefined)
}

function getRandomIndex(source: SecureRandomSource, length: number): ToolResult<number> {
  if (length <= 0) {
    return failure('operation-failed', '随机字符集不能为空。')
  }

  const limit = Math.floor(0x1_0000_0000 / length) * length
  const buffer = new Uint32Array(1)
  let randomValue = 0

  try {
    do {
      source.getRandomValues(buffer)
      randomValue = buffer[0] ?? 0
    } while (randomValue >= limit)
  } catch {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法生成结果。')
  }

  return success(randomValue % length)
}

function getRandomCharacter(source: SecureRandomSource, charset: string): ToolResult<string> {
  const indexResult = getRandomIndex(source, charset.length)

  return indexResult.ok
    ? success(charset.charAt(indexResult.value))
    : indexResult
}

function shuffle(source: SecureRandomSource, values: string[]): ToolResult<string[]> {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndexResult = getRandomIndex(source, index + 1)

    if (!randomIndexResult.ok) {
      return randomIndexResult
    }

    const randomIndex = randomIndexResult.value
    const current = values[index] ?? ''
    values[index] = values[randomIndex] ?? ''
    values[randomIndex] = current
  }

  return success(values)
}

function selectedCharacterTypes(options: PasswordOptions): PasswordCharacterType[] {
  return [
    ...(options.includeLowercase ? ['lowercase' as const] : []),
    ...(options.includeUppercase ? ['uppercase' as const] : []),
    ...(options.includeDigits ? ['digits' as const] : []),
    ...(options.includeSymbols ? ['symbols' as const] : []),
  ]
}

function validatePasswordOptions(options: PasswordOptions): ToolResult<PasswordCharacterType[]> {
  const lengthResult = validateInteger(
    options.length,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    '密码长度',
  )

  if (!lengthResult.ok) {
    return lengthResult
  }

  const countResult = validateInteger(
    options.count,
    CREDENTIAL_MIN_COUNT,
    CREDENTIAL_MAX_COUNT,
    '生成数量',
  )

  if (!countResult.ok) {
    return countResult
  }

  const types = selectedCharacterTypes(options)

  if (!types.length) {
    return failure('invalid-input', '请至少选择一种密码字符类型。')
  }

  if (options.length < types.length) {
    return failure('out-of-range', '密码长度不足以覆盖所有已选择的字符类型。')
  }

  return success(types)
}

function validateAccountOptions(options: AccountOptions): ToolResult<void> {
  const lengthResult = validateInteger(
    options.length,
    ACCOUNT_MIN_LENGTH,
    ACCOUNT_MAX_LENGTH,
    '账号长度',
  )

  if (!lengthResult.ok) {
    return lengthResult
  }

  if (!ACCOUNT_PART_PATTERN.test(options.prefix) || !ACCOUNT_PART_PATTERN.test(options.suffix)) {
    return failure('invalid-input', '账号前缀和后缀只能包含字母、数字、点、下划线和短横线。')
  }

  if (options.prefix.length + options.suffix.length > options.length) {
    return failure('out-of-range', '账号前缀和后缀的总长度不能超过账号长度。')
  }

  return success(undefined)
}

function generatePassword(
  options: PasswordOptions,
  types: readonly PasswordCharacterType[],
  source: SecureRandomSource,
): ToolResult<string> {
  const charset = types.map((type) => PASSWORD_CHARSETS[type]).join('')
  const characters: string[] = []

  for (const type of types) {
    const characterResult = getRandomCharacter(source, PASSWORD_CHARSETS[type])

    if (!characterResult.ok) {
      return characterResult
    }

    characters.push(characterResult.value)
  }

  while (characters.length < options.length) {
    const characterResult = getRandomCharacter(source, charset)

    if (!characterResult.ok) {
      return characterResult
    }

    characters.push(characterResult.value)
  }

  const shuffledResult = shuffle(source, characters)

  return shuffledResult.ok ? success(shuffledResult.value.join('')) : shuffledResult
}

function generateUsername(options: AccountOptions, source: SecureRandomSource): ToolResult<string> {
  const bodyLength = options.length - options.prefix.length - options.suffix.length
  const body: string[] = []

  for (let index = 0; index < bodyLength; index += 1) {
    const characterResult = getRandomCharacter(source, ACCOUNT_CHARSET)

    if (!characterResult.ok) {
      return characterResult
    }

    body.push(characterResult.value)
  }

  return success(`${options.prefix}${body.join('')}${options.suffix}`)
}

export function generateCredentials(
  accountOptions: AccountOptions,
  passwordOptions: PasswordOptions,
  source: SecureRandomSource,
): ToolResult<CredentialPair[]> {
  const accountResult = validateAccountOptions(accountOptions)

  if (!accountResult.ok) {
    return accountResult
  }

  const passwordResult = validatePasswordOptions(passwordOptions)

  if (!passwordResult.ok) {
    return passwordResult
  }

  const result: CredentialPair[] = []

  for (let index = 0; index < passwordOptions.count; index += 1) {
    const usernameResult = generateUsername(accountOptions, source)

    if (!usernameResult.ok) {
      return usernameResult
    }

    const passwordValueResult = generatePassword(passwordOptions, passwordResult.value, source)

    if (!passwordValueResult.ok) {
      return passwordValueResult
    }

    result.push({
      username: usernameResult.value,
      password: passwordValueResult.value,
    })
  }

  return success(result)
}
