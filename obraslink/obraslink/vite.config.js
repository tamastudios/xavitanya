import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/xavitanya/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'ObrasLink · Gestión de obras',
        short_name: 'ObrasLink',
        description: 'Fichajes, partes diarios, almacén y obras para tu empresa de reformas',
        lang: 'es',
        start_url: '/xavitanya/',
        display: 'standalone',
        background_color: '#F3F4F2',
        theme_color: '#1F2421',
        icons: [
          { src: '/xavitanya/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/xavitanya/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/xavitanya/pwa-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/xavitanya/index.html'
      }
    })
  ]
})
