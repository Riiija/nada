import { Check, X } from 'lucide-react'
import { Link } from 'react-router'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { isActive, importQueue, type ImportItem } from '@/lib/import'
import { ocrRunner, useOcrJob } from '@/lib/ocr'
import { formatBytes } from '@/lib/storage'
import { cn } from '@/lib/cn'
import { OcrJobBadge, OcrProgress, ScanThumbnail } from './OcrStatus'

function badgeFor(item: ImportItem) {
  switch (item.state) {
    case 'queued':
      return <Badge>En attente</Badge>
    case 'reading':
      return <Badge tone="petrol">Lecture</Badge>
    case 'saving':
      return <Badge tone="petrol">Enregistrement</Badge>
    case 'ocrQueued':
    case 'ocrRunning':
    case 'done':
      return <Badge tone="teal">Enregistré</Badge>
    case 'duplicate':
      return <Badge tone="amber">Déjà archivé</Badge>
    case 'rejected':
      return <Badge tone="danger">Refusé</Badge>
    case 'failed':
      return <Badge tone="danger">Échec</Badge>
    case 'canceled':
      return <Badge>Annulé</Badge>
  }
}

function ImportSteps({ saved }: { saved: boolean }) {
  const step = (label: string, done: boolean, current: boolean) => (
    <span className={cn('inline-flex items-center gap-1', done ? 'text-teal-ink' : current ? 'text-text' : 'text-text-subtle')}>
      {done ? <Icon icon={Check} size={14} /> : <span aria-hidden="true" className={cn('size-1.5 rounded-full', current ? 'bg-text' : 'bg-text-subtle')} />}
      {label}
    </span>
  )
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Étapes de l'import">
      {step('Import', saved, !saved)}
      {step('Lecture OCR', false, false)}
      {step('Indexé', false, false)}
    </div>
  )
}

/** Ligne de la file d'import, dans le panneau « Imports » et sur la page d'import en masse. */
export function ImportRow({ item }: { item: ImportItem }) {
  const job = useOcrJob(item.documentId)
  const active = isActive(item.state)
  const kind = item.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'
  const extension = item.name.split('.').pop()
  const showBar = item.state === 'reading' || item.state === 'saving'
  const percent = Math.round(item.progress * 100)
  const saved = ['ocrQueued', 'ocrRunning', 'done'].includes(item.state)
  const reading = saved && job?.state === 'running'

  return (
    <li className="flex gap-3 px-4 py-3">
      {reading && item.documentId ? <ScanThumbnail documentId={item.documentId} /> : <FileTypeIcon kind={kind} label={extension} size={36} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {saved && job ? <OcrJobBadge job={job} /> : badgeFor(item)}
            {active ? (
              <button
                type="button"
                aria-label={`Annuler l'import de ${item.name}`}
                onClick={() => importQueue.cancel(item.id)}
                className="grid size-6 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
              >
                <Icon icon={X} size={14} />
              </button>
            ) : reading && item.documentId ? (
              <button
                type="button"
                aria-label={`Annuler la lecture de ${item.name}`}
                onClick={() => ocrRunner.cancel(item.documentId!)}
                className="grid size-6 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
              >
                <Icon icon={X} size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-text-muted">
          {formatBytes(item.size)}
          {item.pageCount ? `, ${item.pageCount} page${item.pageCount > 1 ? 's' : ''}` : ''}
          {showBar ? `, ${item.step} ${percent} %` : ''}
        </p>
        {showBar ? (
          <div
            role="progressbar"
            aria-label={`Import de ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-active"
          >
            <div className="h-full rounded-full bg-petrol transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {saved && job && item.documentId ? <OcrProgress job={job} documentId={item.documentId} /> : saved ? <ImportSteps saved /> : null}
        {item.state === 'duplicate' && item.existingId ? (
          <Link to={`/documents/${item.existingId}`} className="mt-1 inline-block text-xs text-text underline underline-offset-2">
            Ouvrir le document existant
          </Link>
        ) : null}
        {item.message && item.state !== 'duplicate' ? <p className="mt-1 text-xs text-danger">{item.message}</p> : null}
        {item.warning ? <p className="mt-1 text-xs text-amber-ink">{item.warning}</p> : null}
        {item.state === 'failed' || item.state === 'canceled' ? (
          <Button size="sm" className="mt-2" onClick={() => importQueue.retry(item.id)}>
            Réessayer
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/** Lecture d'un document qui n'est pas dans la file d'import (reprise au démarrage, relance). */
export function OcrOnlyRow({ documentId, title }: { documentId: string; title: string }) {
  const job = useOcrJob(documentId)
  if (!job) return null
  return (
    <li className="flex gap-3 px-4 py-3">
      {job.state === 'running' ? <ScanThumbnail documentId={documentId} /> : <FileTypeIcon kind="pdf" label="DOC" size={36} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium" title={title}>
            {title}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <OcrJobBadge job={job} />
            {job.state === 'running' ? (
              <button
                type="button"
                aria-label={`Annuler la lecture de ${title}`}
                onClick={() => ocrRunner.cancel(documentId)}
                className="grid size-6 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
              >
                <Icon icon={X} size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <OcrProgress job={job} documentId={documentId} />
      </div>
    </li>
  )
}
