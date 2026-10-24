// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { daysBetween } from '@/lib/dates'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { PermissionError, ValidationError } from './errors'
import { listEntityHistory } from './repositories/history'
import { changePosition, createMail, deleteMail, getMail, isStale, markProcessed, restoreMail, updateMail } from './repositories/mails'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { saveReference } from './repositories/referenceData'
import { createUser } from './repositories/users'
import { updateSettings } from './repositories/settings'
import { loadDemoData } from './seed/demo'
import { resetSessionForTests } from './session'

interface Ctx {
  dept: string
  staff: string
  staff2: string
  partner: string
  followUp: string
  position: string
  position2: string
}
let ctx: Ctx

async function setup() {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  const id = (type: Parameters<typeof saveReference>[0], input: object) => saveReference(type, null, input)
  ctx = {
    dept: await id('departments', { name: 'Cabinet' }),
    staff: await id('staff', { fullName: 'Karim Mansour', jobTitle: 'Directeur de cabinet' }),
    staff2: await id('staff', { fullName: 'Autre Agent' }),
    partner: await id('partners', { name: 'UNICEF', kind: 'internationalOrg' }),
    followUp: await id('followUps', { label: 'Urgent' }),
    position: await id('positions', { label: 'Au cabinet' }),
    position2: await id('positions', { label: 'Classé' }),
  }
}

const incoming = (over: object = {}) => ({
  mailDate: '2026-10-24',
  subject: 'Visite du musée',
  departmentId: ctx.dept,
  fileNumber: 'D1',
  followUpId: ctx.followUp,
  positionId: ctx.position,
  assignedStaffId: ctx.staff,
  sourcePartnerId: ctx.partner,
  ...over,
})
const outgoing = (over: object = {}) => ({ mailDate: '2026-10-24', subject: 'Réponse', signedByStaffId: ctx.staff, ...over })

const actions = async () => (await db.auditLog.toArray()).map((e) => e.action)

beforeEach(setup)

describe('enregistrement des courriers', () => {
  it('numérote chaque sens séparément, copie la fonction et journalise', async () => {
    const a = await createMail('incoming', incoming())
    const b = await createMail('incoming', incoming())
    const c = await createMail('outgoing', outgoing())
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    expect([a.reference, b.reference, c.reference]).toEqual([`1/${yy}`, `2/${yy}`, `1/${yy}`])
    expect((await db.mails.get(a.id))?.staffJobTitle).toBe('Directeur de cabinet')
    expect((await actions()).filter((x) => x === 'mail.created')).toHaveLength(3)
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('ne produit aucun doublon sous enregistrements simultanés', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => createMail('incoming', incoming())))
    expect(new Set(results.map((r) => r.reference)).size).toBe(15)
    expect((await db.mails.toArray()).map((m) => m.seq).sort((x, y) => x - y)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it('applique le format de numérotation des paramètres', async () => {
    await updateSettings({ referenceFormats: { mailOutgoing: '{n}-MFBSB/CAB/{yy}' } })
    const { reference } = await createMail('outgoing', outgoing())
    expect(reference).toMatch(/^1-MFBSB\/CAB\/\d{2}$/)
  })

  it('exige les champs obligatoires de WinDev, par sens', async () => {
    await expect(createMail('incoming', incoming({ subject: '' }))).rejects.toThrow("objet")
    await expect(createMail('incoming', incoming({ fileNumber: '' }))).rejects.toThrow('dossier')
    await expect(createMail('incoming', incoming({ assignedStaffId: '' }))).rejects.toThrow('destinataire')
    await expect(createMail('incoming', incoming({ mailDate: '31/02/2026' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createMail('outgoing', outgoing({ signedByStaffId: '' }))).rejects.toThrow('paraphé')
    // provenance, direction et « adressé à » restent facultatifs pour un départ
    await createMail('outgoing', outgoing({ recipientLabel: 'Mission permanente' }))
    expect(await db.mails.count()).toBe(1)
  })

  it('n’attribue pas de numéro si l’enregistrement échoue', async () => {
    await expect(createMail('incoming', incoming({ assignedStaffId: 'inconnu' }))).rejects.toBeInstanceOf(ValidationError)
    expect(await db.counters.count()).toBe(0)
    expect((await createMail('incoming', incoming())).reference).toMatch(/^1\//)
  })

  it('notifie le compte lié au destinataire, pas son auteur', async () => {
    const userId = await createUser({ fullName: 'Karim', username: 'karim', role: 'reader', staffId: ctx.staff, password: 'motdepasse-solide' })
    const { id } = await createMail('incoming', incoming())
    const notes = await db.notifications.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ recipientUserId: userId, title: 'Nouveau courrier : Visite du musée', entityId: id })
    await createMail('outgoing', outgoing())
    expect(await db.notifications.count()).toBe(1)
  })
})

describe('modification et suivi', () => {
  it('journalise les écarts avec des libellés, et distingue position et traitement', async () => {
    const { id } = await createMail('incoming', incoming())
    await changePosition(id, ctx.position2)
    await markProcessed(id)
    await updateMail(id, incoming({ subject: 'Nouvel objet', positionId: ctx.position2, isProcessed: true }))

    const history = await listEntityHistory('mail', id)
    expect(history.map((e) => e.action)).toEqual(['mail.created', 'mail.positionChanged', 'mail.processed', 'mail.updated'])
    expect(history[1]?.changes).toEqual({ position: ['Au cabinet', 'Classé'] })
    expect(history[3]?.changes).toEqual({ subject: ['Visite du musée', 'Nouvel objet'] })
    const mail = await db.mails.get(id)
    expect(mail).toMatchObject({ isProcessed: 1, positionId: ctx.position2 })
    expect(mail?.processedAt).toBeTruthy()
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('ne journalise rien quand rien ne change', async () => {
    const { id } = await createMail('incoming', incoming())
    const before = await db.auditLog.count()
    await updateMail(id, incoming())
    await markProcessed(id)
    await markProcessed(id)
    expect(await db.auditLog.count()).toBe(before + 1)
  })

  it('supprime logiquement sans réutiliser le numéro, et restaure', async () => {
    const { id } = await createMail('incoming', incoming())
    await deleteMail(id)
    expect(await getMail(id)).toBeUndefined()
    await expect(deleteMail(id)).rejects.toBeInstanceOf(ValidationError)
    expect((await createMail('incoming', incoming())).reference).toMatch(/^2\//)
    await restoreMail(id)
    expect((await getMail(id))?.reference).toMatch(/^1\//)
    expect((await actions()).slice(-3)).toEqual(['mail.deleted', 'mail.created', 'mail.restored'])
  })
})

describe('droits et confidentialité', () => {
  async function asUser(username: string) {
    await signOut()
    await signIn({ username, password: 'motdepasse-solide' })
  }

  it('limite lecteur et archiviste, et laisse le lecteur destinataire traiter son courrier', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Karim', username: 'karim', role: 'reader', staffId: ctx.staff, password: 'motdepasse-solide' })
    await createUser({ fullName: 'Autre', username: 'autre', role: 'reader', staffId: ctx.staff2, password: 'motdepasse-solide' })
    const normal = await createMail('incoming', incoming())

    await asUser('karim')
    await expect(createMail('incoming', incoming())).rejects.toBeInstanceOf(PermissionError)
    await expect(updateMail(normal.id, incoming())).rejects.toBeInstanceOf(PermissionError)
    await expect(deleteMail(normal.id)).rejects.toBeInstanceOf(PermissionError)
    await markProcessed(normal.id)
    await changePosition(normal.id, ctx.position2)

    await asUser('autre')
    await expect(markProcessed(normal.id)).rejects.toBeInstanceOf(PermissionError)
    await expect(changePosition(normal.id, ctx.position)).rejects.toBeInstanceOf(PermissionError)
  })

  it('cache un courrier restreint à ceux qui n’y ont pas droit', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Archi 2', username: 'archi2', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Karim', username: 'karim', role: 'reader', staffId: ctx.staff, password: 'motdepasse-solide' })
    await createUser({ fullName: 'Autre', username: 'autre', role: 'reader', staffId: ctx.staff2, password: 'motdepasse-solide' })

    await asUser('archi')
    const { id } = await createMail('incoming', incoming({ confidentiality: 'restricted' }))
    expect(await getMail(id)).toBeDefined()
    expect((await listEntityHistory('mail', id)).length).toBe(1)

    await asUser('archi2')
    expect(await getMail(id)).toBeUndefined()
    expect(await listEntityHistory('mail', id)).toEqual([])
    await expect(updateMail(id, incoming())).rejects.toBeInstanceOf(ValidationError)

    await asUser('autre')
    expect(await getMail(id)).toBeUndefined()

    await asUser('karim')
    expect(await getMail(id)).toBeDefined()

    await asUser('admin')
    expect(await getMail(id)).toBeDefined()
  })
})

describe('retard et données de démonstration', () => {
  it('calcule le retard au-delà du seuil, pour les courriers non traités seulement', () => {
    const late = { isProcessed: 0 as const, mailDate: '2026-10-01' }
    expect(isStale(late, '2026-10-16', 15)).toBe(false)
    expect(isStale(late, '2026-10-17', 15)).toBe(true)
    expect(isStale({ ...late, isProcessed: 1 }, '2026-12-01', 15)).toBe(false)
    expect(daysBetween('2026-10-01', '2026-10-24')).toBe(23)
  })

  it('charge ~180 arrivés et ~120 départs numérotés, environ 20 % non traités', async () => {
    await db.delete()
    await db.open()
    resetSessionForTests()
    await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
    await loadDemoData()
    const mails = await db.mails.toArray()
    const inc = mails.filter((m) => m.flow === 'incoming')
    expect(inc).toHaveLength(180)
    expect(mails.filter((m) => m.flow === 'outgoing')).toHaveLength(120)
    const pendingShare = inc.filter((m) => m.isProcessed === 0).length / inc.length
    expect(pendingShare).toBeGreaterThan(0.1)
    expect(pendingShare).toBeLessThan(0.3)
    // numéros uniques par sens et par année, compteur recalé sur le maximum
    expect(new Set(mails.map((m) => `${m.flow}${m.year}${m.seq}`)).size).toBe(300)
    for (const c of (await db.counters.toArray()).filter((x) => x.scope === 'mailIncoming' || x.scope === 'mailOutgoing')) {
      const max = Math.max(...inc.concat(mails).filter((m) => m.flow === (c.scope === 'mailIncoming' ? 'incoming' : 'outgoing') && m.year === c.year).map((m) => m.seq))
      expect(c.lastSeq).toBe(max)
    }
    expect((await verifyAuditChain()).ok).toBe(true)
  })
})
