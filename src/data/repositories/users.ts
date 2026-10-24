import { useLiveQuery } from 'dexie-react-hooks'
import { appendAudit, diffChanges } from '../audit'
import { db } from '../db'
import { ValidationError } from '../errors'
import { hashPassword } from '../password'
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '../schemas/users'
import { requireRole } from '../session'
import type { User } from '../types'

/** Compte sans empreinte de mot de passe : seul cet objet quitte la couche de données. */
export type UserRow = Omit<User, 'passwordHash' | 'passwordSalt'>

function toRow({ passwordHash: _h, passwordSalt: _s, ...row }: User): UserRow {
  void _h
  void _s
  return row
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await db.users.toArray()
  return rows.map(toRow).sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr', { sensitivity: 'base' }))
}

export function useUsers(): UserRow[] | undefined {
  return useLiveQuery(listUsers, [])
}

function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return new ValidationError(result.error?.issues[0]?.message ?? 'Données invalides.')
}

const label = (u: Pick<User, 'username'>) => `Compte ${u.username}`

async function activeAdminCount() {
  return (await db.users.where('role').equals('admin').toArray()).filter((u) => u.isActive === 1).length
}

export async function createUser(input: unknown): Promise<string> {
  requireRole('admin')
  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) throw firstIssue(parsed)
  const { password, ...data } = parsed.data
  const hashed = await hashPassword(password)
  const user: User = {
    id: crypto.randomUUID(),
    ...data,
    isActive: 1,
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    createdAt: new Date().toISOString(),
  }
  try {
    await db.transaction('rw', db.users, db.auditLog, async (tx) => {
      await db.users.add(user)
      await appendAudit(tx, { action: 'user.created', entityType: 'user', entityId: user.id, entityLabel: label(user), metadata: { role: user.role } })
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ConstraintError') throw new ValidationError('Cet identifiant est déjà utilisé.')
    throw error
  }
  return user.id
}

export async function updateUser(id: string, input: unknown): Promise<void> {
  const me = requireRole('admin')
  const parsed = updateUserSchema.safeParse(input)
  if (!parsed.success) throw firstIssue(parsed)
  await db.transaction('rw', db.users, db.auditLog, async (tx) => {
    const before = await db.users.get(id)
    if (!before) throw new ValidationError('Ce compte n’existe plus.')
    const after: User = { ...before, ...parsed.data }
    if (before.role === 'admin' && after.role !== 'admin') {
      if (id === me.id) throw new ValidationError('Vous ne pouvez pas retirer votre propre rôle d’administrateur.')
      if (before.isActive === 1 && (await activeAdminCount()) <= 1) throw new ValidationError('Il doit rester au moins un administrateur actif.')
    }
    const changes = diffChanges(before, after)
    if (Object.keys(changes).length === 0) return
    await db.users.put(after)
    const roleChanged = 'role' in changes
    await appendAudit(tx, {
      action: roleChanged ? 'user.roleChanged' : 'user.updated',
      entityType: 'user',
      entityId: id,
      entityLabel: label(after),
      changes,
    })
  })
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const me = requireRole('admin')
  await db.transaction('rw', db.users, db.auditLog, async (tx) => {
    const user = await db.users.get(id)
    if (!user) throw new ValidationError('Ce compte n’existe plus.')
    if (user.isActive === (active ? 1 : 0)) return
    if (!active) {
      if (id === me.id) throw new ValidationError('Vous ne pouvez pas désactiver votre propre compte.')
      if (user.role === 'admin' && (await activeAdminCount()) <= 1) throw new ValidationError('Il doit rester au moins un administrateur actif.')
    }
    await db.users.update(id, { isActive: active ? 1 : 0 })
    await appendAudit(tx, { action: active ? 'user.reactivated' : 'user.deactivated', entityType: 'user', entityId: id, entityLabel: label(user) })
  })
}

export async function resetUserPassword(id: string, input: unknown): Promise<void> {
  requireRole('admin')
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) throw firstIssue(parsed)
  const hashed = await hashPassword(parsed.data.password)
  await db.transaction('rw', db.users, db.auditLog, async (tx) => {
    const user = await db.users.get(id)
    if (!user) throw new ValidationError('Ce compte n’existe plus.')
    await db.users.update(id, { passwordHash: hashed.hash, passwordSalt: hashed.salt })
    await appendAudit(tx, { action: 'user.passwordReset', entityType: 'user', entityId: id, entityLabel: label(user), metadata: { method: 'admin' } })
  })
}
