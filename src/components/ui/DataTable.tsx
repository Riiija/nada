import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'

type Props<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  /** undefined = chargement en cours. */
  data: T[] | undefined
  getRowId: (row: T) => string
  /** Texte recherché dans toutes les colonnes. */
  filter?: string
  onRowClick?: (row: T) => void
  /** Affiché quand il n'y a aucune ligne (liste vide ou filtre sans résultat). */
  empty: ReactNode
  /** Rendu d'une ligne sous 768 px (liste empilée, sans défilement horizontal). */
  mobileRow: (row: T) => ReactNode
  pageSize?: number
  label: string
}

const numberFormat = new Intl.NumberFormat('fr-FR')

/** Classe optionnelle d'une colonne, par exemple `hidden xl:table-cell` pour la masquer sur écran étroit. */
function columnClass(meta: unknown): string | undefined {
  return (meta as { className?: string } | undefined)?.className
}

export function DataTable<T>({ columns, data, getRowId, filter, onRowClick, empty, mobileRow, pageSize = 25, label }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  // TanStack Table renvoie des fonctions non mémoïsables : le compilateur saute ce composant, sans conséquence ici.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    state: { sorting, globalFilter: filter ?? '' },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: (row, _columnId, value: string) => {
      const needle = String(value).trim().toLocaleLowerCase('fr')
      if (!needle) return true
      return JSON.stringify(Object.values(row.original as object)).toLocaleLowerCase('fr').includes(needle)
    },
  })

  if (data === undefined) {
    return (
      <div role="status" aria-label="Chargement" className="space-y-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const rows = table.getRowModel().rows
  if (rows.length === 0) return <>{empty}</>

  const { pageIndex, pageSize: size } = table.getState().pagination
  const total = table.getFilteredRowModel().rows.length
  const from = pageIndex * size + 1
  const to = Math.min(total, from + size - 1)

  return (
    <div>
      <ul className="divide-y divide-border md:hidden" aria-label={label}>
        {rows.map((row) => (
          <li key={row.id}>
            {onRowClick ? (
              <button type="button" className="block w-full px-4 py-3 text-left hover:bg-surface-muted" onClick={() => onRowClick(row.original)}>
                {mobileRow(row.original)}
              </button>
            ) : (
              <div className="px-4 py-3">{mobileRow(row.original)}</div>
            )}
          </li>
        ))}
      </ul>

      <div className="relative hidden overflow-x-auto md:block">
      <table className="w-full border-collapse" aria-label={label}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="h-10 bg-surface-muted text-left">
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={cn('px-3 text-xs font-medium whitespace-nowrap text-text-muted first:pl-4 last:pr-4', columnClass(header.column.columnDef.meta))}
                  >
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-text">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted ? <Icon icon={sorted === 'asc' ? ArrowUp : ArrowDown} size={14} /> : null}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={
                onRowClick
                  ? (e) => {
                      // Les menus ouverts depuis la ligne sont dans un portail mais leurs clics remontent ici.
                      if (e.currentTarget.contains(e.target as Node)) onRowClick(row.original)
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row.original)
                    }
                  : undefined
              }
              className={cn('h-12 border-t border-border', onRowClick && 'cursor-pointer hover:bg-surface-muted')}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={cn('px-3 text-sm first:pl-4 last:pr-4', columnClass(cell.column.columnDef.meta))}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-text-muted">
        <span>
          {numberFormat.format(from)}–{numberFormat.format(to)} sur {numberFormat.format(total)}
        </span>
        <div className="flex gap-2">
          <Button size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <Icon icon={ChevronLeft} />
            Précédent
          </Button>
          <Button size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Suivant
            <Icon icon={ChevronRight} />
          </Button>
        </div>
      </div>
    </div>
  )
}
