import type { ColumnDef } from '@tanstack/react-table'
import { FolderInput } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { RowActions } from '@/components/ui/RowActions'
import { SearchInput } from '@/components/ui/SearchInput'
import { ocrRunner } from '@/lib/ocr'
import { Select } from '@/components/ui/Select'
import { toast } from 'sonner'
import { errorMessage } from '@/data/errors'
import { useDocuments } from '@/data/repositories/documents'
import { categoryLabels, documentCategories } from '@/data/schemas/document'
import { useSession } from '@/data/session'
import type { DocumentCategory, DocumentRecord } from '@/data/types'
import { formatDate, formatNumber } from '@/lib/format'
import { formatBytes } from '@/lib/storage'

export function OcrBadge({ status }: { status: DocumentRecord['ocrStatus'] }) {
  switch (status) {
    case 'pending':
      return <Badge tone="amber">Lecture en attente</Badge>
    case 'processing':
      return <Badge tone="petrol">Lecture en cours</Badge>
    case 'done':
      return <Badge tone="teal">Indexé</Badge>
    case 'failed':
      return <Badge tone="danger">À relancer</Badge>
  }
}

export function DocumentsListPage() {
  const documents = useDocuments()
  const navigate = useNavigate()
  const canImport = useSession().user?.role !== 'reader'
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState<DocumentCategory | ''>('')

  const rows = useMemo(() => documents?.filter((d) => !category || d.category === category), [documents, category])
  const columns = useMemo<ColumnDef<DocumentRecord>[]>(
    () => [
      {
        id: 'title',
        header: 'Document',
        accessorFn: (d) => `${d.title} ${d.originalFilename}`,
        cell: ({ row: { original: d } }) => (
          <div className="flex items-center gap-3">
            <FileTypeIcon kind={d.kind} label={d.originalFilename.split('.').pop()} size={28} />
            <span className="block max-w-[320px] truncate font-medium" title={d.title}>
              {d.title}
            </span>
          </div>
        ),
      },
      { id: 'category', header: 'Catégorie', enableSorting: false, accessorFn: (d) => categoryLabels[d.category] },
      { id: 'pages', header: 'Pages', accessorFn: (d) => d.pageCount },
      { id: 'size', header: 'Taille', accessorFn: (d) => d.sizeBytes, cell: ({ row }) => formatBytes(row.original.sizeBytes) },
      { id: 'archivedAt', header: 'Archivé le', accessorFn: (d) => d.archivedAt, cell: ({ row }) => formatDate(row.original.archivedAt) },
      { id: 'ocr', header: 'Lecture', enableSorting: false, accessorFn: (d) => d.ocrStatus, cell: ({ row }) => <OcrBadge status={row.original.ocrStatus} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row: { original: d } }) => (
          <RowActions
            label={`Actions pour ${d.title}`}
            actions={[
              { label: 'Ouvrir', onSelect: () => navigate(`/documents/${d.id}`) },
              ...(canImport && d.ocrStatus !== 'processing' && d.ocrStatus !== 'pending' ? [{ label: 'Relancer la lecture', onSelect: () => void relaunch([d.id]) }] : []),
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canImport],
  )

  async function relaunch(ids: string[]) {
    try {
      await ocrRunner.retry(ids)
      toast.success(ids.length > 1 ? `${ids.length} lectures relancées` : 'Lecture relancée')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  const failed = (documents ?? []).filter((d) => d.ocrStatus === 'failed').map((d) => d.id)

  const total = documents?.length

  return (
    <>
      <PageHeader
        title="Tous les documents"
        description={total === undefined ? ' ' : `${formatNumber(total)} document${total > 1 ? 's' : ''} archivé${total > 1 ? 's' : ''} dans ce navigateur.`}
        actions={
          canImport ? (
            <Button variant="primary" asChild>
              <Link to="/archivage">
                <Icon icon={FolderInput} />
                Importer des documents
              </Link>
            </Button>
          ) : undefined
        }
      />
      <section className="rounded-card border border-border bg-surface shadow-card" aria-label="Documents">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput value={filter} onChange={setFilter} placeholder="Rechercher" label="Rechercher un document" />
          {canImport && failed.length > 0 ? (
            <Button onClick={() => void relaunch(failed)}>Relancer la lecture ({failed.length})</Button>
          ) : null}
          <div className="w-full sm:w-[220px]">
            <Select aria-label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')}>
              <option value="">Toutes les catégories</option>
              {documentCategories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DataTable
          label="Documents"
          data={rows}
          columns={columns}
          filter={filter}
          getRowId={(d) => d.id}
          onRowClick={(d) => navigate(`/documents/${d.id}`)}
          mobileRow={(d) => (
            <div className="flex items-center gap-3">
              <FileTypeIcon kind={d.kind} label={d.originalFilename.split('.').pop()} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="truncate text-xs text-text-muted">
                  {categoryLabels[d.category]}, {formatBytes(d.sizeBytes)}
                </div>
              </div>
              <OcrBadge status={d.ocrStatus} />
            </div>
          )}
          empty={
            <EmptyState
              illustration={<EmptyMailbox />}
              title={total === 0 ? 'Aucun document archivé' : 'Aucun résultat'}
              description={total === 0 ? 'Les documents importés apparaîtront ici.' : 'Aucun document ne correspond à ces critères.'}
              action={
                total === 0 && canImport ? (
                  <Button variant="primary" asChild>
                    <Link to="/archivage">Importer des documents</Link>
                  </Button>
                ) : total !== 0 ? (
                  <Button
                    onClick={() => {
                      setFilter('')
                      setCategory('')
                    }}
                  >
                    Réinitialiser les filtres
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </section>
    </>
  )
}
