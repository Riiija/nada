import type { ColumnDef } from '@tanstack/react-table'
import { Download, Filter, Paperclip, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DataTable } from '@/components/ui/DataTable'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { RowActions } from '@/components/ui/RowActions'
import { SearchInput } from '@/components/ui/SearchInput'
import { errorMessage } from '@/data/errors'
import { useLinkCounts } from '@/data/repositories/documentLinks'
import { recordExport } from '@/data/repositories/exports'
import { deleteRegisterEntry, ledgerTotals, restoreRegisterEntry, runningBalances, useRegisterEntries, type RegisterRow } from '@/data/repositories/registers'
import { useSettings } from '@/data/repositories/settings'
import { useSession } from '@/data/session'
import { toCsv } from '@/lib/csv'
import { downloadText } from '@/lib/download'
import { formatDate, formatNumber } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import { fold } from '@/lib/search/engine'
import { todayIn } from '@/lib/dates'
import { invoiceStatusLabels } from '@/data/schemas/registers'
import { registerConfigs, type ColumnDef as Col, type RegisterConfig } from './config'
import { RegisterFormSheet } from './RegisterFormSheet'
import { useRegisterLookups, type LookupSource } from './useRegisterLookups'

const STATUS_TONE = { received: 'neutral', validated: 'petrol', paid: 'teal', rejected: 'danger' } as const

export function StatusBadge({ status }: { status: string }) {
  const known = status in invoiceStatusLabels
  return <Badge tone={known ? STATUS_TONE[status as keyof typeof STATUS_TONE] : 'neutral'}>{known ? invoiceStatusLabels[status as keyof typeof invoiceStatusLabels] : '–'}</Badge>
}

export function RegisterListPage({ type }: { type: keyof typeof registerConfigs }) {
  const config = registerConfigs[type]
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const rows = useRegisterEntries(type)
  const lookups = useRegisterLookups()
  const links = useLinkCounts(config.entityType)
  const settings = useSettings()
  const role = useSession().user?.role
  const canEdit = role === 'admin' || role === 'archivist'
  const [editing, setEditing] = useState<RegisterRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const sheetOpen = params.get('nouveau') === '1' || editing !== null
  const currency = settings?.currency
  const ctx = useMemo(() => ({ lookups, currency }), [lookups, currency])

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
    if (!rows) return undefined
    const current = new URLSearchParams(query)
    const needle = fold((current.get('q') ?? '').trim())
    const from = current.get('du') ?? ''
    const to = current.get('au') ?? ''
    return rows.filter((row) => {
      const day = String(row[config.dateField] ?? '')
      if ((from && day < from) || (to && day > to)) return false
      for (const f of config.filters) {
        const wanted = current.get(f.param)
        if (wanted && row[f.field] !== wanted) return false
      }
      if (!needle) return true
      const haystack = fold(
        [...config.columns.map((c) => c.value(row, ctx)), ...config.searchFields.map((f) => String(row[f] ?? ''))].join(' '),
      )
      return haystack.includes(needle)
    })
  }, [rows, query, config, ctx])

  const balances = useMemo(() => (type === 'ledgerEntries' && rows ? runningBalances(rows) : undefined), [type, rows])
  const totals = useMemo(() => (type === 'ledgerEntries' && filtered ? ledgerTotals(filtered) : undefined), [type, filtered])
  const activeFilters = ['q', 'du', 'au', ...config.filters.map((f) => f.param)].filter((k) => params.get(k)).length

  async function remove(row: RegisterRow) {
    try {
      await deleteRegisterEntry(type, row.id)
      toast.success(`${config.singular} supprimé${config.singular === 'Facture' || config.singular === 'Note de service' || config.singular === 'Écriture' ? 'e' : ''}`, {
        duration: 6000,
        action: {
          label: 'Annuler',
          onClick: () =>
            void restoreRegisterEntry(type, row.id).then(
              () => toast.success('Élément restauré'),
              (error) => toast.error(errorMessage(error)),
            ),
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function exportCsv() {
    if (!filtered) return
    setExporting(true)
    try {
      const strip = (v: string) => (v === '–' ? '' : v)
      const header = [...config.columns.map((c) => headerLabel(c, currency)), ...(balances ? ['Solde cumulé'] : []), 'Pièces jointes']
      const lines = filtered.map((row) => [
        ...config.columns.map((c) => strip(amountCell(c, row, ctx))),
        ...(balances ? [formatMoney(balances.get(row.id) ?? 0)] : []),
        links?.get(row.id) ?? 0,
      ])
      await recordExport(config.title, filtered.length, Object.fromEntries(params))
      downloadText(`${config.slug}-${todayIn(settings?.timezone ?? 'UTC')}.csv`, toCsv(header, lines))
      toast.success('Liste exportée', { description: `${formatNumber(filtered.length)} ligne${filtered.length > 1 ? 's' : ''}` })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const columns = useMemo<ColumnDef<RegisterRow>[]>(() => {
    const cols: ColumnDef<RegisterRow>[] = config.columns.map((c) => ({
      id: c.key,
      header: () => <span className={c.align === 'right' ? 'block text-right' : undefined}>{headerLabel(c, currency)}</span>,
      accessorFn: (row) => (c.sort ? c.sort(row) : c.value(row, ctx)),
      enableSorting: Boolean(c.sort),
      meta: { className: c.hideBelow === 'xl' ? 'hidden xl:table-cell' : undefined },
      cell: ({ row }) => {
        if (c.key === 'status') return <StatusBadge status={String(row.original.status ?? '')} />
        const text = c.value(row.original, ctx)
        const cell = c.key === 'reference' ? <span className="font-medium whitespace-nowrap">{text}</span> : <span className="block max-w-[260px] truncate" title={text}>{text}</span>
        return c.align === 'right' ? <span className="block text-right whitespace-nowrap tabular-nums">{text}</span> : cell
      },
    }))
    if (balances) {
      cols.push({
        id: 'balance',
        header: () => <span className="block text-right">Solde cumulé</span>,
        accessorFn: (row) => balances.get(row.id) ?? 0,
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => {
          const value = balances.get(row.original.id) ?? 0
          return <span className={`block text-right whitespace-nowrap tabular-nums ${value < 0 ? 'text-danger' : ''}`}>{formatMoney(value)}</span>
        },
      })
    }
    cols.push({
      id: 'attachments',
      header: () => (
        <span title="Pièces jointes">
          <Icon icon={Paperclip} size={14} />
          <span className="sr-only">Pièces jointes</span>
        </span>
      ),
      enableSorting: false,
      accessorFn: (row) => links?.get(row.id) ?? 0,
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
    })
    cols.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <RowActions
          label={`Actions pour ${config.heading(row.original)}`}
          actions={[
            { label: 'Ouvrir', onSelect: () => navigate(`/${config.slug}/${row.original.id}`) },
            ...(canEdit
              ? [
                  { label: 'Modifier', onSelect: () => setEditing(row.original) },
                  { label: 'Supprimer', danger: true, onSelect: () => void remove(row.original) },
                ]
              : []),
          ]}
        />
      ),
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ctx, currency, balances, links, canEdit])

  const total = rows?.length
  const closeSheet = () => {
    setEditing(null)
    if (params.has('nouveau')) setParam('nouveau', '')
  }

  return (
    <>
      <PageHeader
        title={config.title}
        description={total === undefined ? ' ' : `${formatNumber(total)} enregistré${total > 1 ? 's' : ''}.`}
        actions={
          <>
            {canEdit ? (
              <Button onClick={() => void exportCsv()} loading={exporting} disabled={!filtered?.length}>
                <Icon icon={Download} />
                Exporter
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="primary" onClick={() => setParam('nouveau', '1')}>
                <Icon icon={Plus} />
                {config.addLabel}
              </Button>
            ) : null}
          </>
        }
      />

      {totals ? (
        <dl className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="Totaux de la période affichée">
          {[
            ['Total débit', totals.debit],
            ['Total crédit', totals.credit],
            ['Solde', totals.balance],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-card border border-border bg-surface px-5 py-4 shadow-card">
              <dt className="text-[13px] text-text-muted">{label}</dt>
              <dd className={`mt-1 text-[22px] leading-7 font-bold tabular-nums ${label === 'Solde' && (value as number) < 0 ? 'text-danger' : ''}`}>
                {formatMoney(value as number)}
                {currency ? <span className="ml-1.5 text-[13px] font-normal text-text-muted">{currency}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="rounded-card border border-border bg-surface shadow-card" aria-label={config.title}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <SearchInput value={params.get('q') ?? ''} onChange={(v) => setParam('q', v)} placeholder="Rechercher" label={`Rechercher dans ${config.title.toLowerCase()}`} />
          <FiltersPopover config={config} lookups={lookups} params={params} setParam={setParam} />
          {activeFilters > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setParams(params.has('nouveau') ? new URLSearchParams({ nouveau: '1' }) : new URLSearchParams(), { replace: true })}>
              <Icon icon={X} />
              Réinitialiser
            </Button>
          ) : null}
        </div>
        <DataTable
          label={config.title}
          data={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/${config.slug}/${r.id}`)}
          mobileRow={(r) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.reference ? `${r.reference}, ${config.heading(r)}` : config.heading(r)}</div>
                <div className="truncate text-xs text-text-muted">{formatDate(String(r[config.dateField] ?? ''))}</div>
              </div>
              {type === 'incomingInvoices' ? <StatusBadge status={String(r.status ?? '')} /> : null}
              {type === 'ledgerEntries' ? (
                <span className="text-sm font-medium tabular-nums">{formatMoney(Number(r.credit) > 0 ? Number(r.credit) : -Number(r.debit))}</span>
              ) : null}
            </div>
          )}
          empty={
            <EmptyState
              illustration={<EmptyMailbox />}
              title={total === 0 ? `Aucun ${config.singular.toLowerCase()}` : 'Aucun résultat'}
              description={total === 0 ? (canEdit ? config.emptyText : 'Rien n’a encore été enregistré.') : 'Aucun élément ne correspond à ces critères.'}
              action={
                total === 0 ? (
                  canEdit ? (
                    <Button variant="primary" onClick={() => setParam('nouveau', '1')}>
                      <Icon icon={Plus} />
                      {config.addLabel}
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

      {canEdit ? <RegisterFormSheet config={config} row={editing} open={sheetOpen} onClose={closeSheet} /> : null}
    </>
  )
}

const headerLabel = (c: Col, currency?: string) => (c.align === 'right' && currency ? `${c.label} (${currency})` : c.label)
const amountCell = (c: Col, row: RegisterRow, ctx: Parameters<Col['value']>[1]) => c.value(row, ctx)

function FiltersPopover({
  config,
  lookups,
  params,
  setParam,
}: {
  config: RegisterConfig
  lookups: ReturnType<typeof useRegisterLookups>
  params: URLSearchParams
  setParam: (key: string, value: string) => void
}) {
  const count = ['du', 'au', ...config.filters.map((f) => f.param)].filter((k) => params.get(k)).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <Icon icon={Filter} />
          Filtres{count ? ` (${count})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] space-y-4 p-4">
        {config.filters.map((f) => (
          <Field key={f.param} label={f.label}>
            {(p) => (
              <Combobox
                {...p}
                value={params.get(f.param) ?? ''}
                onChange={(v) => setParam(f.param, v)}
                options={f.options ?? lookups.options(f.source as LookupSource)}
                clearLabel="Tous"
                placeholder="Tous"
              />
            )}
          </Field>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du">{(p) => <DatePicker {...p} value={params.get('du') ?? ''} onChange={(v) => setParam('du', v)} />}</Field>
          <Field label="Au">{(p) => <DatePicker {...p} value={params.get('au') ?? ''} onChange={(v) => setParam('au', v)} />}</Field>
        </div>
      </PopoverContent>
    </Popover>
  )
}
