export interface Trend {
  /** Variation en %, null quand le mois précédent vaut zéro. */
  percent: number | null
  /** Sens métier : une hausse des courriers en attente est mauvaise. */
  upIs: 'good' | 'bad' | 'neutral'
  current: number
  previous: number
}

export function trendOf(current: number, previous: number, upIs: Trend['upIs']): Trend {
  return { percent: previous === 0 ? null : ((current - previous) / previous) * 100, upIs, current, previous }
}

