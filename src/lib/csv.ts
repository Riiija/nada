/**
 * CSV pour Excel en français : UTF-8 avec BOM, séparateur « ; », fins de ligne Windows.
 * Les cellules qui commenceraient une formule (=, +, -, @) sont neutralisées : un export ne
 * doit jamais exécuter de code à l'ouverture.
 */
const BOM = String.fromCharCode(0xfeff)

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) text = `'${text}`
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
}
