import { ChevronDown, ChevronLeft, ChevronRight, Lock, LogOut } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { canAccess, navigation } from '@/app/navigation'
import { Logo } from '@/components/icons/Logo'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { Tooltip } from '@/components/ui/Tooltip'
import { lockSession, signOut } from '@/data/repositories/auth'
import { useMailCounters } from '@/data/repositories/mails'
import { useSettings } from '@/data/repositories/settings'
import { useSession } from '@/data/session'
import type { Role } from '@/data/types'
import { cn } from '@/lib/cn'

const roleLabels: Record<Role, string> = { admin: 'Administrateur', archivist: 'Archiviste', reader: 'Lecteur' }

type ContentProps = { collapsed?: boolean; onNavigate?: () => void }

export function SidebarContent({ collapsed = false, onNavigate }: ContentProps) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const { user } = useSession()
  const { pathname } = useLocation()
  const settings = useSettings()
  const counters = useMailCounters()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <Logo />
        {collapsed ? null : (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-semibold">{settings?.appName ?? ' '}</div>
            <div className="truncate text-xs text-text-muted">{settings?.organizationName ?? ' '}</div>
          </div>
        )}
      </div>

      <nav aria-label="Navigation principale" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {navigation.map((group) => {
          const items = group.items.filter((item) => !user || canAccess(item, user.role))
          if (items.length === 0) return null
          const isClosed = !collapsed && closed[group.label]
          return (
            <div key={group.label} className="mb-2">
              {collapsed ? (
                <div className="mx-2 my-2 h-px bg-border" />
              ) : (
                <button
                  type="button"
                  aria-expanded={!isClosed}
                  onClick={() => setClosed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                  className="flex h-8 w-full items-center justify-between rounded-control px-2.5 text-xs font-medium text-text-subtle hover:text-text-muted"
                >
                  {group.label}
                  <Icon icon={ChevronDown} size={14} className={cn('transition-transform duration-[120ms]', isClosed && '-rotate-90')} />
                </button>
              )}
              {isClosed ? null : (
                <ul className="mt-0.5 space-y-0.5">
                  {items.map((item) => {
                    const link = (
                      <NavLink
                        to={item.to}
                        onClick={onNavigate}
                        aria-label={collapsed ? item.label : undefined}
                        className={({ isActive: exact }) => {
                          const isActive = exact || (item.activePrefix ? pathname.startsWith(item.activePrefix) : false)
                          return cn(
                            'flex h-9 items-center gap-3 rounded-control px-2.5 text-sm text-text-muted transition-colors duration-[120ms] hover:bg-surface-muted',
                            collapsed && 'justify-center',
                            isActive && 'bg-surface-active font-medium text-text hover:bg-surface-active',
                          )
                        }}
                      >
                        <Icon icon={item.icon} size={18} />
                        {collapsed ? null : <span className="truncate">{item.label}</span>}
                        {!collapsed && item.to === '/courriers/arrives' && counters?.pending ? (
                          <span
                            className={cn(
                              'ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                              counters.stale > 0 ? 'bg-accent-tint text-accent-ink' : 'bg-surface-active text-text',
                            )}
                            aria-label={`${counters.pending} non traités${counters.stale ? `, dont ${counters.stale} en retard` : ''}`}
                          >
                            {counters.pending}
                          </span>
                        ) : null}
                      </NavLink>
                    )
                    return <li key={item.to}>{collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link}</li>
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      {user ? (
        <div className={cn('flex shrink-0 items-center gap-3 border-t border-border p-3', collapsed && 'flex-col')}>
          <Avatar name={user.fullName} />
          {collapsed ? null : (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{user.fullName}</div>
              <div className="text-xs text-text-muted">{roleLabels[user.role]}</div>
            </div>
          )}
          <div className={cn('flex gap-1', collapsed && 'flex-col')}>
            <Tooltip label="Verrouiller la session" side={collapsed ? 'right' : 'top'}>
              <button
                type="button"
                aria-label="Verrouiller la session"
                onClick={() => void lockSession()}
                className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <Icon icon={Lock} size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Se déconnecter" side={collapsed ? 'right' : 'top'}>
              <button
                type="button"
                aria-label="Se déconnecter"
                onClick={() => void signOut()}
                className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
              >
                <Icon icon={LogOut} size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type Props = { collapsed: boolean; onToggle: () => void }

export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-sidebar transition-[width] duration-200 ease-ged lg:block',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      <SidebarContent collapsed={collapsed} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
        className="absolute top-[84px] -right-3 z-20 grid size-6 place-items-center rounded-full border border-border bg-surface text-text-muted hover:text-text"
      >
        <Icon icon={collapsed ? ChevronRight : ChevronLeft} size={14} />
      </button>
    </aside>
  )
}
