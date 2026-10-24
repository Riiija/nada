import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { describeAudit } from '@/data/audit-labels'
import { errorMessage } from '@/data/errors'
import { useEntityHistory } from '@/data/repositories/history'
import { deleteRegisterEntry, restoreRegisterEntry, useRegisterEntry, type RegisterRow } from '@/data/repositories/registers'
import { useSettings } from '@/data/repositories/settings'
import { useSession } from '@/data/session'
import { EntityAttachments } from '@/features/mails/MailAttachments'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import { registerConfigs, type FieldDef, type RegisterConfig } from './config'
import { RegisterFormSheet } from './RegisterFormSheet'
import { StatusBadge } from './RegisterListPage'
import { useRegisterLookups } from './useRegisterLookups'

export function RegisterDetailPage({ type }: { type: keyof typeof registerConfigs }) {
  const config = registerConfigs[type]
  const { id } = useParams()
  const row = useRegisterEntry(type, id)

  if (row === undefined) {
    return (
      <div role="status" aria-label="Chargement" className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (row === null) {
    return (
      <>
        <Breadcrumb items={[{ label: config.title, to: `/${config.slug}` }, { label: 'Introuvable' }]} />
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            illustration={<EmptyMailbox />}
            title="Élément introuvable"
            description="Il a peut-être été supprimé."
            action={
              <Button asChild>
                <Link to={`/${config.slug}`}>Retourner à la liste</Link>
              </Button>
            }
          />
        </div>
      </>
    )
  }
  return <Detail config={config} row={row} />
}

function display(field: FieldDef, row: RegisterRow, lookups: ReturnType<typeof useRegisterLookups>): React.ReactNode {
  const value = row[field.name]
  if (value === undefined || value === null || value === '') return '–'
  switch (field.kind) {
    case 'date':
      return formatDate(String(value))
    case 'money':
      return typeof value === 'number' && value > 0 ? formatMoney(value) : '–'
    case 'status':
      return <StatusBadge status={String(value)} />
    case 'select': {
      const map = field.source === 'headsOfState' || field.source === 'ministers' ? lookups.names.official : field.source === 'departments' ? lookups.names.department : field.source === 'staff' ? lookups.names.staff : lookups.names.partner
      return map.get(String(value)) ?? '–'
    }
    default:
      return <span className="whitespace-pre-wrap">{String(value)}</span>
  }
}

function Detail({ config, row }: { config: RegisterConfig; row: RegisterRow }) {
  const navigate = useNavigate()
  const canEdit = ['admin', 'archivist'].includes(useSession().user?.role ?? '')
  const currency = useSettings()?.currency
  const lookups = useRegisterLookups()
  const history = useEntityHistory(config.type, row.id)
  const [tab, setTab] = useState<'detail' | 'history'>('detail')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    try {
      await deleteRegisterEntry(config.type, row.id)
      navigate(`/${config.slug}`, { replace: true })
      toast.success('Élément supprimé', {
        duration: 6000,
        action: {
          label: 'Annuler',
          onClick: () =>
            void restoreRegisterEntry(config.type, row.id).then(
              () => toast.success('Élément restauré'),
              (error) => toast.error(errorMessage(error)),
            ),
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <Breadcrumb items={[{ label: config.title, to: `/${config.slug}` }, { label: row.reference ?? config.heading(row) }]} />
      <PageHeader
        title={config.heading(row)}
        description={row.reference ? `${config.singular} ${row.reference}` : config.singular}
        actions={
          canEdit ? (
            <>
              <Button onClick={() => setEditing(true)}>
                <Icon icon={Pencil} />
                Modifier
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                <Icon icon={Trash2} />
                Supprimer
              </Button>
            </>
          ) : undefined
        }
      />
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
        <div className="space-y-5">
          <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="fields-title">
            <h2 id="fields-title" className="mb-4 text-base font-semibold">
              Informations
            </h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {row.reference ? (
                <div>
                  <dt className="text-[13px] text-text-muted">N°</dt>
                  <dd className="mt-0.5 text-sm font-medium">{row.reference}</dd>
                </div>
              ) : null}
              {config.fields.map((f) => (
                <div key={f.name} className={f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
                  <dt className="text-[13px] text-text-muted">{f.kind === 'money' && currency ? `${f.label} (${currency})` : f.label}</dt>
                  <dd className="mt-0.5 text-sm">{display(f, row, lookups)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <EntityAttachments entityType={config.entityType} entityId={row.id} canEdit={canEdit} category={config.category} noun={config.demonstrative} />
        </div>
      ) : (
        <section className="rounded-card border border-border bg-surface shadow-card" aria-label="Historique">
          {history === undefined ? (
            <Skeleton className="m-4 h-20" />
          ) : history.length === 0 ? (
            <EmptyState illustration={<EmptyMailbox />} title="Aucun événement" description="Les actions sur cet élément apparaîtront ici." />
          ) : (
            <ol className="divide-y divide-border">
              {[...history].reverse().map((e) => (
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
      )}

      {canEdit ? <RegisterFormSheet config={config} row={row} open={editing} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Supprimer ${config.demonstrative} ?`}
        description="Il disparaîtra des listes. L’opération est enregistrée dans l’historique et son numéro ne sera pas réutilisé."
        confirmLabel="Supprimer"
        danger
        onConfirm={remove}
      />
    </>
  )
}
