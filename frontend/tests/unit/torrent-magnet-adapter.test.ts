
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyTorrentMagnet,
  downloadTorrentMagnet,
  readTorrentFile,
} from '../../adapters/torrent-magnet'
import { TORRENT_MAX_FILE_BYTES } from '../../core/torrent-magnet'

const encoder = new TextEncoder()

function text(value: string): Uint8Array {
  return encoder.encode(value)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

function bstr(value: string | Uint8Array): Uint8Array {
  const bytes = typeof value === 'string' ? text(value) : value
  return concat([text(String(bytes.length)), new Uint8Array([0x3a]), bytes])
}

function integer(value: number): Uint8Array {
  return concat([new Uint8Array([0x69]), text(String(value)), new Uint8Array([0x65])])
}

function dictionary(entries: readonly [string, Uint8Array][]): Uint8Array {
  const sorted = [...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  return concat([
    new Uint8Array([0x64]),
    ...sorted.flatMap(([key, value]) => [bstr(key), value]),
    new Uint8Array([0x65]),
  ])
}

function createTorrentBytes(): Uint8Array {
  const info = dictionary([
    ['length', integer(123)],
    ['name', bstr('sample.txt')],
    ['piece length', integer(16_384)],
    ['pieces', bstr(new Uint8Array(20).fill(7))],
  ])

  return dictionary([['info', info]])
}

function createFile(bytes: Uint8Array, overrides: Partial<File> = {}): File {
  return {
    name: 'sample.torrent',
    size: bytes.byteLength,
    type: 'application/x-bittorrent',
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    ...overrides,
  } as File
}

describe('torrent-magnet browser adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads a local file, hashes the raw info bytes and creates a Magnet', async () => {
    const digest = new Uint8Array(20).fill(0xab)
    const digestSpy = vi.fn().mockResolvedValue(digest.buffer)
    vi.stubGlobal('crypto', { subtle: { digest: digestSpy } })

    const result = await readTorrentFile(createFile(createTorrentBytes()))

    expect(result).toMatchObject({
      ok: true,
      value: {
        fileName: 'sample.torrent',
        byteLength: expect.any(Number),
        infoHashHex: 'ab'.repeat(20),
        magnet: 'magnet:?xt=urn:btih:' + 'ab'.repeat(20) + '&dn=sample.txt',
      },
    })
    expect(digestSpy).toHaveBeenCalledWith('SHA-1', expect.any(ArrayBuffer))
  })

  it('returns explicit local limits and Web Crypto errors', async () => {
    const tooLarge = createFile(new Uint8Array(1), {
      size: TORRENT_MAX_FILE_BYTES + 1,
    })
    const sizeResult = await readTorrentFile(tooLarge)
    expect(sizeResult).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })

    vi.stubGlobal('crypto', { subtle: null })
    const cryptoResult = await readTorrentFile(createFile(createTorrentBytes()))
    expect(cryptoResult).toMatchObject({
      ok: false,
      error: { code: 'crypto-unavailable' },
    })

    const readFailure = await readTorrentFile(createFile(createTorrentBytes(), {
      arrayBuffer: async () => {
        throw new Error('read failed')
      },
    }))
    expect(readFailure).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })

  it('maps copy and UTF-8 text download feedback to the tool protocol', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const createObjectURL = vi.fn().mockReturnValue('blob:download')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    const link = { href: '', download: '', click }
    vi.stubGlobal('window', {
      URL: {
        createObjectURL,
        revokeObjectURL,
      },
    })
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(link),
    })

    const magnet = 'magnet:?xt=urn:btih:' + '0'.repeat(40)
    const copied = await copyTorrentMagnet(magnet)
    const downloaded = downloadTorrentMagnet(magnet)

    expect(copied).toEqual({ ok: true, value: '已复制到剪贴板。' })
    expect(writeText).toHaveBeenCalledWith(magnet)
    expect(downloaded).toMatchObject({ ok: true })
    expect(link.download).toMatch(/^torrent-magnet-\d{8}\.txt$/u)
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
  })
})
