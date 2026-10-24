import type { Transaction } from 'dexie'
import { db } from './db'
import type { Counter, CounterScope } from './types'

export const DEFAULT_REFERENCE_FORMAT = '{n}/{yy}'

/** Année courante dans le fuseau horaire des paramètres. */
export function currentYear(timezone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).formatToParts(now)
  return Number(parts.find((p) => p.type === 'year')?.value)
}

export function formatReference(format: string, seq: number, year: number): string {
  return format.replaceAll('{n}', String(seq)).replaceAll('{yy}', String(year % 100).padStart(2, '0'))
}

/**
 * Attribue le numéro suivant. À appeler dans la transaction d'enregistrement (table
 * counters en écriture) : les transactions readwrite sur les mêmes tables sont sérialisées,
 * y compris entre onglets, donc pas de doublon possible.
 */
export async function nextSequence(tx: Transaction, scope: CounterScope, year: number): Promise<number> {
  const table = tx.table<Counter, [string, number]>('counters')
  const row = await table.get([scope, year])
  const lastSeq = (row?.lastSeq ?? 0) + 1
  await table.put({ scope, year, lastSeq })
  return lastSeq
}

/** Import de l'historique : recale le compteur au maximum des numéros d'origine. */
export async function raiseCounterTo(tx: Transaction, scope: CounterScope, year: number, min: number) {
  const table = tx.table<Counter, [string, number]>('counters')
  const row = await table.get([scope, year])
  if ((row?.lastSeq ?? 0) < min) await table.put({ scope, year, lastSeq: min })
}

/** Aperçu « N° attribué à l'enregistrement » : non réservé. */
export async function peekNextSequence(scope: CounterScope, year: number): Promise<number> {
  const row = await db.counters.get([scope, year])
  return (row?.lastSeq ?? 0) + 1
}
