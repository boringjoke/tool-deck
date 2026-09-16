
import {
  createTorrentMagnet,
  parseTorrent,
  TORRENT_MAX_FILE_BYTES,
  type TorrentMetadata,
} from '../core/torrent-magnet'
import { failure, success, type ToolResult } from '../core/tool-result'
import { copyText } from './clipboard'
import { createDownloadFileName, downloadText } from './download'

export interface TorrentAnalysis extends TorrentMetadata {
  fileName: string
  byteLength: number
  infoHashHex: string
  magnet: string
}

/** 将 Uint8Array 的有效范围复制为 Web Crypto 可接受的 ArrayBuffer。 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** 将摘要字节转换为固定小写十六进制文本。 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

/** 读取浏览器 Web Crypto 能力，不提供第三方哈希回退。 */
function getWebCrypto(): Crypto | null {
  if (
    typeof globalThis.crypto === 'undefined'
    || !globalThis.crypto.subtle
    || typeof globalThis.crypto.subtle.digest !== 'function'
  ) {
    return null
  }

  return globalThis.crypto
}

/** 使用 Web Crypto 对原始 info 字典字节计算 v1 SHA-1。 */
async function hashInfoBytes(
  metadata: TorrentMetadata,
): Promise<ToolResult<string>> {
  const cryptoApi = getWebCrypto()
  if (!cryptoApi) {
    return failure('crypto-unavailable', '当前浏览器不支持 Web Crypto，无法生成完整 Magnet。')
  }

  try {
    const digest = await cryptoApi.subtle.digest(
      'SHA-1',
      toArrayBuffer(metadata.infoBytes),
    )

    return success(bytesToHex(new Uint8Array(digest)))
  } catch {
    return failure('crypto-unavailable', 'Torrent info-hash 计算失败，未生成不完整 Magnet。')
  }
}

/** 读取本地 Torrent 文件、严格解析 v1 并生成 Magnet。 */
export async function readTorrentFile(
  file: File,
): Promise<ToolResult<TorrentAnalysis>> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return failure('operation-failed', '当前浏览器不支持读取 Torrent 文件。')
  }

  if (file.size > TORRENT_MAX_FILE_BYTES) {
    return failure('out-of-range', 'Torrent 文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return failure('operation-failed', 'Torrent 文件读取失败，请重新选择文件。')
  }

  if (bytes.byteLength > TORRENT_MAX_FILE_BYTES) {
    return failure('out-of-range', 'Torrent 文件超过 10 MiB 大小限制，请选择更小的文件。')
  }

  const parsed = parseTorrent(bytes)
  if (!parsed.ok) {
    return parsed
  }

  const infoHash = await hashInfoBytes(parsed.value)
  if (!infoHash.ok) {
    return infoHash
  }

  const magnet = createTorrentMagnet(parsed.value, infoHash.value)
  if (!magnet.ok) {
    return magnet
  }

  return success({
    ...parsed.value,
    fileName: file.name,
    byteLength: bytes.byteLength,
    infoHashHex: infoHash.value,
    magnet: magnet.value,
  })
}

/** 复制当前 Torrent Magnet，并将浏览器反馈转换为工具错误协议。 */
export async function copyTorrentMagnet(
  magnet: string,
): Promise<ToolResult<string>> {
  const copied = await copyText(magnet)
  return copied.ok
    ? success(copied.message)
    : failure('operation-failed', copied.message)
}

/** 下载当前 Torrent Magnet 文本。 */
export function downloadTorrentMagnet(
  magnet: string,
): ToolResult<string> {
  const downloaded = downloadText(
    magnet,
    createDownloadFileName('torrent-magnet', 'txt'),
  )

  return downloaded.ok
    ? success(downloaded.message)
    : failure('operation-failed', downloaded.message)
}
