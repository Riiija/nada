import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatNumber } from '@/lib/format'
import { usePrefersReducedMotion } from '@/lib/motion'

/** Séries de graphiques, dans cet ordre : accent, teal, petrol, amber, puis texte discret. */
const COLORS = ['var(--accent)', 'var(--teal)', 'var(--petrol)', 'var(--amber)', 'var(--text-subtle)']

export interface Slice {
  label: string
  value: number
}

type Props = { data: Slice[]; unit: string; label: string }

/** Donut : rayon intérieur 62 %, écart de 2°, total au centre, légende en pourcentages. */
export function Donut({ data, unit, label }: Props) {
  const reduced = usePrefersReducedMotion()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div role="img" aria-label={`${label} : ${formatNumber(total)} ${unit}`} className="relative size-[136px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={!reduced} animationDuration={700}>
              {data.map((slice, i) => (
                <Cell key={slice.label} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-[22px] leading-7 font-bold">{formatNumber(total)}</span>
          <span className="text-xs text-text-muted">{unit}</span>
        </div>
      </div>
      <ul className="min-w-[160px] flex-1 space-y-2">
        {data.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs text-text-muted">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="text-[13px] font-semibold text-text">{percent.format(total ? slice.value / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
