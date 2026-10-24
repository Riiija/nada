import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = { icon: LucideIcon; size?: 14 | 16 | 18 | 20 | 22; className?: string }

export function Icon({ icon: Glyph, size = 16, className }: Props) {
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" className={cn('shrink-0', className)} />
}
