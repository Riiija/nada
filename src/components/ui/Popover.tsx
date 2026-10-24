import * as P from '@radix-ui/react-popover'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor

export function PopoverContent({ className, align = 'start', sideOffset = 6, ...rest }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-[60] rounded-card border border-border bg-surface shadow-pop outline-none', className)}
        {...rest}
      />
    </P.Portal>
  )
}
