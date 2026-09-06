import type { SecureRandomSource } from '~/core/uuid'

type CryptoLike = {
  randomUUID?: () => string
  getRandomValues: (array: Uint8Array | Uint32Array) => Uint8Array | Uint32Array
}

export function getSecureRandomSource(): SecureRandomSource | null {
  const cryptoValue = (globalThis as typeof globalThis & { crypto?: CryptoLike }).crypto

  if (!cryptoValue || typeof cryptoValue.getRandomValues !== 'function') {
    return null
  }

  return {
    randomUUID: typeof cryptoValue.randomUUID === 'function'
      ? cryptoValue.randomUUID.bind(cryptoValue)
      : undefined,
    getRandomValues: ((array: Uint8Array | Uint32Array) => cryptoValue.getRandomValues(array)) as SecureRandomSource['getRandomValues'],
  }
}
