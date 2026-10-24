// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { verifyAuditChain } from './audit'
import { db } from './db'
import { PermissionError, ValidationError } from './errors'
import { createFirstAdmin, signIn, signOut } from './repositories/auth'
import { listReference, saveReference, setReferenceActive } from './repositories/referenceData'
import { getSettings, updateSettings } from './repositories/settings'
import { createUser, listUsers, resetUserPassword, setUserActive, updateUser } from './repositories/users'
import { loadDemoData } from './seed/demo'
import { getSession, resetSessionForTests } from './session'

async function freshAdmin() {
  await db.delete()
  await db.open()
  resetSessionForTests()
  await createFirstAdmin({ organizationName: 'Org', fullName: 'Admin Test', username: 'admin', password: 'motdepasse-solide' })
}

beforeEach(freshAdmin)

const actions = async () => (await db.auditLog.toArray()).map((e) => e.action)

describe('référentiels', () => {
  it('crée, modifie et désactive avec une trace pour chaque écriture', async () => {
    const id = await saveReference('departments', null, { code: 'CAB', name: 'Cabinet' })
    expect(await listReference('departments')).toMatchObject([{ id, name: 'Cabinet', code: 'CAB', isActive: 1 }])

    await saveReference('departments', id, { code: '', name: 'Cabinet du ministre' })
    const [row] = await listReference('departments')
    expect(row?.name).toBe('Cabinet du ministre')
    expect(row?.code).toBeUndefined()

    await setReferenceActive('departments', id, false)
    expect((await listReference('departments'))[0]?.isActive).toBe(0)
    await setReferenceActive('departments', id, true)

    expect((await actions()).slice(-4)).toEqual([
      'referenceData.created',
      'referenceData.updated',
      'referenceData.deactivated',
      'referenceData.updated',
    ])
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('ne journalise rien quand rien ne change', async () => {
    const id = await saveReference('partners', null, { name: 'UNICEF', kind: 'internationalOrg' })
    const before = await db.auditLog.count()
    await saveReference('partners', id, { name: 'UNICEF', kind: 'internationalOrg' })
    expect(await db.auditLog.count()).toBe(before)
  })

  it('valide les champs et refuse les doublons de libellé', async () => {
    await expect(saveReference('departments', null, { name: '  ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveReference('staff', null, { fullName: 'A', email: 'pas-un-mail' })).rejects.toThrow('adresse e-mail')
    await saveReference('mailTypes', null, { label: 'Lettre' })
    await expect(saveReference('mailTypes', null, { label: 'Lettre' })).rejects.toThrow('existe déjà')
    expect(await db.lookups.count()).toBe(1)
  })

  it('numérote les listes, sépare chefs de l’État et ministres, et isole les catégories', async () => {
    await saveReference('mailTypes', null, { label: 'Lettre' })
    await saveReference('mailTypes', null, { label: 'Note' })
    await saveReference('followUps', null, { label: 'Urgent' })
    expect((await listReference('mailTypes')).map((r) => [r.label, r.sortOrder])).toEqual([['Lettre', 1], ['Note', 2]])
    expect(await listReference('followUps')).toHaveLength(1)

    await saveReference('ministers', null, { fullName: 'Ministre Test', termStart: '2025-01-01', termEnd: '2024-01-01' }).then(
      () => expect.unreachable(),
      (e) => expect(e).toBeInstanceOf(ValidationError),
    )
    await saveReference('ministers', null, { fullName: 'Ministre Test', termStart: '2024-01-01', termEnd: '2025-01-01' })
    expect(await listReference('ministers')).toHaveLength(1)
    expect(await listReference('headsOfState')).toHaveLength(0)
  })

  it('respecte les rôles : l’archiviste crée mais ne désactive pas, le lecteur ne fait rien', async () => {
    const id = await saveReference('departments', null, { name: 'DSI' })
    await createUser({ fullName: 'Archi', username: 'archi', role: 'archivist', password: 'motdepasse-solide' })
    await createUser({ fullName: 'Lect', username: 'lect', role: 'reader', password: 'motdepasse-solide' })

    await signOut()
    await signIn({ username: 'archi', password: 'motdepasse-solide' })
    await saveReference('departments', null, { name: 'DAF' })
    await expect(setReferenceActive('departments', id, false)).rejects.toBeInstanceOf(PermissionError)
    await expect(createUser({ fullName: 'X', username: 'xxx', role: 'reader', password: 'motdepasse-solide' })).rejects.toBeInstanceOf(PermissionError)

    await signOut()
    await signIn({ username: 'lect', password: 'motdepasse-solide' })
    await expect(saveReference('departments', null, { name: 'DRH' })).rejects.toBeInstanceOf(PermissionError)
    await expect(updateSettings({ staleAfterDays: 20 })).rejects.toBeInstanceOf(PermissionError)
  })
})

describe('utilisateurs', () => {
  it('crée un compte sans exposer son empreinte, puis le modifie et le désactive', async () => {
    const id = await createUser({ fullName: 'Archi Test', username: 'Archi', role: 'archivist', password: 'motdepasse-solide' })
    const rows = await listUsers()
    expect(rows.find((u) => u.id === id)).toMatchObject({ username: 'archi', role: 'archivist', isActive: 1 })
    expect(JSON.stringify(rows)).not.toContain('passwordHash')

    await expect(createUser({ fullName: 'Autre', username: 'archi', role: 'reader', password: 'motdepasse-solide' })).rejects.toThrow('déjà utilisé')

    await updateUser(id, { fullName: 'Archi Test', role: 'reader' })
    await updateUser(id, { fullName: 'Archi Modifié', role: 'reader' })
    await setUserActive(id, false)
    await setUserActive(id, true)
    await resetUserPassword(id, { password: 'nouveau-mot-de-passe' })
    expect((await actions()).slice(-6)).toEqual([
      'user.created',
      'user.roleChanged',
      'user.updated',
      'user.deactivated',
      'user.reactivated',
      'user.passwordReset',
    ])
    await signOut()
    await signIn({ username: 'archi', password: 'nouveau-mot-de-passe' })
    expect((await verifyAuditChain()).ok).toBe(true)
  })

  it('protège le dernier administrateur et son propre compte', async () => {
    const me = getSession().user!
    await expect(setUserActive(me.id, false)).rejects.toThrow('propre compte')
    await expect(updateUser(me.id, { fullName: me.fullName, role: 'reader' })).rejects.toThrow('propre rôle')

    const otherId = await createUser({ fullName: 'Second', username: 'second', role: 'admin', password: 'motdepasse-solide' })
    await setUserActive(otherId, false)
    await setUserActive(otherId, true)
    await updateUser(otherId, { fullName: 'Second', role: 'reader' })
    const admins = (await listUsers()).filter((u) => u.role === 'admin' && u.isActive === 1)
    expect(admins).toHaveLength(1)
  })
})

describe('paramètres', () => {
  it('valide les valeurs et journalise l’écart', async () => {
    await expect(updateSettings({ timezone: 'Mars/Phobos' })).rejects.toThrow('fuseau')
    await expect(updateSettings({ referenceFormats: { decree: 'sans numéro' } })).rejects.toThrow('{n}')
    await expect(updateSettings({ maxUploadMb: 0 })).rejects.toBeInstanceOf(ValidationError)
    await expect(updateSettings({ ocrLanguages: 'deu' })).rejects.toBeInstanceOf(ValidationError)

    await updateSettings({ maxUploadMb: '80', referenceFormats: { decree: '{n}-DP/{yy}', mailIncoming: '' }, currency: 'EUR' })
    const settings = await getSettings()
    expect(settings).toMatchObject({ maxUploadMb: 80, currency: 'EUR', referenceFormats: { decree: '{n}-DP/{yy}' } })
    expect(settings.referenceFormats.mailIncoming).toBeUndefined()
    expect((await db.auditLog.toArray()).at(-1)?.action).toBe('settings.updated')
  })
})

describe('données de démonstration', () => {
  it('charge référentiels et comptes de test, une seule fois, avec la chaîne intacte', async () => {
    const { accounts } = await loadDemoData()
    expect(accounts).toHaveLength(3)
    expect(await db.departments.count()).toBe(6)
    expect(await db.staff.count()).toBe(20)
    expect(await db.partners.count()).toBe(15)
    expect(await db.lookups.count()).toBe(15)
    expect((await db.users.toArray()).find((u) => u.username === 'destinataire')?.staffId).toBeTruthy()
    expect((await db.auditLog.toArray()).at(-1)?.action).toBe('demo.loaded')
    await expect(loadDemoData()).rejects.toThrow('base sans référentiel')

    const lecteur = accounts.find((a) => a.username === 'lecteur')!
    await signOut()
    await signIn({ username: lecteur.username, password: lecteur.password })
    expect(getSession().user?.role).toBe('reader')
    expect((await verifyAuditChain()).ok).toBe(true)
  })
})
