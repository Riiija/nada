import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { usePrefersReducedMotion } from '@/lib/motion'

type Props = { data: number[]; color: string; label: string }

/** Courbe de 30 jours qui touche les bords de la carte : trait 2 px, dégradé de 18 % à 0 %. */
export function Spark({ data, color, label }: Props) {
  const gradient = `spark-${useId().replace(/:/g, '')}`
  const reduced = usePrefersReducedMotion()
  const points = data.map((v, i) => ({ i, v }))
  return (
    <div role="img" aria-label={label} className="h-14">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradient})`} dot={false} isAnimationActive={!reduced} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
