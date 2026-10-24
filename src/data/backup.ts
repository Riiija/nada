import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { todayIn } from '@/lib/dates'
import { appendAudit, verifyAuditChain, verifyAuditEntries } from './audit'
import { db } from './db'
import { AppError, ValidationError } from './errors'
import { getSettings } from './repositories/settings'
import { requireRole } from './session'
import type { AuditEntry, DocumentRecord } from './types'

/** Tables sauvegardées en JSON. Les fichiers sont à part ; miniatures et index de recherche sont régénérés. */
export const BACKUP_TABLES = [
  'users',
  'departments',
  'staff',
  'partners',
  'officials',
  'lookups',
  'mails',
  'documents',
  'documentPages',
  'documentLinks',
  'decrees',
  'ministerialOrders',
  'serviceNotes',
  'incomingInvoices',
  'ledgerEntries',
  'counters',
  'notifications',
  'auditLog',
  'settings',
] as const
type BackupTable = (typeof BACKUP_TABLES)[number]

export const BACKUP_FORMAT = 'ged-backup'

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  formatVersion: 1
  appVersion: string
  schemaVersion: number
  createdAt: string
  organizationName: string
  counts: Record<BackupTable, number>
  files: { count: number; bytes: number }
  audit: { count: number; lastSeq: number; lastHash: string }
}

export interface BackupProgress {
  step: 'verify' | 'data' | 'files' | 'check' | 'copy' | 'replace' | 'finish'
  label: string
  done: number
  total: number
}

/** Destination d'une sauvegarde : fichier choisi par l'utilisateur ou mémoire. */
export interface BackupSink {
  write(chunk: Uint8Array): Promise<void> | void
  close(): Promise<void> | void
  abort?(): Promise<void> | void
}

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const noProgress = () => undefined

export function backupFilename(timeZone: string, now = new Date()) {
  return `sauvegarde-ged-${todayIn(timeZone, now)}.zip`
}

/**
 * Sauvegarde complète en zip, écrite en flux : manifeste, journal, tables en JSON, puis les fichiers
 * d'origine un à un (jamais tous en mémoire). La chaîne d'audit est vérifiée d'abord ; `backup.exported`
 * est journalisé avant l'écriture, de sorte que la sauvegarde contient sa propre trace.
 */
export async function createBackup(sink: BackupSink, options: { onProgress?: (p: BackupProgress) => void; force?: boolean } = {}) {
  requireRole('admin')
  const report = options.onProgress ?? noProgress

  report({ step: 'verify', label: 'Vérification de l’intégrité de l’historique', done: 0, total: 1 })
  const chain = await verifyAuditChain()
  if (!chain.ok && !options.force) {
    throw new AppError(
      'audit-chain',
      `L’historique est altéré à l’entrée n° ${chain.firstInvalidSeq}. ${chain.reason} Sauvegardez quand même pour ne rien perdre, puis faites vérifier cette base.`,
    )
  }

  const documentCount = await db.documents.count()
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, {
      action: 'backup.exported',
      entityType: 'backup',
      entityId: 'backup',
      entityLabel: 'Sauvegarde complète',
      metadata: { documents: documentCount, chainIntact: chain.ok },
    }),
  )

  report({ step: 'data', label: 'Enregistrement des données', done: 0, total: BACKUP_TABLES.length })
  const settings = await getSettings()
  const tables = {} as Record<BackupTable, unknown[]>
  for (const [i, name] of BACKUP_TABLES.entries()) {
    tables[name] = await db.table(name).toArray()
    report({ step: 'data', label: 'Enregistrement des données', done: i + 1, total: BACKUP_TABLES.length })
  }
  const audit = tables.auditLog as AuditEntry[]
  const last = audit.reduce((a, b) => ((b.seq ?? 0) > (a.seq ?? 0) ? b : a))
  const documents = tables.documents as DocumentRecord[]

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    appVersion: __APP_VERSION__,
    schemaVersion: db.verno,
    createdAt: new Date().toISOString(),
    organizationName: settings.organizationName,
    counts: Object.fromEntries(BACKUP_TABLES.map((t) => [t, tables[t].length])) as Record<BackupTable, number>,
    files: { count: documents.length, bytes: documents.reduce((sum, d) => sum + d.sizeBytes, 0) },
    audit: { count: audit.length, lastSeq: last.seq ?? 0, lastHash: last.hash },
  }

  // Écriture en flux : les morceaux du zip partent vers la destination au fil de l'eau.
  let written = Promise.resolve()
  let bytes = 0
  let failure: unknown
  const zip = new Zip((error, chunk) => {
    if (error) {
      failure = error
      return
    }
    bytes += chunk.length
    written = written.then(() => sink.write(chunk))
  })

  try {
    const addJson = (name: string, data: unknown) => {
      const entry = new ZipDeflate(name, { level: 6 })
      zip.add(entry)
      entry.push(encoder.encode(JSON.stringify(data)), true)
    }
    addJson('manifest.json', manifest)
    addJson('data/auditLog.json', tables.auditLog)
    for (const name of BACKUP_TABLES) if (name !== 'auditLog') addJson(`data/${name}.json`, tables[name])

    // Les PDF et images sont déjà compressés : on les stocke tels quels.
    for (const [i, doc] of documents.entries()) {
      report({ step: 'files', label: 'Ajout des fichiers', done: i, total: documents.length })
      const stored = await db.files.get(doc.id)
      if (!stored) throw new ValidationError(`Le fichier du document « ${doc.title} » est introuvable dans ce navigateur.`)
      const entry = new ZipPassThrough(`files/${doc.id}.${EXTENSIONS[doc.mimeType] ?? 'bin'}`)
      zip.add(entry)
      const reader = stored.blob.stream().getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        entry.push(value, false)
      }
      entry.push(new Uint8Array(0), true)
      await written
      if (failure) throw failure
    }
    report({ step: 'finish', label: 'Finalisation', done: 1, total: 1 })
    zip.end()
    await written
    if (failure) throw failure
    await sink.close()
  } catch (error) {
    zip.terminate()
    await sink.abort?.()
    throw error
  }

  await db.settings.put({ key: 'lastBackupAt', value: manifest.createdAt })
  return { manifest, bytes, filename: backupFilename(settings.timezone) }
}

/** Destination en mémoire : le zip est rendu en Blob (navigateurs sans sélecteur de fichier). */
export function memorySink() {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  return {
    write: (chunk: Uint8Array) => void chunks.push(new Uint8Array(chunk)),
    close: () => undefined,
    blob: () => new Blob(chunks, { type: 'application/zip' }),
  } satisfies BackupSink & { blob: () => Blob }
}

type EntryHandler = (chunk: Uint8Array, final: boolean) => void

/** Lit un zip en flux. `onEntry` renvoie le récepteur d'un fichier, `stop` interrompt la lecture. */
async function scanZip(source: Blob, onEntry: (name: string) => EntryHandler, options: { stop?: () => boolean; onBytes?: (read: number) => void } = {}) {
  let failure: unknown
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  unzip.onfile = (file) => {
    const handler = onEntry(file.name)
    file.ondata = (error, data, final) => {
      if (error) failure = error
      else handler(data, final)
    }
    file.start()
  }
  const reader = source.stream().getReader()
  let read = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        unzip.push(new Uint8Array(0), true)
        break
      }
      unzip.push(value, false)
      read += value.length
      options.onBytes?.(read)
      if (failure) break
      if (options.stop?.()) break
    }
  } catch {
    throw new AppError('backup-format', 'Ce fichier n’est pas une sauvegarde valide : le zip est abîmé.')
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  if (failure) throw new AppError('backup-format', 'Ce fichier n’est pas une sauvegarde valide : le zip est abîmé.')
}

function collect(onDone: (bytes: Uint8Array) => void): EntryHandler {
  const parts: Uint8Array[] = []
  return (chunk, final) => {
    if (chunk.length) parts.push(chunk.slice())
    if (final) {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let offset = 0
      for (const p of parts) {
        all.set(p, offset)
        offset += p.length
      }
      onDone(all)
    }
  }
}

function parseJson<T>(bytes: Uint8Array, what: string): T {
  try {
    return JSON.parse(decoder.decode(bytes)) as T
  } catch {
    throw new AppError('backup-format', `La sauvegarde est abîmée : ${what} est illisible.`)
  }
}

function checkManifest(manifest: BackupManifest | undefined): BackupManifest {
  if (!manifest || manifest.format !== BACKUP_FORMAT) {
    throw new AppError('backup-format', 'Ce fichier n’est pas une sauvegarde de l’application.')
  }
  if (manifest.schemaVersion > db.verno) {
    throw new AppError('backup-version', 'Cette sauvegarde vient d’une version plus récente de l’application. Mettez l’application à jour avant de la restaurer.')
  }
  if (manifest.schemaVersion < db.verno) {
    throw new AppError('backup-version', 'Cette sauvegarde vient d’une version trop ancienne pour être restaurée directement.')
  }
  return manifest
}

export interface BackupPreview {
  manifest: BackupManifest
  /** Chaîne d'audit contenue dans la sauvegarde. */
  chainOk: boolean
  chainMessage?: string
}

/** Lit seulement le manifeste et le journal : aperçu avant restauration, sans toucher aux données. */
export async function inspectBackup(file: Blob): Promise<BackupPreview> {
  requireRole('admin')
  let manifest: BackupManifest | undefined
  let audit: AuditEntry[] | undefined
  await scanZip(
    file,
    (name) => {
      if (name === 'manifest.json') return collect((b) => (manifest = parseJson<BackupManifest>(b, 'le manifeste')))
      if (name === 'data/auditLog.json') return collect((b) => (audit = parseJson<AuditEntry[]>(b, 'le journal')))
      return () => undefined
    },
    { stop: () => !!manifest && !!audit },
  )
  const checked = checkManifest(manifest)
  if (!audit) throw new AppError('backup-format', 'La sauvegarde est incomplète : le journal est absent.')
  const chain = verifyAuditEntries(audit)
  const mismatch = chain.ok && chain.lastHash !== checked.audit.lastHash
  return {
    manifest: checked,
    chainOk: chain.ok && !mismatch,
    chainMessage: !chain.ok ? `Incohérence à l’entrée n° ${chain.firstInvalidSeq}. ${chain.reason}` : mismatch ? 'La dernière entrée du journal ne correspond pas au manifeste.' : undefined,
  }
}

interface Scanned {
  manifest: BackupManifest
  rows: Record<BackupTable, unknown[]>
  /** documentId → empreinte et taille réellement lues dans le zip */
  files: Map<string, { sha256: string; size: number }>
}

/** Passe 1 : lit tout le zip sans rien écrire et contrôle manifeste, journal, tables et empreintes des fichiers. */
async function validateBackup(file: Blob, report: (p: BackupProgress) => void): Promise<Scanned> {
  let manifest: BackupManifest | undefined
  const rows = {} as Record<BackupTable, unknown[]>
  const files = new Map<string, { sha256: string; size: number }>()

  await scanZip(
    file,
    (name) => {
      if (name === 'manifest.json') return collect((b) => (manifest = parseJson<BackupManifest>(b, 'le manifeste')))
      const table = /^data\/(.+)\.json$/.exec(name)?.[1] as BackupTable | undefined
      if (table && (BACKUP_TABLES as readonly string[]).includes(table)) {
        return collect((b) => {
          const parsed = parseJson<unknown>(b, `la table ${table}`)
          if (!Array.isArray(parsed)) throw new AppError('backup-format', `La sauvegarde est abîmée : la table ${table} est mal formée.`)
          rows[table] = parsed
        })
      }
      const id = /^files\/([^/.]+)\.[a-z0-9]+$/.exec(name)?.[1]
      if (id) {
        const hash = sha256.create()
        let size = 0
        return (chunk, final) => {
          hash.update(chunk)
          size += chunk.length
          if (final) files.set(id, { sha256: bytesToHex(hash.digest()), size })
        }
      }
      return () => undefined
    },
    { onBytes: (read) => report({ step: 'check', label: 'Vérification de la sauvegarde', done: read, total: file.size }) },
  )

  const checked = checkManifest(manifest)
  for (const name of BACKUP_TABLES) {
    if (!rows[name]) throw new AppError('backup-format', `La sauvegarde est incomplète : la table ${name} est absente.`)
    if (rows[name].length !== checked.counts[name]) {
      throw new AppError('backup-format', `La sauvegarde est abîmée : la table ${name} ne contient pas le nombre d’éléments annoncé.`)
    }
  }

  const chain = verifyAuditEntries(rows.auditLog as AuditEntry[])
  if (!chain.ok) {
    throw new AppError('backup-integrity', `L’historique de cette sauvegarde est altéré à l’entrée n° ${chain.firstInvalidSeq}. ${chain.reason} La restauration est refusée.`)
  }
  if (chain.lastHash !== checked.audit.lastHash) {
    throw new AppError('backup-integrity', 'La dernière entrée du journal ne correspond pas au manifeste. La restauration est refusée.')
  }

  const documents = rows.documents as DocumentRecord[]
  for (const doc of documents) {
    const found = files.get(doc.id)
    if (!found) throw new AppError('backup-integrity', `Le fichier du document « ${doc.title} » manque dans la sauvegarde.`)
    if (found.size !== doc.sizeBytes || found.sha256 !== doc.sha256) {
      throw new AppError('backup-integrity', `Le fichier du document « ${doc.title} » est abîmé : son empreinte ne correspond pas. La restauration est refusée.`)
    }
  }
  const known = new Set(documents.map((d) => d.id))
  for (const id of files.keys()) if (!known.has(id)) throw new AppError('backup-integrity', 'La sauvegarde contient un fichier qui ne correspond à aucun document.')

  return { manifest: checked, rows, files }
}

/** Supprime les fichiers qui n'appartiennent à aucun document (reste d'une restauration interrompue). */
export async function purgeOrphanFiles() {
  const known = new Set(await db.documents.toCollection().primaryKeys())
  const keys = await db.files.toCollection().primaryKeys()
  await db.files.bulkDelete(keys.filter((k) => !known.has(k)))
}

/**
 * Restaure une sauvegarde en remplaçant TOUTES les données.
 * 1. contrôle complet (journal, nombres, empreintes de chaque fichier) sans rien écrire ;
 * 2. copie des fichiers, un par un, sans toucher aux données ;
 * 3. remplacement des tables, de l'index et des miniatures en une seule transaction, qui ajoute
 *    `backup.restored` à la chaîne restaurée. Tout échec avant l'étape 3 laisse les données intactes.
 * Les miniatures et l'index sont à régénérer ensuite, et la session doit être rouverte.
 */
export async function restoreBackup(file: Blob, onProgress: (p: BackupProgress) => void = noProgress) {
  requireRole('admin')
  const { manifest, rows, files } = await validateBackup(file, onProgress)
  const documents = rows.documents as DocumentRecord[]
  const byId = new Map(documents.map((d) => [d.id, d]))

  try {
    let copied = 0
    const writes: Promise<void>[] = []
    await scanZip(
      file,
      (name) => {
        const id = /^files\/([^/.]+)\.[a-z0-9]+$/.exec(name)?.[1]
        if (!id || !files.has(id)) return () => undefined
        const parts: Uint8Array<ArrayBuffer>[] = []
        return (chunk, final) => {
          if (chunk.length) parts.push(new Uint8Array(chunk))
          if (!final) return
          const blob = new Blob(parts, { type: byId.get(id)?.mimeType })
          // Une transaction par fichier : jamais d'attente hors Dexie à l'intérieur.
          writes.push(
            db.files.put({ documentId: id, blob }).then(() => {
              copied++
              onProgress({ step: 'copy', label: 'Copie des fichiers', done: copied, total: documents.length })
            }),
          )
        }
      },
    )
    // Toutes les copies sont terminées avant de remplacer les données.
    await Promise.all(writes)
    if (copied < documents.length) throw new AppError('backup-integrity', 'La copie des fichiers n’a pas abouti. Les données n’ont pas été modifiées.')

    onProgress({ step: 'replace', label: 'Remplacement des données', done: 0, total: 1 })
    const stores = [...BACKUP_TABLES.map((t) => db.table(t)), db.files, db.thumbnails, db.searchIndex]
    await db.transaction('rw', stores, async (tx) => {
      for (const name of BACKUP_TABLES) {
        const table = db.table(name)
        await table.clear()
        let list = rows[name]
        if (name === 'documents') list = documents.map((d) => (d.ocrStatus === 'processing' ? { ...d, ocrStatus: 'pending' } : d))
        await table.bulkAdd(list)
      }
      await db.settings.put({ key: 'lastBackupAt', value: manifest.createdAt })
      await db.thumbnails.clear()
      await db.searchIndex.clear()
      const keep = new Set(byId.keys())
      const keys = await db.files.toCollection().primaryKeys()
      await db.files.bulkDelete(keys.filter((k) => !keep.has(k)))
      await appendAudit(tx, {
        action: 'backup.restored',
        entityType: 'backup',
        entityId: 'backup',
        entityLabel: `Sauvegarde du ${manifest.createdAt.slice(0, 10)}`,
        metadata: { createdAt: manifest.createdAt, appVersion: manifest.appVersion, mails: manifest.counts.mails, documents: manifest.counts.documents },
      })
    })
  } catch (error) {
    await purgeOrphanFiles().catch(() => undefined)
    throw error
  }
  onProgress({ step: 'finish', label: 'Restauration terminée', done: 1, total: 1 })
  return manifest
}

/**
 * Régénère les miniatures après une restauration. La préparation (rendu, canvas) est fournie par
 * l'appelant : cette couche ne touche pas au DOM.
 */
export async function rebuildThumbnails(
  prepare: (blob: Blob, kind: 'pdf' | 'image') => Promise<{ thumbnail?: Blob }>,
  onProgress: (p: BackupProgress) => void = noProgress,
) {
  requireRole('admin')
  const documents = await db.documents.toArray()
  for (const [i, doc] of documents.entries()) {
    onProgress({ step: 'finish', label: 'Régénération des miniatures', done: i, total: documents.length })
    const file = await db.files.get(doc.id)
    if (!file || doc.deletedAt) continue
    try {
      const { thumbnail } = await prepare(file.blob, doc.kind)
      if (thumbnail) await db.thumbnails.put({ documentId: doc.id, blob: thumbnail })
    } catch {
      // Une miniature manquante ne bloque pas la restauration.
    }
  }
  onProgress({ step: 'finish', label: 'Régénération des miniatures', done: documents.length, total: documents.length })
}
