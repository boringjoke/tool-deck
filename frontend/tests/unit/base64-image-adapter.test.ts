import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeBase64Image,
  downloadBase64Image,
  downloadBase64ImageText,
  readBase64ImageFile,
} from '../../adapters/base64-image'
import { parseBase64ImageText } from '../../core/base64-image'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function createFile(bytes: Uint8Array, type: string): File {
  return {
    name: 'sample.png',
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

describe('base64-image browser adapter', () => {
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()
  const createElement = vi.fn()
  const link = {
    href: '',
    download: '',
    click: vi.fn(),
  }

  beforeEach(() => {
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    createElement.mockReset()
    link.click.mockReset()
    createObjectURL
      .mockReturnValueOnce('blob:preview')
      .mockReturnValueOnce('blob:download')
    createElement.mockReturnValue(link)

    vi.stubGlobal('window', {
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      URL: {
        createObjectURL,
        revokeObjectURL,
      },
    })
    vi.stubGlobal('document', { createElement })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads a supported file and decodes the same bytes for preview', async () => {
    const read = await readBase64ImageFile(createFile(PNG_BYTES, 'image/png'))

    expect(read).toMatchObject({
      ok: true,
      value: {
        base64: 'iVBORw0KGgo=',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
        format: 'png',
        byteLength: 8,
        previewSource: 'data:image/png;base64,iVBORw0KGgo=',
      },
    })

    if (!read.ok) return
    const decoded = decodeBase64Image(read.value)

    expect(decoded).toMatchObject({
      ok: true,
      value: {
        previewSource: 'blob:preview',
        blob: { size: 8, type: 'image/png' },
      },
    })
  })

  it('rejects MIME/signature mismatches and unknown file signatures', async () => {
    const mismatched = await readBase64ImageFile(createFile(PNG_BYTES, 'image/jpeg'))
    const unknown = await readBase64ImageFile(createFile(new Uint8Array([0x01, 0x02]), 'image/png'))

    expect(mismatched).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
    expect(unknown).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
  })

  it('keeps fixed download names and maps browser download feedback', async () => {
    const parsed = parseBase64ImageText('iVBORw0KGgo=', 'png')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const decoded = decodeBase64Image(parsed.value)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return

    const rawText = downloadBase64ImageText(parsed.value, 'raw')
    const image = downloadBase64Image(decoded.value)

    expect(rawText).toMatchObject({ ok: true })
    expect(image).toMatchObject({ ok: true })
    expect(link.download).toMatch(/^base64-image-\d{8}\.png$/u)
    expect(link.click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
  })
})
