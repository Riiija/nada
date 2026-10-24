import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { CircleAlert, DatabaseBackup, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { inspectBackup, rebuildThumbnails, restoreBackup, type BackupPreview, type BackupProgress } from '@/data/backup'
import { errorMessage } from '@/data/errors'
import { useBackupStatus } from '@/data/repositories/backupStatus'
import { signOut } from '@/data/repositories/auth'
import { resetSearch } from '@/data/repositories/search'
import { prepareFile } from '@/lib/import/prepare'
import { formatDateTime, formatNumber } from '@/lib/format'
import { formatBytes, getStorageStatus, type StorageStatus } from '@/lib/storage'
import { cn } from '@/lib/cn'
import { dismissBackupError, runBackup, useBackupState } from './backupStore'

function Progress({ progress }: { progress: BackupProgress }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const counted = progress.step === 'files' || progress.step === 'copy' || (progress.step === 'finish' && progress.total > 1)
  return (
    <div className="mt-4" role="status" aria-live="polite">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">
          {progress.label}
          {counted ? `, ${formatNumber(progress.done)} sur ${formatNumber(progress.total)}` : ''}
        </span>
        <span className="text-text-muted">{percent} %</span>
      </div>
      <div role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-surface-active">
        <div className="h-full rounded-full bg-petrol transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function BackupPage() {
  return (
    <>
      <PageHeader title="Sauvegarde et restauration" description="Les données ne sont enregistrées que dans ce navigateur." />
      <div className="space-y-5">
        <Overview />
        <BackupSection />
        <RestoreSection />
      </div>
    </>
  )
}

function Overview() {
  const status = useBackupStatus()
  const [storage, setStorage] = useState<StorageStatus | null>(null)

  useEffect(() => {
    let alive = true
    void getStorageStatus().then((s) => alive && setStorage(s))
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-label="Où sont vos données">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-amber-tint text-amber">
          <Icon icon={DatabaseBackup} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Où sont vos données</h2>
          <p className="mt-1 max-w-[70ch] text-[13px] text-text-muted">
            Courriers, documents et historique sont enregistrés uniquement dans ce navigateur, sur ce poste. Effacer les données du navigateur ou changer d’ordinateur les fait disparaître.
            Faites une sauvegarde régulière et conservez-la ailleurs que sur ce poste. Elle n’est pas chiffrée : gardez-la en lieu sûr.
          </p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[13px] text-text-muted">Dernière sauvegarde</dt>
              <dd className="mt-0.5">
                {status === undefined ? (
                  ' '
                ) : status.lastBackupAt ? (
                  <span title={formatDateTime(status.lastBackupAt)}>{formatDistanceToNow(new Date(status.lastBackupAt), { locale: fr, addSuffix: true })}</span>
                ) : (
                  <Badge tone="amber">Jamais</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-text-muted">Stockage persistant</dt>
              <dd className="mt-0.5">
                {storage === null ? ' ' : storage.persisted === null ? 'Non disponible' : storage.persisted ? <Badge tone="teal">Activé</Badge> : <Badge tone="amber">Non activé</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-text-muted">Espace utilisé</dt>
              <dd className="mt-0.5">{storage?.usage != null && storage.quota != null ? `${formatBytes(storage.usage)} sur ${formatBytes(storage.quota)}` : storage === null ? ' ' : 'Non disponible'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function BackupSection() {
  const state = useBackupState((s) => s)
  const running = state.status === 'running'

  return (
    <Section title="Sauvegarder" description="Un fichier zip avec toutes les données et les fichiers d’origine. L’intégrité de l’historique est vérifiée avant l’écriture.">
      <Button variant="primary" onClick={() => void runBackup()} loading={running}>
        <Icon icon={DatabaseBackup} />
        Sauvegarder maintenant
      </Button>
      {state.progress ? <Progress progress={state.progress} /> : null}
      {state.status === 'error' ? (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-control border border-danger/30 bg-danger-tint px-4 py-3 text-sm">
          <Icon icon={CircleAlert} size={18} className="mt-0.5 text-danger" />
          <div className="flex-1">
            <p>{state.error}</p>
            <div className="mt-3 flex gap-2">
              {state.chainBroken ? (
                <Button size="sm" onClick={() => void runBackup(true)}>
                  Sauvegarder quand même
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={dismissBackupError}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Section>
  )
}

type Phase = { name: 'idle' } | { name: 'checking' } | { name: 'ready'; file: File; preview: BackupPreview } | { name: 'running'; progress: BackupProgress } | { name: 'error'; message: string }

function RestoreSection() {
  const input = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [confirm, setConfirm] = useState(false)

  async function choose(file: File | undefined) {
    if (!file) return
    setPhase({ name: 'checking' })
    try {
      setPhase({ name: 'ready', file, preview: await inspectBackup(file) })
    } catch (error) {
      setPhase({ name: 'error', message: errorMessage(error, 'Ce fichier n’a pas pu être lu.') })
    }
  }

  async function restore(file: File) {
    setConfirm(false)
    setPhase({ name: 'running', progress: { step: 'check', label: 'Vérification de la sauvegarde', done: 0, total: 1 } })
    const progress = (p: BackupProgress) => setPhase({ name: 'running', progress: p })
    try {
      await restoreBackup(file, progress)
      // Miniatures et index de recherche ne sont pas sauvegardés : on les régénère.
      await rebuildThumbnails(prepareFile, progress)
      resetSearch()
      toast.success('Restauration terminée', { description: 'Reconnectez-vous : les comptes sont ceux de la sauvegarde.', duration: 10_000 })
      await signOut()
    } catch (error) {
      setPhase({ name: 'error', message: errorMessage(error, 'La restauration a échoué. Les données n’ont pas été modifiées.') })
    }
  }

  return (
    <Section title="Restaurer" description="Remplace toutes les données de ce navigateur par celles d’une sauvegarde. Le fichier est contrôlé en entier (historique, nombre d’éléments, empreinte de chaque document) avant que la moindre donnée soit touchée.">
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        aria-label="Choisir une sauvegarde"
        className="sr-only"
        onChange={(e) => {
          void choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {phase.name !== 'running' ? (
        <Button onClick={() => input.current?.click()} loading={phase.name === 'checking'}>
          <Icon icon={Upload} />
          Choisir une sauvegarde
        </Button>
      ) : (
        <Progress progress={phase.progress} />
      )}

      {phase.name === 'error' ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-danger">
          <Icon icon={CircleAlert} size={18} className="mt-0.5" />
          {phase.message}
        </p>
      ) : null}

      {phase.name === 'ready' ? (
        <div className="mt-5 max-w-[640px] rounded-control border border-border p-4" aria-label="Aperçu de la sauvegarde">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {phase.preview.chainOk ? <Icon icon={ShieldCheck} size={18} className="text-teal" /> : <Icon icon={CircleAlert} size={18} className="text-danger" />}
            Sauvegarde du {formatDateTime(phase.preview.manifest.createdAt)}
          </p>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Organisation</dt>
              <dd>{phase.preview.manifest.organizationName || '–'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Courriers</dt>
              <dd>{formatNumber(phase.preview.manifest.counts.mails)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Documents</dt>
              <dd>
                {phase.preview.manifest.files.count === 0
                  ? 'Aucun'
                  : `${formatNumber(phase.preview.manifest.files.count)}, ${formatBytes(phase.preview.manifest.files.bytes)}`}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Version de l’application</dt>
              <dd>{phase.preview.manifest.appVersion}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted">Historique</dt>
              <dd className={cn(!phase.preview.chainOk && 'text-danger')}>
                {phase.preview.chainOk ? `${formatNumber(phase.preview.manifest.audit.count)} entrées, chaîne intacte` : phase.preview.chainMessage}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" disabled={!phase.preview.chainOk} onClick={() => setConfirm(true)}>
              Restaurer cette sauvegarde
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ name: 'idle' })}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {phase.name === 'ready' ? <ConfirmRestore open={confirm} onOpenChange={setConfirm} onConfirm={() => void restore(phase.file)} /> : null}
    </Section>
  )
}

const WORD = 'RESTAURER'

function ConfirmRestore({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setTyped('')
      }}
      title="Remplacer toutes les données ?"
      description="Les courriers, documents, comptes et l’historique de ce navigateur seront remplacés par ceux de la sauvegarde. Faites d’abord une sauvegarde de l’état actuel si vous en avez besoin. Vous serez déconnecté."
    >
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed === WORD) {
            setTyped('')
            onConfirm()
          }
        }}
      >
        <Field label={`Tapez ${WORD} pour confirmer`}>{(p) => <Input {...p} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="dangerSolid" disabled={typed !== WORD}>
            Remplacer toutes les données
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

