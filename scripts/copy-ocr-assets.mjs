// Copie le moteur Tesseract (worker, noyau wasm) et les modèles de langue dans public/ocr.
// Tout est servi par l'application elle-même : l'OCR fonctionne hors ligne et sous la CSP stricte.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = join(root, 'node_modules')
const target = join(root, 'public', 'ocr')

const worker = join(modules, 'tesseract.js', 'dist', 'worker.min.js')
const core = join(modules, 'tesseract.js-core')
if (!existsSync(worker) || !existsSync(core)) {
  console.warn('tesseract.js introuvable : copie ignorée.')
  process.exit(0)
}

mkdirSync(join(target, 'core'), { recursive: true })
mkdirSync(join(target, 'lang'), { recursive: true })
cpSync(worker, join(target, 'worker.min.js'))

// Variantes LSTM avec le wasm embarqué (.wasm.js) : le navigateur charge celle que son processeur gère.
for (const file of readdirSync(core)) {
  if (file.endsWith('-lstm.wasm.js')) cpSync(join(core, file), join(target, 'core', file))
}

for (const lang of ['fra', 'ara']) {
  const model = join(modules, '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`)
  if (existsSync(model)) cpSync(model, join(target, 'lang', `${lang}.traineddata.gz`))
}
console.log('Moteur et modèles OCR copiés dans public/ocr.')
