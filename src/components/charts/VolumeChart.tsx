import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthPoint } from '@/data/repositories/stats'
import { formatNumber } from '@/lib/format'
import { usePrefersReducedMotion } from '@/lib/motion'
import { SERIES, type Series } from './series'

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(2026, i, 1)).replace('.', ''))
const LONG_MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(2026, i, 1)))

/** Montants abrégés : 1 200 devient « 1,2 k ». */
const abbreviate = (n: number) => (n >= 1000 ? `${formatNumber(Math.round(n / 100) / 10)} k` : String(n))

type TipProps = { active?: boolean; payload?: { value: number }[]; label?: string | number; series: Series; year: number }

function Tip({ active, payload, label, series, year }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-0.5 text-text-muted">
        {LONG_MONTHS[Number(label) - 1]} {year}
      </p>
      <p className="font-semibold">
        {formatNumber(payload[0]!.value)} {SERIES[series].label.toLowerCase()}
      </p>
    </div>
  )
}

type Props = { data: MonthPoint[]; series: Series; year: number }

/** Courbe mensuelle : grille en pointillés, pas d'axes tracés, aire en dégradé de 20 % à 0 %. */
export function VolumeChart({ data, series, year }: Props) {
  const gradient = `volume-${useId().replace(/:/g, '')}`
  const reduced = usePrefersReducedMotion()
  const { color, label } = SERIES[series]
  const total = data.reduce((sum, p) => sum + (p[series] ?? 0), 0)

  return (
    <div className="flex h-full flex-col">
      <div role="img" aria-label={`${label} par mois en ${year} : ${formatNumber(total)} au total`} className="min-h-[280px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={(m: number) => MONTHS[m - 1] ?? ''} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickMargin={8} />
            <YAxis allowDecimals={false} tickFormatter={abbreviate} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={48} />
            <Tooltip content={<Tip series={series} year={year} />} cursor={{ stroke: 'var(--border-strong)' }} />
            <Area type="monotone" dataKey={series} stroke={color} strokeWidth={2.5} fill={`url(#${gradient})`} dot={false} connectNulls={false} activeDot={{ r: 4 }} isAnimationActive={!reduced} animationDuration={700} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Mêmes valeurs en tableau, pour les lecteurs d'écran. */}
      <table className="sr-only">
        <caption>{`${label} par mois en ${year}`}</caption>
        <tbody>
          {data.map((p) => (
            <tr key={p.month}>
              <th scope="row">{LONG_MONTHS[p.month - 1]}</th>
              <td>{p[series] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
