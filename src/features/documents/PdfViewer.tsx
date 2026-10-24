import { ChevronLeft, ChevronRight, Maximize2, Minus, PanelLeft, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { loadPdfjs, PDF_OPTIONS } from '@/lib/pdf'
import { useShortcuts } from './useShortcuts'

const ZOOMS = [50, 75, 100, 125, 150, 175, 200]

type Props = { blob: Blob; page: number; onPageChange: (page: number) => void; onPages?: (count: number) => void }

function Thumbnail({ number, current, onSelect }: { number: number; current: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)

  // Les miniatures ne se dessinent que lorsqu'elles entrent dans la colonne.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={`Aller à la page ${number}`}
      aria-current={current ? 'page' : undefined}
      className={cn('block w-[104px] shrink-0 overflow-hidden rounded-control border bg-surface-muted p-0.5 text-center', current ? 'border-accent' : 'border-border hover:border-border-strong')}
    >
      <div className="min-h-[120px]">
        {visible ? <Page pageNumber={number} width={96} renderTextLayer={false} renderAnnotationLayer={false} loading={<Skeleton className="h-[120px] w-[96px]" />} /> : null}
      </div>
      <span className="text-[11px] text-text-muted">{number}</span>
    </button>
  )
}

/** Visionneuse PDF : une page à la fois, couche texte active, miniatures repliables, zoom 50 à 200 %. */
export default function PdfViewer({ blob, page, onPageChange, onPages }: Props) {
  const [ready, setReady] = useState(false)
  const [pages, setPages] = useState(0)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [thumbs, setThumbs] = useState(true)
  const [width, setWidth] = useState(0)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void loadPdfjs().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready])

  const go = (next: number) => onPageChange(Math.min(Math.max(1, next), Math.max(1, pages)))
  const step = (direction: 1 | -1) => {
    const current = zoom === 'fit' ? 100 : zoom
    const index = ZOOMS.findIndex((z) => z >= current - 0.01)
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (index === -1 ? ZOOMS.length - 1 : index) + direction))]!
    setZoom(next)
  }

  useShortcuts({
    ArrowLeft: () => go(page - 1),
    ArrowRight: () => go(page + 1),
    '+': () => step(1),
    '=': () => step(1),
    '-': () => step(-1),
  })

  const fitWidth = Math.max(240, width - 48)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2" role="toolbar" aria-label="Outils de la visionneuse">
        <Button variant="ghost" size="icon" aria-label={thumbs ? 'Masquer les miniatures' : 'Afficher les miniatures'} aria-pressed={thumbs} onClick={() => setThumbs((v) => !v)}>
          <Icon icon={PanelLeft} />
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Page précédente" disabled={page <= 1} onClick={() => go(page - 1)}>
            <Icon icon={ChevronLeft} />
          </Button>
          <span className="min-w-[64px] text-center text-sm" aria-live="polite">
            {page} / {pages || '–'}
          </span>
          <Button variant="ghost" size="icon" aria-label="Page suivante" disabled={page >= pages} onClick={() => go(page + 1)}>
            <Icon icon={ChevronRight} />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Zoom arrière" onClick={() => step(-1)}>
            <Icon icon={Minus} />
          </Button>
          <span className="min-w-[88px] text-center text-sm">{zoom === 'fit' ? 'Largeur' : `${zoom} %`}</span>
          <Button variant="ghost" size="icon" aria-label="Zoom avant" onClick={() => step(1)}>
            <Icon icon={Plus} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Ajuster à la largeur" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
            <Icon icon={Maximize2} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {ready ? (
          <Document
            file={blob}
            options={PDF_OPTIONS}
            onLoadSuccess={({ numPages }) => {
              setPages(numPages)
              onPages?.(numPages)
            }}
            loading={<Skeleton className="m-6 h-[480px] w-[360px] max-w-full" />}
            error={<p className="p-6 text-sm text-danger">Ce PDF n’a pas pu être affiché. Téléchargez-le pour l’ouvrir dans une autre application.</p>}
            className="flex min-h-0 min-w-0 flex-1"
          >
            {thumbs && pages > 0 ? (
              <ol className="hidden w-[124px] shrink-0 space-y-2 overflow-y-auto border-r border-border bg-surface-muted p-2 sm:block" aria-label="Miniatures des pages">
                {Array.from({ length: pages }, (_, i) => (
                  <li key={i} className="flex justify-center">
                    <Thumbnail number={i + 1} current={page === i + 1} onSelect={() => go(i + 1)} />
                  </li>
                ))}
              </ol>
            ) : null}
            <div ref={stage} className="min-w-0 flex-1 overflow-auto bg-surface-muted p-6">
              <div className="mx-auto w-fit shadow-card">
                <Page
                  pageNumber={Math.min(page, pages || 1)}
                  {...(zoom === 'fit' ? { width: fitWidth } : { scale: zoom / 100 })}
                  renderTextLayer
                  renderAnnotationLayer
                  loading={<Skeleton className="h-[480px] w-[360px]" />}
                />
              </div>
            </div>
          </Document>
        ) : (
          <Skeleton className="m-6 h-[480px] w-[360px] max-w-full" />
        )}
      </div>
    </div>
  )
}
