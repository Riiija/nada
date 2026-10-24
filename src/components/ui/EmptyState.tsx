import type { ReactNode } from 'react'

type Props = { illustration: ReactNode; title: string; description: string; action?: ReactNode }

export function EmptyState({ illustration, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      {illustration}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="max-w-[60ch] text-[13px] text-text-muted">{description}</p>
      {action}
    </div>
  )
}
