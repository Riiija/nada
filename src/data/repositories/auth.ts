import { useLiveQuery } from 'dexie-react-hooks'
import { appendAudit } from '../audit'
import { db } from '../db'
import { AuthError, ValidationError } from '../errors'
import {
  generateRecoveryKey,
  hashPassword,
  normalizeRecoveryKey,
  verifyPassword,
  type PasswordHash,
} from '../password'
import {
  adminSetupSchema,
  changePasswordSchema,
  passwordSchema,
  recoverySchema,
  signInSchema,
  type AdminSetupInput,
} from '../schemas/auth'
import {
  endSession,
  getSession,
  lockSessionState,
  readStoredSession,
  requireUser,
  startSession,
  type CurrentUser,
} from '../session'
import type { User } from '../types'
import { defaultSettings } from './settings'

const RECOVERY_SETTING = 'recovery'
const BAD_CREDENTIALS = 'Identifiant ou mot de passe incorrect.'

interface RecoveryRecord extends PasswordHash {
  userId: string
}

function snapshot(user: User): CurrentUser {
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role, staffId: user.staffId }
}

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Données invalides.')
  return result.data
}

/** Nombre de comptes : 0 = premier lancement. Mis à jour en direct (autres onglets compris). */
export function useUserCount(): number | undefined {
  return useLiveQuery(() => db.users.count(), [])
}

/** Premier lancement : crée l'administrateur, l'organisation et la clé de récupération. */
export async function createFirstAdmin(input: AdminSetupInput): Promise<{ recoveryKey: string }> {
  const data = parse(adminSetupSchema.safeParse(input))
  const recoveryKey = generateRecoveryKey()
  const [password, recovery] = await Promise.all([hashPassword(data.password), hashPassword(normalizeRecoveryKey(recoveryKey))])
  const now = new Date().toISOString()
  const user: User = {
    id: crypto.randomUUID(),
    username: data.username,
    fullName: data.fullName,
    role: 'admin',
    isActive: 1,
    passwordHash: password.hash,
    passwordSalt: password.salt,
    createdAt: now,
    lastLoginAt: now,
  }
  const defaults = defaultSettings()

  await db.transaction('rw', db.users, db.settings, db.auditLog, async (tx) => {
    if ((await db.users.count()) > 0) throw new ValidationError('Le compte administrateur existe déjà.')
    await db.users.add(user)
    await db.settings.bulkPut([
      { key: 'organizationName', value: data.organizationName },
      { key: 'timezone', value: defaults.timezone },
      { key: 'schemaVersion', value: defaults.schemaVersion },
      { key: RECOVERY_SETTING, value: { userId: user.id, hash: recovery.hash, salt: recovery.salt } satisfies RecoveryRecord },
    ])
    const actor = { id: user.id, name: user.fullName, role: user.role }
    await appendAudit(tx, { action: 'user.created', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}`, metadata: { role: 'admin', firstLaunch: true } }, actor)
    await appendAudit(tx, { action: 'auth.signedIn', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` }, actor)
  })

  startSession(snapshot(user))
  void navigator.storage?.persist?.().catch(() => undefined)
  return { recoveryKey }
}

/** Au démarrage : retrouve la session de l'onglet (sessionStorage), sinon déconnecté. */
export async function restoreSession(): Promise<void> {
  const stored = readStoredSession()
  const user = stored ? await db.users.get(stored.userId) : undefined
  if (stored && user && user.isActive === 1) startSession(snapshot(user), stored.locked)
  else endSession()
}

export async function signIn(input: { username: string; password: string }): Promise<void> {
  const data = parse(signInSchema.safeParse(input))
  const username = data.username.toLowerCase()
  const user = await db.users.where('username').equals(username).first()
  const valid = user ? await verifyPassword(data.password, { hash: user.passwordHash, salt: user.passwordSalt }) : false

  if (!user || !valid || user.isActive !== 1) {
    await db.transaction('rw', db.auditLog, (tx) =>
      appendAudit(
        tx,
        { action: 'auth.signInFailed', entityType: 'user', entityId: user?.id ?? '', entityLabel: `Connexion refusée : ${username}`, metadata: { username } },
        { id: null, name: username, role: null },
      ),
    )
    throw new AuthError(user && user.isActive !== 1 ? 'Ce compte est désactivé. Contactez un administrateur.' : BAD_CREDENTIALS)
  }

  const now = new Date().toISOString()
  await db.transaction('rw', db.users, db.auditLog, async (tx) => {
    await db.users.update(user.id, { lastLoginAt: now })
    await appendAudit(tx, { action: 'auth.signedIn', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` }, { id: user.id, name: user.fullName, role: user.role })
  })
  startSession(snapshot(user))
}

export async function signOut(): Promise<void> {
  const user = getSession().user
  if (user) {
    await db.transaction('rw', db.auditLog, (tx) =>
      appendAudit(tx, { action: 'auth.signedOut', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` }),
    )
  }
  endSession()
}

export async function lockSession(): Promise<void> {
  const user = requireUser()
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, { action: 'auth.locked', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` }),
  )
  lockSessionState()
}

export async function unlockSession(password: string): Promise<void> {
  const current = getSession()
  if (current.status !== 'locked') return
  const user = await db.users.get(current.user.id)
  const actor = { id: current.user.id, name: current.user.fullName, role: current.user.role }
  const valid = user ? await verifyPassword(password, { hash: user.passwordHash, salt: user.passwordSalt }) : false
  if (!user || !valid || user.isActive !== 1) {
    await db.transaction('rw', db.auditLog, (tx) =>
      appendAudit(tx, { action: 'auth.signInFailed', entityType: 'user', entityId: current.user.id, entityLabel: `Déverrouillage refusé : ${current.user.username}`, metadata: { context: 'unlock' } }, actor),
    )
    throw new AuthError('Mot de passe incorrect.')
  }
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, { action: 'auth.unlocked', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` }, actor),
  )
  startSession(snapshot(user))
}

export async function changeOwnPassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  const me = requireUser()
  const data = parse(changePasswordSchema.safeParse(input))
  const user = await db.users.get(me.id)
  if (!user || !(await verifyPassword(data.currentPassword, { hash: user.passwordHash, salt: user.passwordSalt }))) {
    throw new AuthError('Le mot de passe actuel est incorrect.')
  }
  const next = await hashPassword(data.newPassword)
  await db.transaction('rw', db.users, db.auditLog, async (tx) => {
    await db.users.update(user.id, { passwordHash: next.hash, passwordSalt: next.salt })
    await appendAudit(tx, { action: 'auth.passwordChanged', entityType: 'user', entityId: user.id, entityLabel: `Compte ${user.username}` })
  })
}

/**
 * Mot de passe administrateur oublié : la clé de récupération affichée à la création du
 * compte le réinitialise. Une nouvelle clé est générée (l'ancienne ne sert qu'une fois).
 */
export async function resetAdminPassword(input: {
  recoveryKey: string
  password: string
  confirmPassword: string
}): Promise<{ recoveryKey: string }> {
  const data = parse(recoverySchema.safeParse(input))
  parse(passwordSchema.safeParse(data.password))
  const record = (await db.settings.get(RECOVERY_SETTING))?.value as RecoveryRecord | undefined
  const admin = record ? await db.users.get(record.userId) : undefined
  const ok = record ? await verifyPassword(normalizeRecoveryKey(data.recoveryKey), record) : false
  if (!record || !admin || !ok) throw new AuthError('Clé de récupération incorrecte.')

  const newKey = generateRecoveryKey()
  const [password, recovery] = await Promise.all([hashPassword(data.password), hashPassword(normalizeRecoveryKey(newKey))])
  await db.transaction('rw', db.users, db.settings, db.auditLog, async (tx) => {
    await db.users.update(admin.id, { passwordHash: password.hash, passwordSalt: password.salt, isActive: 1 })
    await db.settings.put({ key: RECOVERY_SETTING, value: { userId: admin.id, hash: recovery.hash, salt: recovery.salt } satisfies RecoveryRecord })
    await appendAudit(
      tx,
      { action: 'user.passwordReset', entityType: 'user', entityId: admin.id, entityLabel: `Compte ${admin.username}`, metadata: { method: 'recoveryKey' } },
      { id: admin.id, name: admin.fullName, role: admin.role },
    )
  })
  return { recoveryKey: newKey }
}
