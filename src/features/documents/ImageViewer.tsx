import { Maximize2, Minus, Plus, RotateCcw, RotateCw, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useShortcuts } from './useShortcuts'

type Props = {
  /** URL `blob:` créée et révoquée par le parent. */
  src: string
  alt: string
  rotation: 0 | 90 | 180 | 270
  /** Absent pour un lecteur : la rotation est enregistrée et journalisée. */
  onRotate?: (direction: 1 | -1) => void
}

const MIN = 0.1
const MAX = 8

/** Visionneuse d'image maison : zoom (molette, boutons, pincement), déplacement, rotation. */
export default function ImageViewer({ src, alt, rotation, onRotate }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState<number | 'fit'>('fit')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; scale: number } | null>(null)

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => entry && setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const turned = rotation === 90 || rotation === 270
  const fitScale = natural && box.w && box.h ? Math.min((box.w - 32) / (turned ? natural.h : natural.w), (box.h - 32) / (turned ? natural.w : natural.h)) : 1
  const current = scale === 'fit' ? fitScale : scale

  const zoomTo = useCallback(
    (next: number) => {
      setScale(Math.min(MAX, Math.max(MIN, next)))
      if (next <= fitScale) setOffset({ x: 0, y: 0 })
    },
    [fitScale],
  )
  const fit = () => {
    setScale('fit')
    setOffset({ x: 0, y: 0 })
  }

  useShortcuts({
    '+': () => zoomTo(current * 1.25),
    '=': () => zoomTo(current * 1.25),
    '-': () => zoomTo(current / 1.25),
    r: () => onRotate?.(1),
  })

  const onWheel = (event: WheelEvent) => zoomTo(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1))

  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: current }
    }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
      zoomTo(pinch.current.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance))
    } else if (pointers.current.size === 1) {
      setOffset((o) => ({ x: o.x + event.clientX - previous.x, y: o.y + event.clientY - previous.y }))
    }
  }
  const onPointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    pinch.current = null
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2" role="toolbar" aria-label="Outils de la visionneuse">
        {onRotate ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Pivoter vers la gauche" onClick={() => onRotate(-1)}>
              <Icon icon={RotateCcw} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Pivoter vers la droite" onClick={() => onRotate(1)}>
              <Icon icon={RotateCw} />
            </Button>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Zoom arrière" onClick={() => zoomTo(current / 1.25)}>
            <Icon icon={Minus} />
          </Button>
          <span className="min-w-[64px] text-center text-sm">{Math.round(current * 100)} %</span>
          <Button variant="ghost" size="icon" aria-label="Zoom avant" onClick={() => zoomTo(current * 1.25)}>
            <Icon icon={Plus} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Taille réelle" onClick={() => zoomTo(1)}>
            <Icon icon={ScanLine} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Ajuster à la fenêtre" aria-pressed={scale === 'fit'} onClick={fit}>
            <Icon icon={Maximize2} />
          </Button>
        </div>
      </div>
      <div
        ref={stage}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden bg-surface-muted select-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            maxWidth: 'none',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${current})`,
            imageRendering: current > 3 ? 'pixelated' : 'auto',
          }}
        />
      </div>
    </div>
  )
}
