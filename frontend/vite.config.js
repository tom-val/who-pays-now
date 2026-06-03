import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// API base is injected at build time (set by CI from a Terraform output).
// Falls back to the local backend for `npm run dev`.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Who Pays Now',
        short_name: 'Who Pays',
        description: "Whose turn is it to pay? Track payment turns by category with your crew.",
        theme_color: '#7c5cff',
        background_color: '#fbfaf6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never cache API calls — turn state must always be fresh.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-shell' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
})
