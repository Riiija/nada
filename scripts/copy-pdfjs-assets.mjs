// Copie les polices standard, les CMaps et les modules wasm de pdf.js dans public/pdfjs.
// Servis par l'application elle-même (CSP `default-src 'self'`, usage hors ligne).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'pdfjs-dist')
const target = join(root, 'public', 'pdfjs')

if (!existsSync(source)) {
  console.warn('pdfjs-dist introuvable : copie ignorée.')
  process.exit(0)
}
mkdirSync(target, { recursive: true })
for (const dir of ['standard_fonts', 'cmaps', 'wasm', 'iccs']) {
  if (existsSync(join(source, dir))) cpSync(join(source, dir), join(target, dir), { recursive: true })
}
console.log('Ressources pdf.js copiées dans public/pdfjs.')
