import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-control text-sm font-medium whitespace-nowrap transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-text text-bg hover:opacity-90',
        secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
        ghost: 'text-text hover:bg-surface-muted',
        danger: 'border border-border bg-surface text-danger hover:bg-danger-tint',
        dangerSolid: 'bg-danger text-white hover:opacity-90',
      },
      size: { sm: 'h-8 px-3', md: 'h-9 px-4', lg: 'h-10 px-5', icon: 'size-9' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { asChild?: boolean; loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, asChild, loading, disabled, children, ...rest },
  ref,
) {
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(button({ variant, size }), className)} {...rest}>
        {children}
      </Slot>
    )
  }
  return (
    <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
})
