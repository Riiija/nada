import type { ReactNode } from 'react'

type Props = { title: string; description?: string; actions?: ReactNode }

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[26px] leading-8 font-bold tracking-[-0.015em]">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
