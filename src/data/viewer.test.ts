// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { hasArabic, highlight } from '@/lib/highlight'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { PermissionError, ValidationError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import {
  deleteDocument,
  downloadDocument,
  openDocument,
  printDocument,
  restoreDocument,
  rotateDocument,
  saveImportedDocument,
  updateDocumentTitle,
} from './repositories/documents'
import { listEntityHistory } from './repositories/history'
import { createMail } from './repositories/mails'
import { saveReference } from './repositories/referenceData'
import { createUser } from './repositories/users'
import { resetSessionForTests } from './session'

let counter = 0

async function addDocument(kind: 'pdf' | 'image' = 'pdf', link?: { entityType: 'mail'; entityId: string }) {
  counter++
  const result = await saveImportedDocument({
    blob: new Blob([`contenu ${counter}`]),
    meta: {
      title: `Document ${counter}`,
      originalFilename: kind === 'pdf' ? `doc-${counter}.pdf` : `scan-${counter}.png`,
      kind,
      mimeType: kind === 'pdf' ? 'application/pdf' : 'image/png',
      sizeBytes: 10,
      sha256: counter.toString(16).padStart(64, '0'),
      pageCount: 1,
    },
    category: 'archive',
    archivedAt: '2026-10-24',
    link,
  })
  if (result.status !== 'saved') throw new Error('attendu : saved')
  return result.id
}

const actions = async () => (await db.auditLog.toArray()).map((e) => e.action)

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
})

describe('accès aux fichiers', () => {
  it('journalise chaque consultation, téléchargement et impression avant de rendre le fichier', async () => {
    const id = await addDocument()
    const opened = await openDocument(id)
    expect(await opened.blob.text()).toBe(`contenu ${counter}`)
    expect(opened.doc.id).toBe(id)
    await downloadDocument(id)
    await printDocument(id)
    await openDocument(id)
    expect((await actions()).slice(-4)).toEqual(['document.viewed', 'document.downloaded', 'document.printed', 'document.viewed'])
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('refuse un document inconnu, supprimé ou sans fichier, sans rien journaliser', async () => {
    const id = await addDocument()
    const before = await db.auditLog.count()
    await expect(openDocument('inconnu')).rejects.toBeInstanceOf(ValidationError)
    await db.files.delete(id)
    await expect(openDocument(id)).rejects.toThrow('introuvable')
    expect(await db.auditLog.count()).toBe(before)
    const other = await addDocument()
    await deleteDocument(other)
    await expect(openDocument(other)).rejects.toBeInstanceOf(ValidationError)
  })

  it('cache les documents restreints à ceux qui n’ont pas accès au courrier lié', async () => {
    const dept = await saveReference('departments', null, { name: 'Cabinet' })
    const staff = await saveReference('staff', null, { fullName: 'Karim Mansour' })
    const secret = await createMail('outgoing', { mailDate: '2026-10-24', subject: 'Secret', signedByStaffId: staff, departmentId: dept, confidentiality: 'restricted' })
    const id = await addDocument('pdf', { entityType: 'mail', entityId: secret.id })
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })

    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    await expect(openDocument(id)).rejects.toBeInstanceOf(ValidationError)
    expect(await listEntityHistory('document', id)).toEqual([])
    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await expect(openDocument(id)).rejects.toBeInstanceOf(ValidationError)
    await signOut()
    await signIn({ username: 'admin', password: 'motdepasse-solide' })
    expect((await openDocument(id)).doc.confidentiality).toBe('restricted')
  })
})

describe('modification', () => {
  it('renomme avec le seul écart au journal, et refuse un titre vide', async () => {
    const id = await addDocument()
    await updateDocumentTitle(id, '  Fiche comptable mars  ')
    expect((await db.documents.get(id))?.title).toBe('Fiche comptable mars')
    const history = await listEntityHistory('document', id)
    expect(history.at(-1)).toMatchObject({ action: 'document.updated', changes: { title: [`Document ${counter}`, 'Fiche comptable mars'] } })
    const before = await db.auditLog.count()
    await updateDocumentTitle(id, 'Fiche comptable mars')
    expect(await db.auditLog.count()).toBe(before)
    await expect(updateDocumentTitle(id, '   ')).rejects.toThrow('vide')
  })

  it('pivote une image par quarts de tour (jamais le fichier) et refuse un PDF', async () => {
    const image = await addDocument('image')
    await rotateDocument(image, 1)
    await rotateDocument(image, 1)
    expect((await db.documents.get(image))?.rotation).toBe(180)
    await rotateDocument(image, -1)
    await rotateDocument(image, -1)
    await rotateDocument(image, -1)
    expect((await db.documents.get(image))?.rotation).toBe(270)
    await rotateDocument(image, 1)
    expect((await db.documents.get(image))?.rotation).toBe(0)
    expect(await (await db.files.get(image))!.blob.text()).toContain('contenu')
    expect((await actions()).filter((a) => a === 'document.rotated')).toHaveLength(6)
    await expect(rotateDocument(await addDocument('pdf'), 1)).rejects.toThrow('images')
  })

  it('supprime logiquement et restaure ; l’archiviste ne restaure que sa propre suppression', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Archi 2', username: 'archi2', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    const id = await addDocument()
    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await deleteDocument(id)
    await signOut()
    await signIn({ username: 'archi2', password: 'motdepasse-solide' })
    await expect(restoreDocument(id)).rejects.toBeInstanceOf(PermissionError)
    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await restoreDocument(id)
    expect((await openDocument(id)).doc.deletedAt).toBeUndefined()
    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    await expect(deleteDocument(id)).rejects.toBeInstanceOf(PermissionError)
    await expect(rotateDocument(id, 1)).rejects.toBeInstanceOf(PermissionError)
    await expect(updateDocumentTitle(id, 'x')).rejects.toBeInstanceOf(PermissionError)
    expect((await openDocument(id)).blob.size).toBeGreaterThan(0)
  })
})

describe('surlignage du texte lu', () => {
  const text = (query: string, source: string) => highlight(source, query).filter((s) => s.match).map((s) => s.text)

  it('ignore la casse et les accents, et garde le texte d’origine', () => {
    expect(text('recouvrement', 'Le Recouvrément des prêts, le recouvrement.')).toEqual(['Recouvrément', 'recouvrement'])
    expect(text('PRET', 'Prêt, prét et pret')).toEqual(['Prêt', 'prét', 'pret'])
    expect(highlight('abc', '').map((s) => s.text)).toEqual(['abc'])
    expect(highlight('Bonjour le monde', 'le').map((s) => s.text).join('')).toBe('Bonjour le monde')
  })

  it('ne trouve rien pour une recherche vide ou absente et reconnaît l’arabe', () => {
    expect(highlight('Rien ici', '   ')).toEqual([{ text: 'Rien ici', match: false }])
    expect(highlight('Rien ici', 'zzz')).toEqual([{ text: 'Rien ici', match: false }])
    expect(hasArabic('مرحبا بكم')).toBe(true)
    expect(hasArabic('Bonjour')).toBe(false)
  })
})
