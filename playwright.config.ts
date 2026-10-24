import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // La lecture OCR et le hachage PBKDF2 sont gourmands : peu de parcours en parallèle.
  workers: 2,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', channel: 'msedge' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
