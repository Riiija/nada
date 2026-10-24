// @vitest-environment node
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { verifyAuditChain } from './audit'
import { BACKUP_TABLES, backupFilename, createBackup, inspectBackup, memorySink, rebuildThumbnails, restoreBackup, type BackupManifest, type BackupProgress } from './backup'
import { db } from './db'
import { AppError, PermissionError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { deleteDocument, saveImportedDocument, updateDocumentTitle } from './repositories/documents'
import { createMail } from './repositories/mails'
import { saveOcrResult } from './repositories/ocr'
import { saveReference } from './repositories/referenceData'
import { createUser } from './repositories/users'
import { resetSessionForTests } from './session'
import { sha256Stream } from '@/lib/import/hash'

let ids: { dept: string; staff: string; followUp: string; position: string }

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 contenu du premier document')
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9])

async function addDocument(title: string, bytes: Uint8Array, kind: 'pdf' | 'image', link?: string) {
  const blob = new Blob([bytes as BlobPart])
  const result = await saveImportedDocument({
    blob,
    thumbnail: new Blob(['miniature']),
    meta: {
      title, originalFilename: `${title}.${kind === 'pdf' ? 'pdf' : 'png'}`, kind, mimeType: kind === 'pdf' ? 'application/pdf' : 'image/png',
      sizeBytes: blob.size, sha256: await sha256Stream(blob), pageCount: 2,
    },
    category: 'archive',
    archivedAt: '2026-10-24',
    link: link ? { entityType: 'mail', entityId: link } : undefined,
  })
  if (result.status !== 'saved') throw new Error('attendu : saved')
  return result.id
}

const incoming = (subject: string) => ({
  mailDate: '2026-10-24', subject, departmentId: ids.dept, fileNumber: 'D1', followUpId: ids.followUp, positionId: ids.position, assignedStaffId: ids.staff,
})

let docA: string
let docB: string

async function populate() {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Ministère test', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  ids = {
    dept: await saveReference('departments', null, { name: 'Cabinet' }),
    staff: await saveReference('staff', null, { fullName: 'Karim Mansour' }),
    followUp: await saveReference('followUps', null, { label: 'Urgent' }),
    position: await saveReference('positions', null, { label: 'Au cabinet' }),
  }
  const mail = await createMail('incoming', incoming('Visite du musée'))
  await createMail('outgoing', { mailDate: '2026-10-24', subject: 'Réponse', signedByStaffId: ids.staff })
  docA = await addDocument('Fiche comptable', PDF_BYTES, 'pdf', mail.id)
  docB = await addDocument('Scan', PNG_BYTES, 'image')
  await saveOcrResult(docA, { pages: [{ pageNumber: 1, text: 'Recouvrement des prêts' }, { pageNumber: 2, text: 'Annexe' }], source: 'tesseract', language: 'fra', confidence: 90, durationMs: 10 })
}

async function backup(options: { force?: boolean; onProgress?: (p: BackupProgress) => void } = {}) {
  const sink = memorySink()
  const result = await createBackup(sink, options)
  return { ...result, blob: sink.blob() }
}

const unzip = async (blob: Blob) => unzipSync(new Uint8Array(await blob.arrayBuffer()))
const rezip = (files: Record<string, Uint8Array>) => new Blob([zipSync(files) as BlobPart])

beforeEach(populate)

describe('création de la sauvegarde', () => {
  it('produit un zip avec manifeste, tables, journal et fichiers d’origine, et se journalise', async () => {
    const progress: string[] = []
    const { manifest, blob, filename } = await backup({ onProgress: (p) => progress.push(p.step) })
    expect(filename).toMatch(/^sauvegarde-ged-\d{4}-\d{2}-\d{2}\.zip$/)
    expect(progress).toEqual(expect.arrayContaining(['verify', 'data', 'files', 'finish']))

    const files = await unzip(blob)
    const names = Object.keys(files).sort()
    expect(names).toContain('manifest.json')
    for (const table of BACKUP_TABLES) expect(names).toContain(`data/${table}.json`)
    expect(names.filter((n) => n.startsWith('files/'))).toEqual([`files/${docA}.pdf`, `files/${docB}.png`].sort())
    expect(names.some((n) => n.includes('thumbnails') || n.includes('searchIndex'))).toBe(false) // régénérés, pas sauvegardés
    expect(files[`files/${docA}.pdf`]).toEqual(PDF_BYTES)
    expect(files[`files/${docB}.png`]).toEqual(PNG_BYTES)

    const stored = JSON.parse(strFromU8(files['manifest.json']!)) as BackupManifest
    expect(stored).toEqual(manifest)
    expect(stored).toMatchObject({ format: 'ged-backup', organizationName: 'Ministère test', schemaVersion: 1, files: { count: 2, bytes: PDF_BYTES.length + PNG_BYTES.length } })
    expect(stored.counts).toMatchObject({ mails: 2, documents: 2, documentPages: 2, users: 1 })

    // La sauvegarde contient sa propre trace, et le manifeste pointe sur la dernière entrée du journal
    const audit = JSON.parse(strFromU8(files['data/auditLog.json']!)) as { seq: number; action: string; hash: string }[]
    expect(audit.at(-1)).toMatchObject({ action: 'backup.exported', hash: stored.audit.lastHash })
    expect(stored.audit.lastSeq).toBe(audit.at(-1)!.seq)
    expect((await db.settings.get('lastBackupAt'))?.value).toBe(stored.createdAt)
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('refuse de sauvegarder une chaîne altérée, sauf demande explicite', async () => {
    const target = (await db.auditLog.toArray())[2]!
    await db.auditLog.update(target.seq!, { entityLabel: 'Falsifié' })
    const refused = backup()
    await expect(refused).rejects.toBeInstanceOf(AppError)
    await expect(refused).rejects.toThrow(`n° ${target.seq}`)
    expect((await db.auditLog.toArray()).some((e) => e.action === 'backup.exported')).toBe(false)
    expect((await db.settings.get('lastBackupAt'))?.value).toBeUndefined()

    const forced = await backup({ force: true })
    expect(forced.manifest.audit.count).toBeGreaterThan(0)
    expect((await db.auditLog.toArray()).at(-1)).toMatchObject({ action: 'backup.exported', metadata: { chainIntact: false } })
  })

  it('refuse un document dont le fichier manque, sans enregistrer de date de sauvegarde', async () => {
    await db.files.delete(docB)
    await expect(backup()).rejects.toThrow('introuvable')
    expect((await db.settings.get('lastBackupAt'))?.value).toBeUndefined()
  })

  it('est réservée à l’administrateur', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await expect(backup()).rejects.toBeInstanceOf(PermissionError)
    await expect(inspectBackup(new Blob(['x']))).rejects.toBeInstanceOf(PermissionError)
    await expect(restoreBackup(new Blob(['x']))).rejects.toBeInstanceOf(PermissionError)
  })

  it('nomme le fichier avec la date du fuseau des paramètres', () => {
    expect(backupFilename('UTC', new Date('2026-10-24T23:30:00Z'))).toBe('sauvegarde-ged-2026-10-24.zip')
    expect(backupFilename('Pacific/Auckland', new Date('2026-10-24T23:30:00Z'))).toBe('sauvegarde-ged-2026-10-25.zip')
  })
})

describe('aperçu avant restauration', () => {
  it('lit le manifeste et contrôle la chaîne sans rien modifier', async () => {
    const { blob, manifest } = await backup()
    const before = await db.auditLog.count()
    const preview = await inspectBackup(blob)
    expect(preview.manifest).toEqual(manifest)
    expect(preview.chainOk).toBe(true)
    expect(await db.auditLog.count()).toBe(before)
  })

  it('reconnaît un fichier qui n’est pas une sauvegarde', async () => {
    await expect(inspectBackup(new Blob(['du texte, pas un zip']))).rejects.toThrow('pas une sauvegarde')
    await expect(inspectBackup(rezip({ 'autre.txt': strToU8('bonjour') }))).rejects.toThrow('pas une sauvegarde de l’application')
    await expect(inspectBackup(rezip({ 'manifest.json': strToU8(JSON.stringify({ format: 'autre' })) }))).rejects.toThrow('pas une sauvegarde de l’application')
  })

  it('refuse une sauvegarde d’une autre version du schéma', async () => {
    const { blob } = await backup()
    const files = await unzip(blob)
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as BackupManifest
    for (const [schemaVersion, message] of [[2, 'plus récente'], [0, 'trop ancienne']] as const) {
      const changed = rezip({ ...files, 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion })) })
      await expect(inspectBackup(changed)).rejects.toThrow(message)
    }
  })

  it('signale un journal altéré dans la sauvegarde', async () => {
    const { blob } = await backup()
    const files = await unzip(blob)
    const audit = JSON.parse(strFromU8(files['data/auditLog.json']!)) as { entityLabel: string }[]
    audit[1]!.entityLabel = 'Falsifié'
    const preview = await inspectBackup(rezip({ ...files, 'data/auditLog.json': strToU8(JSON.stringify(audit)) }))
    expect(preview.chainOk).toBe(false)
    expect(preview.chainMessage).toContain('Incohérence')
  })
})

describe('restauration', () => {
  it('remplace toutes les données par celles de la sauvegarde, journal prolongé, fichiers et compteurs compris', async () => {
    const { blob, manifest } = await backup()

    // L'état change après la sauvegarde
    const extra = await createMail('incoming', incoming('Courrier après sauvegarde'))
    const docC = await addDocument('Document après sauvegarde', new Uint8Array([9, 9, 9]), 'image', extra.id)
    await updateDocumentTitle(docA, 'Renommé')
    await deleteDocument(docB)
    await saveReference('departments', null, { name: 'Direction ajoutée' })
    await db.thumbnails.put({ documentId: docA, blob: new Blob(['ancienne miniature']) })
    await db.settings.put({ key: 'searchIndexMarker', value: 1 })
    await db.searchIndex.put({ key: 'minisearch', value: { version: 1, json: '{}' } })
    await db.documents.update(docA, { ocrStatus: 'processing' })
    expect(await db.mails.count()).toBe(3)

    const steps: string[] = []
    const restored = await restoreBackup(blob, (p) => steps.push(p.step))
    expect(restored.createdAt).toBe(manifest.createdAt)
    expect(steps).toEqual(expect.arrayContaining(['check', 'copy', 'replace', 'finish']))

    // Données revenues à l'état de la sauvegarde
    expect(await db.mails.count()).toBe(2)
    expect((await db.mails.toArray()).map((m) => m.subject).sort()).toEqual(['Réponse', 'Visite du musée'])
    expect(await db.departments.count()).toBe(1)
    const documents = await db.documents.toArray()
    expect(documents.map((d) => d.title).sort()).toEqual(['Fiche comptable', 'Scan'])
    expect(documents.every((d) => !d.deletedAt)).toBe(true)
    expect(documents.find((d) => d.id === docA)?.ocrStatus).toBe('done')
    expect((await db.documentPages.where('documentId').equals(docA).toArray()).map((p) => p.text)).toEqual(['Recouvrement des prêts', 'Annexe'])
    expect(await db.documentLinks.count()).toBe(1)

    // Fichiers : ceux de la sauvegarde, rien d'autre ; miniatures et index à régénérer
    expect((await db.files.toCollection().primaryKeys()).sort()).toEqual([docA, docB].sort())
    expect(await db.files.get(docC)).toBeUndefined()
    expect(new Uint8Array(await (await db.files.get(docA))!.blob.arrayBuffer())).toEqual(PDF_BYTES)
    expect((await db.files.get(docB))!.blob.type).toBe('image/png')
    expect(await db.thumbnails.count()).toBe(0)
    expect(await db.searchIndex.count()).toBe(0)

    // Numérotation : le compteur est revenu avec la sauvegarde, pas de numéro réutilisé ni sauté
    expect((await createMail('incoming', incoming('Suivant'))).reference).toMatch(/^2\//)

    // Journal : la chaîne restaurée est prolongée par la restauration
    expect((await verifyAuditChain()).ok).toBe(true)
    const actions = (await db.auditLog.toArray()).map((e) => e.action)
    expect(actions).toContain('backup.exported')
    expect(actions.slice(-2)).toEqual(['backup.restored', 'mail.created'])
    expect((await db.settings.get('lastBackupAt'))?.value).toBe(manifest.createdAt)
    expect((await db.settings.get('searchIndexMarker'))).toBeUndefined()
  })

  it('reprend une lecture interrompue : processing redevient pending', async () => {
    await db.documents.update(docB, { ocrStatus: 'processing' })
    const { blob } = await backup()
    await restoreBackup(blob)
    expect((await db.documents.get(docB))?.ocrStatus).toBe('pending')
  })

  it('refuse sans rien modifier une sauvegarde dont un fichier est abîmé', async () => {
    const { blob } = await backup()
    const files = await unzip(blob)
    const broken = rezip({ ...files, [`files/${docA}.pdf`]: new TextEncoder().encode('%PDF-1.4 contenu ALTERE du premier') })
    const marker = await createMail('incoming', incoming('Présent avant la tentative'))
    const before = JSON.stringify(await db.mails.toArray())

    await expect(restoreBackup(broken)).rejects.toThrow('empreinte')
    expect(JSON.stringify(await db.mails.toArray())).toBe(before)
    expect(await db.mails.get(marker.id)).toBeDefined()
    expect((await db.auditLog.toArray()).some((e) => e.action === 'backup.restored')).toBe(false)
  })

  it('refuse une sauvegarde dont un fichier manque, ou dont le journal est altéré', async () => {
    const { blob } = await backup()
    const files = await unzip(blob)
    const { [`files/${docB}.png`]: _gone, ...withoutFile } = files
    void _gone
    await expect(restoreBackup(rezip(withoutFile))).rejects.toThrow('manque dans la sauvegarde')

    const audit = JSON.parse(strFromU8(files['data/auditLog.json']!)) as { actorName: string }[]
    audit[0]!.actorName = 'Intrus'
    await expect(restoreBackup(rezip({ ...files, 'data/auditLog.json': strToU8(JSON.stringify(audit)) }))).rejects.toThrow('altéré')

    const truncated = JSON.parse(strFromU8(files['data/mails.json']!)) as unknown[]
    truncated.pop()
    await expect(restoreBackup(rezip({ ...files, 'data/mails.json': strToU8(JSON.stringify(truncated)) }))).rejects.toThrow('nombre')
    expect(await db.mails.count()).toBe(2)
  })

  it('nettoie les fichiers copiés d’une restauration interrompue', async () => {
    const { blob } = await backup()
    const files = await unzip(blob)
    // Un document de la table n'a plus de fichier : le contrôle échoue après la lecture de tout le zip
    const documents = JSON.parse(strFromU8(files['data/documents.json']!)) as { id: string }[]
    documents[0]!.id = 'inconnu'
    await expect(restoreBackup(rezip({ ...files, 'data/documents.json': strToU8(JSON.stringify(documents)) }))).rejects.toBeInstanceOf(AppError)
    expect((await db.files.toCollection().primaryKeys()).sort()).toEqual([docA, docB].sort())
  })
})

describe('miniatures régénérées', () => {
  it('recrée une miniature par document avec la préparation fournie', async () => {
    const { blob } = await backup()
    await restoreBackup(blob)
    const seen: string[] = []
    await rebuildThumbnails(async (file, kind) => {
      seen.push(kind)
      return { thumbnail: new Blob([`miniature ${file.size}`]) }
    })
    expect(seen.sort()).toEqual(['image', 'pdf'])
    expect(await db.thumbnails.count()).toBe(2)
    // Une préparation qui échoue ne bloque rien
    await db.thumbnails.clear()
    await rebuildThumbnails(async () => {
      throw new Error('illisible')
    })
    expect(await db.thumbnails.count()).toBe(0)
  })
})
