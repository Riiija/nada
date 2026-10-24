import { useSyncExternalStore } from 'react'
import { PermissionError } from './errors'
import type { Role, User } from './types'

export type CurrentUser = Pick<User, 'id' | 'username' | 'fullName' | 'role' | 'staffId'>

export type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'locked'; user: CurrentUser }
  | { status: 'active'; user: CurrentUser }

export interface Actor {
  id: string | null
  name: string
  role: Role | null
}

const STORAGE_KEY = 'ged.session'

let state: SessionState = { status: 'loading', user: null }
const listeners = new Set<() => void>()

function emit(next: SessionState) {
  state = next
  listeners.forEach((l) => l())
}

/** sessionStorage : identifiant du compte connecté uniquement, jamais de mot de passe. */
export function readStoredSession(): { userId: string; locked: boolean } | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId?: unknown; locked?: unknown }
    return typeof parsed.userId === 'string' ? { userId: parsed.userId, locked: parsed.locked === true } : null
  } catch {
    return null
  }
}

function writeStoredSession(value: { userId: string; locked: boolean } | null) {
  try {
    if (value) globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value))
    else globalThis.sessionStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

export function getSession(): SessionState {
  return state
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession)
}

export function startSession(user: CurrentUser, locked = false) {
  writeStoredSession({ userId: user.id, locked })
  emit({ status: locked ? 'locked' : 'active', user })
}

export function lockSessionState() {
  if (state.user) startSession(state.user, true)
}

export function endSession() {
  writeStoredSession(null)
  emit({ status: 'signedOut', user: null })
}

/** Vide la session sans toucher au stockage (tests). */
export function resetSessionForTests(status: 'loading' | 'signedOut' = 'signedOut') {
  writeStoredSession(null)
  emit({ status, user: null })
}

export function getActor(): Actor {
  const user = state.user
  return user ? { id: user.id, name: user.fullName, role: user.role } : { id: null, name: 'Système', role: null }
}

/** Utilisateur connecté et non verrouillé, sinon erreur. */
export function requireUser(): CurrentUser {
  if (state.status !== 'active') throw new PermissionError('Connectez-vous pour continuer.')
  return state.user
}

export function requireRole(...roles: Role[]): CurrentUser {
  const user = requireUser()
  if (!roles.includes(user.role)) throw new PermissionError()
  return user
}
