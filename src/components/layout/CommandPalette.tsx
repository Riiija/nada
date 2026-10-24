import * as D from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { FileText, FolderInput, Inbox, Mail, Search, Send } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '@/components/ui/Icon'
import type { SearchResult } from '@/data/repositories/search'
import { useSession } from '@/data/session'
import { useSearch } from '@/features/search/useSearch'
import { fold } from '@/lib/search/engine'
import { formatDate } from '@/lib/format'
import { highlight } from '@/lib/highlight'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const ITEM = 'flex min-h-10 cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm data-[selected=true]:bg-surface-muted'
const HEADING = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-subtle'

export function Snippet({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-[3px] bg-accent-tint px-0.5 text-text">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

/** Palette Ctrl K / ⌘K : actions rapides, courriers, documents et pages. Requête après 150 ms. */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const canEdit = useSession().user?.role !== 'reader'
  const [query, setQuery] = useState('')
  const { results, loading } = useSearch(open ? query : '')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (to: string) => {
    onOpenChange(false)
    setQuery('')
    navigate(to)
  }

  const actions = [
    ...(canEdit
      ? [
          { label: 'Enregistrer un courrier arrivé', icon: Inbox, to: '/courriers/arrives?nouveau=1' },
          { label: 'Enregistrer un courrier départ', icon: Send, to: '/courriers/departs?nouveau=1' },
          { label: 'Importer des documents', icon: FolderInput, to: '/archivage' },
        ]
      : []),
    { label: 'Ouvrir la recherche avancée', icon: Search, to: '/recherche' },
  ].filter((a) => !query.trim() || fold(a.label).includes(fold(query.trim())))

  const group = (kind: SearchResult['kind']) => (results ?? []).filter((r) => r.kind === kind).slice(0, 5)
  const mails = group('mail') as Extract<SearchResult, { kind: 'mail' }>[]
  const documents = group('document') as Extract<SearchResult, { kind: 'document' }>[]
  const pages = group('page') as Extract<SearchResult, { kind: 'page' }>[]
  const q = query.trim()

  const row = (icon: typeof Mail, primary: ReactNode, secondary?: ReactNode) => (
    <>
      <Icon icon={icon} size={18} className="text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{primary}</span>
        {secondary ? <span className="block truncate text-xs text-text-muted">{secondary}</span> : null}
      </span>
    </>
  )

  return (
    <D.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery('')
      }}
    >
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none"
        >
          <D.Title className="sr-only">Rechercher</D.Title>
          <Command shouldFilter={false} loop label="Rechercher un courrier, un document">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Icon icon={Search} className="text-text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Rechercher un courrier, un document…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-text-subtle"
              />
            </div>
            <Command.List className={`max-h-[60vh] overflow-y-auto p-2 ${HEADING}`}>
              {q && !loading && (results?.length ?? 0) === 0 ? <Command.Empty className="px-3 py-6 text-center text-[13px] text-text-muted">Aucun résultat pour « {q} ».</Command.Empty> : null}
              {actions.length > 0 ? (
                <Command.Group heading="Actions rapides">
                  {actions.map((a) => (
                    <Command.Item key={a.to} value={`action:${a.to}`} onSelect={() => go(a.to)} className={ITEM}>
                      {row(a.icon, a.label)}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {mails.length > 0 ? (
                <Command.Group heading="Courriers">
                  {mails.map((m) => (
                    <Command.Item key={m.id} value={`mail:${m.id}`} onSelect={() => go(`/courriers/${m.flow === 'incoming' ? 'arrives' : 'departs'}/${m.id}`)} className={ITEM}>
                      {row(
                        m.flow === 'incoming' ? Inbox : Send,
                        <>
                          <span className="font-medium">{m.reference}</span> <Snippet text={m.subject} query={q} />
                        </>,
                        `${m.flow === 'incoming' ? 'Courrier arrivé' : 'Courrier départ'}, ${formatDate(m.date)}`,
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {documents.length > 0 ? (
                <Command.Group heading="Documents">
                  {documents.map((d) => (
                    <Command.Item key={d.id} value={`doc:${d.id}`} onSelect={() => go(`/documents/${d.id}`)} className={ITEM}>
                      {row(FileText, <Snippet text={d.title} query={q} />, `${d.pageCount} page${d.pageCount > 1 ? 's' : ''}, archivé le ${formatDate(d.date)}`)}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {pages.length > 0 ? (
                <Command.Group heading="Pages">
                  {pages.map((p) => (
                    <Command.Item key={`${p.documentId}:${p.page}`} value={`page:${p.documentId}:${p.page}`} onSelect={() => go(`/documents/${p.documentId}?page=${p.page}&q=${encodeURIComponent(q)}`)} className={ITEM}>
                      {row(FileText, `${p.title}, page ${p.page}`, <Snippet text={p.snippet} query={q} />)}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {q ? (
                <Command.Group>
                  <Command.Item value="all" onSelect={() => go(`/recherche?q=${encodeURIComponent(q)}`)} className={ITEM}>
                    {row(Search, `Voir tous les résultats pour « ${q} »`)}
                  </Command.Item>
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
