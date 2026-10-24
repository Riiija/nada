import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { canSeeDocument } from './documents'
import { canSeeMail } from './mails'
import { requireUser, useSession } from '../session'
import type { AuditEntry } from '../types'

/** Journal d'un élément. Réservé à qui peut voir l'élément lui-même. */
export async function listEntityHistory(entityType: string, entityId: string): Promise<AuditEntry[]> {
  const user = requireUser()
  if (entityType === 'mail') {
    const mail = await db.mails.get(entityId)
    if (!mail || !canSeeMail(mail, user)) return []
  }
  if (entityType === 'document') {
    const doc = await db.documents.get(entityId)
    if (!doc || !(await canSeeDocument(doc, user))) return []
  }
  const rows = await db.auditLog.where('[entityType+entityId]').equals([entityType, entityId]).toArray()
  return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export function useEntityHistory(entityType: string, entityId: string | undefined): AuditEntry[] | undefined {
  const user = useSession().user
  return useLiveQuery(
    () => (entityId && user ? listEntityHistory(entityType, entityId) : []),
    [entityType, entityId, user?.id],
  )
}
