import { Badge } from '@/components/ui/Badge'
import { isStale } from '@/data/repositories/mails'
import type { Mail } from '@/data/types'

/** Traité (teal), En attente (amber), En retard (accent, au-delà du seuil). */
export function MailStatusBadge({ mail, today, staleAfterDays }: { mail: Mail; today: string; staleAfterDays: number }) {
  if (mail.flow === 'outgoing') return null
  if (mail.isProcessed === 1) return <Badge tone="teal">Traité</Badge>
  return isStale(mail, today, staleAfterDays) ? <Badge tone="accent">En retard</Badge> : <Badge tone="amber">En attente</Badge>
}
