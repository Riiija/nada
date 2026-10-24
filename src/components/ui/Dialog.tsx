import * as D from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
}

export function Dialog({ open, onOpenChange, title, description, children }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-pop outline-none">
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-[13px] text-text-muted">{description}</D.Description> : null}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
