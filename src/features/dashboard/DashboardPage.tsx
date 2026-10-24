import { Archive, Hourglass, Inbox, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Donut } from '@/components/charts/Donut'
import { SERIES, type Series } from '@/components/charts/series'
import { VolumeChart } from '@/components/charts/VolumeChart'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { trendOf } from '@/components/ui/trend'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { describeAudit } from '@/data/audit-labels'
import { useSettings } from '@/data/repositories/settings'
import { useDashboardStats, useRecentActivity, type DashboardStats } from '@/data/repositories/stats'
import { categoryLabels } from '@/data/schemas/document'
import { useSession } from '@/data/session'
import { useMailLookups } from '@/features/mails/useMailLookups'
import { todayIn } from '@/lib/dates'
import { formatDate, formatNumber } from '@/lib/format'
import { formatBytes, getStorageStatus, type StorageStatus } from '@/lib/storage'

function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-card border border-border bg-surface p-5 shadow-card ${className ?? ''}`} aria-label={title}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-[13px] text-text-muted">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

export function DashboardPage() {
  const user = useSession().user
  const settings = useSettings()
  const currentYear = Number(todayIn(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 4))
  const [year, setYear] = useState<number | null>(null)
  const stats = useDashboardStats(year ?? currentYear)
  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? ''

  return (
    <>
      <PageHeader title="Tableau de bord" description={`Bonjour ${firstName}. Voici l’activité du bureau d’ordre.`} />
      {stats === undefined ? (
        <div role="status" aria-label="Chargement" className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-card" />
          ))}
          <Skeleton className="h-[380px] rounded-card md:col-span-2 xl:col-span-3" />
          <Skeleton className="h-[380px] rounded-card" />
        </div>
      ) : (
        <Content stats={stats} year={year ?? currentYear} onYear={setYear} />
      )}
    </>
  )
}

function Content({ stats, year, onYear }: { stats: DashboardStats; year: number; onYear: (year: number) => void }) {
  const [series, setSeries] = useState<Series>('incoming')
  const kpis = [
    { key: 'incoming', label: 'Courriers arrivés', icon: Inbox, tone: 'accent' as const, kpi: stats.incoming, upIs: 'good' as const, detail: undefined },
    { key: 'outgoing', label: 'Courriers départ', icon: Send, tone: 'teal' as const, kpi: stats.outgoing, upIs: 'good' as const, detail: undefined },
    { key: 'documents', label: 'Documents archivés', icon: Archive, tone: 'petrol' as const, kpi: stats.documents, upIs: 'good' as const, detail: stats.documents.bytes ? formatBytes(stats.documents.bytes) : undefined },
    { key: 'pending', label: 'En attente de traitement', icon: Hourglass, tone: 'amber' as const, kpi: stats.pending, upIs: 'bad' as const, detail: undefined },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ key, label, icon, tone, kpi, upIs, detail }) => (
          <KpiCard
            key={key}
            label={label}
            value={formatNumber(kpi.value)}
            detail={detail}
            icon={icon}
            tone={tone}
            trend={trendOf(kpi.current, kpi.previous, upIs)}
            spark={kpi.spark}
            sparkLabel={`${label} sur les 30 derniers jours`}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Volume mensuel"
          description="Activité mois par mois sur l’année choisie."
          className="xl:col-span-2"
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Segmented
                label="Série affichée"
                value={series}
                onChange={setSeries}
                options={(Object.keys(SERIES) as Series[]).map((value) => ({ value, label: SERIES[value].label }))}
              />
              <div className="w-[96px]">
                <Select aria-label="Année" value={year} onChange={(e) => onYear(Number(e.target.value))}>
                  {stats.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          }
        >
          <VolumeChart data={stats.monthly} series={series} year={year} />
        </Panel>

        <div className="space-y-5">
          <Panel title="Répartition des documents" description="Par catégorie.">
            {stats.categories.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-muted">Aucun document archivé pour le moment.</p>
            ) : (
              <Donut data={stats.categories.map((c) => ({ label: categoryLabels[c.category], value: c.count }))} unit="documents" label="Répartition des documents par catégorie" />
            )}
          </Panel>
          <Indicators stats={stats} year={year} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PendingPanel stats={stats} />
        <ActivityPanel />
      </div>
    </div>
  )
}

function Indicators({ stats, year }: { stats: DashboardStats; year: number }) {
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const isAdmin = useSession().user?.role === 'admin'

  useEffect(() => {
    let alive = true
    void getStorageStatus().then((s) => alive && setStorage(s))
    return () => {
      alive = false
    }
  }, [])

  const pct = (done: number, total: number) => (total ? (done / total) * 100 : 0)
  const label = (done: number, total: number) => `${formatNumber(Math.round(pct(done, total)))} %`
  const used = storage?.usage ?? null
  const quota = storage?.quota ?? null
  const usedPercent = used !== null && quota ? (used / quota) * 100 : 0

  return (
    <Panel title="Indicateurs">
      <div className="space-y-5">
        <ProgressBar
          label={`Courriers traités en ${year}`}
          tone="teal"
          percent={pct(stats.processed.done, stats.processed.total)}
          display={label(stats.processed.done, stats.processed.total)}
          detail={`${formatNumber(stats.processed.done)} traités sur ${formatNumber(stats.processed.total)}`}
        />
        <ProgressBar
          label="Documents lisibles par la recherche"
          tone="accent"
          percent={pct(stats.readable.done, stats.readable.total)}
          display={label(stats.readable.done, stats.readable.total)}
          detail={`${formatNumber(stats.readable.done)} lus sur ${formatNumber(stats.readable.total)}`}
        />
        <div>
          <ProgressBar
            label="Espace utilisé"
            tone="petrol"
            percent={usedPercent}
            display={used === null || !quota ? 'Non disponible' : usedPercent < 1 ? '< 1 %' : `${formatNumber(Math.round(usedPercent))} %`}
            detail={used === null || !quota ? undefined : `${formatBytes(used)} sur ${formatBytes(quota)}`}
          />
          {storage?.persisted === true ? (
            <p className="mt-1 text-xs text-text-muted">Stockage persistant : activé</p>
          ) : storage?.persisted === false ? (
            <p className="mt-1 text-xs text-text-muted">
              Stockage persistant : non activé.{' '}
              {isAdmin ? (
                <Link to="/parametres" className="underline underline-offset-2">
                  Ouvrir les paramètres
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}

function PendingPanel({ stats }: { stats: DashboardStats }) {
  const navigate = useNavigate()
  const lookups = useMailLookups()
  const stale = stats.staleAfterDays

  return (
    <Panel
      title="Courriers en attente"
      description="Les plus anciens, non traités."
      action={
        <Link to="/courriers/arrives?statut=pending" className="text-[13px] font-medium underline underline-offset-2">
          Voir tout
        </Link>
      }
    >
      {stats.oldestPending.length === 0 ? (
        <EmptyState illustration={<EmptyMailbox />} title="Aucun courrier en attente" description="Les courriers arrivés non traités apparaîtront ici." />
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {stats.oldestPending.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => navigate(`/courriers/arrives/${m.id}`)} className="flex w-full items-center gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.reference}, {m.subject}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {formatDate(m.mailDate)}
                    {m.assignedStaffId ? `, ${lookups.names.staff.get(m.assignedStaffId) ?? ''}` : ''}
                  </p>
                </div>
                <Badge tone={m.ageDays >= stale * 2 ? 'accent' : m.ageDays >= stale ? 'amber' : 'neutral'}>{m.ageDays} j</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ActivityPanel() {
  const activity = useRecentActivity(8)
  return (
    <Panel title="Activité récente" description="Les derniers événements que vous pouvez voir.">
      {activity === undefined ? (
        <div role="status" aria-label="Chargement" className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <EmptyState illustration={<EmptyMailbox />} title="Aucune activité" description="Les actions des utilisateurs apparaîtront ici." />
      ) : (
        <ol className="space-y-4">
          {activity.map((e) => (
            <li key={e.seq} className="flex items-start gap-3">
              <Avatar name={e.actorName} size={32} />
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-medium">{e.actorName}</span> {describeAudit(e)}
                </p>
                <p className="truncate text-xs text-text-muted">{e.entityLabel}</p>
              </div>
              <time dateTime={e.occurredAt} className="shrink-0 text-xs text-text-muted">
                {formatDistanceToNow(new Date(e.occurredAt), { locale: fr, addSuffix: true })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
