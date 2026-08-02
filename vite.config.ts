import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path is relative so the built app works regardless of the GitHub Pages
// repo sub-path (e.g. https://user.github.io/repo-name/) without extra config.
export default defineConfig({
  base: './',
  server: {
    // Bind IPv4 all-interfaces so phones on the same Wi-Fi can open the LAN URL.
    host: '0.0.0.0',
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-32.png', 'pwa-192.png', 'pwa-512.png', 'maskable-512.png'],
      manifest: {
        name: 'Ndod Budget',
        short_name: 'Ndod Budget',
        description:
          'Household income & expense tracking, collaborative for couples.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
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
            name: 'Add Expense',
            short_name: 'Expense',
            url: './#/tambah',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Add Income',
            short_name: 'Income',
            url: './#/tambah?type=income',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // Cache hanya app shell (JS/CSS/HTML/asset statis). Data Supabase tetap
        // network-only sesuai keputusan online-only, supaya data selalu terbaru.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      // Jangan aktifkan SW di localhost — sering bikin HP stuck di bundle lama.
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
