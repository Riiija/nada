import { cn } from '@/lib/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true" className={cn('size-9 shrink-0', className)}>
      <rect width="36" height="36" rx="10" fill="var(--text)" />
      <path
        d="M9 13.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-9Z"
        stroke="var(--bg)"
        strokeWidth="1.75"
      />
      <path d="m10 13 8 6 8-6" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
