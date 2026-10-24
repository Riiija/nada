import { useLiveQuery } from 'dexie-react-hooks'
import type { ZodType } from 'zod'
import { formatDate } from '@/lib/format'
import { appendAudit, diffChanges } from '../audit'
import { labelChanges } from '../changeLabels'
import { currentYear, formatReference, nextSequence, peekNextSequence } from '../counters'
import { db } from '../db'
import { PermissionError, ValidationError } from '../errors'
import { decreeSchema, incomingInvoiceSchema, ledgerEntrySchema, ministerialOrderSchema, serviceNoteSchema } from '../schemas/registers'
import { requireRole } from '../session'
import type { CounterScope, LinkEntityType } from '../types'
import { getSettings, referenceFormatFor } from './settings'

export type RegisterType = 'decrees' | 'ministerialOrders' | 'serviceNotes' | 'incomingInvoices' | 'ledgerEntries'

export interface RegisterRow {
  id: string
  /** Absents du journal des opérations, qui n'est pas numéroté. */
  year?: number
  seq?: number
  reference?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  deletedAt?: string
  deletedBy?: string
  [field: string]: unknown
}

interface Definition {
  schema: ZodType
  /** Registre numéroté : séquence propre, remise à 1 chaque année. */
  scope?: CounterScope
  /** Type d'élément pour le rattachement de documents et les actions du journal. */
  entity: LinkEntityType
  noun: string
  /** Champ de date utilisé pour trier et filtrer par période. */
  dateField: string
  label: (row: RegisterRow) => string
}

const text = (row: RegisterRow, field: string) => String(row[field] ?? '')

export const registerDefinitions: Record<RegisterType, Definition> = {
  decrees: { schema: decreeSchema, scope: 'decree', entity: 'decree', noun: 'Décret', dateField: 'signedOn', label: (r) => `Décret ${r.reference} : ${text(r, 'subject')}` },
  ministerialOrders: {
    schema: ministerialOrderSchema,
    scope: 'ministerialOrder',
    entity: 'ministerialOrder',
    noun: 'Arrêté',
    dateField: 'signedOn',
    label: (r) => `Arrêté ${r.reference} : ${text(r, 'subject')}`,
  },
  serviceNotes: {
    schema: serviceNoteSchema,
    scope: 'serviceNote',
    entity: 'serviceNote',
    noun: 'Note de service',
    dateField: 'issuedOn',
    label: (r) => `Note de service ${r.reference} : ${text(r, 'subject')}`,
  },
  incomingInvoices: {
    schema: incomingInvoiceSchema,
    scope: 'incomingInvoice',
    entity: 'incomingInvoice',
    noun: 'Facture',
    dateField: 'receivedOn',
    label: (r) => `Facture ${r.reference}${r.invoiceNumber ? ` (n° ${text(r, 'invoiceNumber')})` : ''}`,
  },
  ledgerEntries: {
    schema: ledgerEntrySchema,
    entity: 'ledgerEntry',
    noun: 'Écriture du journal',
    dateField: 'operationDate',
    label: (r) => `Écriture du ${formatDate(text(r, 'operationDate'))} : ${text(r, 'label')}`,
  },
}

const table = (type: RegisterType) => db.table<RegisterRow, string>(type)

/** Tables lues pour résoudre les libellés du journal (signataire, direction, fournisseur…). */
const LABEL_TABLES = () => [db.officials, db.departments, db.partners, db.staff]

function parse(type: RegisterType, input: unknown): Record<string, unknown> {
  const result = registerDefinitions[type].schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Données invalides.')
  return result.data as Record<string, unknown>
}

/** Enregistre un acte ou une écriture. Les registres numérotés reçoivent leur numéro dans la même transaction. */
export async function createRegisterEntry(type: RegisterType, input: unknown): Promise<{ id: string; reference?: string }> {
  const user = requireRole('admin', 'archivist')
  const def = registerDefinitions[type]
  const data = parse(type, input)
  const settings = await getSettings()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  let reference: string | undefined

  await db.transaction('rw', [table(type), db.counters, db.auditLog], async (tx) => {
    const base = { id, ...data, createdAt: now, createdBy: user.id, updatedAt: now, updatedBy: user.id }
    let row: RegisterRow
    if (def.scope) {
      const year = currentYear(settings.timezone)
      const seq = await nextSequence(tx, def.scope, year)
      reference = formatReference(referenceFormatFor(settings, def.scope), seq, year)
      row = { ...base, year, seq, reference }
    } else {
      row = base
    }
    await table(type).add(row)
    await appendAudit(tx, { action: `${def.entity}.created`, entityType: type, entityId: id, entityLabel: def.label(row) })
  })
  return { id, reference }
}

export async function updateRegisterEntry(type: RegisterType, id: string, input: unknown): Promise<void> {
  const user = requireRole('admin', 'archivist')
  const def = registerDefinitions[type]
  const data = parse(type, input)
  await db.transaction('rw', [table(type), ...LABEL_TABLES(), db.auditLog], async (tx) => {
    const before = await table(type).get(id)
    if (!before || before.deletedAt) throw new ValidationError("Cet élément n'existe plus.")
    const after = { ...before, ...data } as RegisterRow
    const changes = diffChanges(before, after)
    if (Object.keys(changes).length === 0) return
    await table(type).put({ ...after, updatedAt: new Date().toISOString(), updatedBy: user.id })
    await appendAudit(tx, { action: `${def.entity}.updated`, entityType: type, entityId: id, entityLabel: def.label(after), changes: await labelChanges(tx, changes) })
  })
}

/** Suppression logique : le numéro n'est jamais réutilisé. */
export async function deleteRegisterEntry(type: RegisterType, id: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  const def = registerDefinitions[type]
  await db.transaction('rw', [table(type), db.auditLog], async (tx) => {
    const row = await table(type).get(id)
    if (!row || row.deletedAt) throw new ValidationError("Cet élément n'existe plus.")
    const now = new Date().toISOString()
    await table(type).update(id, { deletedAt: now, deletedBy: user.id, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, { action: `${def.entity}.deleted`, entityType: type, entityId: id, entityLabel: def.label(row) })
  })
}

/** Restauration : l'administrateur, ou l'archiviste qui vient de supprimer (bouton « Annuler »). */
export async function restoreRegisterEntry(type: RegisterType, id: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  const def = registerDefinitions[type]
  await db.transaction('rw', [table(type), db.auditLog], async (tx) => {
    const row = await table(type).get(id)
    if (!row || !row.deletedAt) throw new ValidationError("Cet élément n'est pas supprimé.")
    if (user.role !== 'admin' && row.deletedBy !== user.id) throw new PermissionError()
    await table(type).update(id, { deletedAt: undefined, deletedBy: undefined, updatedAt: new Date().toISOString(), updatedBy: user.id })
    await appendAudit(tx, { action: `${def.entity}.restored`, entityType: type, entityId: id, entityLabel: def.label(row) })
  })
}

/** Éléments d'un registre, les plus récents d'abord (date de l'acte, puis numéro). */
export async function listRegisterEntries(type: RegisterType): Promise<RegisterRow[]> {
  const { dateField } = registerDefinitions[type]
  const rows = (await table(type).toArray()).filter((r) => !r.deletedAt)
  return rows.sort((a, b) => text(b, dateField).localeCompare(text(a, dateField)) || (b.seq ?? 0) - (a.seq ?? 0) || b.createdAt.localeCompare(a.createdAt))
}

export function useRegisterEntries(type: RegisterType): RegisterRow[] | undefined {
  return useLiveQuery(() => listRegisterEntries(type), [type])
}

export function useRegisterEntry(type: RegisterType, id: string | undefined): RegisterRow | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const row = await table(type).get(id)
    return row && !row.deletedAt ? row : null
  }, [type, id])
}

export interface LedgerTotals {
  debit: number
  credit: number
  balance: number
}

/** Totaux débit, crédit et solde (crédit moins débit) d'une série d'écritures, en centimes. */
export function ledgerTotals(rows: Record<string, unknown>[]): LedgerTotals {
  const debit = rows.reduce((sum, r) => sum + Number(r.debit ?? 0), 0)
  const credit = rows.reduce((sum, r) => sum + Number(r.credit ?? 0), 0)
  return { debit, credit, balance: credit - debit }
}

/**
 * Solde cumulé après chaque écriture, dans l'ordre chronologique (date puis ordre d'enregistrement).
 * Calculé à l'affichage, jamais stocké.
 */
export function runningBalances(rows: RegisterRow[]): Map<string, number> {
  const ordered = [...rows].sort((a, b) => text(a, 'operationDate').localeCompare(text(b, 'operationDate')) || a.createdAt.localeCompare(b.createdAt))
  const balances = new Map<string, number>()
  let balance = 0
  for (const r of ordered) {
    balance += Number(r.credit ?? 0) - Number(r.debit ?? 0)
    balances.set(r.id, balance)
  }
  return balances
}

/** Aperçu du numéro « attribué à l'enregistrement » : non réservé, absent des registres sans numérotation. */
export function useNextRegisterReference(type: RegisterType): string | undefined {
  return useLiveQuery(async () => {
    const scope = registerDefinitions[type].scope
    if (!scope) return undefined
    const settings = await getSettings()
    const year = currentYear(settings.timezone)
    return formatReference(referenceFormatFor(settings, scope), await peekNextSequence(scope, year), year)
  }, [type])
}
