import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/mealy/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mealy',
        short_name: 'Mealy',
        description: 'Your shared week of good food',
        theme_color: '#f7f1e7',
        background_color: '#f7f1e7',
        display: 'standalone',
        start_url: '/mealy/',
        scope: '/mealy/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Never put OAuth responses or private Supabase data into a shared cache.
        navigateFallbackDenylist: [/[?&](code|error|error_description)=/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})
