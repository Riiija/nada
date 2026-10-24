// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { sha256Stream } from '@/lib/import/hash'
import { createImportQueue, type ImportDeps, type ImportQueue } from '@/lib/import/queue'
import { detectFile, sizeError, spaceError } from '@/lib/import/validate'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { PermissionError, ValidationError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { findDuplicate, linkDocuments, saveImportedDocument, unlinkDocument, type ImportInput } from './repositories/documents'
import { createMail } from './repositories/mails'
import { saveReference } from './repositories/referenceData'
import { createUser } from './repositories/users'
import { resetSessionForTests } from './session'

const bytes = (...values: number[]) => new Uint8Array(values)
const file = (name: string, content: Uint8Array | string, type = '') => new File([content as BlobPart], name, { type })
const PDF = (extra = '') => file('a.pdf', `%PDF-1.7\n${extra}`)

async function sha(blob: Blob) {
  return sha256Stream(blob)
}

let mailId: string

async function setup() {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  const dept = await saveReference('departments', null, { name: 'Cabinet' })
  const staff = await saveReference('staff', null, { fullName: 'Karim Mansour' })
  const followUp = await saveReference('followUps', null, { label: 'Urgent' })
  const position = await saveReference('positions', null, { label: 'Au cabinet' })
  mailId = (
    await createMail('incoming', {
      mailDate: '2026-10-24', subject: 'Courrier', departmentId: dept, fileNumber: 'D1', followUpId: followUp, positionId: position, assignedStaffId: staff,
    })
  ).id
}

async function input(blob: File, over: Partial<ImportInput> = {}): Promise<ImportInput> {
  return {
    blob,
    thumbnail: new Blob(['thumb']),
    meta: {
      title: blob.name.replace(/\.[^.]+$/, ''), originalFilename: blob.name, kind: 'pdf', mimeType: 'application/pdf',
      sizeBytes: blob.size, sha256: await sha(blob), pageCount: 3,
    },
    category: 'archive',
    archivedAt: '2026-10-24',
    ...over,
  }
}

beforeEach(setup)

describe('contrôle des fichiers', () => {
  it('vérifie l’extension ET la signature, pas le type MIME', async () => {
    expect(await detectFile(PDF())).toEqual({ kind: 'pdf', mimeType: 'application/pdf' })
    expect(await detectFile(file('p.jpg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)))).toMatchObject({ kind: 'image', mimeType: 'image/jpeg' })
    expect(await detectFile(file('p.JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)))).toMatchObject({ mimeType: 'image/jpeg' })
    expect(await detectFile(file('p.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)))).toMatchObject({ mimeType: 'image/png' })
    expect(await detectFile(file('p.webp', bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)))).toMatchObject({ mimeType: 'image/webp' })
    // un PDF renommé en .png, un faux PDF, un WAV (RIFF mais pas WEBP), des formats exclus
    expect(await detectFile(file('x.png', '%PDF-1.4'))).toBeNull()
    expect(await detectFile(file('x.pdf', 'MZ not a pdf'))).toBeNull()
    expect(await detectFile(file('x.webp', bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)))).toBeNull()
    for (const name of ['a.docx', 'a.xlsx', 'a.tiff', 'a.tif', 'a.txt', 'sans-extension']) expect(await detectFile(file(name, '%PDF-1.4'))).toBeNull()
  })

  it('refuse un fichier trop gros, vide ou trop volumineux pour l’espace restant', () => {
    expect(sizeError(51 * 1024 * 1024, 50)).toBe('Le fichier dépasse 50 Mo.')
    expect(sizeError(0, 50)).toBe('Le fichier est vide.')
    expect(sizeError(10, 50)).toBeNull()
    expect(spaceError(200 * 1024 * 1024, { usage: 900 * 1024 * 1024, quota: 1020 * 1024 * 1024 })).toMatch(/^Espace insuffisant dans ce navigateur : 120 Mo disponibles/)
    expect(spaceError(1, { usage: null, quota: null })).toBeNull()
  })

  it('hache par morceaux comme crypto.subtle et rend compte de la progression', async () => {
    const data = new Uint8Array(300_000).map((_, i) => i % 251)
    const blob = new Blob([data])
    const steps: number[] = []
    const mine = await sha256Stream(blob, (read) => steps.push(read))
    const reference = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
    expect(mine).toBe(reference)
    expect(steps.at(-1)).toBe(300_000)
    await expect(sha256Stream(blob, undefined, AbortSignal.abort())).rejects.toThrow()
  })
})

describe('enregistrement d’un document', () => {
  it('écrit document, fichier, miniature, lien et journal dans une transaction', async () => {
    const result = await saveImportedDocument(await input(PDF('un'), { link: { entityType: 'mail', entityId: mailId } }))
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(await db.documents.get(result.id)).toMatchObject({ title: 'a', ocrStatus: 'pending', pageCount: 3, confidentiality: 'normal', archivedAt: '2026-10-24' })
    expect((await db.files.get(result.id))?.blob.size).toBeGreaterThan(0)
    expect(await db.thumbnails.get(result.id)).toBeTruthy()
    expect(await db.documentLinks.toArray()).toHaveLength(1)
    expect((await db.auditLog.toArray()).map((e) => e.action).slice(-2)).toEqual(['document.imported', 'document.linked'])
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('rejette un doublon par empreinte, quel que soit le nom, sans rien écrire sauf la trace', async () => {
    const first = await saveImportedDocument(await input(PDF('même contenu')))
    const copy = file('autre-nom.pdf', '%PDF-1.7\nmême contenu')
    expect(await findDuplicate(await sha(copy))).toMatchObject({ title: 'a' })
    const second = await saveImportedDocument(await input(copy))
    expect(second).toMatchObject({ status: 'duplicate', existingId: first.status === 'saved' ? first.id : '' })
    expect(await db.documents.count()).toBe(1)
    expect(await db.files.count()).toBe(1)
    expect((await db.auditLog.toArray()).at(-1)?.action).toBe('document.duplicateRejected')
  })

  it('accepte un même nom au contenu différent, en le signalant', async () => {
    await saveImportedDocument(await input(PDF('un')))
    const second = await saveImportedDocument(await input(PDF('deux')))
    expect(second).toMatchObject({ status: 'saved', sameNameCount: 1 })
    expect(await db.documents.count()).toBe(2)
  })

  it('valide les métadonnées et le lien', async () => {
    const base = await input(PDF('x'))
    await expect(saveImportedDocument({ ...base, meta: { ...base.meta, sha256: 'abc' } })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveImportedDocument({ ...base, archivedAt: '31/02/2026' })).rejects.toThrow('date d\'archivage')
    await expect(saveImportedDocument({ ...base, link: { entityType: 'mail', entityId: 'inconnu' } })).rejects.toThrow('n\'existe plus')
    await expect(saveImportedDocument({ ...base, link: { entityType: 'decree', entityId: 'x' } })).rejects.toThrow("n'existe plus")
    expect(await db.documents.count()).toBe(0)
    expect(await db.files.count()).toBe(0)
  })

  it('réserve l’import à l’admin et à l’archiviste', async () => {
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    await expect(saveImportedDocument(await input(PDF('x')))).rejects.toBeInstanceOf(PermissionError)
  })

  it('rattache, évite le double lien et détache un document archivé', async () => {
    const saved = await saveImportedDocument(await input(PDF('x')))
    if (saved.status !== 'saved') throw new Error('attendu : saved')
    await linkDocuments([saved.id], 'mail', mailId)
    await linkDocuments([saved.id], 'mail', mailId)
    expect(await db.documentLinks.count()).toBe(1)
    await unlinkDocument(saved.id, 'mail', mailId)
    expect(await db.documentLinks.count()).toBe(0)
    await expect(unlinkDocument(saved.id, 'mail', mailId)).rejects.toThrow('pas rattaché')
    expect((await db.auditLog.toArray()).map((e) => e.action).slice(-3)).toEqual(['document.imported', 'document.linked', 'document.unlinked'])
  })

  it('hérite de la confidentialité du courrier restreint', async () => {
    const dept = (await db.departments.toArray())[0]!.id
    const restricted = await createMail('outgoing', { mailDate: '2026-10-24', subject: 'Secret', signedByStaffId: (await db.staff.toArray())[0]!.id, departmentId: dept, confidentiality: 'restricted' })
    const saved = await saveImportedDocument(await input(PDF('secret'), { link: { entityType: 'mail', entityId: restricted.id } }))
    if (saved.status !== 'saved') throw new Error('attendu : saved')
    expect((await db.documents.get(saved.id))?.confidentiality).toBe('restricted')
  })
})

describe('file d’import', () => {
  function makeQueue(over: Partial<ImportDeps> = {}) {
    const calls = { active: 0, maxActive: 0, saved: 0 }
    const deps: ImportDeps = {
      detect: async (f) => (f.name.endsWith('.pdf') ? { kind: 'pdf', mimeType: 'application/pdf' } : null),
      limits: async () => ({ maxUploadMb: 50, usage: 0, quota: 1e12 }),
      hash: async (f, onProgress) => {
        calls.active++
        calls.maxActive = Math.max(calls.maxActive, calls.active)
        onProgress(f.size, f.size)
        await new Promise((r) => setTimeout(r, 15))
        calls.active--
        return (f.size % 10).toString(16).repeat(64)
      },
      findDuplicate: async () => undefined,
      prepare: async () => ({ pageCount: 2 }),
      save: async (i) => {
        calls.saved++
        return { status: 'saved', id: `doc-${i.meta.originalFilename}`, sameNameCount: 0 }
      },
      errorMessage: (e) => (e instanceof Error ? e.message : 'erreur'),
      ...over,
    }
    return { queue: createImportQueue(deps), calls }
  }

  const settled = async (queue: ImportQueue) => {
    for (let i = 0; i < 200; i++) {
      if (queue.store.getState().items.every((it) => !['queued', 'reading', 'saving'].includes(it.state))) return
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error('file non terminée')
  }
  const options = { category: 'archive' as const, archivedAt: '2026-10-24' }
  const state = (queue: ImportQueue) => queue.store.getState().items.map((i) => [i.name, i.state])

  it('traite 3 imports à la fois, classe les sorties et ouvre le panneau', async () => {
    const { queue, calls } = makeQueue()
    queue.enqueue([...Array.from({ length: 7 }, (_, i) => file(`f${i}.pdf`, `%PDF-${'x'.repeat(i)}`)), file('x.docx', 'zzz')], options)
    expect(queue.store.getState().trayOpen).toBe(true)
    await settled(queue)
    expect(calls.maxActive).toBeLessThanOrEqual(3)
    expect(calls.maxActive).toBeGreaterThan(1)
    const items = queue.store.getState().items
    expect(items.filter((i) => i.state === 'ocrQueued')).toHaveLength(7)
    expect(items.find((i) => i.name === 'x.docx')).toMatchObject({ state: 'rejected', message: "Ce fichier n'est pas un PDF ni une image JPEG, PNG ou WebP." })
    expect(items.find((i) => i.name === 'f0.pdf')).toMatchObject({ documentId: 'doc-f0.pdf', pageCount: 2 })
  })

  it('signale doublon, fichier trop gros, erreur et avertissement de même nom', async () => {
    let n = 0
    const { queue } = makeQueue({
      limits: async () => ({ maxUploadMb: 1, usage: 0, quota: 1e12 }),
      findDuplicate: async () => (n++ === 1 ? { id: 'ex', title: 'Existant' } : undefined),
      prepare: async (f) => {
        if (f.name === 'casse.pdf') throw new Error('Ce PDF est illisible ou protégé par un mot de passe.')
        return { pageCount: 1 }
      },
      save: async (i) =>
        i.meta.originalFilename === 'dup.pdf' ? { status: 'duplicate', existingId: 'ex', existingTitle: 'Existant' } : { status: 'saved', id: 'id', sameNameCount: i.meta.originalFilename === 'nom.pdf' ? 1 : 0 },
    })
    queue.enqueue([file('ok.pdf', '%PDF-ok'), file('dup.pdf', '%PDF-dup'), file('casse.pdf', '%PDF-c'), file('nom.pdf', '%PDF-nom'), file('gros.pdf', new Uint8Array(1024 * 1024 + 1))], options)
    await settled(queue)
    const by = (name: string) => queue.store.getState().items.find((i) => i.name === name)!
    expect(by('ok.pdf').state).toBe('ocrQueued')
    expect(by('dup.pdf')).toMatchObject({ state: 'duplicate', existingId: 'ex' })
    expect(by('casse.pdf')).toMatchObject({ state: 'failed', message: 'Ce PDF est illisible ou protégé par un mot de passe.' })
    expect(by('nom.pdf').warning).toMatch(/même nom/)
    expect(by('gros.pdf')).toMatchObject({ state: 'rejected', message: 'Le fichier dépasse 1 Mo.' })
  })

  it('annule un import en attente, relance un import en échec et vide les lignes terminées', async () => {
    let fail = true
    const { queue } = makeQueue({
      prepare: async () => {
        if (fail) throw new Error('boum')
        return { pageCount: 1 }
      },
      concurrency: 1,
    })
    const [first, second] = queue.enqueue([file('a.pdf', '%PDF-a'), file('b.pdf', '%PDF-b')], options)
    queue.cancel(second!)
    await settled(queue)
    expect(state(queue)).toEqual([['a.pdf', 'failed'], ['b.pdf', 'canceled']])
    fail = false
    queue.retry(first!)
    await settled(queue)
    expect(queue.store.getState().items[0]?.state).toBe('ocrQueued')
    queue.clearFinished()
    expect(queue.store.getState().items).toEqual([])
  })
})
