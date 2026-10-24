import { cn } from '@/lib/cn'

type Props = { kind: 'pdf' | 'image'; label?: string; size?: 28 | 36 | 48; className?: string }

export function FileTypeIcon({ kind, label, size = 36, className }: Props) {
  const ext = (label ?? (kind === 'pdf' ? 'PDF' : 'IMG')).toUpperCase().slice(0, 4)
  const band = kind === 'pdf' ? '#D64545' : 'var(--petrol)'
  return (
    <svg
      viewBox="0 0 24 30"
      width={size * 0.8}
      height={size}
      role="img"
      aria-label={kind === 'pdf' ? 'Fichier PDF' : 'Fichier image'}
      className={cn('shrink-0', className)}
    >
      <path d="M2 1h14l6 6v20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M16 1v4a2 2 0 0 0 2 2h4" fill="var(--surface-muted)" stroke="var(--border-strong)" />
      <path d="M2 21h20v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" fill={band} />
      <text x="12" y="26.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="inherit">
        {ext}
      </text>
    </svg>
  )
}
