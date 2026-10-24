import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useThumbnailUrl } from '@/data/repositories/documents'
import { ocrRunner, type OcrJobState } from '@/lib/ocr'
import { cn } from '@/lib/cn'

export function OcrJobBadge({ job }: { job: OcrJobState }) {
  switch (job.state) {
    case 'queued':
      return <Badge tone="amber">Lecture en attente</Badge>
    case 'running':
      return <Badge tone="accent">Lecture en cours</Badge>
    case 'done':
      return job.lowConfidence ? <Badge tone="amber">Lecture peu fiable</Badge> : <Badge tone="teal">Indexé</Badge>
    case 'failed':
      return <Badge tone="danger">Lecture échouée</Badge>
    case 'canceled':
      return <Badge>Lecture annulée</Badge>
  }
}

/** Miniature de la page en cours de lecture, traversée par une ligne de balayage. */
export function ScanThumbnail({ documentId }: { documentId: string }) {
  const url = useThumbnailUrl(documentId)
  return (
    <div className="scan-frame relative h-[52px] w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface-muted">
      {url ? <img src={url} alt="" className="size-full object-cover object-top" /> : null}
      <span className="scanline" aria-hidden="true" />
    </div>
  )
}

/** Barre accent, libellé, étapes et issue d'une lecture : partagé par le panneau et la page d'import. */
export function OcrProgress({ job, documentId }: { job: OcrJobState; documentId: string }) {
  const percent = Math.round(job.progress * 100)
  const done = job.state === 'done'
  return (
    <>
      {job.state === 'running' ? (
        <>
          <p className="mt-1 text-xs text-text-muted">{job.label}</p>
          <div role="progressbar" aria-label="Lecture OCR" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-2 overflow-hidden rounded-full bg-surface-active">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
          </div>
        </>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Étapes">
        <span className="inline-flex items-center gap-1 text-teal-ink">
          <Icon icon={Check} size={14} />
          Import
        </span>
        <span className={cn('inline-flex items-center gap-1', done ? 'text-teal-ink' : job.state === 'running' ? 'text-text' : 'text-text-subtle')}>
          {done ? <Icon icon={Check} size={14} /> : <span aria-hidden="true" className={cn('size-1.5 rounded-full', job.state === 'running' ? 'bg-accent' : 'bg-text-subtle')} />}
          Lecture OCR
        </span>
        <span className={cn('inline-flex items-center gap-1', done ? 'text-teal-ink' : 'text-text-subtle')}>
          {done ? <Icon icon={Check} size={14} /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-text-subtle" />}
          Indexé
        </span>
      </div>
      {done ? (
        <p className="mt-1 text-xs text-text-muted">
          {job.confidence === undefined ? 'Indexé, texte du PDF' : `Indexé, confiance ${Math.round(job.confidence)} %`}
        </p>
      ) : null}
      {done && job.lowConfidence ? <p className="mt-1 text-xs text-amber-ink">Un nouveau scan à 300 dpi améliore la recherche.</p> : null}
      {job.state === 'failed' || job.state === 'canceled' ? (
        <>
          {job.message ? <p className="mt-1 text-xs text-danger">{job.message}</p> : null}
          <Button size="sm" className="mt-2" onClick={() => void ocrRunner.retry([documentId])}>
            Réessayer
          </Button>
        </>
      ) : null}
    </>
  )
}
