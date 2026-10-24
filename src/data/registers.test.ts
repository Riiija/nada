// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney, moneyToInput, parseMoney } from '@/lib/money'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { PermissionError, ValidationError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { linkDocuments, saveImportedDocument } from './repositories/documents'
import { recordExport } from './repositories/exports'
import { listEntityHistory } from './repositories/history'
import {
  createRegisterEntry,
  deleteRegisterEntry,
  ledgerTotals,
  listRegisterEntries,
  restoreRegisterEntry,
  runningBalances,
  updateRegisterEntry,
} from './repositories/registers'
import { saveReference } from './repositories/referenceData'
import { updateSettings } from './repositories/settings'
import { createUser } from './repositories/users'
import { resetSessionForTests } from './session'

let ids: { head: string; minister: string; dept: string; staff: string; supplier: string }
const YY = String(new Date().getFullYear() % 100).padStart(2, '0')

const decree = (over: object = {}) => ({ signedOn: '2026-10-01', subject: 'Nomination', officialId: ids.head, ...over })
const invoice = (over: object = {}) => ({ supplierPartnerId: ids.supplier, invoiceDate: '2026-09-28', receivedOn: '2026-10-02', amount: '1 250,50', ...over })
const ledger = (over: object = {}) => ({ operationDate: '2026-10-03', label: 'Achat de fournitures', debit: '15000', ...over })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  ids = {
    head: await saveReference('headsOfState', null, { fullName: 'Chef de l’État' }),
    minister: await saveReference('ministers', null, { fullName: 'Ministre Test' }),
    dept: await saveReference('departments', null, { name: 'Cabinet' }),
    staff: await saveReference('staff', null, { fullName: 'Karim Mansour' }),
    supplier: await saveReference('partners', null, { name: 'Société Horizon', kind: 'company' }),
  }
})

describe('montants', () => {
  it('lit la saisie en unités et la convertit en centimes', () => {
    expect(parseMoney('1 750 000')).toBe(175_000_000)
    expect(parseMoney('1750000,50')).toBe(175_000_050)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('12,345')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
  })

  it('formate sans décimales quand il n’y a pas de centimes, et prépare la saisie', () => {
    expect(formatMoney(175_000_000)).toBe('1 750 000')
    expect(formatMoney(125_050)).toBe('1 250,50')
    expect(moneyToInput(125_050)).toBe('1250,50')
    expect(moneyToInput(1_500_000)).toBe('15000')
    expect(moneyToInput(undefined)).toBe('')
  })
})

describe('numérotation des registres', () => {
  it('numérote chaque registre séparément, avec le format des paramètres', async () => {
    const a = await createRegisterEntry('decrees', decree())
    const b = await createRegisterEntry('decrees', decree())
    const c = await createRegisterEntry('ministerialOrders', { signedOn: '2026-10-01', subject: 'Arrêté', officialId: ids.minister })
    const d = await createRegisterEntry('serviceNotes', { issuedOn: '2026-10-02', subject: 'Note' })
    const e = await createRegisterEntry('incomingInvoices', invoice())
    expect([a.reference, b.reference, c.reference, d.reference, e.reference]).toEqual([`1/${YY}`, `2/${YY}`, `1/${YY}`, `1/${YY}`, `1/${YY}`])

    await updateSettings({ referenceFormats: { decree: '{n}-DP/{yy}' } })
    expect((await createRegisterEntry('decrees', decree())).reference).toBe(`3-DP/${YY}`)
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('ne produit aucun doublon sous enregistrements simultanés', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => createRegisterEntry('decrees', decree())))
    expect(new Set(results.map((r) => r.reference)).size).toBe(12)
    expect((await db.decrees.toArray()).map((r) => r.seq).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('n’attribue pas de numéro au journal des opérations', async () => {
    const entry = await createRegisterEntry('ledgerEntries', ledger())
    expect(entry.reference).toBeUndefined()
    expect(await db.ledgerEntries.get(entry.id)).toMatchObject({ debit: 1_500_000, credit: 0 })
    expect(await db.counters.count()).toBe(0)
  })

  it('ne réutilise jamais un numéro supprimé', async () => {
    const a = await createRegisterEntry('decrees', decree())
    await deleteRegisterEntry('decrees', a.id)
    expect(await listRegisterEntries('decrees')).toEqual([])
    expect((await createRegisterEntry('decrees', decree())).reference).toBe(`2/${YY}`)
    await restoreRegisterEntry('decrees', a.id)
    expect((await listRegisterEntries('decrees')).map((r) => r.reference).sort()).toEqual([`1/${YY}`, `2/${YY}`])
  })
})

describe('validation', () => {
  it('exige la date, l’objet et le signataire des actes', async () => {
    await expect(createRegisterEntry('decrees', decree({ subject: '' }))).rejects.toThrow('objet')
    await expect(createRegisterEntry('decrees', decree({ officialId: '' }))).rejects.toThrow('signataire')
    await expect(createRegisterEntry('decrees', decree({ signedOn: '31/02/2026' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createRegisterEntry('decrees', decree({ publishedOn: 'hier' }))).rejects.toThrow('date valide')
    await expect(createRegisterEntry('serviceNotes', { issuedOn: '', subject: 'Note' })).rejects.toThrow('date')
    expect(await db.decrees.count()).toBe(0)
    expect(await db.counters.count()).toBe(0)
  })

  it('contrôle les montants des factures et des écritures', async () => {
    await expect(createRegisterEntry('incomingInvoices', invoice({ amount: '0' }))).rejects.toThrow('montant')
    await expect(createRegisterEntry('incomingInvoices', invoice({ amount: 'beaucoup' }))).rejects.toThrow('montant valide')
    await expect(createRegisterEntry('incomingInvoices', invoice({ supplierPartnerId: '' }))).rejects.toThrow('fournisseur')
    await expect(createRegisterEntry('incomingInvoices', invoice({ status: 'inconnu' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createRegisterEntry('ledgerEntries', ledger({ debit: '', credit: '' }))).rejects.toThrow('débit ou un crédit')
    await expect(createRegisterEntry('ledgerEntries', ledger({ debit: -100 }))).rejects.toThrow('négatif')
    // Un nombre est déjà en centimes, un texte est en unités
    const a = await createRegisterEntry('ledgerEntries', ledger({ debit: 2500, credit: '' }))
    const b = await createRegisterEntry('incomingInvoices', invoice({ amount: 99_000 }))
    expect((await db.ledgerEntries.get(a.id))?.debit).toBe(2500)
    expect((await db.incomingInvoices.get(b.id))?.amount).toBe(99_000)
    expect((await db.incomingInvoices.get(b.id))?.status).toBe('received')
  })
})

describe('modification et droits', () => {
  it('journalise le seul écart avec des libellés lisibles, et rien s’il n’y a pas de changement', async () => {
    const { id } = await createRegisterEntry('decrees', decree())
    const other = await saveReference('headsOfState', null, { fullName: 'Nouveau signataire' })
    await updateRegisterEntry('decrees', id, decree({ subject: 'Nomination modifiée', officialId: other }))
    const history = await listEntityHistory('decrees', id)
    expect(history.map((e) => e.action)).toEqual(['decree.created', 'decree.updated'])
    expect(history[1]?.changes).toEqual({ subject: ['Nomination', 'Nomination modifiée'], official: ['Chef de l’État', 'Nouveau signataire'] })

    const before = await db.auditLog.count()
    await updateRegisterEntry('decrees', id, decree({ subject: 'Nomination modifiée', officialId: other }))
    expect(await db.auditLog.count()).toBe(before)
    await expect(updateRegisterEntry('decrees', 'inconnu', decree())).rejects.toBeInstanceOf(ValidationError)
  })

  it('autorise la lecture à tous, l’écriture à l’admin et à l’archiviste, et la restauration au seul auteur de la suppression', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Archi 2', username: 'archi2', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    const { id } = await createRegisterEntry('serviceNotes', { issuedOn: '2026-10-02', subject: 'Note' })

    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await deleteRegisterEntry('serviceNotes', id)
    await signOut()
    await signIn({ username: 'archi2', password: 'motdepasse-solide' })
    await expect(restoreRegisterEntry('serviceNotes', id)).rejects.toBeInstanceOf(PermissionError)
    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await restoreRegisterEntry('serviceNotes', id)

    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    expect(await listRegisterEntries('serviceNotes')).toHaveLength(1)
    await expect(createRegisterEntry('serviceNotes', { issuedOn: '2026-10-02', subject: 'x' })).rejects.toBeInstanceOf(PermissionError)
    await expect(updateRegisterEntry('serviceNotes', id, { issuedOn: '2026-10-02', subject: 'x' })).rejects.toBeInstanceOf(PermissionError)
    await expect(deleteRegisterEntry('serviceNotes', id)).rejects.toBeInstanceOf(PermissionError)
    await expect(recordExport('Notes de service', 1)).rejects.toBeInstanceOf(PermissionError)
  })
})

describe('pièces jointes', () => {
  it('rattache des documents à un décret ou à une écriture, à l’import comme depuis les archives', async () => {
    const d = await createRegisterEntry('decrees', decree())
    const l = await createRegisterEntry('ledgerEntries', ledger())
    const blob = new Blob(['%PDF-1.4 décret'])
    const saved = await saveImportedDocument({
      blob,
      meta: { title: 'Décret signé', originalFilename: 'decret.pdf', kind: 'pdf', mimeType: 'application/pdf', sizeBytes: blob.size, sha256: 'a'.repeat(64), pageCount: 1 },
      category: 'decree',
      archivedAt: '2026-10-03',
      link: { entityType: 'decree', entityId: d.id },
    })
    if (saved.status !== 'saved') throw new Error('attendu : saved')
    await linkDocuments([saved.id], 'ledgerEntry', l.id)
    expect((await db.documentLinks.toArray()).map((x) => x.entityType).sort()).toEqual(['decree', 'ledgerEntry'])
    const last = (await db.auditLog.toArray()).at(-1)!
    expect(last).toMatchObject({ action: 'document.linked', metadata: { entityType: 'ledgerEntry' } })
    await expect(linkDocuments([saved.id], 'decree', 'inconnu')).rejects.toThrow('n\'existe plus')
    await deleteRegisterEntry('decrees', d.id)
    await expect(linkDocuments([saved.id], 'decree', d.id)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('journal des opérations', () => {
  it('calcule totaux et solde cumulé en centimes, dans l’ordre chronologique', async () => {
    await createRegisterEntry('ledgerEntries', ledger({ operationDate: '2026-10-05', label: 'Virement reçu', debit: '', credit: '100 000' }))
    await createRegisterEntry('ledgerEntries', ledger({ operationDate: '2026-10-01', label: 'Loyer', debit: '30 000,50' }))
    await createRegisterEntry('ledgerEntries', ledger({ operationDate: '2026-10-03', label: 'Fournitures', debit: '15 000' }))
    const rows = await listRegisterEntries('ledgerEntries')
    expect(rows.map((r) => r.label)).toEqual(['Virement reçu', 'Fournitures', 'Loyer']) // plus récent d'abord
    expect(ledgerTotals(rows)).toEqual({ debit: 4_500_050, credit: 10_000_000, balance: 5_499_950 })
    const balances = runningBalances(rows)
    expect(rows.map((r) => balances.get(r.id))).toEqual([5_499_950, -4_500_050, -3_000_050])
    expect(ledgerTotals([])).toEqual({ debit: 0, credit: 0, balance: 0 })
  })
})

describe('trace des exports', () => {
  it('journalise l’export avec le nombre de lignes et les filtres', async () => {
    await recordExport('Décrets présidentiels', 12, { du: '2026-01-01' })
    expect((await db.auditLog.toArray()).at(-1)).toMatchObject({
      action: 'export.generated',
      entityLabel: 'Export : Décrets présidentiels',
      metadata: { count: 12, filters: { du: '2026-01-01' } },
    })
  })
})
