const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * 规范化公开站点地址，拒绝非 HTTP(S) 协议和携带凭据的地址。
 * 查询参数和 fragment 不属于站点根地址，统一移除。
 */
export function normalizeSiteUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  try {
    const url = new URL(value.trim())

    if (!SUPPORTED_PROTOCOLS.has(url.protocol) || url.username || url.password) {
      return ''
    }

    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '')

    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

/**
 * 生产环境优先使用 NUXT_PUBLIC_SITE_URL；未配置时仅使用当前请求地址，方便本地验证。
 */
export function resolveSiteUrl(configured: unknown, requestOrigin: unknown): string {
  return normalizeSiteUrl(configured) || normalizeSiteUrl(requestOrigin)
}

/** 将站点地址和路径组合为绝对 URL。 */
export function toAbsoluteSiteUrl(siteUrl: string, pathname: string): string {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl)

  if (!normalizedSiteUrl) {
    return ''
  }

  const baseUrl = new URL(`${normalizedSiteUrl}/`)
  const normalizedPath = pathname.trim().replace(/^\/+/, '')

  return normalizedPath ? new URL(normalizedPath, baseUrl).toString() : baseUrl.toString()
}
