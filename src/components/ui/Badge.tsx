import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const badge = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      teal: 'bg-teal-tint text-teal-ink',
      amber: 'bg-amber-tint text-amber-ink',
      accent: 'bg-accent-tint text-accent-ink',
      petrol: 'bg-petrol-tint text-petrol',
      danger: 'bg-danger-tint text-danger',
      neutral: 'bg-surface-active text-text',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

const dot = {
  teal: 'bg-teal',
  amber: 'bg-amber',
  accent: 'bg-accent',
  petrol: 'bg-petrol',
  danger: 'bg-danger',
  neutral: 'bg-text',
} as const

type Props = VariantProps<typeof badge> & { children: ReactNode; className?: string }

export function Badge({ tone, children, className }: Props) {
  return (
    <span className={cn(badge({ tone }), className)}>
      <span className={cn('size-1.5 rounded-full', dot[tone ?? 'neutral'])} aria-hidden="true" />
      {children}
    </span>
  )
}
