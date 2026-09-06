import { failure, success, type ToolResult } from './tool-result'

export interface SecureRandomSource {
  randomUUID?: () => string
  getRandomValues: {
    (array: Uint8Array): Uint8Array
    (array: Uint32Array): Uint32Array
  }
}

export const UUID_MIN_COUNT = 1
export const UUID_MAX_COUNT = 100

function formatUuidBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function generateUuid(source: SecureRandomSource): ToolResult<string> {
  try {
    if (source.randomUUID) {
      return success(source.randomUUID().toLowerCase())
    }

    const bytes = new Uint8Array(16)
    source.getRandomValues(bytes)
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    return success(formatUuidBytes(bytes))
  } catch {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法生成 UUID。')
  }
}

export function generateUuidList(
  count: number,
  source: SecureRandomSource,
): ToolResult<string[]> {
  if (!Number.isInteger(count) || count < UUID_MIN_COUNT || count > UUID_MAX_COUNT) {
    return failure('out-of-range', `生成数量必须是 ${UUID_MIN_COUNT}–${UUID_MAX_COUNT} 之间的整数。`)
  }

  const result: string[] = []

  for (let index = 0; index < count; index += 1) {
    const uuidResult = generateUuid(source)

    if (!uuidResult.ok) {
      return uuidResult
    }

    result.push(uuidResult.value)
  }

  return success(result)
}

export function formatUuidCase(value: string, uppercase: boolean): string {
  return uppercase ? value.toUpperCase() : value.toLowerCase()
}
