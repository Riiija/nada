import { ChevronDown, ChevronRight, CircleAlert, Download, ShieldCheck, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { describeAudit, fieldLabel, formatChangeValue } from '@/data/audit-labels'
import type { ChainVerification } from '@/data/audit'
import { errorMessage } from '@/data/errors'
import { ACTION_FAMILIES, ENTITY_KINDS, exportAuditCsv, useAuditLog, verifyAuditIntegrity, type AuditFilters } from '@/data/repositories/auditLog'
import { useUsers } from '@/data/repositories/users'
import { useSession } from '@/data/session'
import type { AuditEntry } from '@/data/types'
import { cn } from '@/lib/cn'
import { formatDateTime, formatNumber } from '@/lib/format'

const STEP = 25
const roleNames = { admin: 'Administrateur', archivist: 'Archiviste', reader: 'Lecteur' } as const

function entityLink(entry: AuditEntry): string | null {
  if (entry.entityType === 'mail') return `/courriers/${entry.entityLabel.startsWith('Courrier départ') ? 'departs' : 'arrives'}/${entry.entityId}`
  if (entry.entityType === 'document') return `/documents/${entry.entityId}`
  return null
}

function Detail({ entry }: { entry: AuditEntry }) {
  const changes = Object.entries(entry.changes ?? {})
  const metadata = Object.entries(entry.metadata ?? {}).filter(([, v]) => v !== undefined)
  const link = entityLink(entry)
  return (
    <div className="space-y-4 px-5 py-4 text-sm">
      {changes.length > 0 ? (
        <table className="w-full max-w-[640px] border-collapse text-[13px]" aria-label="Modifications">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-1.5 font-medium">Champ</th>
              <th className="pb-1.5 font-medium">Avant</th>
              <th className="pb-1.5 font-medium">Après</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(([key, [from, to]]) => (
              <tr key={key} className="border-t border-border align-top">
                <th scope="row" className="py-1.5 pr-4 text-left font-medium">
                  {fieldLabel(key)}
                </th>
                <td className="py-1.5 pr-4 text-text-muted">{formatChangeValue(key, from)}</td>
                <td className="py-1.5">{formatChangeValue(key, to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[13px] text-text-muted">Aucune modification de champ pour cette action.</p>
      )}
      <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        {metadata.map(([key, value]) => (
          <div key={key}>
            <dt className="text-text-muted">{key}</dt>
            <dd className="break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-text-muted">Navigateur</dt>
          <dd className="break-words">{entry.userAgent || '–'}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Entrée n° {entry.seq}, empreinte</dt>
          <dd className="font-medium break-all" title={entry.hash}>
            {entry.hash.slice(0, 16)}
          </dd>
        </div>
      </dl>
      {link ? (
        <Link to={link} className="inline-block text-[13px] font-medium underline underline-offset-2">
          Ouvrir l’élément
        </Link>
      ) : null}
    </div>
  )
}

function Who({ entry }: { entry: AuditEntry }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={entry.actorName} size={32} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{entry.actorName}</span>
        {entry.actorRole ? <span className="block text-xs text-text-muted">{roleNames[entry.actorRole]}</span> : null}
      </span>
    </span>
  )
}

function Expander({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" aria-expanded={open} aria-label={label} onClick={onToggle} className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-active hover:text-text">
      <Icon icon={open ? ChevronDown : ChevronRight} />
    </button>
  )
}

function Table({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="relative hidden overflow-x-auto md:block">
    <table className="w-full border-collapse" aria-label="Historique des opérations">
      <thead>
        <tr className="h-10 bg-surface-muted text-left text-xs font-medium text-text-muted">
          <th scope="col" className="w-12 pl-3">
            <span className="sr-only">Détail</span>
          </th>
          <th scope="col" className="px-3 whitespace-nowrap">Date et heure</th>
          <th scope="col" className="px-3">Utilisateur</th>
          <th scope="col" className="px-3">Action</th>
          <th scope="col" className="px-3 pr-4">Élément</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const isOpen = open === e.seq
          return (
            <Fragment key={e.seq}>
              <tr className={cn('border-t border-border text-sm', isOpen && 'bg-surface-muted')}>
                <td className="py-2 pl-3">
                  <Expander open={isOpen} onToggle={() => setOpen(isOpen ? null : (e.seq ?? null))} label={`${isOpen ? 'Masquer' : 'Afficher'} le détail de l’entrée ${e.seq}`} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-text-muted">
                  <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
                </td>
                <td className="px-3 py-2">
                  <Who entry={e} />
                </td>
                <td className="px-3 py-2">{describeAudit(e)}</td>
                <td className="max-w-[320px] truncate px-3 py-2 pr-4 text-text-muted" title={e.entityLabel}>
                  {e.entityLabel}
                </td>
              </tr>
              {isOpen ? (
                <tr className="bg-surface-muted">
                  <td />
                  <td colSpan={4}>
                    <Detail entry={e} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function Timeline({ entries, className }: { entries: AuditEntry[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const days = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>()
    for (const e of entries) {
      const key = dayFormat.format(new Date(e.occurredAt))
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    return [...groups]
  }, [entries])

  return (
    <div className={cn('divide-y divide-border', className)}>
      {days.map(([day, list]) => (
        <section key={day} aria-label={day}>
          <h3 className="bg-surface-muted px-4 py-2 text-xs font-medium text-text-muted first-letter:uppercase">{day}</h3>
          <ol>
            {list.map((e) => {
              const isOpen = open === e.seq
              return (
                <li key={e.seq} className="border-t border-border first:border-t-0">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={e.actorName} size={32} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-medium">{e.actorName}</span> {describeAudit(e)}
                      </p>
                      <p className="truncate text-xs text-text-muted">{e.entityLabel}</p>
                    </div>
                    <time dateTime={e.occurredAt} className="shrink-0 pt-0.5 text-xs text-text-muted">
                      {timeFormat.format(new Date(e.occurredAt))}
                    </time>
                    <Expander open={isOpen} onToggle={() => setOpen(isOpen ? null : (e.seq ?? null))} label={`${isOpen ? 'Masquer' : 'Afficher'} le détail de l’entrée ${e.seq}`} />
                  </div>
                  {isOpen ? (
                    <div className="bg-surface-muted pl-11">
                      <Detail entry={e} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams()
  const role = useSession().user?.role
  const canExport = role === 'admin' || role === 'archivist'
  const users = useUsers()
  const [shown, setShown] = useState(STEP)
  const [verification, setVerification] = useState<ChainVerification | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const setParam = (key: string, value: string) => {
    setShown(STEP)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const filters: AuditFilters = {
    text: params.get('q') || undefined,
    actorId: params.get('utilisateur') || undefined,
    family: params.get('famille') || undefined,
    entityKind: params.get('type') || undefined,
    from: params.get('du') || undefined,
    to: params.get('au') || undefined,
  }
  const view = params.get('vue') === 'chronologie' ? 'timeline' : 'table'
  const active = Object.values(filters).some(Boolean)
  const page = useAuditLog(filters)

  async function verify() {
    setVerifying(true)
    try {
      setVerification(await verifyAuditIntegrity())
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setVerifying(false)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const { filename, csv, count } = await exportAuditCsv(filters)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Historique exporté', { description: `${formatNumber(count)} entrée${count > 1 ? 's' : ''} dans ${filename}` })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const entries = page?.entries ?? []
  const visible = entries.slice(0, shown)

  return (
    <>
      <PageHeader
        title="Historique des opérations"
        description="Chaque action est enregistrée dans un journal chaîné : toute modification après coup se détecte."
        actions={
          <>
            {canExport ? (
              <Button onClick={() => void exportCsv()} loading={exporting}>
                <Icon icon={Download} />
                Exporter
              </Button>
            ) : null}
            {role === 'admin' ? (
              <Button variant="primary" onClick={() => void verify()} loading={verifying}>
                <Icon icon={ShieldCheck} />
                Vérifier l’intégrité
              </Button>
            ) : null}
          </>
        }
      />

      {verification ? (
        <div
          role="status"
          className={cn('mb-5 flex items-start gap-3 rounded-card border px-4 py-3 text-sm', verification.ok ? 'border-teal/30 bg-teal-tint' : 'border-danger/30 bg-danger-tint')}
        >
          <Icon icon={verification.ok ? ShieldCheck : CircleAlert} size={18} className={verification.ok ? 'mt-0.5 text-teal' : 'mt-0.5 text-danger'} />
          <p className="flex-1">
            {verification.ok ? (
              <>
                <span className="font-semibold">{formatNumber(verification.count)} entrées vérifiées, chaîne intacte.</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Incohérence à l’entrée n° {verification.firstInvalidSeq}.</span> {verification.reason} {formatNumber(verification.count)} entrées précédentes sont intactes.
              </>
            )}
          </p>
          <button type="button" aria-label="Fermer le résultat" onClick={() => setVerification(null)} className="grid size-6 place-items-center rounded-control text-text-muted hover:bg-surface-active">
            <Icon icon={X} size={14} />
          </button>
        </div>
      ) : null}

      <section className="rounded-card border border-border bg-surface shadow-card" aria-label="Journal">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={params.get('q') ?? ''} onChange={(v) => setParam('q', v)} placeholder="Rechercher" label="Rechercher dans l’historique" />
            <div className="ml-auto">
              <Segmented
                label="Affichage"
                value={view}
                onChange={(v) => setParam('vue', v === 'timeline' ? 'chronologie' : '')}
                options={[
                  { value: 'table', label: 'Tableau' },
                  { value: 'timeline', label: 'Chronologie' },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {role !== 'reader' ? (
              <div className="w-[200px]">
                <Field label="Utilisateur">
                  {(p) => (
                    <Select {...p} value={params.get('utilisateur') ?? ''} onChange={(e) => setParam('utilisateur', e.target.value)}>
                      <option value="">Tous</option>
                      {(users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
            <div className="w-[210px]">
              <Field label="Famille d’action">
                {(p) => (
                  <Select {...p} value={params.get('famille') ?? ''} onChange={(e) => setParam('famille', e.target.value)}>
                    <option value="">Toutes</option>
                    {ACTION_FAMILIES.filter((f) => role !== 'archivist' || f.key !== 'auth').map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="w-[190px]">
              <Field label="Type d’élément">
                {(p) => (
                  <Select {...p} value={params.get('type') ?? ''} onChange={(e) => setParam('type', e.target.value)}>
                    <option value="">Tous</option>
                    {ENTITY_KINDS.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="w-[150px]">
              <Field label="Du">{(p) => <DatePicker {...p} value={params.get('du') ?? ''} onChange={(v) => setParam('du', v)} />}</Field>
            </div>
            <div className="w-[150px]">
              <Field label="Au">{(p) => <DatePicker {...p} value={params.get('au') ?? ''} onChange={(v) => setParam('au', v)} />}</Field>
            </div>
            {active ? (
              <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
                <Icon icon={X} />
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </div>

        {page === undefined ? (
          <div role="status" aria-label="Chargement" className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            illustration={<EmptyMailbox />}
            title={active ? 'Aucune entrée' : 'Historique vide'}
            description={active ? 'Aucune entrée ne correspond à ces critères.' : 'Les actions des utilisateurs apparaîtront ici.'}
            action={active ? <Button onClick={() => setParams({}, { replace: true })}>Réinitialiser les filtres</Button> : undefined}
          />
        ) : (
          <>
            <p className="border-b border-border px-4 py-2.5 text-[13px] text-text-muted" aria-live="polite">
              {page.capped ? 'Plus de ' : ''}
              {formatNumber(page.total)} entrée{page.total > 1 ? 's' : ''}
              {page.total > entries.length ? `, les ${formatNumber(entries.length)} plus récentes sont chargées. Affinez les filtres ou exportez pour tout obtenir.` : '.'}
            </p>
            {view === 'table' ? (
              <>
                <Table entries={visible} />
                <Timeline entries={visible} className="md:hidden" />
              </>
            ) : (
              <Timeline entries={visible} />
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-text-muted">
              <span>
                1–{formatNumber(visible.length)} sur {formatNumber(entries.length)}
              </span>
              {visible.length < entries.length ? <Button size="sm" onClick={() => setShown((n) => n + STEP)}>Afficher 25 de plus</Button> : null}
            </div>
          </>
        )}
      </section>
    </>
  )
}
