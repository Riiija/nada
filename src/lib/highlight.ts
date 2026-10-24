export interface Segment {
  text: string
  match: boolean
}

const fold = (char: string) => char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Découpe un texte autour des occurrences d'une recherche, sans tenir compte de la casse
 * ni des accents (« recouvrement » trouve « Recouvrément »).
 */
export function highlight(text: string, query: string): Segment[] {
  const needle = [...query.trim()].map(fold).join('')
  if (!needle) return [{ text, match: false }]

  // Texte normalisé caractère par caractère, avec la correspondance vers le texte d'origine.
  let folded = ''
  const origin: number[] = []
  let index = 0
  for (const char of text) {
    const f = fold(char)
    for (let i = 0; i < f.length; i++) origin.push(index)
    folded += f
    index += char.length
  }
  origin.push(index)

  const segments: Segment[] = []
  let cursor = 0
  let from = 0
  for (;;) {
    const hit = folded.indexOf(needle, from)
    if (hit === -1) break
    const start = origin[hit]!
    const end = origin[hit + needle.length]!
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
    from = hit + needle.length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })
  return segments.length ? segments : [{ text, match: false }]
}

export const hasArabic = (text: string) => /\p{Script=Arabic}/u.test(text)
