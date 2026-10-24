import * as T from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = T.Provider

type Props = { label: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }

export function Tooltip({ label, children, side = 'right' }: Props) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-text shadow-pop"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
