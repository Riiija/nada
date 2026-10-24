import { ChevronDown } from 'lucide-react'
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/** Liste déroulante native, stylée comme un champ. Le Combobox (recherche) viendra avec les courriers. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-[38px] w-full appearance-none rounded-control border border-border bg-surface pr-9 pl-3 text-sm text-text hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon icon={ChevronDown} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted" />
    </div>
  )
})
