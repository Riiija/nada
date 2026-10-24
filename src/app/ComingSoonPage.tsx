import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import type { NavItem } from './navigation'

export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <div className="rounded-card border border-border bg-surface shadow-card">
        <EmptyState
          illustration={<EmptyMailbox />}
          title="Cet écran n’est pas encore construit"
          description="Il sera disponible dans une prochaine phase du chantier."
        />
      </div>
    </>
  )
}
