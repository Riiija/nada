import { CircleAlert } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

type FieldProps = {
  label: string
  required?: boolean
  help?: string
  error?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

export function Field({ label, required, help, error, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required ? <span className="text-accent-ink"> *</span> : null}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-danger">
          <Icon icon={CircleAlert} size={14} />
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-xs text-text-muted">
          {help}
        </p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-[38px] w-full rounded-control border border-border bg-surface px-3 text-sm text-text placeholder:text-text-subtle hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15',
        className,
      )}
      {...rest}
    />
  )
})
