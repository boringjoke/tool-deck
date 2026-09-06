import { getPublicRoutePaths } from './utils/public-routes'

const publicPrerenderRoutes = [
  ...getPublicRoutePaths(),
  '/sitemap.xml',
  '/robots.txt',
]

export default defineNuxtConfig({
  compatibilityDate: '2026-09-05',

  devtools: {
    enabled: false,
  },

  ssr: true,

  nitro: {
    prerender: {
      routes: publicPrerenderRoutes,
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      siteUrl: '',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
})
