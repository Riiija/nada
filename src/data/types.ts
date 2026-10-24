/** Types des tables IndexedDB (voir docs/DOMAIN.md §4). Booléens stockés en 0/1. */

export type Flag = 0 | 1
export type Role = 'admin' | 'archivist' | 'reader'
export type Confidentiality = 'normal' | 'restricted'

export interface Traceable {
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface SoftDeletable {
  deletedAt?: string
  deletedBy?: string
}

export interface User {
  id: string
  username: string
  fullName: string
  role: Role
  staffId?: string
  isActive: Flag
  passwordHash: string
  passwordSalt: string
  createdAt: string
  lastLoginAt?: string
}

export interface Department {
  id: string
  code?: string
  name: string
  isActive: Flag
}

export interface Staff {
  id: string
  fullName: string
  jobTitle?: string
  departmentId?: string
  email?: string
  isActive: Flag
}

export type PartnerKind =
  | 'presidency'
  | 'ministry'
  | 'publicBody'
  | 'internationalOrg'
  | 'company'
  | 'individual'
  | 'other'

export interface Partner {
  id: string
  name: string
  kind: PartnerKind
  isActive: Flag
}

export interface Official {
  id: string
  kind: 'headOfState' | 'minister'
  fullName: string
  title?: string
  termStart?: string
  termEnd?: string
  isActive: Flag
}

export type LookupCategory = 'mailType' | 'followUp' | 'position'

export interface Lookup {
  id: string
  category: LookupCategory
  label: string
  sortOrder: number
  isActive: Flag
}

export type MailFlow = 'incoming' | 'outgoing'

export interface Mail extends Traceable, SoftDeletable {
  id: string
  flow: MailFlow
  seq: number
  year: number
  reference: string
  mailDate: string
  subject: string
  departmentId?: string
  assignedStaffId?: string
  signedByStaffId?: string
  staffJobTitle?: string
  sourcePartnerId?: string
  recipientPartnerId?: string
  recipientLabel?: string
  mailTypeId?: string
  followUpId?: string
  positionId?: string
  fileNumber?: string
  isProcessed: Flag
  processedAt?: string
  confidentiality: Confidentiality
}

export type DocumentCategory =
  | 'mailAttachment'
  | 'archive'
  | 'decree'
  | 'ministerialOrder'
  | 'serviceNote'
  | 'invoice'
  | 'ledger'

export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface DocumentRecord extends Traceable, SoftDeletable {
  id: string
  category: DocumentCategory
  title: string
  originalFilename: string
  kind: 'pdf' | 'image'
  mimeType: string
  sizeBytes: number
  sha256: string
  pageCount: number
  width?: number
  height?: number
  rotation: 0 | 90 | 180 | 270
  ocrStatus: OcrStatus
  ocrSource?: 'nativeText' | 'tesseract'
  ocrLanguage?: string
  ocrConfidence?: number
  ocrCompletedAt?: string
  contentText?: string
  archivedAt: string
  confidentiality: Confidentiality
}

export interface StoredFile {
  documentId: string
  blob: Blob
}

export interface Thumbnail {
  documentId: string
  blob: Blob
}

export interface DocumentPage {
  documentId: string
  pageNumber: number
  text: string
  confidence?: number
}

export type LinkEntityType =
  | 'mail'
  | 'decree'
  | 'ministerialOrder'
  | 'serviceNote'
  | 'incomingInvoice'
  | 'ledgerEntry'

export interface DocumentLink {
  documentId: string
  entityType: LinkEntityType
  entityId: string
  linkedBy: string
  linkedAt: string
}

/**
 * Registres d'actes. Les champs complets sont « à valider avec le métier »
 * (DOMAIN.md §4) : seuls les champs indexés sont typés pour l'instant.
 */
export interface RegisterRecord extends Traceable, SoftDeletable {
  id: string
  year: number
  seq: number
  reference: string
  [field: string]: unknown
}

export interface LedgerEntry extends Traceable, SoftDeletable {
  id: string
  operationDate: string
  label: string
  orderNumber?: string
  chequeNumber?: string
  /** Centimes entiers. */
  debit: number
  credit: number
  observation?: string
}

export type CounterScope =
  | 'mailIncoming'
  | 'mailOutgoing'
  | 'decree'
  | 'ministerialOrder'
  | 'serviceNote'
  | 'incomingInvoice'

export interface Counter {
  scope: CounterScope
  year: number
  lastSeq: number
}

export interface AppNotification {
  id: string
  recipientUserId: string
  title: string
  entityType?: string
  entityId?: string
  readAt?: string
  createdAt: string
}

export interface Setting {
  key: string
  value: unknown
}

export interface SearchIndexRow {
  key: string
  value: unknown
}

export type AuditAction =
  | 'auth.signedIn'
  | 'auth.signedOut'
  | 'auth.signInFailed'
  | 'auth.locked'
  | 'auth.unlocked'
  | 'auth.passwordChanged'
  | 'mail.created'
  | 'mail.updated'
  | 'mail.processed'
  | 'mail.positionChanged'
  | 'mail.deleted'
  | 'mail.restored'
  | 'document.imported'
  | 'document.duplicateRejected'
  | 'document.ocrCompleted'
  | 'document.ocrFailed'
  | 'document.viewed'
  | 'document.downloaded'
  | 'document.printed'
  | 'document.linked'
  | 'document.unlinked'
  | 'document.updated'
  | 'document.rotated'
  | 'document.deleted'
  | 'document.restored'
  | `${'decree' | 'ministerialOrder' | 'serviceNote' | 'incomingInvoice' | 'ledgerEntry'}.${'created' | 'updated' | 'deleted' | 'restored'}`
  | 'referenceData.created'
  | 'referenceData.updated'
  | 'referenceData.deactivated'
  | 'user.created'
  | 'user.roleChanged'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.updated'
  | 'user.passwordReset'
  | 'export.generated'
  | 'audit.exported'
  | 'audit.verified'
  | 'backup.exported'
  | 'backup.restored'
  | 'settings.updated'
  | 'demo.loaded'
  | 'legacy.imported'

export interface AuditEntry {
  seq?: number
  occurredAt: string
  /** null : action sans utilisateur identifié (connexion refusée). */
  actorId: string | null
  actorName: string
  actorRole: Role | null
  action: AuditAction
  entityType: string
  entityId: string
  entityLabel: string
  changes?: Record<string, [unknown, unknown]>
  metadata?: Record<string, unknown>
  userAgent: string
  prevHash: string
  hash: string
}
