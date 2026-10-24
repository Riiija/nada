import { Lock, Pencil, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { describeAudit } from '@/data/audit-labels'
import { errorMessage } from '@/data/errors'
import { useEntityHistory } from '@/data/repositories/history'
import { canTreat, changePosition, deleteMail, markProcessed, restoreMail, useMail } from '@/data/repositories/mails'
import { useSettings } from '@/data/repositories/settings'
import { useSession } from '@/data/session'
import type { AuditEntry, Mail, MailFlow } from '@/data/types'
import { todayIn } from '@/lib/dates'
import { formatDate, formatDateTime } from '@/lib/format'
import { MailAttachments } from './MailAttachments'
import { MailFormSheet } from './MailFormSheet'
import { MailStatusBadge } from './StatusBadge'
import { useMailLookups } from './useMailLookups'

export function MailDetailPage({ flow }: { flow: MailFlow }) {
  const { id } = useParams()
  const incoming = flow === 'incoming'
  const basePath = incoming ? '/courriers/arrives' : '/courriers/departs'
  const listLabel = incoming ? 'Courriers arrivés' : 'Courriers départ'
  const mail = useMail(id)

  if (mail === undefined) {
    return (
      <div role="status" aria-label="Chargement" className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (mail === null || mail.flow !== flow) {
    return (
      <>
        <Breadcrumb items={[{ label: listLabel, to: basePath }, { label: 'Introuvable' }]} />
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            illustration={<EmptyMailbox />}
            title="Courrier introuvable"
            description="Il a peut-être été supprimé, ou vous n’avez pas le droit de le consulter."
            action={
              <Button asChild>
                <Link to={basePath}>Retourner à la liste</Link>
              </Button>
            }
          />
        </div>
      </>
    )
  }
  return <Detail mail={mail} basePath={basePath} listLabel={listLabel} />
}

function Detail({ mail, basePath, listLabel }: { mail: Mail; basePath: string; listLabel: string }) {
  const incoming = mail.flow === 'incoming'
  const navigate = useNavigate()
  const user = useSession().user
  const settings = useSettings()
  const lookups = useMailLookups()
  const history = useEntityHistory('mail', mail.id)
  const [tab, setTab] = useState<'detail' | 'history'>('detail')
  const [editing, setEditing] = useState(false)
  const [positionOpen, setPositionOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const canEdit = user?.role === 'admin' || user?.role === 'archivist'
  const canAct = !!user && canTreat(mail, user)
  const n = lookups.names

  async function run(action: () => Promise<void>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function remove() {
    try {
      await deleteMail(mail.id)
      navigate(basePath, { replace: true })
      toast.success(`Courrier ${mail.reference} supprimé`, {
        duration: 6000,
        action: {
          label: 'Annuler',
          onClick: () =>
            void restoreMail(mail.id).then(
              () => toast.success('Courrier restauré'),
              (error) => toast.error(errorMessage(error)),
            ),
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const rows: [string, ReactNode][] = incoming
    ? [
        ['Date', formatDate(mail.mailDate)],
        ['N° dossier', mail.fileNumber],
        ['Provenance', n.partner.get(mail.sourcePartnerId ?? '')],
        ['Au bureau de', n.staff.get(mail.assignedStaffId ?? '')],
        ['Fonction occupée', mail.staffJobTitle],
        ['Direction', n.department.get(mail.departmentId ?? '')],
        ['Type', n.lookup.get(mail.mailTypeId ?? '')],
        ['Suivi', n.lookup.get(mail.followUpId ?? '')],
        ['Position', n.lookup.get(mail.positionId ?? '')],
        ['Traité le', mail.isProcessed ? formatDateTime(mail.processedAt) : undefined],
      ]
    : [
        ['Date', formatDate(mail.mailDate)],
        ['Paraphé par', n.staff.get(mail.signedByStaffId ?? '')],
        ['Fonction occupée', mail.staffJobTitle],
        ['Direction', n.department.get(mail.departmentId ?? '')],
        ['Adressé à', mail.recipientPartnerId ? n.partner.get(mail.recipientPartnerId) : mail.recipientLabel],
      ]

  const positions = lookups.options({ positionId: mail.positionId }).positions
  const moves = (history ?? []).filter((e) => e.action === 'mail.positionChanged')

  return (
    <>
      <Breadcrumb items={[{ label: listLabel, to: basePath }, { label: mail.reference }]} />
      <PageHeader
        title={mail.subject}
        description={`${incoming ? 'Courrier arrivé' : 'Courrier départ'} ${mail.reference}`}
        actions={
          <>
            {canEdit ? (
              <Button onClick={() => setEditing(true)}>
                <Icon icon={Pencil} />
                Modifier
              </Button>
            ) : null}
            {incoming && canAct && mail.isProcessed === 0 ? (
              <Button variant="primary" onClick={() => void run(() => markProcessed(mail.id), 'Courrier marqué comme traité')}>
                Marquer comme traité
              </Button>
            ) : null}
            {incoming && canAct ? <Button onClick={() => setPositionOpen(true)}>Changer la position</Button> : null}
            {canEdit ? (
              <Button variant="danger" onClick={() => setDeleting(true)}>
                <Icon icon={Trash2} />
                Supprimer
              </Button>
            ) : null}
          </>
        }
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2">
        <MailStatusBadge mail={mail} today={todayIn(settings?.timezone ?? 'UTC')} staleAfterDays={settings?.staleAfterDays ?? 15} />
        {mail.confidentiality === 'restricted' ? (
          <Badge tone="neutral">
            <Icon icon={Lock} size={14} />
            Restreint
          </Badge>
        ) : null}
      </div>

      <div className="mb-4">
        <Segmented
          label="Affichage"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'detail', label: 'Détail' },
            { value: 'history', label: 'Historique', count: history?.length },
          ]}
        />
      </div>

      {tab === 'detail' ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="fields-title">
              <h2 id="fields-title" className="mb-4 text-base font-semibold">
                Informations
              </h2>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {rows.map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-[13px] text-text-muted">{term}</dt>
                    <dd className="mt-0.5 text-sm">{value || '–'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <MailAttachments mailId={mail.id} canEdit={canEdit} />
          </div>

          {incoming ? (
            <section className="h-fit rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="moves-title">
              <h2 id="moves-title" className="mb-3 text-base font-semibold">
                Parcours du courrier
              </h2>
              {moves.length === 0 ? (
                <p className="text-[13px] text-text-muted">La position n’a pas changé depuis l’enregistrement.</p>
              ) : (
                <ol className="space-y-3">
                  {moves.map((e) => (
                    <li key={e.seq} className="text-sm">
                      <div>{e.changes?.position ? `${String(e.changes.position[0] ?? 'vide')} → ${String(e.changes.position[1] ?? 'vide')}` : 'Position modifiée'}</div>
                      <div className="text-xs text-text-muted">
                        {e.actorName}, {formatDateTime(e.occurredAt)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}
        </div>
      ) : (
        <HistoryList entries={history} />
      )}

      {canEdit ? <MailFormSheet flow={mail.flow} mail={mail} open={editing} onClose={() => setEditing(false)} /> : null}
      <PositionDialog
        open={positionOpen}
        onOpenChange={setPositionOpen}
        current={mail.positionId ?? ''}
        options={positions}
        onSubmit={(positionId) => run(() => changePosition(mail.id, positionId), 'Position changée')}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Supprimer le courrier ${mail.reference} ?`}
        description="Il disparaîtra des listes. L’opération est enregistrée dans l’historique et son numéro ne sera pas réutilisé."
        confirmLabel="Supprimer le courrier"
        danger
        onConfirm={remove}
      />
    </>
  )
}

function HistoryList({ entries }: { entries: AuditEntry[] | undefined }) {
  return (
    <section className="rounded-card border border-border bg-surface shadow-card" aria-label="Historique du courrier">
      {entries === undefined ? (
        <div role="status" aria-label="Chargement" className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState illustration={<EmptyMailbox />} title="Aucun événement" description="Les actions sur ce courrier apparaîtront ici." />
      ) : (
        <ol className="divide-y divide-border">
          {[...entries].reverse().map((e) => (
            <li key={e.seq} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span>
                <span className="font-medium">{e.actorName}</span> {describeAudit(e)}
              </span>
              <time dateTime={e.occurredAt} className="text-xs text-text-muted">
                {formatDateTime(e.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function PositionDialog({
  open,
  onOpenChange,
  current,
  options,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  options: { value: string; label: string }[]
  onSubmit: (positionId: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Changer la position" description="Le changement est enregistré dans le parcours du courrier.">
      {open ? <PositionForm current={current} options={options} onSubmit={onSubmit} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function PositionForm({
  current,
  options,
  onSubmit,
  onClose,
}: {
  current: string
  options: { value: string; label: string }[]
  onSubmit: (positionId: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        await onSubmit(value)
        setBusy(false)
        onClose()
      }}
    >
      <Field label="Nouvelle position">
        {(p) => (
          <Select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={value === current}>
          Changer la position
        </Button>
      </div>
    </form>
  )
}
