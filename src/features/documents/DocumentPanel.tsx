import { Copy } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { describeAudit } from '@/data/audit-labels'
import { useDocumentPages, useLinkedItems } from '@/data/repositories/documents'
import { categoryLabels } from '@/data/schemas/document'
import type { AuditEntry, DocumentRecord } from '@/data/types'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/format'
import { hasArabic, highlight } from '@/lib/highlight'
import { formatBytes } from '@/lib/storage'
import { OcrBadge } from './DocumentsListPage'

export function InfoTab({ doc, history }: { doc: DocumentRecord; history: AuditEntry[] | undefined }) {
  const linked = useLinkedItems(doc.id)
  const imported = history?.find((e) => e.action === 'document.imported')
  const rows: [string, React.ReactNode][] = [
    ['Catégorie', categoryLabels[doc.category]],
    ['Type', doc.kind === 'pdf' ? 'PDF' : doc.mimeType.replace('image/', 'Image ').toUpperCase()],
    ['Pages', doc.pageCount],
    ['Taille', formatBytes(doc.sizeBytes)],
    ...(doc.width && doc.height ? ([['Dimensions', `${doc.width} × ${doc.height} px`]] as [string, string][]) : []),
    ['Archivé le', formatDate(doc.archivedAt)],
    ['Importé par', imported ? `${imported.actorName}, ${formatDateTime(imported.occurredAt)}` : history ? '–' : ' '],
    ['Nom du fichier', <span key="n" className="break-all">{doc.originalFilename}</span>],
    ['Empreinte SHA-256', <span key="h" className="break-all text-xs" title={doc.sha256}>{doc.sha256}</span>],
    ['Lecture', <span key="o" className="inline-flex items-center gap-2"><OcrBadge status={doc.ocrStatus} />{doc.ocrConfidence !== undefined ? <span className="text-xs text-text-muted">confiance {Math.round(doc.ocrConfidence)} %</span> : null}</span>],
  ]
  return (
    <div className="space-y-5 p-5">
      <dl className="space-y-3">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="text-[13px] text-text-muted">{term}</dt>
            <dd className="mt-0.5 text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="linked-title">
        <h3 id="linked-title" className="mb-2 text-[13px] text-text-muted">
          Éléments liés
        </h3>
        {linked === undefined ? (
          <Skeleton className="h-5 w-48" />
        ) : linked.length === 0 ? (
          <p className="text-sm text-text-muted">Ce document n’est rattaché à aucun courrier.</p>
        ) : (
          <ul className="space-y-1.5">
            {linked.map((item) => (
              <li key={item.entityId}>
                <Link to={item.to} className="text-sm underline underline-offset-2">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function HistoryTab({ history }: { history: AuditEntry[] | undefined }) {
  if (history === undefined) return <Skeleton className="m-5 h-24" />
  if (history.length === 0) return <p className="p-5 text-sm text-text-muted">Aucun événement pour ce document.</p>
  return (
    <ol className="divide-y divide-border">
      {[...history].reverse().map((e) => (
        <li key={e.seq} className="px-5 py-3 text-sm">
          <div>
            <span className="font-medium">{e.actorName}</span> {describeAudit(e)}
          </div>
          <time dateTime={e.occurredAt} className="text-xs text-text-muted">
            {formatDateTime(e.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  )
}

type TextTabProps = { doc: DocumentRecord; page: number; query: string; onQuery: (q: string) => void; searchRef: RefObject<HTMLInputElement | null> }

/** Texte lu par page : suit la page courante, recherche surlignée, copie, arabe de droite à gauche. */
export function TextTab({ doc, page, query, onQuery, searchRef }: TextTabProps) {
  const pages = useDocumentPages(doc.id)
  const sections = useRef(new Map<number, HTMLElement>())
  const arabic = (pages ?? []).some((p) => hasArabic(p.text))

  // La police arabe n'est chargée que si le texte en contient.
  useEffect(() => {
    if (arabic) void import('@fontsource/ibm-plex-sans-arabic/400.css')
  }, [arabic])

  useEffect(() => {
    sections.current.get(page)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [page, pages])

  async function copy() {
    try {
      await navigator.clipboard.writeText((pages ?? []).map((p) => p.text).join('\n\n'))
      toast.success('Texte copié')
    } catch {
      toast.error('Impossible de copier le texte.')
    }
  }

  const empty =
    doc.ocrStatus === 'done'
      ? 'Aucun texte n’a été reconnu dans ce document.'
      : doc.ocrStatus === 'failed'
        ? 'La lecture de ce document a échoué. Relancez-la depuis la liste des documents.'
        : 'Le texte de ce document n’est pas encore lu. Il apparaîtra ici une fois la lecture terminée.'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <input
          ref={searchRef}
          type="search"
          aria-label="Rechercher dans le texte"
          placeholder="Rechercher dans le texte ( / )"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-sm placeholder:text-text-subtle focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none"
        />
        <Button size="sm" onClick={() => void copy()} disabled={!pages?.length}>
          <Icon icon={Copy} />
          Copier
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pages === undefined ? (
          <Skeleton className="m-5 h-24" />
        ) : pages.length === 0 ? (
          <p className="p-5 text-sm text-text-muted">{empty}</p>
        ) : (
          pages.map((p) => {
            const rtl = hasArabic(p.text)
            return (
              <section
                key={p.pageNumber}
                ref={(el) => {
                  if (el) sections.current.set(p.pageNumber, el)
                  else sections.current.delete(p.pageNumber)
                }}
                aria-current={p.pageNumber === page ? 'page' : undefined}
                className={cn('border-b border-border px-5 py-4', p.pageNumber === page && 'bg-surface-muted')}
              >
                <h3 className="mb-1 text-xs font-medium text-text-muted">Page {p.pageNumber}</h3>
                <p
                  lang={rtl ? 'ar' : undefined}
                  dir={rtl ? 'rtl' : undefined}
                  style={rtl ? { fontFamily: "'IBM Plex Sans Arabic', var(--font-sans)" } : undefined}
                  className="text-sm leading-6 whitespace-pre-wrap"
                >
                  {highlight(p.text, query).map((s, i) =>
                    s.match ? (
                      <mark key={i} className="rounded-[3px] bg-accent-tint px-0.5 text-text">
                        {s.text}
                      </mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                </p>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
