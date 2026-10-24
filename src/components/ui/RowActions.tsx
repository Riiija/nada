import * as M from '@radix-ui/react-dropdown-menu'
import { Ellipsis } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

export type RowAction = { label: string; onSelect: () => void; danger?: boolean }

export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  if (actions.length === 0) return null
  return (
    <M.Root>
      <M.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-active hover:text-text"
        >
          <Icon icon={Ellipsis} size={18} />
        </button>
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={4} className="z-50 min-w-[200px] rounded-card border border-border bg-surface p-1 shadow-pop">
          {actions.map((action) => (
            <M.Item
              key={action.label}
              onSelect={action.onSelect}
              className={cn(
                'flex h-9 cursor-pointer items-center rounded-control px-3 text-sm outline-none data-[highlighted]:bg-surface-muted',
                action.danger && 'text-danger',
              )}
            >
              {action.label}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}
