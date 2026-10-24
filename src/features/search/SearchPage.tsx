import { FileText, Inbox, Search, Send } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Snippet } from '@/components/layout/CommandPalette'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useReference } from '@/data/repositories/referenceData'
import type { SearchFilters, SearchResult } from '@/data/repositories/search'
import { categoryLabels, documentCategories } from '@/data/schemas/document'
import type { DocumentCategory } from '@/data/types'
import { formatDate, formatNumber } from '@/lib/format'
import { useSearch } from './useSearch'

type Scope = 'all' | 'mail' | 'document' | 'page'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const departments = useReference('departments')
  const q = params.get('q') ?? ''
  const scope = (params.get('type') as Scope | null) ?? 'all'
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

  const filters = useMemo<SearchFilters>(() => {
    const processed = params.get('traite')
    return {
      types: scope === 'all' ? undefined : [scope],
      from: params.get('du') || undefined,
      to: params.get('au') || undefined,
      category: (params.get('categorie') as DocumentCategory | null) || undefined,
      departmentId: params.get('direction') || undefined,
      processed: processed === 'oui' ? true : processed === 'non' ? false : undefined,
    }
  }, [params, scope])

  const { results, loading } = useSearch(q, filters, 250)
  const count = (kind: SearchResult['kind']) => (results ?? []).filter((r) => r.kind === kind).length
  const filtered = Boolean(params.get('du') || params.get('au') || params.get('categorie') || params.get('direction') || params.get('traite') || scope !== 'all')

  return (
    <>
      <PageHeader title="Recherche" description="Courriers, documents et texte des pages. Les numéros se retrouvent aussi : 12/26, D14523696-23." />

      <section className="mb-5 rounded-card border border-border bg-surface p-5 shadow-card" aria-label="Critères de recherche">
        <div className="relative">
          <Icon icon={Search} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle" />
          <input
            type="search"
            aria-label="Rechercher"
            autoFocus
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Un mot, un numéro, un nom…"
            className="h-11 w-full rounded-control border border-border bg-surface pr-3 pl-10 text-[15px] placeholder:text-text-subtle hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Segmented
            label="Type de résultat"
            value={scope}
            onChange={(v) => setParam('type', v === 'all' ? '' : v)}
            options={[
              { value: 'all', label: 'Tout' },
              { value: 'mail', label: 'Courriers', count: q ? count('mail') : undefined },
              { value: 'document', label: 'Documents', count: q ? count('document') : undefined },
              { value: 'page', label: 'Pages', count: q ? count('page') : undefined },
            ]}
          />
          <div className="w-[150px]">
            <Field label="Du">{(p) => <DatePicker {...p} value={params.get('du') ?? ''} onChange={(v) => setParam('du', v)} />}</Field>
          </div>
          <div className="w-[150px]">
            <Field label="Au">{(p) => <DatePicker {...p} value={params.get('au') ?? ''} onChange={(v) => setParam('au', v)} />}</Field>
          </div>
          <div className="w-[200px]">
            <Field label="Catégorie de document">
              {(p) => (
                <Select {...p} value={params.get('categorie') ?? ''} onChange={(e) => setParam('categorie', e.target.value)}>
                  <option value="">Toutes</option>
                  {documentCategories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="w-[200px]">
            <Field label="Direction">
              {(p) => (
                <Select {...p} value={params.get('direction') ?? ''} onChange={(e) => setParam('direction', e.target.value)}>
                  <option value="">Toutes</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {String(d.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="w-[160px]">
            <Field label="Courriers arrivés">
              {(p) => (
                <Select {...p} value={params.get('traite') ?? ''} onChange={(e) => setParam('traite', e.target.value)}>
                  <option value="">Tous</option>
                  <option value="oui">Traités</option>
                  <option value="non">En attente</option>
                </Select>
              )}
            </Field>
          </div>
          {filtered ? (
            <Button variant="ghost" onClick={() => setParams(q ? { q } : {}, { replace: true })}>
              Réinitialiser les filtres
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-label="Résultats" aria-live="polite">
        {!q.trim() ? (
          <div className="rounded-card border border-border bg-surface shadow-card">
            <EmptyState illustration={<EmptyMailbox />} title="Que cherchez-vous ?" description="Saisissez un mot, un numéro d’enregistrement ou une phrase. La recherche couvre l’objet des courriers et le texte lu dans les documents." />
          </div>
        ) : results === undefined ? (
          <div role="status" aria-label="Chargement" className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-card border border-border bg-surface shadow-card">
            <EmptyState illustration={<EmptyMailbox />} title={`Aucun résultat pour « ${q.trim()} »`} description="Vérifiez l’orthographe, essayez un seul mot ou retirez des filtres." />
          </div>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <p className="mb-3 text-[13px] text-text-muted">
              {formatNumber(results.length)} résultat{results.length > 1 ? 's' : ''}
            </p>
            <ul className="divide-y divide-border rounded-card border border-border bg-surface shadow-card">
              {results.map((r) => (
                <li key={r.kind === 'page' ? `p:${r.documentId}:${r.page}` : `${r.kind}:${r.id}`}>
                  <ResultRow result={r} query={q.trim()} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  )
}

function ResultRow({ result, query }: { result: SearchResult; query: string }) {
  const base = 'flex items-start gap-3 px-5 py-4 hover:bg-surface-muted'
  if (result.kind === 'mail') {
    const to = `/courriers/${result.flow === 'incoming' ? 'arrives' : 'departs'}/${result.id}`
    return (
      <Link to={to} className={base}>
        <Icon icon={result.flow === 'incoming' ? Inbox : Send} size={18} className="mt-0.5 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {result.reference} <Snippet text={result.subject} query={query} />
          </p>
          <p className="text-xs text-text-muted">
            {result.flow === 'incoming' ? 'Courrier arrivé' : 'Courrier départ'}, {formatDate(result.date)}
          </p>
        </div>
        {result.flow === 'incoming' ? result.isProcessed ? <Badge tone="teal">Traité</Badge> : <Badge tone="amber">En attente</Badge> : null}
      </Link>
    )
  }
  if (result.kind === 'document') {
    return (
      <Link to={`/documents/${result.id}`} className={base}>
        <Icon icon={FileText} size={18} className="mt-0.5 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <Snippet text={result.title} query={query} />
          </p>
          <p className="text-xs text-text-muted">
            Document, {categoryLabels[result.category]}, {result.pageCount} page{result.pageCount > 1 ? 's' : ''}, archivé le {formatDate(result.date)}
          </p>
        </div>
      </Link>
    )
  }
  return (
    <Link to={`/documents/${result.documentId}?page=${result.page}&q=${encodeURIComponent(query)}`} className={base}>
      <Icon icon={FileText} size={18} className="mt-0.5 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {result.title}, page {result.page}
        </p>
        <p className="text-[13px] text-text-muted">
          <Snippet text={result.snippet} query={query} />
        </p>
      </div>
    </Link>
  )
}
