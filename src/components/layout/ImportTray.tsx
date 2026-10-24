import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Icon } from '@/components/ui/Icon'
import { ImportRow, OcrOnlyRow } from '@/features/imports/ImportRow'
import { importQueue, isActive, useImportQueue } from '@/lib/import'
import { useOcrJobs } from '@/lib/ocr'

const CLOSE_DELAY_MS = 5000
const busy = (state: string) => state === 'queued' || state === 'running'

/** Panneau « Imports » fixé en bas à droite : survit à la navigation, réductible en pastille. */
export function ImportTray() {
  const items = useImportQueue((s) => s.items)
  const open = useImportQueue((s) => s.trayOpen)
  const collapsed = useImportQueue((s) => s.trayCollapsed)
  const jobs = useOcrJobs()
  const { pathname } = useLocation()

  // Lectures hors file d'import : reprise au démarrage, relance depuis la liste ou la visionneuse.
  const imported = new Set(items.map((i) => i.documentId).filter(Boolean))
  const lone = jobs.filter((j) => !imported.has(j.id) && j.state !== 'done')
  const readingNow = jobs.filter((j) => busy(j.state) && (imported.has(j.id) || lone.some((l) => l.id === j.id)))
  const active = items.filter((i) => isActive(i.state))
  const workCount = active.length + readingNow.length
  const needsAttention =
    items.some((i) => ['failed', 'rejected', 'duplicate', 'canceled'].includes(i.state) || i.warning) ||
    jobs.some((j) => j.state === 'failed' || j.state === 'canceled' || j.lowConfidence)

  // Une lecture qui démarre sans import en cours rouvre le panneau.
  const running = jobs.some((j) => j.state === 'running')
  useEffect(() => {
    if (running) importQueue.setTray({ trayOpen: true })
  }, [running])

  // Prévient avant de quitter la page pendant un import ou une lecture.
  useEffect(() => {
    if (workCount === 0) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [workCount])

  // Se ferme tout seul 5 s après la fin, s'il n'y a rien à signaler.
  const total = items.length + lone.length
  useEffect(() => {
    if (!open || workCount > 0 || total === 0 || needsAttention) return
    const timer = setTimeout(() => importQueue.setTray({ trayOpen: false }), CLOSE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [open, workCount, total, needsAttention])

  // La page d'import en masse affiche déjà la même file.
  if (!open || total === 0 || pathname === '/archivage') return null

  const size = items.reduce((sum, i) => sum + i.size, 0) || 1
  const percent = Math.round((items.reduce((sum, i) => sum + (isActive(i.state) ? i.progress * i.size : i.size), 0) / size) * 100)
  const summary =
    active.length > 0
      ? `${active.length} import${active.length > 1 ? 's' : ''} en cours, ${percent} %`
      : readingNow.length > 0
        ? `${readingNow.length} lecture${readingNow.length > 1 ? 's' : ''} en cours`
        : 'Imports terminés'

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => importQueue.setTray({ trayCollapsed: false })}
        className="fixed right-4 bottom-4 z-50 flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-pop"
      >
        <Icon icon={ChevronUp} />
        {summary}
      </button>
    )
  }

  return (
    <section aria-label="Imports" className="fixed right-4 bottom-4 z-50 w-[380px] max-w-[calc(100vw-32px)] rounded-card border border-border bg-surface shadow-pop">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Imports</h2>
          <p className="text-xs text-text-muted" aria-live="polite">
            {summary}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Réduire le panneau des imports"
            onClick={() => importQueue.setTray({ trayCollapsed: true })}
            className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
          >
            <Icon icon={ChevronDown} />
          </button>
          {workCount === 0 ? (
            <button
              type="button"
              aria-label="Fermer le panneau des imports"
              onClick={() => importQueue.setTray({ trayOpen: false })}
              className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
            >
              <Icon icon={X} />
            </button>
          ) : null}
        </div>
      </header>
      <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
        {items.map((item) => (
          <ImportRow key={item.id} item={item} />
        ))}
        {lone.map((job) => (
          <OcrOnlyRow key={job.id} documentId={job.id} title={job.title || 'Document'} />
        ))}
      </ul>
    </section>
  )
}
