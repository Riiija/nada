import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { Transaction } from 'dexie'
import { db } from './db'
import { getActor, type Actor } from './session'
import type { AuditAction, AuditEntry } from './types'

export const GENESIS_HASH = '0'.repeat(64)

export interface AuditInput {
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel: string
  changes?: Record<string, [unknown, unknown]>
  metadata?: Record<string, unknown>
}

/** JSON canonique : clés triées, valeurs `undefined` ignorées. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
  return `{${entries.join(',')}}`
}

type HashedFields = Omit<AuditEntry, 'seq' | 'hash'>

export function computeAuditHash(entry: HashedFields): string {
  return bytesToHex(sha256(utf8ToBytes(entry.prevHash + canonicalJson(entry))))
}

/**
 * Ajoute une entrée au journal chaîné. À appeler DANS la transaction de l'action métier
 * (qui doit inclure la table auditLog). Synchrone côté hachage : crypto.subtle clôturerait
 * la transaction. L'auteur vient toujours de la session ; `actor` n'est utilisé que par la
 * couche d'authentification pour les cas où la session n'existe pas encore.
 */
export async function appendAudit(tx: Transaction, input: AuditInput, actor?: Actor): Promise<AuditEntry> {
  const who = actor ?? getActor()
  const table = tx.table<AuditEntry, number>('auditLog')
  const last = await table.orderBy(':id').last()
  const fields: HashedFields = {
    occurredAt: new Date().toISOString(),
    actorId: who.id,
    actorName: who.name,
    actorRole: who.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    changes: input.changes,
    metadata: input.metadata,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    prevHash: last?.hash ?? GENESIS_HASH,
  }
  const entry: AuditEntry = { ...fields, hash: computeAuditHash(fields) }
  entry.seq = await table.add(entry)
  return entry
}

/** Diff des seules propriétés modifiées ; `contentText` est remplacé par sa longueur. */
export function diffChanges<T extends object>(before: T, after: T): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {}
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (canonicalJson(b[key]) === canonicalJson(a[key])) continue
    out[key] =
      key === 'contentText'
        ? [typeof b[key] === 'string' ? (b[key] as string).length : 0, typeof a[key] === 'string' ? (a[key] as string).length : 0]
        : [b[key], a[key]]
  }
  return out
}

export type ChainVerification =
  | { ok: true; count: number }
  | { ok: false; count: number; firstInvalidSeq: number; reason: string }

/** Recalcule toute la chaîne et signale la première entrée incohérente. */
export async function verifyAuditChain(): Promise<ChainVerification> {
  let count = 0
  let prevHash = GENESIS_HASH
  let failure: { seq: number; reason: string } | null = null

  await db.auditLog.orderBy('seq').until(() => failure !== null).each((entry) => {
    const seq = entry.seq ?? -1
    if (entry.prevHash !== prevHash) {
      failure = { seq, reason: 'Le lien avec l’entrée précédente est rompu (entrée supprimée ou modifiée).' }
      return
    }
    const { seq: _seq, hash, ...fields } = entry
    void _seq
    if (computeAuditHash(fields) !== hash) {
      failure = { seq, reason: 'Le contenu de l’entrée a été modifié.' }
      return
    }
    prevHash = hash
    count++
  })

  return failure
    ? { ok: false, count, firstInvalidSeq: (failure as { seq: number }).seq, reason: (failure as { reason: string }).reason }
    : { ok: true, count }
}

/** Même contrôle que `verifyAuditChain`, sur des entrées déjà en mémoire (sauvegarde à restaurer). */
export function verifyAuditEntries(entries: AuditEntry[]): ChainVerification & { lastHash: string } {
  let prevHash = GENESIS_HASH
  let count = 0
  for (const entry of [...entries].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const seq = entry.seq ?? -1
    if (entry.prevHash !== prevHash) {
      return { ok: false, count, firstInvalidSeq: seq, reason: 'Le lien avec l’entrée précédente est rompu (entrée supprimée ou modifiée).', lastHash: prevHash }
    }
    const { seq: _seq, hash, ...fields } = entry
    void _seq
    if (computeAuditHash(fields) !== hash) {
      return { ok: false, count, firstInvalidSeq: seq, reason: 'Le contenu de l’entrée a été modifié.', lastHash: prevHash }
    }
    prevHash = hash
    count++
  }
  return { ok: true, count, lastHash: prevHash }
}

export interface BatchAuditInput extends AuditInput {
  /** Horodatage d'origine (ISO) : les données de démonstration racontent une année d'activité. */
  at: string
  actor: Actor
}

/**
 * Ajoute d'un coup une série d'entrées, triées par date, à la suite de la chaîne. Réservé au
 * chargement des données de démonstration : l'usage normal est `appendAudit`, une entrée par action.
 */
export async function appendAuditBatch(tx: Transaction, inputs: BatchAuditInput[]): Promise<void> {
  const table = tx.table<AuditEntry, number>('auditLog')
  const last = await table.orderBy(':id').last()
  let prevHash = last?.hash ?? GENESIS_HASH
  const entries: AuditEntry[] = [...inputs]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((input) => {
      const fields: HashedFields = {
        occurredAt: input.at,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        changes: input.changes,
        metadata: input.metadata,
        userAgent: 'Données de démonstration',
        prevHash,
      }
      const hash = computeAuditHash(fields)
      prevHash = hash
      return { ...fields, hash }
    })
  await table.bulkAdd(entries)
}
