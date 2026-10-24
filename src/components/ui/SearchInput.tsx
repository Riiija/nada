import { Search } from 'lucide-react'
import { Icon } from './Icon'

type Props = { value: string; onChange: (value: string) => void; placeholder: string; label: string }

export function SearchInput({ value, onChange, placeholder, label }: Props) {
  return (
    <div className="relative w-full sm:w-[280px]">
      <Icon icon={Search} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[38px] w-full rounded-control border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-text-subtle hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none"
      />
    </div>
  )
}
