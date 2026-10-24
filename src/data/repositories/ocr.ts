import { liveQuery } from 'dexie'
import { appendAudit } from '../audit'
import { db } from '../db'
import { ValidationError } from '../errors'
import { requireRole } from '../session'
import type { DocumentRecord } from '../types'
import { getSettings } from './settings'

export interface OcrPageResult {
  pageNumber: number
  text: string
  /** 0 à 100. Absent pour un texte natif. */
  confidence?: number
}

export interface OcrResult {
  pages: OcrPageResult[]
  source: 'nativeText' | 'tesseract'
  language: string
  /** Confiance moyenne des pages lues par Tesseract, 0 à 100. */
  confidence?: number
  durationMs: number
}

export interface OcrJob {
  id: string
  title: string
  kind: DocumentRecord['kind']
  rotation: DocumentRecord['rotation']
  languages: string
}

const label = (title: string) => `Document : ${title}`

/** Documents à lire ou interrompus en cours de lecture, les plus anciens d'abord. Se met à jour en direct. */
export function observePendingOcr(onChange: (ids: string[]) => void): () => void {
  const subscription = liveQuery(async () => {
    const rows = await db.documents.where('ocrStatus').anyOf('pending', 'processing').toArray()
    return rows.filter((d) => !d.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((d) => d.id)
  }).subscribe({ next: onChange, error: () => undefined })
  return () => subscription.unsubscribe()
}

/** Au démarrage du moteur : une lecture interrompue (onglet fermé) redevient « en attente ». */
export async function resetInterruptedOcr(): Promise<void> {
  requireRole('admin', 'archivist')
  await db.documents.where('ocrStatus').equals('processing').modify({ ocrStatus: 'pending' })
}

/** Réserve un document pour la lecture. Retourne undefined s'il n'est plus à lire. */
export async function claimOcr(id: string): Promise<OcrJob | undefined> {
  requireRole('admin', 'archivist')
  const languages = (await getSettings()).ocrLanguages
  return db.transaction('rw', db.documents, async () => {
    const doc = await db.documents.get(id)
    if (!doc || doc.deletedAt || (doc.ocrStatus !== 'pending' && doc.ocrStatus !== 'processing')) return undefined
    await db.documents.update(id, { ocrStatus: 'processing' })
    return { id, title: doc.title, kind: doc.kind, rotation: doc.rotation, languages }
  })
}

/**
 * Le moteur lit le fichier lui-même : ce n'est pas une remise à l'interface (pas de `blob:`),
 * le résultat est journalisé par `document.ocrCompleted`.
 */
export async function readFileForOcr(id: string): Promise<Blob> {
  requireRole('admin', 'archivist')
  const file = await db.files.get(id)
  if (!file) throw new ValidationError('Le fichier de ce document est introuvable dans ce navigateur.')
  return file.blob
}

/** Texte par page, document, statut et journal : tout ou rien. */
export async function saveOcrResult(id: string, result: OcrResult): Promise<void> {
  requireRole('admin', 'archivist')
  await db.transaction('rw', [db.documents, db.documentPages, db.auditLog], async (tx) => {
    const doc = await db.documents.get(id)
    if (!doc || doc.deletedAt) throw new ValidationError("Ce document n'existe plus.")
    await db.documentPages.where('documentId').equals(id).delete()
    await db.documentPages.bulkAdd(result.pages.map((p) => ({ documentId: id, pageNumber: p.pageNumber, text: p.text, confidence: p.confidence })))
    await db.documents.update(id, {
      ocrStatus: 'done',
      ocrSource: result.source,
      ocrLanguage: result.language || undefined,
      ocrConfidence: result.confidence,
      ocrCompletedAt: new Date().toISOString(),
      contentText: result.pages.map((p) => p.text).join('\n\n'),
    })
    await appendAudit(tx, {
      action: 'document.ocrCompleted',
      entityType: 'document',
      entityId: id,
      entityLabel: label(doc.title),
      metadata: { pages: result.pages.length, source: result.source, confidence: result.confidence, durationMs: result.durationMs },
    })
  })
}

export async function failOcr(id: string, reason: string): Promise<void> {
  requireRole('admin', 'archivist')
  await db.transaction('rw', [db.documents, db.auditLog], async (tx) => {
    const doc = await db.documents.get(id)
    if (!doc) return
    await db.documents.update(id, { ocrStatus: 'failed' })
    await appendAudit(tx, { action: 'document.ocrFailed', entityType: 'document', entityId: id, entityLabel: label(doc.title), metadata: { reason } })
  })
}

/** Annulation : le document redevient « en attente » et sera repris au prochain lancement. */
export async function releaseOcr(id: string): Promise<void> {
  requireRole('admin', 'archivist')
  await db.documents.where('id').equals(id).filter((d) => d.ocrStatus === 'processing').modify({ ocrStatus: 'pending' })
}

/** « Relancer la lecture », unitaire ou groupée. Les documents supprimés sont ignorés. */
export async function requeueOcr(ids: string[]): Promise<number> {
  requireRole('admin', 'archivist')
  let count = 0
  await db.transaction('rw', db.documents, async () => {
    for (const id of ids) {
      const doc = await db.documents.get(id)
      if (!doc || doc.deletedAt || doc.ocrStatus === 'pending' || doc.ocrStatus === 'processing') continue
      await db.documents.update(id, { ocrStatus: 'pending' })
      count++
    }
  })
  return count
}
