// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { createMail, markProcessed } from './repositories/mails'
import { saveReference } from './repositories/referenceData'
import { computeDashboard, listRecentActivity } from './repositories/stats'
import { createUser } from './repositories/users'
import { getSession, resetSessionForTests } from './session'
import type { DocumentRecord, Mail } from './types'

const TODAY = '2026-10-24'

let n = 0
const mail = (flow: 'incoming' | 'outgoing', mailDate: string, over: Partial<Mail> = {}): Mail => ({
  id: `m${++n}`, flow, seq: n, year: Number(mailDate.slice(0, 4)), reference: `${n}/26`, mailDate, subject: `Objet ${n}`,
  isProcessed: 0, confidentiality: 'normal', createdAt: mailDate, createdBy: 'u', updatedAt: mailDate, updatedBy: 'u', ...over,
})
const doc = (archivedAt: string, over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: `d${++n}`, category: 'archive', title: 'Doc', originalFilename: 'a.pdf', kind: 'pdf', mimeType: 'application/pdf', sizeBytes: 1000,
  sha256: 'x', pageCount: 1, rotation: 0, ocrStatus: 'pending', archivedAt, confidentiality: 'normal',
  createdAt: archivedAt, createdBy: 'u', updatedAt: archivedAt, updatedBy: 'u', ...over,
})

const compute = (incoming: Mail[], outgoing: Mail[] = [], documents: DocumentRecord[] = [], year = 2026) =>
  computeDashboard({ incoming, outgoing, documents, today: TODAY, staleAfterDays: 15, year })

describe('calcul du tableau de bord', () => {
  it('compare le mois en cours au mois précédent et dessine 30 jours', () => {
    const s = compute(
      [mail('incoming', '2026-10-24'), mail('incoming', '2026-10-03'), mail('incoming', '2026-10-03'), mail('incoming', '2026-09-30'), mail('incoming', '2026-09-01'), mail('incoming', '2026-08-31')],
      [mail('outgoing', '2026-10-10')],
    )
    expect(s.incoming).toMatchObject({ value: 3, current: 3, previous: 2 })
    expect(s.outgoing).toMatchObject({ value: 1, previous: 0 })
    expect(s.incoming.spark).toHaveLength(30)
    expect(s.incoming.spark.at(-1)).toBe(1) // aujourd'hui
    expect(s.incoming.spark.at(-22)).toBe(2) // le 3 octobre
    expect(s.incoming.spark.reduce((a, b) => a + b, 0)).toBe(4) // 24/10, 3/10 ×2 et 30/09 sont dans les 30 jours
  })

  it('suit les courriers en attente, jour par jour, y compris ceux traités depuis', () => {
    const s = compute([
      mail('incoming', '2026-09-20', { isProcessed: 0 }),
      mail('incoming', '2026-09-25', { isProcessed: 1, processedAt: '2026-10-05T10:00:00.000Z' }),
      mail('incoming', '2026-10-20', { isProcessed: 0 }),
      mail('incoming', '2026-10-22', { isProcessed: 1, processedAt: '2026-10-23T10:00:00.000Z' }),
    ])
    expect(s.pending.value).toBe(2)
    expect(s.pending.previous).toBe(2) // fin septembre : 20/09 et 25/09 en attente
    expect(s.pending.spark.at(-1)).toBe(2)
    expect(s.pending.spark.at(-2)).toBe(2) // le 23 octobre, le courrier du 22 est traité dans la journée
    expect(s.pending.spark.at(-3)).toBe(3) // le 22 octobre au soir : 20/09, 20/10 et 22/10
  })

  it('classe les 6 plus anciens en attente avec leur ancienneté', () => {
    const s = compute([
      ...Array.from({ length: 8 }, (_, i) => mail('incoming', `2026-10-${String(i + 1).padStart(2, '0')}`)),
      mail('incoming', '2026-01-01', { isProcessed: 1 }),
    ])
    expect(s.oldestPending).toHaveLength(6)
    expect(s.oldestPending[0]).toMatchObject({ mailDate: '2026-10-01', ageDays: 23 })
    expect(s.oldestPending.map((m) => m.mailDate)).toEqual([...s.oldestPending.map((m) => m.mailDate)].sort())
  })

  it('agrège par mois sur l’année choisie, avec les années disponibles', () => {
    const s = compute(
      [mail('incoming', '2026-01-15'), mail('incoming', '2026-01-20'), mail('incoming', '2025-12-31', { isProcessed: 1 })],
      [mail('outgoing', '2026-03-02')],
      [doc('2026-03-10'), doc('2025-12-01')],
    )
    expect(s.monthly[0]).toMatchObject({ month: 1, incoming: 2, outgoing: 0, archived: 0 })
    expect(s.monthly[2]).toMatchObject({ month: 3, outgoing: 1, archived: 1 })
    expect(s.monthly[10]).toEqual({ month: 11, incoming: null, outgoing: null, archived: null }) // mois à venir
    expect(s.monthly[9]).toMatchObject({ incoming: 0 })
    expect(s.years).toEqual([2026, 2025])
    const previous = compute([mail('incoming', '2025-12-31', { isProcessed: 1 })], [], [doc('2025-12-01')], 2025)
    expect(previous.monthly[11]).toMatchObject({ incoming: 1, archived: 1 }) // année passée : les 12 mois comptent
    expect(previous.processed).toEqual({ done: 1, total: 1 })
  })

  it('compte les documents, leur taille, leurs catégories et ceux lisibles par la recherche', () => {
    const s = compute([], [], [
      doc('2026-10-02', { sizeBytes: 3000, ocrStatus: 'done' }),
      doc('2026-10-03', { sizeBytes: 500, category: 'decree', ocrStatus: 'done' }),
      doc('2026-09-03', { ocrStatus: 'failed' }),
      doc('2026-09-04', { ocrStatus: 'pending' }),
    ])
    expect(s.documents).toMatchObject({ value: 4, current: 2, previous: 2, bytes: 5500 })
    expect(s.readable).toEqual({ done: 2, total: 4 })
    expect(s.categories).toEqual([{ category: 'archive', count: 3 }, { category: 'decree', count: 1 }])
  })

  it('reste cohérent sans aucune donnée', () => {
    const s = compute([])
    expect(s.incoming).toMatchObject({ value: 0, previous: 0 })
    expect(s.oldestPending).toEqual([])
    expect(s.processed).toEqual({ done: 0, total: 0 })
    expect(s.years).toEqual([2026])
    expect(s.monthly).toHaveLength(12)
  })
})

describe('activité récente', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    resetSessionForTests()
    await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
  })

  it('met les plus récentes d’abord, sans la consultation ni la session', async () => {
    const dept = await saveReference('departments', null, { name: 'Cabinet' })
    const staff = await saveReference('staff', null, { fullName: 'Karim Mansour' })
    await createMail('outgoing', { mailDate: TODAY, subject: 'Réponse', signedByStaffId: staff, departmentId: dept })
    const entries = await listRecentActivity(getSession().user!, 8)
    expect(entries.map((e) => e.action)).toEqual(['mail.created', 'referenceData.created', 'referenceData.created', 'user.created'])
    expect(entries.some((e) => e.action.startsWith('auth.'))).toBe(false)
  })

  it('limite le nombre d’événements', async () => {
    for (let i = 0; i < 10; i++) await saveReference('departments', null, { name: `Direction ${i}` })
    expect(await listRecentActivity(getSession().user!, 8)).toHaveLength(8)
    expect(await listRecentActivity(getSession().user!, 3)).toHaveLength(3)
  })

  it('montre à un lecteur ses actions et l’historique de ce qu’il voit, pas le reste', async () => {
    const dept = await saveReference('departments', null, { name: 'Cabinet' })
    const staff = await saveReference('staff', null, { fullName: 'Karim Mansour' })
    const followUp = await saveReference('followUps', null, { label: 'Urgent' })
    const position = await saveReference('positions', null, { label: 'Au cabinet' })
    await createUser({ fullName: 'Karim', username: 'karim', role: 'reader', staffId: staff, password: 'motdepasse-solide' })
    await createUser({ fullName: 'Autre', username: 'autre', role: 'reader', password: 'motdepasse-solide' })
    const base = { mailDate: TODAY, departmentId: dept, fileNumber: 'D1', followUpId: followUp, positionId: position, assignedStaffId: staff }
    const open = await createMail('incoming', { ...base, subject: 'Public' })
    await createMail('incoming', { ...base, subject: 'Secret', confidentiality: 'restricted' })

    await signOut()
    await signIn({ username: 'karim', password: 'motdepasse-solide' })
    await markProcessed(open.id)
    const mine = await listRecentActivity(getSession().user!, 20)
    expect(mine.map((e) => e.entityLabel)).toEqual(expect.arrayContaining([expect.stringContaining('Public'), expect.stringContaining('Secret')]))
    expect(mine.some((e) => e.action === 'referenceData.created')).toBe(false)

    await signOut()
    await signIn({ username: 'autre', password: 'motdepasse-solide' })
    const other = await listRecentActivity(getSession().user!, 20)
    expect(other.map((e) => e.entityLabel).join(' ')).toContain('Public')
    expect(other.map((e) => e.entityLabel).join(' ')).not.toContain('Secret')
  })
})
