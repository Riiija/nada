import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, daysBetween, todayIn } from '@/lib/dates'
import { db } from '../db'
import { useSession, type CurrentUser } from '../session'
import type { AuditEntry, DocumentCategory, DocumentRecord, Mail } from '../types'
import { canSeeDocument } from './documents'
import { canSeeMail } from './mails'
import { getSettings } from './settings'

export interface Kpi {
  /** Valeur affichée. */
  value: number
  /** Mesure comparée : ce mois-ci. */
  current: number
  /** Même mesure le mois précédent. */
  previous: number
  /** 30 derniers jours, un point par jour. */
  spark: number[]
}

/** Un mois futur n'a pas de valeur (null) : la courbe s'arrête au mois en cours. */
export interface MonthPoint {
  month: number
  incoming: number | null
  outgoing: number | null
  archived: number | null
}

export interface PendingMail {
  id: string
  reference: string
  subject: string
  mailDate: string
  ageDays: number
  assignedStaffId?: string
}

export interface DashboardStats {
  incoming: Kpi
  outgoing: Kpi
  documents: Kpi & { bytes: number }
  pending: Kpi
  monthly: MonthPoint[]
  years: number[]
  categories: { category: DocumentCategory; count: number }[]
  processed: { done: number; total: number }
  readable: { done: number; total: number }
  oldestPending: PendingMail[]
  staleAfterDays: number
}

export interface DashboardInput {
  incoming: Mail[]
  outgoing: Mail[]
  documents: DocumentRecord[]
  today: string
  staleAfterDays: number
  year: number
}

const SPARK_DAYS = 30

const monthStart = (date: string) => `${date.slice(0, 7)}-01`
const previousMonthStart = (date: string) => monthStart(addDays(monthStart(date), -1))

function countPerDay(dates: string[], days: string[]): number[] {
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1)
  return days.map((d) => counts.get(d) ?? 0)
}

/** Courriers arrivés encore en attente à la fin d'un jour donné. */
function pendingAt(mails: Mail[], day: string): number {
  return mails.filter((m) => m.mailDate <= day && (m.isProcessed === 0 || (m.processedAt ?? '').slice(0, 10) > day)).length
}

/** Calcule tout le tableau de bord à partir des courriers et documents visibles. Fonction pure. */
export function computeDashboard({ incoming, outgoing, documents, today, staleAfterDays, year }: DashboardInput): DashboardStats {
  const start = monthStart(today)
  const prevStart = previousMonthStart(today)
  const days = Array.from({ length: SPARK_DAYS }, (_, i) => addDays(today, i - (SPARK_DAYS - 1)))
  const inMonth = (date: string) => date >= start
  const inPrevMonth = (date: string) => date >= prevStart && date < start

  const mailKpi = (mails: Mail[]): Kpi => {
    const current = mails.filter((m) => inMonth(m.mailDate)).length
    return { value: current, current, previous: mails.filter((m) => inPrevMonth(m.mailDate)).length, spark: countPerDay(mails.map((m) => m.mailDate), days) }
  }

  const archivedDates = documents.map((d) => d.archivedAt)
  const addedThisMonth = archivedDates.filter(inMonth).length
  const pendingNow = incoming.filter((m) => m.isProcessed === 0).length

  const thisYear = Number(today.slice(0, 4))
  const thisMonth = Number(today.slice(5, 7))
  const monthly: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${year}-${String(i + 1).padStart(2, '0')}`
    if (year === thisYear && i + 1 > thisMonth) return { month: i + 1, incoming: null, outgoing: null, archived: null }
    return {
      month: i + 1,
      incoming: incoming.filter((m) => m.mailDate.startsWith(prefix)).length,
      outgoing: outgoing.filter((m) => m.mailDate.startsWith(prefix)).length,
      archived: archivedDates.filter((d) => d.startsWith(prefix)).length,
    }
  })

  const firstYear = Math.min(Number(today.slice(0, 4)), ...[...incoming, ...outgoing].map((m) => m.year), ...archivedDates.map((d) => Number(d.slice(0, 4))))
  const years = Array.from({ length: Number(today.slice(0, 4)) - firstYear + 1 }, (_, i) => Number(today.slice(0, 4)) - i)

  const categories = new Map<DocumentCategory, number>()
  for (const d of documents) categories.set(d.category, (categories.get(d.category) ?? 0) + 1)

  const yearIncoming = incoming.filter((m) => m.mailDate.startsWith(String(year)))

  return {
    incoming: mailKpi(incoming),
    outgoing: mailKpi(outgoing),
    documents: {
      value: documents.length,
      current: addedThisMonth,
      previous: archivedDates.filter(inPrevMonth).length,
      spark: countPerDay(archivedDates, days),
      bytes: documents.reduce((sum, d) => sum + d.sizeBytes, 0),
    },
    pending: {
      value: pendingNow,
      current: pendingNow,
      previous: pendingAt(incoming, addDays(start, -1)),
      spark: days.map((day) => pendingAt(incoming, day)),
    },
    monthly,
    years,
    categories: [...categories].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    processed: { done: yearIncoming.filter((m) => m.isProcessed === 1).length, total: yearIncoming.length },
    readable: { done: documents.filter((d) => d.ocrStatus === 'done').length, total: documents.length },
    oldestPending: incoming
      .filter((m) => m.isProcessed === 0)
      .sort((a, b) => a.mailDate.localeCompare(b.mailDate) || a.seq - b.seq)
      .slice(0, 6)
      .map((m) => ({ id: m.id, reference: m.reference, subject: m.subject, mailDate: m.mailDate, ageDays: daysBetween(m.mailDate, today), assignedStaffId: m.assignedStaffId })),
    staleAfterDays,
  }
}

async function loadInput(user: CurrentUser, year: number): Promise<DashboardInput> {
  const [settings, mails, docs] = await Promise.all([getSettings(), db.mails.toArray(), db.documents.toArray()])
  const visibleMails = mails.filter((m) => !m.deletedAt && canSeeMail(m, user))
  const visibleDocs: DocumentRecord[] = []
  for (const doc of docs) if (await canSeeDocument(doc, user)) visibleDocs.push(doc)
  return {
    incoming: visibleMails.filter((m) => m.flow === 'incoming'),
    outgoing: visibleMails.filter((m) => m.flow === 'outgoing'),
    documents: visibleDocs,
    today: todayIn(settings.timezone),
    staleAfterDays: settings.staleAfterDays,
    year,
  }
}

/** Statistiques du tableau de bord, mises à jour en direct (autres onglets compris). */
export function useDashboardStats(year: number): DashboardStats | undefined {
  const user = useSession().user
  return useLiveQuery(async () => (user ? computeDashboard(await loadInput(user, year)) : undefined), [year, user?.id, user?.role, user?.staffId])
}

/** Actions de consultation et de session : utiles au journal, trop bruyantes pour un fil d'activité. */
const QUIET = new Set(['document.viewed', 'document.downloaded', 'document.printed', 'audit.verified'])

async function visibleToUser(entry: AuditEntry, user: CurrentUser): Promise<boolean> {
  if (QUIET.has(entry.action) || entry.action.startsWith('auth.')) return false
  if (user.role === 'admin' || user.role === 'archivist') return true
  // Lecteur : ses propres actions, et l'historique des éléments qu'il peut voir.
  if (entry.actorId === user.id) return true
  if (entry.entityType === 'mail') {
    const mail = await db.mails.get(entry.entityId)
    return !!mail && canSeeMail(mail, user)
  }
  if (entry.entityType === 'document') {
    const doc = await db.documents.get(entry.entityId)
    return !!doc && (await canSeeDocument(doc, user))
  }
  return false
}

export async function listRecentActivity(user: CurrentUser, limit = 8): Promise<AuditEntry[]> {
  const found: AuditEntry[] = []
  let offset = 0
  while (found.length < limit) {
    const page = await db.auditLog.orderBy('seq').reverse().offset(offset).limit(100).toArray()
    if (page.length === 0) break
    for (const entry of page) {
      if (await visibleToUser(entry, user)) found.push(entry)
      if (found.length >= limit) break
    }
    offset += 100
  }
  return found
}

export function useRecentActivity(limit = 8): AuditEntry[] | undefined {
  const user = useSession().user
  return useLiveQuery(() => (user ? listRecentActivity(user, limit) : []), [limit, user?.id, user?.role, user?.staffId])
}
