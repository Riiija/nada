// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'
import { verifyAuditChain } from './audit'
import { describeAudit, formatChangeValue } from './audit-labels'
import { db } from './db'
import { PermissionError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { exportAuditCsv, searchAuditLog, verifyAuditIntegrity } from './repositories/auditLog'
import { changePosition, createMail, markProcessed, updateMail } from './repositories/mails'
import { saveReference } from './repositories/referenceData'
import { createUser } from './repositories/users'
import { getSession, resetSessionForTests } from './session'

let ids: { dept: string; staff: string; followUp: string; position: string; position2: string }

const base = () => ({
  mailDate: '2026-10-24', departmentId: ids.dept, fileNumber: 'D1', followUpId: ids.followUp, positionId: ids.position, assignedStaffId: ids.staff,
})

async function as(username: string) {
  await signOut()
  await signIn({ username, password: 'motdepasse-solide' })
}

const me = () => getSession().user!

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  ids = {
    dept: await saveReference('departments', null, { name: 'Cabinet' }),
    staff: await saveReference('staff', null, { fullName: 'Karim Mansour' }),
    followUp: await saveReference('followUps', null, { label: 'Urgent' }),
    position: await saveReference('positions', null, { label: 'Au cabinet' }),
    position2: await saveReference('positions', null, { label: 'Classé' }),
  }
})

describe('visibilité du journal', () => {
  it('donne tout à l’administrateur, tout sauf les connexions à l’archiviste', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    const all = await searchAuditLog(me(), {})
    expect(all.entries.some((e) => e.action.startsWith('auth.'))).toBe(true)
    expect(all.total).toBe(all.entries.length)
    expect(all.entries[0]!.seq).toBeGreaterThan(all.entries.at(-1)!.seq!)

    await as('archi')
    const mine = await searchAuditLog(me(), {})
    expect(mine.entries.some((e) => e.action.startsWith('auth.'))).toBe(false)
    expect(mine.entries.some((e) => e.action === 'referenceData.created')).toBe(true)
  })

  it('limite le lecteur à ses actions et à l’historique de ce qu’il voit', async () => {
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', staffId: ids.staff, password: 'motdepasse-solide' })
    await createUser({ fullName: 'Autre', username: 'autre', role: 'reader', password: 'motdepasse-solide' })
    const open = await createMail('incoming', { ...base(), subject: 'Public' })
    const secret = await createMail('incoming', { ...base(), subject: 'Secret', confidentiality: 'restricted' })

    await as('lect')
    await markProcessed(open.id)
    const lect = await searchAuditLog(me(), {})
    const labels = lect.entries.map((e) => e.entityLabel).join(' | ')
    expect(labels).toContain('Public')
    expect(labels).toContain('Secret') // destinataire du courrier restreint
    expect(lect.entries.some((e) => e.action === 'referenceData.created')).toBe(false)
    expect(lect.entries.some((e) => e.action === 'user.created')).toBe(false)
    expect(lect.entries.some((e) => e.action === 'auth.signedIn' && e.actorId === me().id)).toBe(true) // ses propres connexions

    await as('autre')
    const autre = await searchAuditLog(me(), {})
    const text = autre.entries.map((e) => e.entityLabel).join(' | ')
    expect(text).toContain('Public')
    expect(text).not.toContain('Secret')
    expect(secret.id).toBeTruthy()
  })
})

describe('filtres', () => {
  beforeEach(async () => {
    const mail = await createMail('incoming', { ...base(), subject: 'Visite du musée' })
    await changePosition(mail.id, ids.position2)
    await updateMail(mail.id, { ...base(), positionId: ids.position2, subject: 'Visite du Musée national' })
  })

  it('filtre par famille, type d’élément et utilisateur', async () => {
    expect((await searchAuditLog(me(), { family: 'mail' })).entries.map((e) => e.action)).toEqual(['mail.updated', 'mail.positionChanged', 'mail.created'])
    expect((await searchAuditLog(me(), { entityKind: 'reference' })).entries).toHaveLength(5)
    expect((await searchAuditLog(me(), { family: 'auth' })).entries.every((e) => e.action.startsWith('auth.'))).toBe(true)
    const own = await searchAuditLog(me(), { actorId: me().id })
    expect(own.total).toBe((await db.auditLog.count()))
    expect((await searchAuditLog(me(), { actorId: 'inconnu' })).total).toBe(0)
  })

  it('cherche dans le texte sans tenir compte des accents ni de la casse, y compris dans les modifications', async () => {
    expect((await searchAuditLog(me(), { text: 'MUSEE' })).entries.map((e) => e.action)).toEqual(['mail.updated', 'mail.positionChanged', 'mail.created'])
    expect((await searchAuditLog(me(), { text: 'au cabinet' })).entries.map((e) => e.action)).toContain('mail.positionChanged')
    expect((await searchAuditLog(me(), { text: 'national' })).entries.map((e) => e.action)).toEqual(['mail.updated'])
    expect((await searchAuditLog(me(), { text: 'a changé la position' })).entries).toHaveLength(1)
    expect((await searchAuditLog(me(), { text: 'zzz' })).total).toBe(0)
  })

  it('filtre par période, dans le fuseau des paramètres', async () => {
    await db.auditLog.toCollection().modify((e) => {
      e.occurredAt = e.seq! % 2 === 0 ? '2026-03-10T10:00:00.000Z' : '2026-10-24T10:00:00.000Z'
    })
    const march = await searchAuditLog(me(), { from: '2026-03-01', to: '2026-03-31' })
    expect(march.total).toBeGreaterThan(0)
    expect(march.entries.every((e) => e.occurredAt.startsWith('2026-03'))).toBe(true)
    expect((await searchAuditLog(me(), { from: '2026-10-01' })).entries.every((e) => e.occurredAt.startsWith('2026-10'))).toBe(true)
    expect((await searchAuditLog(me(), { from: '2027-01-01' })).total).toBe(0)
  })

  it('limite l’affichage mais compte toutes les correspondances', async () => {
    const page = await searchAuditLog(me(), {}, 3)
    expect(page.entries).toHaveLength(3)
    expect(page.total).toBe(await db.auditLog.count())
    expect(page.capped).toBe(false)
  })
})

describe('export CSV', () => {
  it('exporte ce qui est filtré, avec BOM et point-virgule, et journalise l’export', async () => {
    await createMail('incoming', { ...base(), subject: '=SOMME(A1)' })
    const result = await exportAuditCsv({ family: 'mail' })
    expect(result.count).toBe(1)
    expect(result.filename).toMatch(/^historique-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(result.csv.charCodeAt(0)).toBe(0xfeff)
    const lines = result.csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe('N°;Date et heure;Utilisateur;Rôle;Action;Élément;Modifications;Navigateur')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('a enregistré le courrier')
    expect(lines[1]).toContain('Courrier arrivé 1/26 : =SOMME(A1)')
    const last = (await db.auditLog.toArray()).at(-1)!
    expect(last).toMatchObject({ action: 'audit.exported', metadata: { count: 1, filters: { family: 'mail' } } })
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('refuse l’export à un lecteur', async () => {
    await createUser({ fullName: 'Lecteur', username: 'lect', role: 'reader', password: 'motdepasse-solide' })
    await as('lect')
    await expect(exportAuditCsv({})).rejects.toBeInstanceOf(PermissionError)
  })

  it('échappe guillemets, points-virgules et retours à la ligne', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'dit "oui"\nok'], [12, null], ['-5', '-texte']])).toBe(
      `${String.fromCharCode(0xfeff)}a;b\r\n"x;y";"dit ""oui""\nok"\r\n12;\r\n-5;'-texte\r\n`,
    )
  })
})

describe('vérification d’intégrité', () => {
  it('confirme la chaîne et journalise le contrôle', async () => {
    await createMail('incoming', { ...base(), subject: 'Objet' })
    const result = await verifyAuditIntegrity()
    expect(result.ok).toBe(true)
    const last = (await db.auditLog.toArray()).at(-1)!
    expect(last).toMatchObject({ action: 'audit.verified', metadata: { ok: true, count: result.count } })
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('signale la première entrée falsifiée, et le dit dans le journal', async () => {
    await createMail('incoming', { ...base(), subject: 'Objet' })
    const target = (await db.auditLog.toArray())[3]!
    await db.auditLog.update(target.seq!, { entityLabel: 'Falsifié' })
    const result = await verifyAuditIntegrity()
    expect(result).toMatchObject({ ok: false, firstInvalidSeq: target.seq })
    expect((await db.auditLog.toArray()).at(-1)).toMatchObject({ action: 'audit.verified', metadata: { ok: false, firstInvalidSeq: target.seq } })
  })

  it('est réservée à l’administrateur', async () => {
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await as('archi')
    await expect(verifyAuditIntegrity()).rejects.toBeInstanceOf(PermissionError)
  })
})

describe('phrases du journal', () => {
  it('décrit les actions et formate les valeurs des modifications', () => {
    const entry = { action: 'mail.positionChanged', changes: { position: ['Au cabinet', null] } } as never
    expect(describeAudit(entry)).toBe('a changé la position : Au cabinet → vide')
    expect(formatChangeValue('isProcessed', 1)).toBe('oui')
    expect(formatChangeValue('isActive', 0)).toBe('non')
    expect(formatChangeValue('role', 'archivist')).toBe('Archiviste')
    expect(formatChangeValue('subject', '')).toBe('vide')
    expect(formatChangeValue('rotation', 90)).toBe('90')
  })
})
