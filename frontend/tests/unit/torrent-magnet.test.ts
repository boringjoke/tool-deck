
import { describe, expect, it } from 'vitest'
import {
  createTorrentMagnet,
  parseTorrent,
  TORRENT_MAX_DEPTH,
  TORRENT_MAX_DISPLAY_FILES,
  TORRENT_MAX_NODES,
  TORRENT_MAX_STRING_BYTES,
} from '../../core/torrent-magnet'

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

function integer(value: number | string): Uint8Array {
  return concat([new Uint8Array([0x69]), text(String(value)), new Uint8Array([0x65])])
}

function list(values: readonly Uint8Array[]): Uint8Array {
  return concat([new Uint8Array([0x6c]), ...values, new Uint8Array([0x65])])
}

function compareText(left: string, right: string): number {
  const leftBytes = text(left)
  const rightBytes = text(right)
  const length = Math.min(leftBytes.length, rightBytes.length)

  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index]! !== rightBytes[index]!) {
      return leftBytes[index]! - rightBytes[index]!
    }
  }

  return leftBytes.length - rightBytes.length
}

function dictionary(entries: readonly [string, Uint8Array][]): Uint8Array {
  return rawDictionary([...entries].sort((left, right) => compareText(left[0], right[0])))
}

function rawDictionary(entries: readonly [string, Uint8Array][]): Uint8Array {
  return concat([
    new Uint8Array([0x64]),
    ...entries.flatMap(([key, value]) => [bstr(key), value]),
    new Uint8Array([0x65]),
  ])
}

function singleTorrent(options: {
  name?: string | Uint8Array
  extraInfo?: readonly [string, Uint8Array][]
  rootExtra?: readonly [string, Uint8Array][]
} = {}): { bytes: Uint8Array; infoBytes: Uint8Array } {
  const infoBytes = dictionary([
    ['length', integer(123)],
    ['name', typeof options.name === 'undefined' ? bstr('example.txt') : bstr(options.name)],
    ['piece length', integer(16_384)],
    ['pieces', bstr(new Uint8Array(20).fill(7))],
    ...(options.extraInfo ?? []),
  ])

  const bytes = dictionary([
    ['announce', bstr('https://tracker.example/announce?x=1&y=two')],
    ['announce-list', list([
      list([bstr('https://tracker.example/announce?x=1&y=two')]),
      list([bstr('https://tracker-two.example/announce')]),
    ])],
    ['info', infoBytes],
    ...(options.rootExtra ?? []),
  ])

  return { bytes, infoBytes }
}

describe('torrent-magnet core', () => {
  it('strictly parses a v1 single-file torrent and preserves raw info bytes', () => {
    const sample = singleTorrent()
    const result = parseTorrent(sample.bytes)

    expect(result).toMatchObject({
      ok: true,
      value: {
        format: 'v1',
        name: 'example.txt',
        magnetName: 'example.txt',
        mode: 'single',
        totalSize: 123,
        fileCount: 1,
        pieceLength: 16_384,
        pieceCount: 1,
        files: [{ path: 'example.txt', length: 123 }],
        filesTruncated: false,
        omittedTrackerCount: 0,
        hasEncodingWarning: false,
      },
    })

    if (!result.ok) return
    expect(result.value.infoBytes).toEqual(sample.infoBytes)
    expect(result.value.trackers).toEqual([
      {
        display: 'https://tracker.example/announce?x=1&y=two',
        uri: 'https://tracker.example/announce?x=1&y=two',
      },
      {
        display: 'https://tracker-two.example/announce',
        uri: 'https://tracker-two.example/announce',
      },
    ])
  })

  it('builds deterministic v1 Magnet fields in xt, dn, tr order', () => {
    const parsed = parseTorrent(singleTorrent().bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const magnet = createTorrentMagnet(parsed.value, 'ABCDEF'.repeat(6) + 'ABCD')
    expect(magnet).toEqual({
      ok: true,
      value: 'magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd&dn=example.txt&tr=https%3A%2F%2Ftracker.example%2Fannounce%3Fx%3D1%26y%3Dtwo&tr=https%3A%2F%2Ftracker-two.example%2Fannounce',
    })
  })

  it('parses multi-file summaries and truncates only the displayed file list', () => {
    const files = Array.from({ length: TORRENT_MAX_DISPLAY_FILES + 1 }, (_, index) => (
      dictionary([
        ['length', integer(index)],
        ['path', list([bstr('folder'), bstr('file-' + index + '.bin')])],
      ])
    ))
    const infoBytes = dictionary([
      ['files', list(files)],
      ['name', bstr('collection')],
      ['piece length', integer(16_384)],
      ['pieces', bstr(new Uint8Array(40).fill(1))],
    ])
    const result = parseTorrent(dictionary([['info', infoBytes]]))

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: 'multi',
        totalSize: (TORRENT_MAX_DISPLAY_FILES * (TORRENT_MAX_DISPLAY_FILES + 1)) / 2,
        fileCount: TORRENT_MAX_DISPLAY_FILES + 1,
        filesTruncated: true,
        files: expect.any(Array),
      },
    })

    if (!result.ok) return
    expect(result.value.files).toHaveLength(TORRENT_MAX_DISPLAY_FILES)
    expect(result.value.files[0]).toEqual({
      path: 'folder/file-0.bin',
      length: 0,
    })
  })

  it('rejects malformed Bencode before interpreting torrent fields', () => {
    const valid = singleTorrent().bytes
    const trailing = concat([valid, new Uint8Array([0x00])])
    const unsortedRoot = rawDictionary([
      ['info', singleTorrent().infoBytes],
      ['announce', bstr('https://tracker.example')],
    ])
    const duplicateRoot = rawDictionary([
      ['announce', bstr('one')],
      ['announce', bstr('two')],
      ['info', singleTorrent().infoBytes],
    ])
    const leadingZero = dictionary([
      ['info', rawDictionary([
        ['length', integer('01')],
        ['name', bstr('x')],
        ['piece length', integer(1)],
        ['pieces', bstr(new Uint8Array(20))],
      ])],
    ])
    const negativeZero = dictionary([
      ['info', rawDictionary([
        ['length', integer('-0')],
        ['name', bstr('x')],
        ['piece length', integer(1)],
        ['pieces', bstr(new Uint8Array(20))],
      ])],
    ])

    expect(parseTorrent(trailing)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseTorrent(unsortedRoot)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseTorrent(duplicateRoot)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseTorrent(leadingZero)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseTorrent(negativeZero)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('rejects v2 and hybrid markers without generating a Magnet', () => {
    const infoBytes = dictionary([
      ['meta version', integer(2)],
      ['name', bstr('v2')],
      ['piece length', integer(16_384)],
    ])
    const result = parseTorrent(dictionary([['info', infoBytes]]))

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
  })

  it('uses replacement text for invalid UTF-8 but omits the unsafe dn parameter', () => {
    const result = parseTorrent(singleTorrent({ name: new Uint8Array([0xff]) }).bytes)

    expect(result).toMatchObject({
      ok: true,
      value: {
        name: '�',
        hasEncodingWarning: true,
      },
    })

    if (!result.ok) return
    const magnet = createTorrentMagnet(result.value, '0'.repeat(40))
    expect(magnet).toEqual({
      ok: true,
      value: 'magnet:?xt=urn:btih:' + '0'.repeat(40) + '&tr=https%3A%2F%2Ftracker.example%2Fannounce%3Fx%3D1%26y%3Dtwo&tr=https%3A%2F%2Ftracker-two.example%2Fannounce',
    })
  })

 it('rejects a byte string beyond the confirmed parser bound', () => {
    const nested = (depth: number): Uint8Array => {
      let value = list([])
      for (let index = 0; index < depth; index += 1) {
        value = list([value])
      }
      return value
    }

    const validFields = [
      ["length", integer(1)] as [string, Uint8Array],
      ["name", bstr("x")] as [string, Uint8Array],
      ["piece length", integer(1)] as [string, Uint8Array],
      ["pieces", bstr(new Uint8Array(20))] as [string, Uint8Array],
    ]
    const deepInfo = dictionary([...validFields, ["nested", nested(TORRENT_MAX_DEPTH + 1)]])
    const deepResult = parseTorrent(dictionary([["info", deepInfo]]))
    expect(deepResult).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })

    const manyNodes = list(Array.from({ length: TORRENT_MAX_NODES }, () => list([])))
    const nodeInfo = dictionary([...validFields, ["nodes", manyNodes]])
    const nodeResult = parseTorrent(dictionary([["info", nodeInfo]]))
    expect(nodeResult).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })

    const unsafeLength = dictionary([
      ["length", integer("9007199254740992")],
      ["name", bstr("x")],
      ["piece length", integer(1)],
      ["pieces", bstr(new Uint8Array(20))],
    ])
    const unsafeResult = parseTorrent(dictionary([["info", unsafeLength]]))
    expect(unsafeResult).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })

   const oversized = new Uint8Array(TORRENT_MAX_STRING_BYTES + 1)
    const result = parseTorrent(concat([
      text('d4:info'),
      text('d'),
      bstr('name'),
      bstr(oversized),
      new Uint8Array([0x65]),
      new Uint8Array([0x65]),
    ]))

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })
})
