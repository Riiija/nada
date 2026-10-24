import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { appendAudit, diffChanges } from '../audit'
import { db } from '../db'
import { PermissionError, ValidationError } from '../errors'
import { importSchema, type ImportMeta } from '../schemas/document'
import { requireRole, requireUser, useSession, type CurrentUser } from '../session'
import type { AuditAction, DocumentLink, DocumentPage, DocumentRecord, LinkEntityType } from '../types'
import { canSeeMail } from './mails'

export type ImportFileMeta = Omit<ImportMeta, 'category' | 'archivedAt'>

export interface ImportInput {
  /** Le fichier d'origine, jamais modifié. */
  blob: Blob
  /** Miniature WebP calculée hors transaction. */
  thumbnail?: Blob
  meta: ImportFileMeta
  category: ImportMeta['category']
  /** Date d'archivage AAAA-MM-JJ. */
  archivedAt: string
  link?: { entityType: LinkEntityType; entityId: string }
}

export type ImportResult =
  | { status: 'saved'; id: string; sameNameCount: number }
  | { status: 'duplicate'; existingId: string; existingTitle: string }

const docLabel = (title: string) => `Document : ${title}`

/** Tables des registres rattachables, par type d'élément. */
const REGISTER_TABLES = {
  decree: 'decrees',
  ministerialOrder: 'ministerialOrders',
  serviceNote: 'serviceNotes',
  incomingInvoice: 'incomingInvoices',
  ledgerEntry: 'ledgerEntries',
} as const

/** Tables lues par les transactions qui rattachent ou détachent un document. */
const LINK_TABLES = () => [db.mails, db.decrees, db.ministerialOrders, db.serviceNotes, db.incomingInvoices, db.ledgerEntries]

/** Libellé et route de la fiche de chaque registre, pour les « éléments liés » d'un document. */
const REGISTER_LINKS = {
  decree: { label: 'Décret', slug: 'decrets' },
  ministerialOrder: { label: 'Arrêté', slug: 'arretes' },
  serviceNote: { label: 'Note de service', slug: 'notes-de-service' },
  incomingInvoice: { label: 'Facture', slug: 'factures' },
  ledgerEntry: { label: 'Écriture du journal', slug: 'journal-operations' },
} as const

export interface LinkTarget {
  /** « 12/26 : Visite du musée », pour le journal. */
  label: string
  confidentiality: 'normal' | 'restricted'
}

async function assertCanLink(entityType: LinkEntityType, entityId: string, user: CurrentUser): Promise<LinkTarget> {
  if (entityType === 'mail') {
    const mail = await db.mails.get(entityId)
    if (!mail || mail.deletedAt || !canSeeMail(mail, user)) throw new ValidationError("Ce courrier n'existe plus.")
    return { label: `${mail.reference} : ${mail.subject}`, confidentiality: mail.confidentiality }
  }
  const row = (await db.table(REGISTER_TABLES[entityType]).get(entityId)) as Record<string, unknown> | undefined
  if (!row || row.deletedAt) throw new ValidationError("Cet élément n'existe plus.")
  return { label: String(row.reference ?? row.label ?? entityId), confidentiality: 'normal' }
}

/** Un document restreint se voit s'il a été créé par soi, ou s'il est rattaché à un courrier qu'on peut voir. */
export async function canSeeDocument(doc: DocumentRecord, user: CurrentUser): Promise<boolean> {
  if (doc.deletedAt) return false
  if (doc.confidentiality !== 'restricted' || user.role === 'admin' || doc.createdBy === user.id) return true
  const links = await db.documentLinks.where('documentId').equals(doc.id).toArray()
  for (const link of links) {
    if (link.entityType !== 'mail') continue
    const mail = await db.mails.get(link.entityId)
    if (mail && !mail.deletedAt && canSeeMail(mail, user)) return true
  }
  return false
}

export async function findDuplicate(sha256: string): Promise<{ id: string; title: string } | undefined> {
  requireUser()
  const existing = await db.documents.where('sha256').equals(sha256).filter((d) => !d.deletedAt).first()
  return existing ? { id: existing.id, title: existing.title } : undefined
}

/**
 * Enregistre un document importé : métadonnées, fichier, miniature, lien éventuel et journal
 * dans une seule transaction. Le fichier est déjà lu, haché et analysé : rien d'asynchrone
 * hors Dexie ici. Un doublon (même empreinte, quel que soit le nom) n'écrit que la trace du refus.
 */
export async function saveImportedDocument(input: ImportInput): Promise<ImportResult> {
  const user = requireRole('admin', 'archivist')
  const parsed = importSchema.safeParse({ ...input.meta, category: input.category, archivedAt: input.archivedAt })
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Données invalides.')
  const meta = parsed.data
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  return db.transaction('rw', [db.documents, db.files, db.thumbnails, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const existing = await db.documents.where('sha256').equals(meta.sha256).filter((d) => !d.deletedAt).first()
    if (existing) {
      await appendAudit(tx, {
        action: 'document.duplicateRejected',
        entityType: 'document',
        entityId: existing.id,
        entityLabel: docLabel(existing.title),
        metadata: { originalFilename: meta.originalFilename },
      })
      return { status: 'duplicate', existingId: existing.id, existingTitle: existing.title } as const
    }

    const target = input.link ? await assertCanLink(input.link.entityType, input.link.entityId, user) : undefined
    const doc: DocumentRecord = {
      id,
      category: meta.category,
      title: meta.title,
      originalFilename: meta.originalFilename,
      kind: meta.kind,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      sha256: meta.sha256,
      pageCount: meta.pageCount,
      width: meta.width,
      height: meta.height,
      rotation: 0,
      ocrStatus: 'pending',
      archivedAt: meta.archivedAt,
      confidentiality: target?.confidentiality === 'restricted' ? 'restricted' : 'normal',
      createdAt: now,
      createdBy: user.id,
      updatedAt: now,
      updatedBy: user.id,
    }
    const sameNameCount = await db.documents.filter((d) => !d.deletedAt && d.originalFilename === meta.originalFilename).count()
    await db.documents.add(doc)
    await db.files.add({ documentId: id, blob: input.blob })
    if (input.thumbnail) await db.thumbnails.add({ documentId: id, blob: input.thumbnail })
    await appendAudit(tx, {
      action: 'document.imported',
      entityType: 'document',
      entityId: id,
      entityLabel: docLabel(doc.title),
      metadata: { sizeBytes: doc.sizeBytes, pages: doc.pageCount, category: doc.category, sha256: doc.sha256 },
    })
    if (input.link) {
      await db.documentLinks.add({ documentId: id, ...input.link, linkedBy: user.id, linkedAt: now })
      await appendAudit(tx, {
        action: 'document.linked',
        entityType: 'document',
        entityId: id,
        entityLabel: docLabel(doc.title),
        metadata: { ...input.link, target: target?.label },
      })
    }
    return { status: 'saved', id, sameNameCount } as const
  })
}

/** Rattache des documents déjà archivés à un élément (« Choisir dans les archives »). */
export async function linkDocuments(documentIds: string[], entityType: LinkEntityType, entityId: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.documents, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const target = await assertCanLink(entityType, entityId, user)
    const now = new Date().toISOString()
    for (const documentId of documentIds) {
      const doc = await db.documents.get(documentId)
      if (!doc || !(await canSeeDocument(doc, user))) throw new ValidationError("Ce document n'existe plus.")
      if (await db.documentLinks.get([documentId, entityType, entityId])) continue
      const link: DocumentLink = { documentId, entityType, entityId, linkedBy: user.id, linkedAt: now }
      await db.documentLinks.add(link)
      await appendAudit(tx, {
        action: 'document.linked',
        entityType: 'document',
        entityId: documentId,
        entityLabel: docLabel(doc.title),
        metadata: { entityType, entityId, target: target.label },
      })
    }
  })
}

export async function unlinkDocument(documentId: string, entityType: LinkEntityType, entityId: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.documents, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const target = await assertCanLink(entityType, entityId, user)
    const doc = await db.documents.get(documentId)
    if (!doc || !(await db.documentLinks.get([documentId, entityType, entityId]))) throw new ValidationError("Ce document n'est pas rattaché.")
    await db.documentLinks.delete([documentId, entityType, entityId])
    await appendAudit(tx, {
      action: 'document.unlinked',
      entityType: 'document',
      entityId: documentId,
      entityLabel: docLabel(doc.title),
      metadata: { entityType, entityId, target: target.label },
    })
  })
}

async function listDocuments(user: CurrentUser): Promise<DocumentRecord[]> {
  const rows = await db.documents.toArray()
  const visible: DocumentRecord[] = []
  for (const doc of rows) if (await canSeeDocument(doc, user)) visible.push(doc)
  return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Documents visibles par l'utilisateur, les plus récents d'abord. Ne charge jamais les fichiers. */
export function useDocuments(): DocumentRecord[] | undefined {
  const user = useSession().user
  return useLiveQuery(() => (user ? listDocuments(user) : []), [user?.id, user?.role, user?.staffId])
}

export function useDocumentsForEntity(entityType: LinkEntityType, entityId: string | undefined): DocumentRecord[] | undefined {
  const user = useSession().user
  return useLiveQuery(async () => {
    if (!user || !entityId) return []
    const links = await db.documentLinks.where('[entityType+entityId]').equals([entityType, entityId]).toArray()
    const docs: DocumentRecord[] = []
    for (const link of links) {
      const doc = await db.documents.get(link.documentId)
      if (doc && (await canSeeDocument(doc, user))) docs.push(doc)
    }
    return docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [entityType, entityId, user?.id, user?.role, user?.staffId])
}

/** Miniature d'un document sous forme d'URL `blob:`, révoquée au démontage du composant. */
export function useThumbnailUrl(documentId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!documentId) return
    let alive = true
    let created: string | undefined
    void db.thumbnails.get(documentId).then((row) => {
      if (!alive || !row) return
      created = URL.createObjectURL(row.blob)
      setUrl(created)
    })
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
      setUrl(undefined)
    }
  }, [documentId])
  return url
}

/** Le fichier n'est remis à l'interface qu'après la trace de son accès, dans la même transaction. */
async function accessDocument(id: string, action: Extract<AuditAction, 'document.viewed' | 'document.downloaded' | 'document.printed'>) {
  const user = requireUser()
  return db.transaction('rw', [db.documents, db.files, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const doc = await db.documents.get(id)
    if (!doc || !(await canSeeDocument(doc, user))) throw new ValidationError("Ce document n'existe plus ou vous n'avez pas le droit de le consulter.")
    const file = await db.files.get(id)
    if (!file) throw new ValidationError('Le fichier de ce document est introuvable dans ce navigateur.')
    await appendAudit(tx, { action, entityType: 'document', entityId: id, entityLabel: docLabel(doc.title) })
    return { doc, blob: file.blob }
  })
}

/** Ouvre un document dans la visionneuse : journalise `document.viewed`, puis rend le fichier. */
export const openDocument = (id: string) => accessDocument(id, 'document.viewed')
export const downloadDocument = (id: string) => accessDocument(id, 'document.downloaded')
export const printDocument = (id: string) => accessDocument(id, 'document.printed')

export function useDocument(id: string | undefined): DocumentRecord | null | undefined {
  const user = useSession().user
  return useLiveQuery(async () => {
    if (!id || !user) return null
    const doc = await db.documents.get(id)
    return doc && (await canSeeDocument(doc, user)) ? doc : null
  }, [id, user?.id, user?.role, user?.staffId])
}

async function editableDocument(id: string) {
  const user = requireRole('admin', 'archivist')
  const doc = await db.documents.get(id)
  if (!doc || !(await canSeeDocument(doc, user))) throw new ValidationError("Ce document n'existe plus.")
  return { user, doc }
}

export async function updateDocumentTitle(id: string, title: string): Promise<void> {
  const next = title.trim()
  if (!next) throw new ValidationError('Le titre du document est vide.')
  await db.transaction('rw', [db.documents, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const { user, doc } = await editableDocument(id)
    const changes = diffChanges({ title: doc.title }, { title: next })
    if (Object.keys(changes).length === 0) return
    await db.documents.update(id, { title: next, updatedAt: new Date().toISOString(), updatedBy: user.id })
    await appendAudit(tx, { action: 'document.updated', entityType: 'document', entityId: id, entityLabel: docLabel(next), changes })
  })
}

/** Rotation d'affichage d'une image, par quarts de tour. Le fichier d'origine n'est jamais modifié. */
export async function rotateDocument(id: string, quarterTurns: 1 | -1): Promise<void> {
  await db.transaction('rw', [db.documents, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const { user, doc } = await editableDocument(id)
    if (doc.kind !== 'image') throw new ValidationError('Seules les images se pivotent.')
    const rotation = ((doc.rotation + 90 * quarterTurns + 360) % 360) as DocumentRecord['rotation']
    await db.documents.update(id, { rotation, updatedAt: new Date().toISOString(), updatedBy: user.id })
    await appendAudit(tx, {
      action: 'document.rotated',
      entityType: 'document',
      entityId: id,
      entityLabel: docLabel(doc.title),
      changes: { rotation: [doc.rotation, rotation] },
    })
  })
}

export async function deleteDocument(id: string): Promise<void> {
  await db.transaction('rw', [db.documents, db.documentLinks, ...LINK_TABLES(), db.auditLog], async (tx) => {
    const { user, doc } = await editableDocument(id)
    const now = new Date().toISOString()
    await db.documents.update(id, { deletedAt: now, deletedBy: user.id, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, { action: 'document.deleted', entityType: 'document', entityId: id, entityLabel: docLabel(doc.title) })
  })
}

/** Restauration : l'admin, ou l'archiviste qui vient de supprimer (bouton « Annuler »). */
export async function restoreDocument(id: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.documents, db.auditLog], async (tx) => {
    const doc = await db.documents.get(id)
    if (!doc || !doc.deletedAt) throw new ValidationError("Ce document n'est pas supprimé.")
    if (user.role !== 'admin' && doc.deletedBy !== user.id) throw new PermissionError()
    const now = new Date().toISOString()
    await db.documents.update(id, { deletedAt: undefined, deletedBy: undefined, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, { action: 'document.restored', entityType: 'document', entityId: id, entityLabel: docLabel(doc.title) })
  })
}

/** Texte lu par page (rempli par la lecture OCR). */
export function useDocumentPages(id: string | undefined): DocumentPage[] | undefined {
  return useLiveQuery(
    async () => (id ? (await db.documentPages.where('documentId').equals(id).toArray()).sort((a, b) => a.pageNumber - b.pageNumber) : []),
    [id],
  )
}

export interface LinkedItem {
  entityType: LinkEntityType
  entityId: string
  label: string
  to: string
}

/** Éléments auxquels le document est rattaché, ceux que l'utilisateur peut voir. */
export function useLinkedItems(documentId: string | undefined): LinkedItem[] | undefined {
  const user = useSession().user
  return useLiveQuery(async () => {
    if (!documentId || !user) return []
    const links = await db.documentLinks.where('documentId').equals(documentId).toArray()
    const items: LinkedItem[] = []
    for (const link of links) {
      if (link.entityType !== 'mail') {
        const row = (await db.table(REGISTER_TABLES[link.entityType]).get(link.entityId)) as Record<string, unknown> | undefined
        if (!row || row.deletedAt) continue
        const meta = REGISTER_LINKS[link.entityType]
        items.push({ entityType: link.entityType, entityId: link.entityId, label: `${meta.label} ${String(row.reference ?? row.label ?? '')}`.trim(), to: `/${meta.slug}/${link.entityId}` })
        continue
      }
      const mail = await db.mails.get(link.entityId)
      if (!mail || mail.deletedAt || !canSeeMail(mail, user)) continue
      const incoming = mail.flow === 'incoming'
      items.push({
        entityType: 'mail',
        entityId: mail.id,
        label: `${incoming ? 'Courrier arrivé' : 'Courrier départ'} ${mail.reference} : ${mail.subject}`,
        to: `/courriers/${incoming ? 'arrives' : 'departs'}/${mail.id}`,
      })
    }
    return items
  }, [documentId, user?.id, user?.role, user?.staffId])
}
