import { HardDriveDownload, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useBackupStatus } from '@/data/repositories/backupStatus'
import { useSession } from '@/data/session'
import { backupStore, runBackup, useBackupState } from '@/features/backup/backupStore'
import { useStoredPreference } from '@/lib/preferences'

const DAY = 86_400_000
const THRESHOLD_DAYS = 7

/** Rappel sous la barre du haut : aucune sauvegarde depuis 7 jours. Masquable 24 h. */
export function BackupBanner() {
  const role = useSession().user?.role
  const status = useBackupStatus()
  const running = useBackupState((s) => s.status === 'running')
  const progress = useBackupState((s) => s.progress)
  const failure = useBackupState((s) => s.status === 'error')
  const navigate = useNavigate()
  const [hiddenUntil, setHiddenUntil] = useStoredPreference<number>('ged.backupBannerHiddenUntil', 0)
  const [now] = useState(() => Date.now())

  if (role !== 'admin' || !status || !status.hasData || status.days < THRESHOLD_DAYS) return null
  if (hiddenUntil > now && !running && !failure) return null

  return (
    <div role="region" aria-label="Rappel de sauvegarde" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-amber-tint px-4 py-2.5 text-[13px] lg:px-6">
      <Icon icon={HardDriveDownload} className="text-amber" />
      <p className="min-w-0 flex-1">
        {status.lastBackupAt ? `Dernière sauvegarde il y a ${status.days} jours.` : 'Aucune sauvegarde n’a encore été faite.'} Les données ne sont enregistrées que dans ce navigateur.
        {running && progress ? <span className="ml-1 text-text-muted"> {progress.label}…</span> : null}
      </p>
      <Button
        size="sm"
        loading={running}
        onClick={() => {
          void runBackup().then(() => {
            // Une chaîne altérée ou une erreur se traite sur la page dédiée.
            if (backupStore.getState().status === 'error') navigate('/sauvegarde')
          })
        }}
      >
        Sauvegarder maintenant
      </Button>
      <button
        type="button"
        aria-label="Masquer ce rappel pendant 24 heures"
        onClick={() => setHiddenUntil(Date.now() + DAY)}
        className="grid size-7 place-items-center rounded-control text-text-muted hover:bg-surface-active hover:text-text"
      >
        <Icon icon={X} />
      </button>
    </div>
  )
}
