import * as M from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Menu, Moon, Plus, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { NotificationsBell } from './NotificationsBell'
import { useSession } from '@/data/session'
import { useTheme } from '@/lib/theme'

const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'

const newItems = [
  { label: 'Courrier arrivé', to: '/courriers/arrives?nouveau=1' },
  { label: 'Courrier départ', to: '/courriers/departs?nouveau=1' },
  { label: 'Importer des documents', to: '/archivage' },
]

export function Topbar({ onOpenMenu, onOpenSearch }: { onOpenMenu: () => void; onOpenSearch: () => void }) {
  const { isDark, setPreference } = useTheme()
  const navigate = useNavigate()
  const canCreate = useSession().user?.role !== 'reader'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu" onClick={onOpenMenu}>
        <Icon icon={Menu} size={18} />
      </Button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-[38px] min-w-0 flex-1 max-w-[340px] items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm text-text-subtle hover:border-border-strong"
      >
        <Icon icon={Search} />
        <span className="truncate">Rechercher un courrier, un document…</span>
        <kbd className="ml-auto hidden rounded-md bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-medium whitespace-nowrap text-text-muted sm:block">
          {shortcut}
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canCreate ? (
        <M.Root>
          <M.Trigger asChild>
            <Button variant="primary">
              <Icon icon={Plus} />
              <span className="hidden sm:inline">Nouveau courrier</span>
              <Icon icon={ChevronDown} size={14} className="hidden sm:block" />
              <span className="sr-only sm:hidden">Nouveau courrier</span>
            </Button>
          </M.Trigger>
          <M.Portal>
            <M.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[220px] rounded-card border border-border bg-surface p-1 shadow-pop"
            >
              {newItems.map((item) => (
                <M.Item
                  key={item.to}
                  onSelect={() => navigate(item.to)}
                  className="flex h-9 cursor-pointer items-center rounded-control px-3 text-sm outline-none data-[highlighted]:bg-surface-muted"
                >
                  {item.label}
                </M.Item>
              ))}
            </M.Content>
          </M.Portal>
        </M.Root>
        ) : null}

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
          onClick={() => setPreference(isDark ? 'light' : 'dark')}
        >
          <Icon icon={isDark ? Sun : Moon} size={18} />
        </Button>
        <NotificationsBell />
      </div>
    </header>
  )
}
