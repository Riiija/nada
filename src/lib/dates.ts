/** Dates métier : chaînes AAAA-MM-JJ, calculées dans le fuseau des paramètres. */

export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Nombre de jours entiers entre deux dates (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return new Date(toUtc(value)).toISOString().slice(0, 10) === value
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

/** Jour AAAA-MM-JJ d'un horodatage ISO, dans un fuseau donné. Le formateur est réutilisé : appelé sur des milliers d'entrées. */
export function dateInZone(iso: string, timeZone: string): string {
  let formatter = zoneFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    zoneFormatters.set(timeZone, formatter)
  }
  return formatter.format(new Date(iso))
}
