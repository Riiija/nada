import { cn } from '@/lib/cn'

type Props = {
  label: string
  /** 0 à 100 */
  percent: number
  /** Texte du pourcentage à droite (« 82 % »). */
  display: string
  /** Ligne sous la barre : « 148 traités sur 180 ». */
  detail?: string
  tone: 'accent' | 'teal' | 'petrol'
}

const FILL = { accent: 'bg-accent', teal: 'bg-teal', petrol: 'bg-petrol' }

/** Barre de progression : libellé et pourcentage au-dessus, valeur sous la barre. */
export function ProgressBar({ label, percent, display, detail, tone }: Props) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[13px] text-text-muted">{display}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-surface-active">
        <div className={cn('h-full rounded-full transition-[width] duration-200', FILL[tone])} style={{ width: `${value}%` }} />
      </div>
      {detail ? <p className="mt-1.5 text-xs text-text-muted">{detail}</p> : null}
    </div>
  )
}
