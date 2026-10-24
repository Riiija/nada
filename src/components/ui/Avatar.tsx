import { cn } from '@/lib/cn'

const COLORS = ['bg-petrol', 'bg-teal', 'bg-avatar-rust', 'bg-avatar-graphite']

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

/** Initiales blanches sur une couleur déterministe (hash du nom). */
export function Avatar({ name, size = 36, className }: { name: string; size?: 32 | 36 | 48; className?: string }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white',
        COLORS[hash % COLORS.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
