import Dexie, { type EntityTable, type Table } from 'dexie'
import { emitChange, type ChangeKind } from './changes'
import type {
  AppNotification,
  AuditEntry,
  Counter,
  Department,
  DocumentLink,
  DocumentPage,
  DocumentRecord,
  LedgerEntry,
  Lookup,
  Mail,
  Official,
  Partner,
  RegisterRecord,
  SearchIndexRow,
  Setting,
  Staff,
  StoredFile,
  Thumbnail,
  User,
} from './types'

export class GedDatabase extends Dexie {
  users!: EntityTable<User, 'id'>
  departments!: EntityTable<Department, 'id'>
  staff!: EntityTable<Staff, 'id'>
  partners!: EntityTable<Partner, 'id'>
  officials!: EntityTable<Official, 'id'>
  lookups!: EntityTable<Lookup, 'id'>
  mails!: EntityTable<Mail, 'id'>
  documents!: EntityTable<DocumentRecord, 'id'>
  files!: EntityTable<StoredFile, 'documentId'>
  thumbnails!: EntityTable<Thumbnail, 'documentId'>
  documentPages!: Table<DocumentPage, [string, number]>
  documentLinks!: Table<DocumentLink, [string, string, string]>
  decrees!: EntityTable<RegisterRecord, 'id'>
  ministerialOrders!: EntityTable<RegisterRecord, 'id'>
  serviceNotes!: EntityTable<RegisterRecord, 'id'>
  incomingInvoices!: EntityTable<RegisterRecord, 'id'>
  ledgerEntries!: EntityTable<LedgerEntry, 'id'>
  counters!: Table<Counter, [string, number]>
  notifications!: EntityTable<AppNotification, 'id'>
  auditLog!: EntityTable<AuditEntry, 'seq'>
  settings!: EntityTable<Setting, 'key'>
  searchIndex!: EntityTable<SearchIndexRow, 'key'>

  constructor(name = 'ged') {
    super(name)
    // Toute évolution du schéma passe par une nouvelle db.version(n) avec migration.
    // Écart avec DOMAIN.md §4 : index `reference` sur mails (recherche par préfixe,
    // FEATURES.md §4) et `staffId` sur users (lien compte / collaborateur).
    this.version(1).stores({
      users: 'id, &username, role, isActive, staffId',
      departments: 'id, name, isActive',
      staff: 'id, fullName, departmentId, isActive',
      partners: 'id, name, kind, isActive',
      officials: 'id, kind, fullName, isActive',
      lookups: 'id, category, &[category+label], isActive',
      mails:
        'id, &[flow+year+seq], [flow+mailDate], [flow+isProcessed], reference, mailDate, assignedStaffId, signedByStaffId, sourcePartnerId, departmentId, createdAt',
      documents: 'id, sha256, category, ocrStatus, archivedAt, createdAt, title',
      files: 'documentId',
      thumbnails: 'documentId',
      documentPages: '[documentId+pageNumber], documentId',
      documentLinks: '[documentId+entityType+entityId], documentId, [entityType+entityId]',
      decrees: 'id, &[year+seq], signedOn, officialId',
      ministerialOrders: 'id, &[year+seq], signedOn, officialId, departmentId',
      serviceNotes: 'id, &[year+seq], issuedOn, departmentId',
      incomingInvoices: 'id, &[year+seq], receivedOn, supplierPartnerId, status',
      ledgerEntries: 'id, operationDate, orderNumber, chequeNumber',
      counters: '[scope+year]',
      notifications: 'id, recipientUserId, [recipientUserId+readAt], createdAt',
      auditLog: '++seq, occurredAt, actorId, action, [entityType+entityId]',
      settings: 'key',
      searchIndex: 'key',
    })

    // Chaque écriture signale l'élément touché une fois réussie ; l'index de recherche s'y abonne.
    const track = (table: Table<unknown, unknown>, kind: ChangeKind, idOf: (key: unknown) => string) => {
      table.hook('creating', function (primKey) {
        this.onsuccess = (key) => emitChange(kind, idOf(key ?? primKey))
      })
      table.hook('updating', function (_modifications, primKey) {
        this.onsuccess = () => emitChange(kind, idOf(primKey))
      })
      table.hook('deleting', function (primKey) {
        this.onsuccess = () => emitChange(kind, idOf(primKey))
      })
    }
    const same = (key: unknown) => String(key)
    track(this.mails as Table<unknown, unknown>, 'mail', same)
    track(this.documents as Table<unknown, unknown>, 'document', same)
    track(this.documentPages as Table<unknown, unknown>, 'page', (key) => String((key as unknown[])[0]))
    for (const t of [this.departments, this.staff, this.partners]) track(t as Table<unknown, unknown>, 'reference', same)
  }
}

export const db = new GedDatabase()
