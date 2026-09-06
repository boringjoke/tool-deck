import { resolveSiteUrl, toAbsoluteSiteUrl } from '~/utils/site-url'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const requestUrl = getRequestURL(event)
  const siteUrl = resolveSiteUrl(config.public.siteUrl, requestUrl.origin)
  const sitemapUrl = toAbsoluteSiteUrl(siteUrl, '/sitemap.xml')

  setResponseHeader(event, 'content-type', 'text/plain; charset=UTF-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')

  return [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${sitemapUrl}`,
    '',
  ].join('\n')
})
