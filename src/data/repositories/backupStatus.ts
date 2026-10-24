import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export interface BackupStatus {
  /** Date de la dernière sauvegarde, absente si aucune n'a été faite. */
  lastBackupAt?: string
  /** Jours écoulés depuis la dernière sauvegarde, ou depuis le premier usage s'il n'y en a pas eu. */
  days: number
  /** Vrai si des données existent : inutile de rappeler de sauvegarder une base vide. */
  hasData: boolean
}

const DAY = 86_400_000

/** État de la sauvegarde, mis à jour en direct (autres onglets compris). */
export function useBackupStatus(): BackupStatus | undefined {
  return useLiveQuery(async () => {
    const [last, users, mails, documents] = await Promise.all([db.settings.get('lastBackupAt'), db.users.toArray(), db.mails.count(), db.documents.count()])
    const lastBackupAt = typeof last?.value === 'string' ? last.value : undefined
    const firstUse = users.map((u) => u.createdAt).sort()[0] ?? new Date().toISOString()
    const since = new Date(lastBackupAt ?? firstUse).getTime()
    return { lastBackupAt, days: Math.floor((Date.now() - since) / DAY), hasData: mails + documents > 0 }
  }, [])
}
