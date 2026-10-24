import * as S from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export function Switch({ className, ...rest }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full bg-border-strong transition-colors duration-[120ms] data-[state=checked]:bg-teal disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-card transition-transform duration-[120ms] data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}
