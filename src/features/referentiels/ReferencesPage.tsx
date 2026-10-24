import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { SubNav } from '@/components/layout/SubNav'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { RowActions, type RowAction } from '@/components/ui/RowActions'
import { SearchInput } from '@/components/ui/SearchInput'
import { errorMessage } from '@/data/errors'
import { setReferenceActive, useReference, type ReferenceRow } from '@/data/repositories/referenceData'
import { useSession } from '@/data/session'
import { formatNumber } from '@/lib/format'
import { configBySlug, referenceConfigs } from './config'
import { ReferenceSheet } from './ReferenceSheet'

const subNavItems = referenceConfigs.map((c) => ({ label: c.tab, to: `/referentiels/${c.slug}`, icon: c.icon }))

export function ReferencesPage() {
  const { type: slug } = useParams()
  const config = configBySlug(slug)
  if (!config) return <Navigate to="/referentiels/directions" replace />
  return <ReferencesList key={config.type} config={config} />
}

function ReferencesList({ config }: { config: NonNullable<ReturnType<typeof configBySlug>> }) {
  const rows = useReference(config.type)
  const departments = useReference('departments')
  const isAdmin = useSession().user?.role === 'admin'
  const [filter, setFilter] = useState('')
  const [sheet, setSheet] = useState<{ row: ReferenceRow | null } | null>(null)
  const [toggle, setToggle] = useState<ReferenceRow | null>(null)

  const lookups = useMemo(
    () => ({ departments: new Map((departments ?? []).map((d) => [d.id, String(d.name)])) }),
    [departments],
  )
  const labelOf = (row: ReferenceRow) => String(row[config.columns[0]!.key] ?? '')

  const columns = useMemo<ColumnDef<ReferenceRow>[]>(
    () => [
      ...config.columns.map<ColumnDef<ReferenceRow>>((spec) => ({
        id: spec.key,
        header: spec.label,
        enableSorting: spec.sortable ?? false,
        accessorFn: (row) => (spec.format ? spec.format(row, lookups) : row[spec.key]),
        cell: ({ row, getValue }) => {
          const value = spec.format ? spec.format(row.original, lookups) : getValue()
          const text = value == null || value === '' ? '–' : typeof value === 'number' ? formatNumber(value) : String(value)
          return <span className={row.original.isActive === 0 ? 'text-text-subtle' : undefined}>{text}</span>
        },
      })),
      {
        id: 'status',
        header: 'Statut',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isActive === 1 ? <Badge tone="teal">Actif</Badge> : <Badge tone="neutral">Désactivé</Badge>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => <RowActions label={`Actions pour ${labelOf(row.original)}`} actions={actionsFor(row.original)} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, lookups, isAdmin],
  )

  function actionsFor(row: ReferenceRow): RowAction[] {
    const actions: RowAction[] = [{ label: 'Modifier', onSelect: () => setSheet({ row }) }]
    if (isAdmin) {
      actions.push(
        row.isActive === 1
          ? { label: 'Désactiver', danger: true, onSelect: () => setToggle(row) }
          : { label: 'Réactiver', onSelect: () => void apply(row, true) },
      )
    }
    return actions
  }

  async function apply(row: ReferenceRow, active: boolean) {
    try {
      await setReferenceActive(config.type, row.id, active)
      toast.success(active ? 'Élément réactivé' : 'Élément désactivé')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const total = rows?.length
  const description = total === undefined ? config.description : `${config.description} ${formatNumber(total)} au total.`

  return (
    <>
      <PageHeader
        title="Référentiels"
        description="Les listes utilisées dans les formulaires de courriers et d’actes."
        actions={
          <Button variant="primary" onClick={() => setSheet({ row: null })}>
            <Icon icon={Plus} />
            {config.addLabel}
          </Button>
        }
      />
      <SubNav items={subNavItems} label="Référentiels" />

      <section aria-labelledby="ref-title" className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="ref-title" className="text-base font-semibold">
              {config.title}
            </h2>
            <p className="text-[13px] text-text-muted">{description}</p>
          </div>
          <SearchInput value={filter} onChange={setFilter} placeholder="Rechercher" label={config.searchLabel} />
        </div>
        <DataTable
          label={config.title}
          data={rows}
          columns={columns}
          filter={filter}
          getRowId={(row) => row.id}
          onRowClick={(row) => setSheet({ row })}
          mobileRow={(row) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={row.isActive === 0 ? 'truncate font-medium text-text-subtle' : 'truncate font-medium'}>{labelOf(row)}</div>
                {config.columns[1] ? (
                  <div className="truncate text-xs text-text-muted">
                    {(() => {
                      const spec = config.columns[1]!
                      const v = spec.format ? spec.format(row, lookups) : row[spec.key]
                      return v == null || v === '' ? '–' : String(v)
                    })()}
                  </div>
                ) : null}
              </div>
              {row.isActive === 1 ? <Badge tone="teal">Actif</Badge> : <Badge tone="neutral">Désactivé</Badge>}
            </div>
          )}
          empty={
            <EmptyState
              illustration={<EmptyMailbox />}
              title={filter ? 'Aucun résultat' : config.emptyTitle}
              description={filter ? 'Aucun élément ne correspond à cette recherche.' : config.emptyText}
              action={
                filter ? (
                  <Button onClick={() => setFilter('')}>Effacer la recherche</Button>
                ) : (
                  <Button variant="primary" onClick={() => setSheet({ row: null })}>
                    <Icon icon={Plus} />
                    {config.addLabel}
                  </Button>
                )
              }
            />
          }
        />
      </section>

      <ReferenceSheet
        config={config}
        row={sheet?.row ?? null}
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
      />
      <ConfirmDialog
        open={toggle !== null}
        onOpenChange={(open) => !open && setToggle(null)}
        title={toggle ? `Désactiver « ${labelOf(toggle)} » ?` : ''}
        description="Cet élément ne sera plus proposé dans les formulaires. Les courriers déjà enregistrés le conservent. L’opération est enregistrée dans l’historique."
        confirmLabel="Désactiver"
        danger
        onConfirm={() => (toggle ? apply(toggle, false) : undefined)}
      />
    </>
  )
}
