import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { Spark } from '@/components/charts/Spark'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'
import type { Trend } from './trend'

export type KpiTone = 'accent' | 'teal' | 'petrol' | 'amber'

const TONES: Record<KpiTone, { tile: string; color: string }> = {
  accent: { tile: 'bg-accent-tint text-accent', color: 'var(--accent)' },
  teal: { tile: 'bg-teal-tint text-teal', color: 'var(--teal)' },
  petrol: { tile: 'bg-petrol-tint text-petrol', color: 'var(--petrol)' },
  amber: { tile: 'bg-amber-tint text-amber', color: 'var(--amber)' },
}

type Props = {
  label: string
  value: string
  /** Précision à côté de la valeur, par exemple la taille des documents. */
  detail?: string
  icon: LucideIcon
  tone: KpiTone
  trend: Trend
  spark: number[]
  sparkLabel: string
}

const percentFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: 'always' })

/** Carte KPI : libellé, tuile d'icône, valeur, tendance et courbe qui touche les bords. */
export function KpiCard({ label, value, detail, icon, tone, trend, spark, sparkLabel }: Props) {
  const up = trend.current > trend.previous
  const down = trend.current < trend.previous
  // La couleur suit le sens métier, pas le signe.
  const color = up ? (trend.upIs === 'good' ? 'text-success' : trend.upIs === 'bad' ? 'text-danger' : 'text-text-muted') : down ? (trend.upIs === 'bad' ? 'text-success' : 'text-text-muted') : 'text-text-muted'
  const palette = TONES[tone]

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-[13px] text-text-muted">{label}</h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] leading-[34px] font-bold">{value}</span>
            {detail ? <span className="text-[13px] text-text-muted">{detail}</span> : null}
          </p>
        </div>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-tile', palette.tile)}>
          <Icon icon={icon} size={20} />
        </span>
      </div>
      <p className={cn('flex items-center gap-1.5 px-5 pb-3 text-[13px]', color)}>
        {up ? <Icon icon={TrendingUp} size={14} /> : down ? <Icon icon={TrendingDown} size={14} /> : null}
        <span className="font-semibold">
          {trend.percent === null ? (trend.current > 0 ? 'Nouveau' : '0 %') : `${percentFormat.format(trend.percent)} %`}
        </span>
        <span className="text-text-muted">vs mois dernier</span>
      </p>
      <Spark data={spark} color={palette.color} label={sparkLabel} />
    </article>
  )
}
