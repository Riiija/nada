export type Series = 'incoming' | 'outgoing' | 'archived'

export const SERIES: Record<Series, { label: string; color: string }> = {
  incoming: { label: 'Arrivés', color: 'var(--accent)' },
  outgoing: { label: 'Départs', color: 'var(--teal)' },
  archived: { label: 'Archivés', color: 'var(--petrol)' },
}

