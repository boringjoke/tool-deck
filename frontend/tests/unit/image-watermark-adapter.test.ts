import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadImageWatermark,
  processImageWatermark,
  readImageWatermarkFile,
} from '../../adapters/image-watermark'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

function createFile(bytes: Uint8Array, type: string, name = 'sample.png'): File {
  return {
    name,
    size: bytes.byteLength,
    type,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

describe('image-watermark browser adapter', () => {
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()
  const createElement = vi.fn()
  const drawImage = vi.fn()
  const fillText = vi.fn()
  const toBlob = vi.fn()
  const link = {
    href: '',
    download: '',
    click: vi.fn(),
  }
  const context = {
    drawImage,
    fillText,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D

  beforeEach(() => {
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    createElement.mockReset()
    drawImage.mockReset()
    fillText.mockReset()
    toBlob.mockReset()
    link.click.mockReset()

    let objectUrlIndex = 0
    createObjectURL.mockImplementation(() => `blob:image-watermark-${++objectUrlIndex}`)
    toBlob.mockImplementation((
      callback: (blob: Blob | null) => void,
      mimeType: string,
    ) => {
      callback(new Blob(['watermarked'], { type: mimeType }))
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
          toBlob,
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

  it('reads a supported local file and reports dimensions for the original preview', async () => {
    const result = await readImageWatermarkFile(createFile(PNG_BYTES, 'image/png'))

    expect(result).toMatchObject({
      ok: true,
      value: {
        fileName: 'sample.png',
        format: 'png',
        mimeType: 'image/png',
        byteLength: 8,
        width: 100,
        height: 80,
        previewSource: 'blob:image-watermark-1',
      },
    })
  })

  it('rejects GIF and mismatched MIME before Canvas work', async () => {
    const gif = await readImageWatermarkFile(createFile(GIF_BYTES, 'image/gif', 'animation.gif'))
    const mismatch = await readImageWatermarkFile(createFile(PNG_BYTES, 'image/jpeg'))

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

  it('renders one text watermark with the source dimensions and fixed PNG output', async () => {
    const result = await processImageWatermark(
      createFile(PNG_BYTES, 'image/png'),
      {
        text: 'Tool Deck',
        position: 'bottom-right',
        size: 'medium',
        color: '#ffffff',
        opacity: 0.55,
      },
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        format: 'png',
        width: 100,
        height: 80,
        text: 'Tool Deck',
        fontSize: 2,
        outputByteLength: 11,
        downloadFileName: expect.stringMatching(/^watermarked-image-\d{8}\.png$/u),
      },
    })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 80)
    expect(fillText).toHaveBeenCalledWith('Tool Deck', 97, 76)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined)
  })

  it('uses the confirmed JPEG quality and maps download feedback', async () => {
    const result = await processImageWatermark(
      createFile(JPEG_BYTES, 'image/jpeg', 'sample.jpg'),
      { text: '©', color: '#abc', opacity: 1 },
    )

    expect(result).toMatchObject({
      ok: true,
      value: { format: 'jpeg', downloadFileName: expect.stringMatching(/\.jpg$/u) },
    })
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92)

    if (!result.ok) return
    const downloaded = downloadImageWatermark(result.value)
    expect(downloaded).toMatchObject({ ok: true })
    expect(link.download).toMatch(/^watermarked-image-\d{8}\.jpg$/u)
    expect(link.click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-watermark-3')
  })
})
