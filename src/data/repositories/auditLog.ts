import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, dateInZone } from '@/lib/dates'
import { toCsv } from '@/lib/csv'
import { fold } from '@/lib/search/engine'
import { appendAudit, verifyAuditChain, type ChainVerification } from '../audit'
import { describeAudit, fieldLabel, formatChangeValue } from '../audit-labels'
import { db } from '../db'
import { requireRole, useSession, type CurrentUser } from '../session'
import type { AuditEntry } from '../types'
import { canSeeDocument } from './documents'
import { canSeeMail } from './mails'
import { getSettings } from './settings'

export interface ActionFamily {
  key: string
  label: string
  prefixes: string[]
}

export const ACTION_FAMILIES: ActionFamily[] = [
  { key: 'auth', label: 'Connexions', prefixes: ['auth.'] },
  { key: 'mail', label: 'Courriers', prefixes: ['mail.'] },
  { key: 'document', label: 'Documents', prefixes: ['document.'] },
  { key: 'registers', label: 'Actes et registres', prefixes: ['decree.', 'ministerialOrder.', 'serviceNote.', 'incomingInvoice.', 'ledgerEntry.'] },
  { key: 'reference', label: 'Référentiels', prefixes: ['referenceData.'] },
  { key: 'user', label: 'Comptes', prefixes: ['user.'] },
  { key: 'integrity', label: 'Exports et intégrité', prefixes: ['export.', 'audit.'] },
  { key: 'system', label: 'Sauvegarde et paramètres', prefixes: ['backup.', 'settings.', 'demo.', 'legacy.'] },
]

export interface EntityKind {
  key: string
  label: string
  entityTypes: string[]
}

const REFERENCE_TYPES = ['departments', 'staff', 'partners', 'headsOfState', 'ministers', 'mailTypes', 'followUps', 'positions']

export const ENTITY_KINDS: EntityKind[] = [
  { key: 'mail', label: 'Courriers', entityTypes: ['mail'] },
  { key: 'document', label: 'Documents', entityTypes: ['document'] },
  { key: 'register', label: 'Actes et registres', entityTypes: ['decrees', 'ministerialOrders', 'serviceNotes', 'incomingInvoices', 'ledgerEntries'] },
  { key: 'reference', label: 'Référentiels', entityTypes: REFERENCE_TYPES },
  { key: 'user', label: 'Comptes', entityTypes: ['user'] },
  { key: 'settings', label: 'Paramètres', entityTypes: ['settings'] },
]

export interface AuditFilters {
  actorId?: string
  family?: string
  entityKind?: string
  /** AAAA-MM-JJ */
  from?: string
  to?: string
  text?: string
}

/**
 * Qui voit quoi dans le journal (DOMAIN.md §3) : l'administrateur tout, l'archiviste tout sauf les
 * connexions, le lecteur ses actions et l'historique des éléments qu'il peut consulter.
 */
export async function canSeeAuditEntry(entry: AuditEntry, user: CurrentUser): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role === 'archivist') return !entry.action.startsWith('auth.')
  if (entry.actorId === user.id) return true
  if (entry.entityType === 'mail') {
    const mail = await db.mails.get(entry.entityId)
    return !!mail && canSeeMail(mail, user)
  }
  if (entry.entityType === 'document') {
    const doc = await db.documents.get(entry.entityId)
    return !!doc && (await canSeeDocument(doc, user))
  }
  return false
}

function plainChanges(entry: AuditEntry): string {
  return Object.entries(entry.changes ?? {})
    .map(([key, [from, to]]) => `${fieldLabel(key)} : ${formatChangeValue(key, from)} → ${formatChangeValue(key, to)}`)
    .join(' ; ')
}

function matchesSync(entry: AuditEntry, f: AuditFilters, tz: string, needle: string): boolean {
  if (f.actorId && entry.actorId !== f.actorId) return false
  if (f.family) {
    const family = ACTION_FAMILIES.find((x) => x.key === f.family)
    if (family && !family.prefixes.some((p) => entry.action.startsWith(p))) return false
  }
  if (f.entityKind) {
    const kind = ENTITY_KINDS.find((x) => x.key === f.entityKind)
    if (kind && !kind.entityTypes.includes(entry.entityType)) return false
  }
  if (f.from || f.to) {
    const day = dateInZone(entry.occurredAt, tz)
    if ((f.from && day < f.from) || (f.to && day > f.to)) return false
  }
  if (needle) {
    const haystack = fold([entry.actorName, entry.entityLabel, describeAudit(entry), plainChanges(entry), JSON.stringify(entry.metadata ?? {})].join(' '))
    if (!haystack.includes(needle)) return false
  }
  return true
}

const CHUNK = 1000
/** Au-delà, on arrête de compter : le total est alors affiché « au moins ». */
const COUNT_CAP = 20_000

export interface AuditPage {
  entries: AuditEntry[]
  total: number
  /** Vrai si d'autres entrées correspondent au-delà de ce qui est compté. */
  capped: boolean
}

/** Entrées visibles par l'utilisateur et correspondant aux filtres, les plus récentes d'abord. */
export async function searchAuditLog(user: CurrentUser, filters: AuditFilters, limit = 500): Promise<AuditPage> {
  const tz = (await getSettings()).timezone
  const needle = filters.text ? fold(filters.text.trim()) : ''
  const entries: AuditEntry[] = []
  let total = 0
  let capped = false
  const visibility = new Map<string, boolean>()

  const base = () => {
    // L'index sur la date réduit l'analyse ; les bornes sont élargies d'un jour (fuseau), le filtre exact suit.
    if (filters.from || filters.to) {
      const lower = filters.from ? `${addDays(filters.from, -1)}T00:00:00` : ''
      const upper = filters.to ? `${addDays(filters.to, 1)}T23:59:59.999Z` : '￿'
      return db.auditLog.where('occurredAt').between(lower, upper, true, true).reverse()
    }
    if (filters.actorId) return db.auditLog.where('actorId').equals(filters.actorId).reverse()
    return db.auditLog.orderBy('seq').reverse()
  }

  for (let offset = 0; !capped; offset += CHUNK) {
    const chunk = await base().offset(offset).limit(CHUNK).toArray()
    if (chunk.length === 0) break
    for (const entry of chunk) {
      if (!matchesSync(entry, filters, tz, needle)) continue
      const key = `${user.role}|${entry.action.startsWith('auth.')}|${entry.actorId === user.id}|${entry.entityType}|${entry.entityId}`
      let visible = visibility.get(key)
      if (visible === undefined) {
        visible = await canSeeAuditEntry(entry, user)
        visibility.set(key, visible)
      }
      if (!visible) continue
      if (total >= COUNT_CAP) {
        capped = true
        break
      }
      total++
      if (entries.length < limit) entries.push(entry)
    }
    if (chunk.length < CHUNK) break
  }
  // Un tri par date d'occurrence peut rompre l'ordre des numéros : on remet les plus récentes d'abord.
  entries.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
  return { entries, total, capped }
}

export function useAuditLog(filters: AuditFilters, limit = 500): AuditPage | undefined {
  const user = useSession().user
  const key = JSON.stringify(filters)
  return useLiveQuery(() => (user ? searchAuditLog(user, JSON.parse(key) as AuditFilters, limit) : { entries: [], total: 0, capped: false }), [key, limit, user?.id, user?.role, user?.staffId])
}

/**
 * Export CSV de ce que l'utilisateur voit avec les filtres courants. L'export est journalisé
 * (`audit.exported`) avant que le fichier ne soit remis.
 */
export async function exportAuditCsv(filters: AuditFilters): Promise<{ filename: string; csv: string; count: number }> {
  const user = requireRole('admin', 'archivist')
  const { entries } = await searchAuditLog(user, filters, Number.POSITIVE_INFINITY)
  const tz = (await getSettings()).timezone
  const formatter = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })
  const csv = toCsv(
    ['N°', 'Date et heure', 'Utilisateur', 'Rôle', 'Action', 'Élément', 'Modifications', 'Navigateur'],
    entries.map((e) => [e.seq, formatter.format(new Date(e.occurredAt)), e.actorName, e.actorRole ?? '', describeAudit(e), e.entityLabel, plainChanges(e), e.userAgent]),
  )
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, { action: 'audit.exported', entityType: 'audit', entityId: 'auditLog', entityLabel: 'Historique des opérations', metadata: { count: entries.length, filters } }),
  )
  return { filename: `historique-${new Date().toISOString().slice(0, 10)}.csv`, csv, count: entries.length }
}

/** « Vérifier l'intégrité » : recalcule toute la chaîne et journalise le résultat. Réservé à l'administrateur. */
export async function verifyAuditIntegrity(): Promise<ChainVerification> {
  requireRole('admin')
  const result = await verifyAuditChain()
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, {
      action: 'audit.verified',
      entityType: 'audit',
      entityId: 'auditLog',
      entityLabel: 'Historique des opérations',
      metadata: result.ok ? { ok: true, count: result.count } : { ok: false, count: result.count, firstInvalidSeq: result.firstInvalidSeq, reason: result.reason },
    }),
  )
  return result
}
