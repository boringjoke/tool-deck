import { computed } from 'vue'
import { normalizeSiteUrl, resolveSiteUrl, toAbsoluteSiteUrl } from '~/utils/site-url'

interface PublicSeoOptions {
  title: string
  description: string
  pathname: string
}

/** 根据工具页面信息设置公开页面的 SEO 元数据。 */
export function usePublicSeo(options: PublicSeoOptions) {
  const config = useRuntimeConfig()
  const requestUrl = useRequestURL()
  const configuredSiteUrl = normalizeSiteUrl(config.public.siteUrl)
  const siteUrl = resolveSiteUrl(configuredSiteUrl, requestUrl.origin)
  const canonicalUrl = computed(() => toAbsoluteSiteUrl(siteUrl, options.pathname))

  useSeoMeta({
    title: options.title,
    description: options.description,
    ogTitle: options.title,
    ogDescription: options.description,
    ogType: 'website',
    ogUrl: canonicalUrl,
    ogSiteName: 'Tool Deck',
    ogLocale: 'zh_CN',
    twitterCard: 'summary',
    robots: 'index, follow',
  })

  useHead({
    link: [
      {
        rel: 'canonical',
        href: canonicalUrl,
      },
    ],
  })

  return {
    canonicalUrl,
    siteUrl,
    siteUrlConfigured: Boolean(configuredSiteUrl),
  }
}
