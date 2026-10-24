import { cn } from '@/lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  count?: number
}

type Props<T extends string> = { value: T; onChange: (value: T) => void; options: SegmentOption<T>[]; label: string }

/** Contrôle segmenté : piste grise, segment actif en surface. */
export function Segmented<T extends string>({ value, onChange, options, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-control bg-surface-muted p-[3px]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-8 rounded-[6px] px-3 text-sm text-text-muted transition-colors duration-[150ms]',
              active && 'bg-surface font-medium text-text shadow-card',
            )}
          >
            {o.label}
            {o.count === undefined ? null : <span className="ml-1.5 text-xs text-text-subtle">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
