import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadAsciiArt,
  processAsciiArt,
  readAsciiArtFile,
} from '../../adapters/ascii-art'
import { ASCII_ART_MAX_FILE_BYTES } from '../../core/ascii-art'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

function createFile(bytes: Uint8Array, type: string, name = 'sample.png'): File {
  return {
    name,
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

describe('ascii-art browser adapter', () => {
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()
  const createElement = vi.fn()
  const drawImage = vi.fn()
  const getImageData = vi.fn()
  const link = {
    href: '',
    download: '',
    click: vi.fn(),
  }
  const context = {
    drawImage,
    getImageData,
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D

  beforeEach(() => {
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    createElement.mockReset()
    drawImage.mockReset()
    getImageData.mockReset()
    link.click.mockReset()

    let objectUrlIndex = 0
    createObjectURL.mockImplementation(() => 'blob:ascii-art-' + (++objectUrlIndex))
    getImageData.mockImplementation((
      _x: number,
      _y: number,
      width: number,
      height: number,
    ) => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let index = 3; index < data.length; index += 4) {
        data[index] = 255
      }
      return { data }
    })

    createElement.mockImplementation((tagName: string) => {
      if (tagName === 'img') {
        const image = {
          naturalWidth: 100,
          naturalHeight: 80,
          width: 100,
          height: 80,
          decoding: 'auto',
          onload: null as (() => void) | null,
          onerror: null as (() => void) | null,
          set src(_value: string) {
            queueMicrotask(() => image.onload?.())
          },
        }
        return image
      }

      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => context,
        }
      }

      if (tagName === 'a') {
        return link
      }

      return {}
    })

    vi.stubGlobal('window', {
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

  it('reads a supported local file and releases its temporary object URL', async () => {
    const result = await readAsciiArtFile(createFile(PNG_BYTES, 'image/png'))

    expect(result).toMatchObject({
      ok: true,
      value: {
        fileName: 'sample.png',
        format: 'png',
        mimeType: 'image/png',
        byteLength: 8,
        width: 100,
        height: 80,
      },
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ascii-art-1')
  })

  it('rejects GIF and mismatched MIME before Canvas work', async () => {
    const gif = await readAsciiArtFile(createFile(GIF_BYTES, 'image/gif', 'animation.gif'))
    const mismatch = await readAsciiArtFile(createFile(PNG_BYTES, 'image/jpeg'))

    expect(gif).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
    expect(mismatch).toMatchObject({
      ok: false,
      error: { code: 'unsupported-input' },
    })
    expect(createElement).not.toHaveBeenCalledWith('canvas')
  })

  it('recognizes a supported WebP signature and rejects oversized files before decoding', async () => {
    const webp = await readAsciiArtFile(createFile(WEBP_BYTES, 'image/webp', 'sample.webp'))
    const oversized = await readAsciiArtFile({
      ...createFile(PNG_BYTES, 'image/png'),
      size: ASCII_ART_MAX_FILE_BYTES + 1,
    } as File)

    expect(webp).toMatchObject({
      ok: true,
      value: {
        fileName: 'sample.webp',
        format: 'webp',
        mimeType: 'image/webp',
      },
    })
    expect(oversized).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('samples the image into the confirmed grid and generates a text result', async () => {
    const result = await processAsciiArt(
      createFile(PNG_BYTES, 'image/png'),
      40,
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: {
          format: 'png',
          width: 100,
          height: 80,
        },
        columns: 40,
        rows: 16,
        cellCount: 640,
        downloadFileName: expect.stringMatching(/^ascii-art-\d{8}\.txt$/u),
      },
    })
    if (result.ok) {
      expect(result.value.text.split('\n')).toHaveLength(16)
      expect(result.value.text.split('\n').every((line) => line === '@'.repeat(40))).toBe(true)
    }
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 40, 16)
    expect(getImageData).toHaveBeenCalledWith(0, 0, 40, 16)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ascii-art-1')
  })

  it('maps download feedback to the existing text download adapter', async () => {
    const result = await processAsciiArt(
      createFile(JPEG_BYTES, 'image/jpeg', 'sample.jpg'),
      40,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const downloaded = downloadAsciiArt(result.value)

    expect(downloaded).toMatchObject({ ok: true })
    expect(link.download).toMatch(/^ascii-art-\d{8}\.txt$/u)
    expect(link.click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ascii-art-2')
  })
})
