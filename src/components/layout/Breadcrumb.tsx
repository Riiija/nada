import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Icon } from '@/components/ui/Icon'

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-muted">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 ? <Icon icon={ChevronRight} size={14} /> : null}
            {item.to ? (
              <Link to={item.to} className="hover:text-text">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
