// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-charts',
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    experimental: {
      openAPI: true
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        'striptags',
        '@ai-sdk/vue',
        'ai',
        '@vueuse/core',
      ],
      noDiscovery: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  runtimeConfig: {
    nextjsApiUrl: process.env.NEXTJS_API_URL || 'http://localhost:3000'
  },

  devServer: {
    port: 3002
  }
})
