import type { ColumnDef } from '@tanstack/react-table'
import { Download, Filter, Paperclip, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DataTable } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { RowActions, type RowAction } from '@/components/ui/RowActions'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { errorMessage } from '@/data/errors'
import { useLinkCounts } from '@/data/repositories/documentLinks'
import { recordExport } from '@/data/repositories/exports'
import { canTreat, isStale, markProcessed, useMails } from '@/data/repositories/mails'
import { useSettings } from '@/data/repositories/settings'
import { useSession } from '@/data/session'
import type { Mail, MailFlow } from '@/data/types'
import { toCsv } from '@/lib/csv'
import { todayIn } from '@/lib/dates'
import { downloadText } from '@/lib/download'
import { formatDate, formatNumber } from '@/lib/format'
import { MailFormSheet } from './MailFormSheet'
import { MailStatusBadge } from './StatusBadge'
import { useMailLookups } from './useMailLookups'

type Status = 'all' | 'pending' | 'processed'

const FILTER_KEYS = ['provenance', 'personne', 'direction', 'destinataire', 'du', 'au'] as const

export function MailsListPage({ flow }: { flow: MailFlow }) {
  const incoming = flow === 'incoming'
  const basePath = incoming ? '/courriers/arrives' : '/courriers/departs'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const user = useSession().user
  const settings = useSettings()
  const mails = useMails(flow)
  const lookups = useMailLookups()
  const links = useLinkCounts('mail')
  const canEdit = user?.role === 'admin' || user?.role === 'archivist'
  const [editing, setEditing] = useState<Mail | null>(null)
  const [exporting, setExporting] = useState(false)

  const sheetOpen = params.get('nouveau') === '1' || editing !== null
  const today = todayIn(settings?.timezone ?? 'UTC')
  const staleAfterDays = settings?.staleAfterDays ?? 15

  const q = params.get('q') ?? ''
  const status = (params.get('statut') as Status | null) ?? 'all'
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const query = params.toString()
  const filtered = useMemo(() => {
    if (!mails) return undefined
    const current = new URLSearchParams(query)
    const needle = q.trim().toLocaleLowerCase('fr')
    const get = (k: string) => current.get(k) ?? ''
    return mails.filter((m) => {
      if (incoming && status === 'pending' && m.isProcessed === 1) return false
      if (incoming && status === 'processed' && m.isProcessed === 0) return false
      if (get('provenance') && m.sourcePartnerId !== get('provenance')) return false
      if (get('destinataire') && m.recipientPartnerId !== get('destinataire')) return false
      if (get('personne') && (incoming ? m.assignedStaffId : m.signedByStaffId) !== get('personne')) return false
      if (get('direction') && m.departmentId !== get('direction')) return false
      if (get('du') && m.mailDate < get('du')) return false
      if (get('au') && m.mailDate > get('au')) return false
      if (!needle) return true
      const haystack = [
        m.reference,
        m.subject,
        m.fileNumber,
        m.recipientLabel,
        lookups.names.partner.get(m.sourcePartnerId ?? ''),
        lookups.names.partner.get(m.recipientPartnerId ?? ''),
        lookups.names.staff.get(m.assignedStaffId ?? ''),
        lookups.names.staff.get(m.signedByStaffId ?? ''),
        lookups.names.department.get(m.departmentId ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr')
      return haystack.includes(needle)
    })
  }, [mails, q, status, query, incoming, lookups.names])

  const counts = useMemo(() => {
    const all = mails?.length ?? 0
    const pending = mails?.filter((m) => m.isProcessed === 0).length ?? 0
    return { all, pending, processed: all - pending }
  }, [mails])

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length

  async function exportCsv() {
    if (!filtered) return
    setExporting(true)
    try {
      const n = lookups.names
      const status = (m: Mail) => (m.isProcessed === 1 ? 'Traité' : isStale(m, today, staleAfterDays) ? 'En retard' : 'En attente')
      const header = incoming
        ? ['Date', 'N°', 'Objet', 'N° dossier', 'Provenance', 'Au bureau de', 'Fonction', 'Direction', 'Type', 'Suivi', 'Position', 'Statut', 'Pièces jointes']
        : ['Date', 'N°', 'Objet', 'Paraphé par', 'Fonction', 'Direction', 'Adressé à', 'Pièces jointes']
      const lines = filtered.map((m) =>
        incoming
          ? [formatDate(m.mailDate), m.reference, m.subject, m.fileNumber, n.partner.get(m.sourcePartnerId ?? ''), n.staff.get(m.assignedStaffId ?? ''), m.staffJobTitle, n.department.get(m.departmentId ?? ''), n.lookup.get(m.mailTypeId ?? ''), n.lookup.get(m.followUpId ?? ''), n.lookup.get(m.positionId ?? ''), status(m), links?.get(m.id) ?? 0]
          : [formatDate(m.mailDate), m.reference, m.subject, n.staff.get(m.signedByStaffId ?? ''), m.staffJobTitle, n.department.get(m.departmentId ?? ''), m.recipientPartnerId ? n.partner.get(m.recipientPartnerId) : m.recipientLabel, links?.get(m.id) ?? 0],
      )
      await recordExport(incoming ? 'Courriers arrivés' : 'Courriers départ', filtered.length, Object.fromEntries(params))
      downloadText(`${incoming ? 'courriers-arrives' : 'courriers-departs'}-${today}.csv`, toCsv(header, lines))
      toast.success('Liste exportée', { description: `${formatNumber(filtered.length)} ligne${filtered.length > 1 ? 's' : ''}` })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  async function treat(mail: Mail) {
    try {
      await markProcessed(mail.id)
      toast.success('Courrier marqué comme traité')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const actionsFor = (m: Mail): RowAction[] => {
    const actions: RowAction[] = [{ label: 'Ouvrir', onSelect: () => navigate(`${basePath}/${m.id}`) }]
    if (canEdit) actions.push({ label: 'Modifier', onSelect: () => setEditing(m) })
    if (incoming && m.isProcessed === 0 && user && canTreat(m, user)) actions.push({ label: 'Marquer comme traité', onSelect: () => void treat(m) })
    return actions
  }

  const name = lookups.names
  const columns = useMemo<ColumnDef<Mail>[]>(() => {
    const date: ColumnDef<Mail> = { id: 'mailDate', header: 'Date', accessorFn: (m) => m.mailDate, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.mailDate)}</span> }
    const reference: ColumnDef<Mail> = {
      id: 'reference',
      header: 'N°',
      accessorFn: (m) => m.year * 1_000_000 + m.seq,
      cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.reference}</span>,
    }
    const subject: ColumnDef<Mail> = {
      id: 'subject',
      header: 'Objet',
      enableSorting: false,
      accessorFn: (m) => m.subject,
      cell: ({ row }) => (
        <span className="block max-w-[240px] truncate" title={row.original.subject}>
          {row.original.subject}
        </span>
      ),
    }
    const text = (id: string, header: string, get: (m: Mail) => string | undefined, className?: string): ColumnDef<Mail> => ({
      id,
      header,
      meta: { className },
      enableSorting: false,
      accessorFn: (m) => get(m) ?? '',
      cell: ({ row }) => <span className="block max-w-[140px] truncate">{get(row.original) || '–'}</span>,
    })
    const attachments: ColumnDef<Mail> = {
      id: 'attachments',
      header: () => (
        <span title="Pièces jointes">
          <Icon icon={Paperclip} size={14} />
          <span className="sr-only">Pièces jointes</span>
        </span>
      ),
      enableSorting: false,
      accessorFn: (m) => links?.get(m.id) ?? 0,
      cell: ({ row }) => {
        const n = links?.get(row.original.id) ?? 0
        return n ? (
          <span className="inline-flex items-center gap-1 text-text-muted">
            <Icon icon={Paperclip} size={14} />
            {n}
          </span>
        ) : (
          <span className="text-text-subtle">–</span>
        )
      },
    }
    const actions: ColumnDef<Mail> = {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => <RowActions label={`Actions pour le courrier ${row.original.reference}`} actions={actionsFor(row.original)} />,
    }
    return incoming
      ? [
          date,
          reference,
          subject,
          text('source', 'Provenance', (m) => name.partner.get(m.sourcePartnerId ?? ''), 'hidden xl:table-cell'),
          text('assigned', 'Destinataire', (m) => name.staff.get(m.assignedStaffId ?? '')),
          text('position', 'Position', (m) => name.lookup.get(m.positionId ?? ''), 'hidden xl:table-cell'),
          attachments,
          {
            id: 'status',
            header: 'Statut',
            enableSorting: false,
            accessorFn: (m) => m.isProcessed,
            cell: ({ row }) => <MailStatusBadge mail={row.original} today={today} staleAfterDays={staleAfterDays} />,
          },
          actions,
        ]
      : [
          date,
          reference,
          subject,
          text('signedBy', 'Paraphé par', (m) => name.staff.get(m.signedByStaffId ?? '')),
          text('department', 'Direction', (m) => name.department.get(m.departmentId ?? '')),
          text('recipient', 'Adressé à', (m) => (m.recipientPartnerId ? name.partner.get(m.recipientPartnerId) : m.recipientLabel)),
          attachments,
          actions,
        ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, name, links, today, staleAfterDays, user?.id, canEdit])

  const title = incoming ? 'Courriers arrivés' : 'Courriers départ'
  const total = mails?.length
  const closeSheet = () => {
    setEditing(null)
    if (params.has('nouveau')) setParam('nouveau', '')
  }

  return (
    <>
      <PageHeader
        title={title}
        description={total === undefined ? ' ' : `${formatNumber(total)} courrier${total > 1 ? 's' : ''} ${incoming ? 'reçu' : 'envoyé'}${total > 1 ? 's' : ''}.`}
        actions={
          canEdit ? (
            <>
              <Button onClick={() => void exportCsv()} loading={exporting} disabled={!filtered?.length}>
                <Icon icon={Download} />
                Exporter
              </Button>
              <Button variant="primary" onClick={() => setParam('nouveau', '1')}>
                <Icon icon={Plus} />
                Enregistrer un courrier
              </Button>
            </>
          ) : undefined
        }
      />

      <section className="rounded-card border border-border bg-surface shadow-card" aria-label={title}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          {incoming ? (
            <Segmented
              label="Statut"
              value={status}
              onChange={(v) => setParam('statut', v === 'all' ? '' : v)}
              options={[
                { value: 'all', label: 'Tous', count: counts.all },
                { value: 'pending', label: 'En attente', count: counts.pending },
                { value: 'processed', label: 'Traités', count: counts.processed },
              ]}
            />
          ) : null}
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Rechercher" label={`Rechercher dans les ${title.toLowerCase()}`} />
            <FiltersPopover flow={flow} lookups={lookups} params={params} setParam={setParam} count={activeFilters} />
            {activeFilters > 0 || q || status !== 'all' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setParams((prev) => (prev.has('nouveau') ? new URLSearchParams({ nouveau: '1' }) : new URLSearchParams()), { replace: true })}
              >
                <Icon icon={X} />
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </div>

        <DataTable
          label={title}
          data={filtered}
          columns={columns}
          getRowId={(m) => m.id}
          onRowClick={(m) => navigate(`${basePath}/${m.id}`)}
          mobileRow={(m) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {m.reference}, {m.subject}
                </div>
                <div className="truncate text-xs text-text-muted">
                  {formatDate(m.mailDate)}, {incoming ? name.partner.get(m.sourcePartnerId ?? '') : name.staff.get(m.signedByStaffId ?? '')}
                </div>
              </div>
              <MailStatusBadge mail={m} today={today} staleAfterDays={staleAfterDays} />
            </div>
          )}
          empty={
            <EmptyState
              illustration={<EmptyMailbox />}
              title={total === 0 ? `Aucun courrier ${incoming ? 'arrivé' : 'départ'}` : 'Aucun résultat'}
              description={
                total === 0
                  ? canEdit
                    ? 'Les courriers enregistrés apparaîtront ici.'
                    : 'Aucun courrier n’a encore été enregistré.'
                  : 'Aucun courrier ne correspond à ces critères.'
              }
              action={
                total === 0 ? (
                  canEdit ? (
                    <Button variant="primary" onClick={() => setParam('nouveau', '1')}>
                      <Icon icon={Plus} />
                      Enregistrer un courrier
                    </Button>
                  ) : undefined
                ) : (
                  <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>Réinitialiser les filtres</Button>
                )
              }
            />
          }
        />
      </section>

      {canEdit ? <MailFormSheet flow={flow} mail={editing} open={sheetOpen} onClose={closeSheet} /> : null}
    </>
  )
}

type PopoverProps = {
  flow: MailFlow
  lookups: ReturnType<typeof useMailLookups>
  params: URLSearchParams
  setParam: (key: string, value: string) => void
  count: number
}

function FiltersPopover({ flow, lookups, params, setParam, count }: PopoverProps) {
  const incoming = flow === 'incoming'
  const options = lookups.options()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="md">
          <Icon icon={Filter} />
          Filtres{count ? ` (${count})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-4 p-4">
        {incoming ? (
          <Field label="Provenance">
            {(p) => <Combobox {...p} value={params.get('provenance') ?? ''} onChange={(v) => setParam('provenance', v)} options={options.partners} clearLabel="Toutes" placeholder="Toutes" />}
          </Field>
        ) : (
          <Field label="Adressé à">
            {(p) => <Combobox {...p} value={params.get('destinataire') ?? ''} onChange={(v) => setParam('destinataire', v)} options={options.partners} clearLabel="Tous" placeholder="Tous" />}
          </Field>
        )}
        <Field label={incoming ? 'Au bureau de' : 'Paraphé par'}>
          {(p) => <Combobox {...p} value={params.get('personne') ?? ''} onChange={(v) => setParam('personne', v)} options={options.staff} clearLabel="Tous" placeholder="Tous" />}
        </Field>
        <Field label="Direction">
          {(p) => <Combobox {...p} value={params.get('direction') ?? ''} onChange={(v) => setParam('direction', v)} options={options.departments} clearLabel="Toutes" placeholder="Toutes" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du">{(p) => <DatePicker {...p} value={params.get('du') ?? ''} onChange={(v) => setParam('du', v)} />}</Field>
          <Field label="Au">{(p) => <DatePicker {...p} value={params.get('au') ?? ''} onChange={(v) => setParam('au', v)} />}</Field>
        </div>
      </PopoverContent>
    </Popover>
  )
}

