import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

/** En-têtes de sécurité de vercel.json, repris par `vite preview` : les tests tournent sous la même CSP qu'en production. */
function securityHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  return Object.fromEntries((config.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]))
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Le service worker ne se met pas à jour tout seul : l'utilisateur choisit le moment (message « Nouvelle version disponible »).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Courrier et archives',
        short_name: 'Courrier',
        description: 'Gestion des courriers et archivage, avec lecture OCR. Fonctionne hors ligne.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Application, moteur OCR (worker, noyau wasm, modèles) et ressources de pdf.js : tout est disponible hors ligne.
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff,woff2,gz,webmanifest,wasm,bcmap,pfb,ttf,icc,json}'],
        globIgnores: ['**/*.map'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  preview: { headers: securityHeaders() },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts?(x)'],
    globals: false,
  },
})
