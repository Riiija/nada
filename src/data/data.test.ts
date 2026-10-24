// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { appendAudit, diffChanges, verifyAuditChain } from './audit'
import { currentYear, formatReference, nextSequence, peekNextSequence } from './counters'
import { db } from './db'
import { AuthError, PermissionError, ValidationError } from './errors'
import { createFirstAdmin, lockSession, resetAdminPassword, restoreSession, signIn, signOut, unlockSession } from './repositories/auth'
import { getSettings, updateSettings } from './repositories/settings'
import { getSession, requireRole, resetSessionForTests, startSession } from './session'
import type { User } from './types'

const admin = { organizationName: 'Ministère test', fullName: 'Nadia Test', username: 'Nadia', password: 'motdepasse-solide' }

async function reset() {
  await db.delete()
  await db.open()
  resetSessionForTests()
}

beforeEach(reset)

describe('journal d’audit chaîné', () => {
  async function append(n: number) {
    for (let i = 0; i < n; i++) {
      await db.transaction('rw', db.auditLog, (tx) =>
        appendAudit(tx, { action: 'mail.created', entityType: 'mail', entityId: `m${i}`, entityLabel: `Courrier ${i}` }),
      )
    }
  }

  it('reste vérifiable après plusieurs écritures', async () => {
    await append(5)
    expect(await verifyAuditChain()).toEqual({ ok: true, count: 5 })
  })

  it('détecte une entrée modifiée', async () => {
    await append(5)
    await db.auditLog.update(3, { entityLabel: 'Falsifié' })
    const result = await verifyAuditChain()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.firstInvalidSeq).toBe(3)
  })

  it('détecte une entrée supprimée', async () => {
    await append(5)
    await db.auditLog.delete(2)
    const result = await verifyAuditChain()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.firstInvalidSeq).toBe(3)
  })

  it('annule la trace avec l’action si la transaction échoue', async () => {
    await expect(
      db.transaction('rw', db.auditLog, db.counters, async (tx) => {
        await nextSequence(tx, 'mailIncoming', 2026)
        await appendAudit(tx, { action: 'mail.created', entityType: 'mail', entityId: 'x', entityLabel: 'x' })
        throw new Error('échec')
      }),
    ).rejects.toThrow('échec')
    expect(await db.auditLog.count()).toBe(0)
    expect(await peekNextSequence('mailIncoming', 2026)).toBe(1)
  })

  it('ne garde que les propriétés modifiées et remplace contentText par sa longueur', () => {
    expect(diffChanges({ a: 1, b: 'x', contentText: 'abc' }, { a: 1, b: 'y', contentText: 'abcde' })).toEqual({
      b: ['x', 'y'],
      contentText: [3, 5],
    })
  })
})

describe('numérotation', () => {
  it('ne produit aucun doublon sous écritures simultanées', async () => {
    const seqs = await Promise.all(
      Array.from({ length: 20 }, () => db.transaction('rw', db.counters, (tx) => nextSequence(tx, 'mailIncoming', 2026))),
    )
    expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('repart à 1 chaque année et par registre', async () => {
    const take = (scope: 'mailIncoming' | 'decree', year: number) =>
      db.transaction('rw', db.counters, (tx) => nextSequence(tx, scope, year))
    expect(await take('mailIncoming', 2026)).toBe(1)
    expect(await take('mailIncoming', 2026)).toBe(2)
    expect(await take('mailIncoming', 2027)).toBe(1)
    expect(await take('decree', 2026)).toBe(1)
  })

  it('formate la référence et lit l’année dans le fuseau des paramètres', () => {
    expect(formatReference('{n}/{yy}', 12, 2026)).toBe('12/26')
    expect(formatReference('{n}-MFBSB/CAB/{yy}', 9, 2026)).toBe('9-MFBSB/CAB/26')
    expect(currentYear('Pacific/Auckland', new Date('2026-12-31T20:00:00Z'))).toBe(2027)
    expect(currentYear('UTC', new Date('2026-12-31T20:00:00Z'))).toBe(2026)
  })
})

describe('comptes et rôles', () => {
  it('crée le premier administrateur avec sa trace et une clé de récupération', async () => {
    const { recoveryKey } = await createFirstAdmin(admin)
    expect(recoveryKey).toMatch(/^([A-Z0-9]{5}-){4}[A-Z0-9]{5}$/)
    const users = await db.users.toArray()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ username: 'nadia', role: 'admin', isActive: 1 })
    expect(users[0]?.passwordHash).not.toContain(admin.password)
    expect((await getSettings()).organizationName).toBe('Ministère test')
    expect(getSession().status).toBe('active')
    expect((await db.auditLog.toArray()).map((e) => e.action)).toEqual(['user.created', 'auth.signedIn'])
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('refuse un second premier lancement et un mot de passe trop court', async () => {
    await createFirstAdmin(admin)
    await expect(createFirstAdmin(admin)).rejects.toBeInstanceOf(ValidationError)
    await reset()
    await expect(createFirstAdmin({ ...admin, password: 'court' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('connecte, verrouille, déverrouille et déconnecte en journalisant chaque étape', async () => {
    await createFirstAdmin(admin)
    await signOut()
    expect(getSession().status).toBe('signedOut')

    await expect(signIn({ username: 'nadia', password: 'mauvais' })).rejects.toBeInstanceOf(AuthError)
    await signIn({ username: 'NADIA', password: admin.password })
    expect(getSession().status).toBe('active')

    await lockSession()
    expect(getSession().status).toBe('locked')
    await expect(unlockSession('mauvais')).rejects.toBeInstanceOf(AuthError)
    await unlockSession(admin.password)
    expect(getSession().status).toBe('active')
    await signOut()

    expect((await db.auditLog.toArray()).map((e) => e.action)).toEqual([
      'user.created',
      'auth.signedIn',
      'auth.signedOut',
      'auth.signInFailed',
      'auth.signedIn',
      'auth.locked',
      'auth.signInFailed',
      'auth.unlocked',
      'auth.signedOut',
    ])
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('refuse un compte désactivé', async () => {
    await createFirstAdmin(admin)
    await signOut()
    await db.users.toCollection().modify({ isActive: 0 })
    await expect(signIn({ username: 'nadia', password: admin.password })).rejects.toThrow('désactivé')
  })

  it('applique requireRole selon le rôle de la session', async () => {
    const reader: User = {
      id: 'u2', username: 'lecteur', fullName: 'Lecteur', role: 'reader', isActive: 1,
      passwordHash: '', passwordSalt: '', createdAt: new Date().toISOString(),
    }
    expect(() => requireRole('admin')).toThrow(PermissionError)
    startSession(reader)
    expect(() => requireRole('admin', 'archivist')).toThrow(PermissionError)
    expect(requireRole('reader').id).toBe('u2')
    await expect(updateSettings({ staleAfterDays: 30 })).rejects.toBeInstanceOf(PermissionError)
  })

  it('journalise la modification des paramètres avec le seul écart', async () => {
    await createFirstAdmin(admin)
    await updateSettings({ staleAfterDays: 30 })
    const last = (await db.auditLog.toArray()).at(-1)
    expect(last).toMatchObject({ action: 'settings.updated', changes: { staleAfterDays: [15, 30] } })
    expect((await getSettings()).staleAfterDays).toBe(30)
  })

  it('réinitialise le mot de passe avec la clé de récupération, une seule fois', async () => {
    const { recoveryKey } = await createFirstAdmin(admin)
    await signOut()
    await expect(
      resetAdminPassword({ recoveryKey: 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA', password: 'nouveau-mot-de-passe', confirmPassword: 'nouveau-mot-de-passe' }),
    ).rejects.toBeInstanceOf(AuthError)

    const next = await resetAdminPassword({ recoveryKey: recoveryKey.toLowerCase(), password: 'nouveau-mot-de-passe', confirmPassword: 'nouveau-mot-de-passe' })
    expect(next.recoveryKey).not.toBe(recoveryKey)
    await signIn({ username: 'nadia', password: 'nouveau-mot-de-passe' })
    await signOut()
    await expect(signIn({ username: 'nadia', password: admin.password })).rejects.toBeInstanceOf(AuthError)
    await expect(
      resetAdminPassword({ recoveryKey, password: 'encore-un-autre', confirmPassword: 'encore-un-autre' }),
    ).rejects.toBeInstanceOf(AuthError)
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('restaure la session de l’onglet mais pas celle d’un compte désactivé', async () => {
    await createFirstAdmin(admin)
    const stored = { userId: (await db.users.toArray())[0]!.id, locked: false }
    const store = new Map<string, string>([['ged.session', JSON.stringify(stored)]])
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    })
    resetSessionForTests('loading')
    store.set('ged.session', JSON.stringify(stored))
    await restoreSession()
    expect(getSession().status).toBe('active')

    await db.users.toCollection().modify({ isActive: 0 })
    store.set('ged.session', JSON.stringify(stored))
    await restoreSession()
    expect(getSession().status).toBe('signedOut')
  })
})
