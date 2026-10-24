/** Montants : entiers en centimes en base, format `1 750 000` (fr-FR) à l'écran. */

const NBSP = /[\u202f\u00a0\s]/g

/**
 * Saisie d'un montant en unités (« 1 750 000 », « 1750000,50 », « 12.5 ») vers des centimes.
 * Retourne null si le texte n'est pas un montant valide ; un champ vide vaut zéro.
 */
export function parseMoney(text: string): number | null {
  const clean = text.replace(NBSP, '').replace(',', '.')
  if (clean === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number.parseFloat(clean) * 100)
}

/** Centimes vers la valeur de saisie (« 1750000,5 »), pour préremplir un formulaire. */
export function moneyToInput(cents: number | undefined): string {
  if (!cents) return ''
  const units = cents / 100
  return Number.isInteger(units) ? String(units) : units.toFixed(2).replace('.', ',')
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** « 1 750 000 », avec deux décimales seulement s'il y a des centimes. Espaces ordinaires, faciles à copier. */
export function formatMoney(cents: number): string {
  const formatter = cents % 100 === 0 ? integer : decimal
  return formatter.format(cents / 100).replace(/[\u202f\u00a0]/g, ' ')
}

export function formatMoneyWithCurrency(cents: number, currency?: string): string {
  return currency ? `${formatMoney(cents)} ${currency}` : formatMoney(cents)
}
