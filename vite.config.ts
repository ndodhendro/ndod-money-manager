import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path is relative so the built app works regardless of the GitHub Pages
// repo sub-path (e.g. https://user.github.io/repo-name/) without extra config.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'pwa-192.png', 'pwa-512.png', 'maskable-512.png'],
      manifest: {
        name: 'Money Manager',
        short_name: 'Money Manager',
        description:
          'Pencatatan pemasukan & pengeluaran rumah tangga, kolaboratif untuk suami dan istri.',
        theme_color: '#10b981',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Tambah Pengeluaran',
            short_name: 'Pengeluaran',
            url: './#/',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Tambah Pemasukan',
            short_name: 'Pemasukan',
            url: './#/?type=income',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // Cache hanya app shell (JS/CSS/HTML/asset statis). Data Supabase tetap
        // network-only sesuai keputusan online-only, supaya data selalu terbaru.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
