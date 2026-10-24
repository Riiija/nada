import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { requireUser, useSession } from '../session'
import type { AppNotification } from '../types'

export interface NotificationList {
  items: AppNotification[]
  unread: number
}

/** Notifications du compte connecté, les plus récentes d'abord. */
export function useNotifications(): NotificationList | undefined {
  const userId = useSession().user?.id
  return useLiveQuery(async () => {
    if (!userId) return { items: [], unread: 0 }
    const all = await db.notifications.where('recipientUserId').equals(userId).toArray()
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: all.slice(0, 20), unread: all.filter((n) => !n.readAt).length }
  }, [userId])
}

export async function markNotificationRead(id: string): Promise<void> {
  const user = requireUser()
  const row = await db.notifications.get(id)
  if (row && row.recipientUserId === user.id && !row.readAt) await db.notifications.update(id, { readAt: new Date().toISOString() })
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = requireUser()
  const now = new Date().toISOString()
  await db.notifications
    .where('recipientUserId')
    .equals(user.id)
    .filter((n) => !n.readAt)
    .modify({ readAt: now })
}
