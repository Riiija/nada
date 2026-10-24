import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  side?: 'left' | 'right'
  className?: string
  children: ReactNode
}

export function Sheet({ open, onOpenChange, title, description, side = 'right', className, children }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <D.Content
          onOpenAutoFocus={(e) => {
            // Le focus va au premier champ du formulaire, pas au bouton Fermer.
            const field = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('form input, form select, form button[role="combobox"]')
            if (field) {
              e.preventDefault()
              field.focus()
            }
          }}
          className={cn(
            'fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-pop outline-none',
            side === 'right' ? 'right-0 border-l border-border sm:w-[600px]' : 'left-0 w-[280px] border-r border-border',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? <D.Description className="text-[13px] text-text-muted">{description}</D.Description> : null}
            </div>
            <D.Close
              aria-label="Fermer"
              className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted"
            >
              <Icon icon={X} />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
