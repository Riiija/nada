import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { markAllNotificationsRead, markNotificationRead, useNotifications } from '@/data/repositories/notifications'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

/** Cloche : point si non lu, liste, « Tout marquer comme lu », clic = ouverture du courrier. */
export function NotificationsBell() {
  const data = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const unread = data?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'} className="relative">
          <Icon icon={Bell} size={18} />
          {unread ? <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-accent" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-32px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread ? (
            <button type="button" className="text-[13px] text-text-muted underline underline-offset-2 hover:text-text" onClick={() => void markAllNotificationsRead()}>
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        {data && data.items.length > 0 ? (
          <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void markNotificationRead(n.id)
                    setOpen(false)
                    if (n.entityType === 'mail' && n.entityId) navigate(`/courriers/arrives/${n.entityId}`)
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted"
                >
                  <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
                  <span className="min-w-0">
                    <span className={cn('block text-sm', !n.readAt && 'font-medium')}>{n.title}</span>
                    <span className="block text-xs text-text-muted">{formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-[13px] text-text-muted">Aucune notification. Les courriers qui vous sont adressés apparaîtront ici.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}
