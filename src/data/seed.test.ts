// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { searchAuditLog } from './repositories/auditLog'
import { openDocument } from './repositories/documents'
import { resetSearch, searchContent, startSearch } from './repositories/search'
import { loadDemoData } from './seed/demo'
import type { ImageSpec } from './seed/types'
import { getSession, resetSessionForTests } from './session'

// Faux rendu de page : en test il n'y a pas de canvas. Un vrai PNG 1x1 (que pdf-lib accepte),
// suivi du texte de la page pour que chaque image ait une empreinte différente.
const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)
async function fakeRender(spec: ImageSpec): Promise<Blob> {
  const text = spec.lines.map((l) => l.text).join('|')
  return new Blob([PNG_1X1, new TextEncoder().encode(text)], { type: spec.format === 'jpeg' ? 'image/jpeg' : 'image/png' })
}

async function freshAdmin() {
  await db.delete()
  await db.open()
  resetSessionForTests()
  resetSearch()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
}

describe('données de démonstration sans navigateur', () => {
  beforeEach(freshAdmin)

  it('se limitent aux PDF à couche texte, lus tout de suite', async () => {
    await loadDemoData()
    const docs = await db.documents.toArray()
    expect(docs).toHaveLength(10)
    expect(docs.every((d) => d.kind === 'pdf' && d.ocrStatus === 'done' && d.ocrSource === 'nativeText')).toBe(true)
    expect(await db.thumbnails.count()).toBe(0)
  })
})

describe('jeu de démonstration complet', () => {
  beforeEach(async () => {
    await freshAdmin()
    await loadDemoData({ renderImage: fakeRender })
  })

  it('contient les registres, les référentiels et 25 documents dont 3 en attente de lecture', async () => {
    expect(await db.decrees.count()).toBe(6)
    expect(await db.ministerialOrders.count()).toBe(6)
    expect(await db.serviceNotes.count()).toBe(5)
    expect(await db.incomingInvoices.count()).toBe(8)
    expect(await db.ledgerEntries.count()).toBeGreaterThanOrEqual(38)
    expect(await db.officials.count()).toBe(6)
    expect(await db.officials.where('kind').equals('headOfState').count()).toBe(2)

    const docs = await db.documents.toArray()
    expect(docs).toHaveLength(25)
    const pending = docs.filter((d) => d.ocrStatus === 'pending')
    expect(pending).toHaveLength(3)
    expect(pending.every((d) => d.kind === 'image')).toBe(true)
    expect(docs.some((d) => d.mimeType === 'image/png')).toBe(true)
    expect(docs.some((d) => d.mimeType === 'image/jpeg')).toBe(true)
    expect(new Set(docs.map((d) => d.sha256)).size).toBe(25) // aucun doublon
    expect(await db.files.count()).toBe(25)
    for (const d of docs.filter((x) => x.ocrStatus === 'done')) {
      const pages = (await db.documentPages.where('documentId').equals(d.id).toArray()).sort((a, b) => a.pageNumber - b.pageNumber)
      expect(pages.length).toBe(d.pageCount)
      expect(d.contentText).toBe(pages.map((p) => p.text).join('\n\n'))
    }
  })

  it('numérote chaque registre sans trou ni doublon, et recale les compteurs', async () => {
    const registers = [
      ['decrees', 'decree'],
      ['ministerialOrders', 'ministerialOrder'],
      ['serviceNotes', 'serviceNote'],
      ['incomingInvoices', 'incomingInvoice'],
    ] as const
    for (const [table, scope] of registers) {
      const rows = await db.table(table).toArray()
      const byYear = new Map<number, number[]>()
      for (const r of rows) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r.seq])
      for (const [year, seqs] of byYear) {
        expect(seqs.sort((a, b) => a - b)).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1))
        expect((await db.counters.get([scope, year]))?.lastSeq).toBe(seqs.length)
      }
      expect(rows.every((r) => r.reference === `${r.seq}/${String(r.year % 100).padStart(2, '0')}`)).toBe(true)
    }
  })

  it('relie des pièces jointes à des courriers et des actes existants', async () => {
    const links = await db.documentLinks.toArray()
    expect(links.length).toBeGreaterThanOrEqual(18)
    const types = new Set(links.map((l) => l.entityType))
    for (const t of ['mail', 'decree', 'ministerialOrder', 'incomingInvoice', 'ledgerEntry']) expect(types.has(t as never)).toBe(true)
    const tables = { decree: 'decrees', ministerialOrder: 'ministerialOrders', incomingInvoice: 'incomingInvoices', ledgerEntry: 'ledgerEntries', serviceNote: 'serviceNotes' } as const
    for (const link of links) {
      const row = link.entityType === 'mail' ? await db.mails.get(link.entityId) : await db.table(tables[link.entityType]).get(link.entityId)
      expect(row).toBeDefined()
      expect(await db.documents.get(link.documentId)).toBeDefined()
    }
    expect(new Set(links.map((l) => l.entityId)).size).toBe(links.length)
    for (const link of links.filter((l) => l.entityType === 'mail')) expect((await db.mails.get(link.entityId))?.confidentiality).toBe('normal')
  })

  it('rattache chaque document au courrier dont il parle', async () => {
    const expected: Record<string, string> = {
      'courrier-visite-musee.png': 'Visite du musée',
      'courrier-fiche-comptable.png': 'Fiche comptable',
      'rapport-recouvrement-prets.pdf': 'Recouvrement des prêts',
      'courrier-banque-centrale.pdf': 'Moyen de paiement',
    }
    for (const [filename, subject] of Object.entries(expected)) {
      const doc = (await db.documents.toArray()).find((d) => d.originalFilename === filename)!
      const link = (await db.documentLinks.where('documentId').equals(doc.id).toArray())[0]!
      expect((await db.mails.get(link.entityId))?.subject).toBe(subject)
    }
  })

  it('paie les factures payées dans le journal des opérations, en centimes entiers', async () => {
    const paid = (await db.incomingInvoices.toArray()).filter((r) => r.status === 'paid')
    expect(paid.length).toBeGreaterThan(0)
    const ledger = await db.ledgerEntries.toArray()
    for (const invoice of paid) expect(ledger.some((e) => e.label === `Paiement de la facture ${invoice.reference}` && e.debit === invoice.amount)).toBe(true)
    expect(ledger.every((e) => e.debit >= 0 && e.credit >= 0 && (e.debit > 0 || e.credit > 0))).toBe(true)
    expect(ledger.every((e) => Number.isInteger(e.debit) && Number.isInteger(e.credit))).toBe(true)
  })

  it('écrit un historique cohérent, daté de l’année écoulée, et chaîné', async () => {
    expect((await verifyAuditChain()).ok).toBe(true)
    const entries = await db.auditLog.toArray()
    expect(entries.length).toBeGreaterThan(700)
    const actions = new Set<string>(entries.map((e) => e.action))
    for (const a of [
      'mail.created', 'mail.positionChanged', 'mail.processed', 'decree.created', 'ministerialOrder.created', 'serviceNote.created',
      'incomingInvoice.created', 'incomingInvoice.updated', 'ledgerEntry.created', 'document.imported', 'document.linked', 'document.ocrCompleted', 'demo.loaded',
    ]) {
      expect(actions.has(a)).toBe(true)
    }
    // Les entrées de démonstration sont triées par date ; la dernière est le chargement lui-même
    const demo = entries.filter((e) => e.userAgent === 'Données de démonstration')
    expect(demo.map((e) => e.occurredAt)).toEqual([...demo.map((e) => e.occurredAt)].sort())
    expect(entries.at(-1)?.action).toBe('demo.loaded')
    expect(entries.filter((e) => e.action === 'mail.created')).toHaveLength(300)
    expect(entries.filter((e) => e.action === 'document.ocrCompleted')).toHaveLength(22)
    expect(entries.filter((e) => e.action === 'mail.processed')).toHaveLength(await db.mails.where('[flow+isProcessed]').equals(['incoming', 1]).count())
    const moved = entries.find((e) => e.action === 'mail.positionChanged')!
    expect(moved.changes?.position?.[0]).toBe('Au bureau d’ordre')
  })

  it('permet de consulter, rechercher et filtrer comme avec de vraies données', async () => {
    const docs = await db.documents.toArray()
    const text = docs.find((d) => d.ocrSource === 'nativeText')!
    expect((await openDocument(text.id)).blob.size).toBe(text.sizeBytes)

    await startSearch()
    const hits = await searchContent('recouvrement prêts')
    expect(hits.some((h) => h.kind === 'page')).toBe(true)
    expect(hits.some((h) => h.kind === 'mail')).toBe(true)
    expect((await searchContent('décret')).length).toBeGreaterThan(0)

    const page = await searchAuditLog(getSession().user!, { family: 'document' })
    expect(page.total).toBeGreaterThan(40)
  })

  it('laisse la base prête pour une première connexion', async () => {
    expect(await db.notifications.count()).toBe(0)
    await signOut()
    expect(getSession().status).toBe('signedOut')
    await expect(signIn({ username: 'archiviste', password: 'mauvais' })).rejects.toThrow()
  })
})
