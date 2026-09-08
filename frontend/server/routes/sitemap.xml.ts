import { getPublicRoutePaths } from '~/utils/public-routes'
import { resolveSiteUrl, toAbsoluteSiteUrl } from '~/utils/site-url'

/** 转义 XML 文本中的特殊字符。 */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const requestUrl = getRequestURL(event)
  const siteUrl = resolveSiteUrl(config.public.siteUrl, requestUrl.origin)
  const urls = getPublicRoutePaths()
    .map((pathname) => toAbsoluteSiteUrl(siteUrl, pathname))
    .filter(Boolean)
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join('\n')

  setResponseHeader(event, 'content-type', 'application/xml; charset=UTF-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n')
})
