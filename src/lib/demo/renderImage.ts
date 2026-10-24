import type { ImageSpec } from '@/data/seed/types'

/**
 * Dessine une page de courrier « scannée » : papier clair, en-tête, texte, ligne de signature et
 * légère rotation. Sert aux données de démonstration, pour essayer la lecture OCR sur de vraies images.
 */
export async function renderImage(spec: ImageSpec): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f4f4f1'
  ctx.fillRect(0, 0, spec.width, spec.height)
  ctx.save()
  ctx.translate(spec.width / 2, spec.height / 2)
  ctx.rotate(((spec.tilt ?? 0) * Math.PI) / 180)
  ctx.translate(-spec.width / 2, -spec.height / 2)

  // Feuille
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(40, 40, spec.width - 80, spec.height - 80)
  ctx.fillStyle = '#111111'
  ctx.textBaseline = 'alphabetic'

  const margin = 130
  let y = 190
  for (const line of spec.lines) {
    ctx.font = `${line.bold ? '700' : '400'} ${line.size}px Arial, Helvetica, sans-serif`
    const words = line.text.split(' ')
    const rows: string[] = []
    let current = ''
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word
      if (ctx.measureText(attempt).width > spec.width - margin * 2 && current) {
        rows.push(current)
        current = word
      } else {
        current = attempt
      }
    }
    if (current) rows.push(current)
    for (const row of rows) {
      const width = ctx.measureText(row).width
      const x = line.align === 'center' ? (spec.width - width) / 2 : line.align === 'right' ? spec.width - margin - width : margin
      ctx.fillText(row, x, y)
      y += line.size * 1.45
    }
    y += line.gap ?? 20
    if (line.bold) {
      ctx.fillRect(margin, y - (line.gap ?? 20) + 4, spec.width - margin * 2, 3)
      y += 40
    }
  }

  // Signature manuscrite
  ctx.strokeStyle = '#1f2a5a'
  ctx.lineWidth = 3
  ctx.beginPath()
  const sx = spec.width - 520
  const sy = Math.min(y + 120, spec.height - 260)
  ctx.moveTo(sx, sy)
  for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(sx + i * 38 - 20, sy - 50 + (i % 2) * 90, sx + i * 38, sy + 10 * Math.sin(i))
  ctx.stroke()
  ctx.restore()

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Le rendu de la page a échoué.'))), spec.format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.82)
  })
}
