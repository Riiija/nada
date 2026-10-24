// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { averageConfidence, countNonBlank, globalProgress, pickSource } from '@/lib/ocr/extract'
import { createOcrRunner, type OcrJobState, type RunnerDeps } from '@/lib/ocr/runner'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { deleteDocument, saveImportedDocument, updateDocumentTitle } from './repositories/documents'
import { createMail, deleteMail } from './repositories/mails'
import {
  claimOcr,
  failOcr,
  observePendingOcr,
  readFileForOcr,
  releaseOcr,
  requeueOcr,
  resetInterruptedOcr,
  saveOcrResult,
  type OcrResult,
} from './repositories/ocr'
import { saveReference } from './repositories/referenceData'
import { flushSearch, resetSearch, searchContent, startSearch } from './repositories/search'
import { createUser } from './repositories/users'
import { resetSessionForTests } from './session'

let counter = 0
async function addDocument(title = `Document ${++counter}`, link?: { entityType: 'mail'; entityId: string }) {
  counter++
  const result = await saveImportedDocument({
    blob: new Blob([`contenu ${counter}`]),
    meta: { title, originalFilename: `${counter}.pdf`, kind: 'pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: counter.toString(16).padStart(64, '0'), pageCount: 2 },
    category: 'archive',
    archivedAt: '2026-10-24',
    link,
  })
  if (result.status !== 'saved') throw new Error('attendu : saved')
  return result.id
}

const result = (over: Partial<OcrResult> = {}): OcrResult => ({
  pages: [
    { pageNumber: 1, text: 'Le recouvrement des prêts bancaires a progressé.', confidence: 91 },
    { pageNumber: 2, text: 'Annexe : tableau des remboursements.', confidence: 85 },
  ],
  source: 'tesseract',
  language: 'fra',
  confidence: 88,
  durationMs: 1200,
  ...over,
})

let ids: { dept: string; staff: string; followUp: string; position: string }

beforeEach(async () => {
  resetSearch()
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  ids = {
    dept: await saveReference('departments', null, { name: 'Cabinet' }),
    staff: await saveReference('staff', null, { fullName: 'Karim Mansour' }),
    followUp: await saveReference('followUps', null, { label: 'Urgent' }),
    position: await saveReference('positions', null, { label: 'Au cabinet' }),
  }
})

const incoming = (over: object = {}) => ({
  mailDate: '2026-10-24', subject: 'Visite du musée', departmentId: ids.dept, fileNumber: 'D1', followUpId: ids.followUp,
  positionId: ids.position, assignedStaffId: ids.staff, ...over,
})

describe('décisions de lecture', () => {
  it('compte les caractères non blancs, choisit la source et mesure la progression', () => {
    expect(countNonBlank(' a b\n\tc ')).toBe(3)
    expect(pickSource(9, 10)).toBe('nativeText')
    expect(pickSource(8, 10)).toBe('tesseract')
    expect(pickSource(0, 0)).toBe('tesseract')
    expect(averageConfidence([{ confidence: 90 }, { confidence: 70 }, {}])).toBe(80)
    expect(averageConfidence([{}, {}])).toBeUndefined()
    expect(globalProgress(2, 0.5, 5)).toBe(0.5)
    expect(globalProgress(5, 0, 5)).toBe(1)
  })
})

describe('enregistrement du résultat', () => {
  it('écrit les pages, le statut et le journal dans une transaction, puis remplace à la relance', async () => {
    const id = await addDocument()
    expect((await db.documents.get(id))?.ocrStatus).toBe('pending')
    await saveOcrResult(id, result())
    const doc = await db.documents.get(id)
    expect(doc).toMatchObject({ ocrStatus: 'done', ocrSource: 'tesseract', ocrLanguage: 'fra', ocrConfidence: 88 })
    expect(doc?.contentText).toContain('Annexe')
    expect(await db.documentPages.where('documentId').equals(id).count()).toBe(2)
    expect((await db.auditLog.toArray()).at(-1)).toMatchObject({ action: 'document.ocrCompleted', metadata: { pages: 2, source: 'tesseract', confidence: 88, durationMs: 1200 } })

    await requeueOcr([id])
    await saveOcrResult(id, result({ pages: [{ pageNumber: 1, text: 'Une seule page.' }], source: 'nativeText', language: '', confidence: undefined }))
    expect(await db.documentPages.where('documentId').equals(id).count()).toBe(1)
    expect((await db.documents.get(id))?.ocrLanguage).toBeUndefined()
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('réserve, libère, réinitialise et relance les lectures', async () => {
    const [a, b, c] = [await addDocument(), await addDocument(), await addDocument()]
    expect((await claimOcr(a))?.title).toMatch(/Document/)
    expect((await db.documents.get(a))?.ocrStatus).toBe('processing')
    await releaseOcr(a)
    expect((await db.documents.get(a))?.ocrStatus).toBe('pending')

    await claimOcr(b)
    await resetInterruptedOcr()
    expect((await db.documents.get(b))?.ocrStatus).toBe('pending')

    await failOcr(c, 'PDF illisible')
    expect((await db.documents.get(c))?.ocrStatus).toBe('failed')
    expect((await db.auditLog.toArray()).at(-1)).toMatchObject({ action: 'document.ocrFailed', metadata: { reason: 'PDF illisible' } })
    expect(await requeueOcr([a, b, c])).toBe(1)
    expect((await db.documents.get(c))?.ocrStatus).toBe('pending')

    await deleteDocument(a)
    expect(await claimOcr(a)).toBeUndefined()
    expect(await (await readFileForOcr(b)).text()).toContain('contenu')
  })

  it('suit en direct la liste des documents à lire', async () => {
    const seen: string[][] = []
    const stop = observePendingOcr((list) => seen.push(list))
    const a = await addDocument()
    await new Promise((r) => setTimeout(r, 50))
    await saveOcrResult(a, result())
    await new Promise((r) => setTimeout(r, 50))
    stop()
    expect(seen.some((list) => list.includes(a))).toBe(true)
    expect(seen.at(-1)).toEqual([])
  })
})

describe('moteur de lecture', () => {
  function makeRunner(over: Partial<RunnerDeps> = {}) {
    const order: string[] = []
    const deps: RunnerDeps = {
      observePending: observePendingOcr,
      resetInterrupted: resetInterruptedOcr,
      claim: claimOcr,
      readFile: readFileForOcr,
      process: async (_blob, job, progress) => {
        order.push(`start:${job.title}`)
        progress(0.5, 'Lecture de la page 1 sur 2')
        await new Promise((r) => setTimeout(r, 20))
        order.push(`end:${job.title}`)
        return result()
      },
      save: saveOcrResult,
      fail: failOcr,
      release: releaseOcr,
      requeue: requeueOcr,
      abortEngine: async () => undefined,
      withLock: (task) => task(),
      errorMessage: (e) => (e instanceof Error ? e.message : 'erreur'),
      ...over,
    }
    return { runner: createOcrRunner(deps), order }
  }

  const waitFor = async (check: () => boolean | Promise<boolean>, ms = 3000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await check()) return
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('délai dépassé')
  }
  const jobs = (r: ReturnType<typeof makeRunner>['runner']) => r.store.getState().jobs
  const state = (r: ReturnType<typeof makeRunner>['runner'], id: string): OcrJobState | undefined => jobs(r)[id]

  it('lit un document à la fois, dans l’ordre d’arrivée, et reprend les interrompus au démarrage', async () => {
    const a = await addDocument('A')
    const b = await addDocument('B')
    await db.documents.update(a, { ocrStatus: 'processing' }) // interrompu par la fermeture de l'onglet
    const { runner, order } = makeRunner()
    runner.start()
    await waitFor(() => state(runner, a)?.state === 'done' && state(runner, b)?.state === 'done')
    expect(order).toEqual(['start:A', 'end:A', 'start:B', 'end:B'])
    expect(state(runner, a)).toMatchObject({ progress: 1, label: 'Indexé', confidence: 88, lowConfidence: false })
    expect((await db.documents.get(b))?.ocrStatus).toBe('done')

    const c = await addDocument('C')
    await waitFor(() => state(runner, c)?.state === 'done')
    await runner.stop()
  })

  it('signale une lecture peu fiable et un échec, puis relance', async () => {
    const weak = await addDocument('Faible')
    const broken = await addDocument('Cassé')
    let fail = true
    const { runner } = makeRunner({
      process: async (_b, job) => {
        if (job.title === 'Cassé' && fail) throw new Error('Ce PDF est illisible ou protégé par un mot de passe.')
        return result({ confidence: job.title === 'Faible' ? 45 : 90 })
      },
    })
    runner.start()
    await waitFor(() => state(runner, weak)?.state === 'done' && state(runner, broken)?.state === 'failed')
    expect(state(runner, weak)?.lowConfidence).toBe(true)
    expect(state(runner, broken)?.message).toBe('Ce PDF est illisible ou protégé par un mot de passe.')
    expect((await db.documents.get(broken))?.ocrStatus).toBe('failed')

    fail = false
    await runner.retry([broken])
    await waitFor(() => state(runner, broken)?.state === 'done')
    await runner.stop()
  })

  it('annule la lecture en cours : le document redevient « en attente »', async () => {
    const a = await addDocument('Long')
    let engineStopped = false
    const { runner } = makeRunner({
      process: (_b, _j, _p, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Annulé', 'AbortError')))
        }),
      abortEngine: async () => {
        engineStopped = true
      },
    })
    runner.start()
    await waitFor(() => state(runner, a)?.state === 'running')
    runner.cancel(a)
    await waitFor(() => state(runner, a)?.state === 'canceled')
    expect(engineStopped).toBe(true)
    expect((await db.documents.get(a))?.ocrStatus).toBe('pending')
    await runner.stop()
  })
})

describe('recherche plein texte', () => {
  it('trouve courriers, titres et pages, puis suit les ajouts, modifications et suppressions', async () => {
    const mail = await createMail('incoming', incoming({ subject: 'Recouvrement des prêts' }))
    const doc = await addDocument('Rapport trimestriel')
    await saveOcrResult(doc, result())
    await startSearch()
    await flushSearch()

    const kinds = async (q: string) => (await searchContent(q)).map((r) => r.kind)
    expect(await kinds('recouvrement')).toEqual(expect.arrayContaining(['mail', 'page']))
    const page = (await searchContent('remboursements')).find((r) => r.kind === 'page')
    expect(page).toMatchObject({ kind: 'page', page: 2, title: 'Rapport trimestriel' })
    expect(page && 'snippet' in page && page.snippet).toContain('remboursements')
    expect((await searchContent('trimestriel'))[0]).toMatchObject({ kind: 'document', title: 'Rapport trimestriel' })

    await updateDocumentTitle(doc, 'Bilan annuel')
    await deleteMail(mail.id)
    await new Promise((r) => setTimeout(r, 30))
    await flushSearch()
    expect(await searchContent('trimestriel')).toEqual([])
    expect((await searchContent('bilan'))[0]).toMatchObject({ kind: 'document' })
    expect((await searchContent('recouvrement')).map((r) => r.kind)).toEqual(['page'])
    await deleteDocument(doc)
    await new Promise((r) => setTimeout(r, 30))
    await flushSearch()
    expect(await searchContent('recouvrement')).toEqual([])
  })

  it('retrouve un courrier par son numéro, entier ou par préfixe, et applique les filtres', async () => {
    const a = await createMail('incoming', incoming())
    await createMail('incoming', incoming({ mailDate: '2025-01-05', subject: 'Autre objet' }))
    await startSearch()
    await flushSearch()
    const year = String(new Date().getFullYear() % 100).padStart(2, '0')
    expect((await searchContent(`1/${year}`))[0]).toMatchObject({ kind: 'mail', id: a.id })
    expect((await searchContent('2/'))[0]).toMatchObject({ kind: 'mail', subject: 'Autre objet' })
    expect(await searchContent('objet', { from: '2026-01-01' })).toHaveLength(0)
    expect(await searchContent('objet', { to: '2025-12-31' })).toHaveLength(1)
    expect(await searchContent('musée', { types: ['document'] })).toEqual([])
    expect(await searchContent('musée', { processed: true })).toEqual([])
    expect(await searchContent('musée', { processed: false })).toHaveLength(1)
  })

  it('ne montre jamais un élément restreint à qui n’y a pas droit, ni son extrait', async () => {
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    const secret = await createMail('incoming', incoming({ subject: 'Dossier confidentiel', confidentiality: 'restricted' }))
    const doc = await addDocument('Pièce secrète', { entityType: 'mail', entityId: secret.id })
    await saveOcrResult(doc, result({ pages: [{ pageNumber: 1, text: 'Contenu confidentiel du dossier.' }] }))
    await startSearch()
    await flushSearch()
    expect((await searchContent('confidentiel')).map((r) => r.kind).sort()).toEqual(['mail', 'page'])

    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    expect(await searchContent('confidentiel')).toEqual([])
    expect(await searchContent('secrète')).toEqual([])
    await signOut()
    await signIn({ username: 'admin', password: 'motdepasse-solide' })
    expect((await searchContent('confidentiel')).map((r) => r.kind).sort()).toEqual(['mail', 'page'])
    expect((await searchContent('secrète')).map((r) => r.kind).sort()).toEqual(['document', 'page'])
  })

  it('enregistre l’index et le recharge sans le reconstruire', async () => {
    await createMail('incoming', incoming({ subject: 'Rapport persistant' }))
    await startSearch()
    await flushSearch()
    await new Promise((r) => setTimeout(r, 2200))
    const saved = await db.searchIndex.get('minisearch')
    expect(saved?.value).toMatchObject({ version: 1 })
    resetSearch()
    // Une écriture sans abonnement n'est pas vue : seul l'index enregistré répond.
    await startSearch()
    expect((await searchContent('persistant'))[0]).toMatchObject({ kind: 'mail' })
  }, 10_000)
})
