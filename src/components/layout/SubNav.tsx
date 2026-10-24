import { NavLink } from 'react-router'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'

export type SubNavItem = { label: string; to: string; icon: LucideIcon }

/** Sous-navigation par onglets (référentiels). Défile en largeur sur mobile, sans faire défiler la page. */
export function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-5 -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-text-muted hover:text-text',
                  isActive && 'border-accent font-medium text-text',
                )
              }
            >
              <Icon icon={item.icon} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
