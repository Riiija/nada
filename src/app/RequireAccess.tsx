import type { ReactNode } from 'react'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSession } from '@/data/session'
import { canAccess, type NavItem } from './navigation'

/** Masque un écran aux rôles qui n'y ont pas droit (les repositories contrôlent aussi). */
export function RequireAccess({ item, children }: { item: NavItem; children: ReactNode }) {
  const { user } = useSession()
  if (user && !canAccess(item, user.role)) {
    return (
      <>
        <PageHeader title={item.title} />
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            illustration={<EmptyMailbox />}
            title="Accès non autorisé"
            description="Votre rôle ne permet pas d'ouvrir cet écran. Demandez à un administrateur si vous en avez besoin."
          />
        </div>
      </>
    )
  }
  return <>{children}</>
}
