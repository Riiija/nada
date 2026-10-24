const numberFormat = new Intl.NumberFormat('fr-FR')

export function formatNumber(value: number): string {
  // Intl insère une espace insécable fine : on la normalise pour le copier-coller.
  return numberFormat.format(value).replace(/[\u202f\u00a0]/g, ' ')
}

/** « 2026-10-24 » devient « 24/10/2026 ». Une valeur vide donne un tiret. */
export function formatDate(value: string | undefined): string {
  if (!value) return '–'
  const [y, m, d] = value.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '–'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}
