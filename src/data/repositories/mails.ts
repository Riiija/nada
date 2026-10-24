import { useLiveQuery } from 'dexie-react-hooks'
import { daysBetween, todayIn } from '@/lib/dates'
import { appendAudit, diffChanges } from '../audit'
import { currentYear, formatReference, nextSequence, peekNextSequence } from '../counters'
import { db } from '../db'
import { PermissionError, ValidationError } from '../errors'
import { incomingMailSchema, outgoingMailSchema } from '../schemas/mail'
import { requireRole, requireUser, useSession, type CurrentUser } from '../session'
import type { AppNotification, Flag, Mail, MailFlow } from '../types'
import { labelChanges } from '../changeLabels'
import { getSettings, referenceFormatFor } from './settings'

export const flowLabels: Record<MailFlow, string> = { incoming: 'Courrier arrivé', outgoing: 'Courrier départ' }

const label = (m: Pick<Mail, 'flow' | 'reference' | 'subject'>) => `${flowLabels[m.flow]} ${m.reference} : ${m.subject}`

/** Un élément restreint n'est visible que de l'admin, de l'archiviste qui l'a créé et du destinataire (DOMAIN.md §3). */
export function canSeeMail(mail: Mail, user: CurrentUser): boolean {
  if (mail.confidentiality !== 'restricted') return true
  if (user.role === 'admin') return true
  if (user.role === 'archivist') return mail.createdBy === user.id
  return mail.flow === 'incoming' && !!mail.assignedStaffId && mail.assignedStaffId === user.staffId
}

/** Traiter un courrier : admin, archiviste, ou lecteur destinataire (à valider avec le métier). */
export function canTreat(mail: Mail, user: CurrentUser): boolean {
  if (user.role === 'admin' || user.role === 'archivist') return true
  return mail.flow === 'incoming' && !!mail.assignedStaffId && mail.assignedStaffId === user.staffId
}

function parseFor(flow: MailFlow, input: unknown): Record<string, unknown> {
  const result = (flow === 'incoming' ? incomingMailSchema : outgoingMailSchema).safeParse(input)
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Données invalides.')
  return result.data as Record<string, unknown>
}

export async function getMail(id: string): Promise<Mail | undefined> {
  const user = requireUser()
  const mail = await db.mails.get(id)
  return mail && !mail.deletedAt && canSeeMail(mail, user) ? mail : undefined
}

export function useMail(id: string | undefined): Mail | null | undefined {
  const user = useSession().user
  return useLiveQuery(async () => {
    if (!id || !user) return null
    const mail = await db.mails.get(id)
    return mail && !mail.deletedAt && canSeeMail(mail, user) ? mail : null
  }, [id, user?.id, user?.role, user?.staffId])
}

async function listMails(flow: MailFlow, user: CurrentUser): Promise<Mail[]> {
  const rows = await db.mails.where('[flow+mailDate]').between([flow, ''], [flow, '￿'], true, true).reverse().toArray()
  return rows.filter((m) => !m.deletedAt && canSeeMail(m, user)).sort((a, b) => b.mailDate.localeCompare(a.mailDate) || b.seq - a.seq)
}

/** Courriers d'un sens, du plus récent au plus ancien, visibles par l'utilisateur connecté. */
export function useMails(flow: MailFlow): Mail[] | undefined {
  const user = useSession().user
  return useLiveQuery(() => (user ? listMails(flow, user) : []), [flow, user?.id, user?.role, user?.staffId])
}

export interface MailCounters {
  pending: number
  stale: number
}

/** Compteurs de la barre latérale : arrivés non traités, dont ceux en retard. */
export function useMailCounters(): MailCounters | undefined {
  const user = useSession().user
  return useLiveQuery(async () => {
    if (!user) return { pending: 0, stale: 0 }
    const [settings, rows] = await Promise.all([getSettings(), listMails('incoming', user)])
    const today = todayIn(settings.timezone)
    const pending = rows.filter((m) => m.isProcessed === 0)
    return { pending: pending.length, stale: pending.filter((m) => isStale(m, today, settings.staleAfterDays)).length }
  }, [user?.id, user?.role, user?.staffId])
}

export function isStale(mail: Pick<Mail, 'isProcessed' | 'mailDate'>, today: string, staleAfterDays: number): boolean {
  return mail.isProcessed === 0 && daysBetween(mail.mailDate, today) > staleAfterDays
}

export async function createMail(flow: MailFlow, input: unknown): Promise<{ id: string; reference: string }> {
  const user = requireRole('admin', 'archivist')
  const data = parseFor(flow, input)
  const settings = await getSettings()
  const now = new Date().toISOString()
  const year = currentYear(settings.timezone)
  const scope = flow === 'incoming' ? 'mailIncoming' : 'mailOutgoing'
  const id = crypto.randomUUID()
  let reference = ''

  await db.transaction('rw', [db.mails, db.counters, db.staff, db.users, db.notifications, db.auditLog], async (tx) => {
    const seq = await nextSequence(tx, scope, year)
    reference = formatReference(referenceFormatFor(settings, scope), seq, year)
    const { isProcessed, ...fields } = data
    const personId = (flow === 'incoming' ? fields.assignedStaffId : fields.signedByStaffId) as string
    const person = await db.staff.get(personId)
    if (!person) throw new ValidationError('Ce collaborateur n’existe plus.')
    const processed: Flag = isProcessed === true ? 1 : 0
    const mail: Mail = {
      ...(fields as Partial<Mail>),
      id,
      flow,
      seq,
      year,
      reference,
      staffJobTitle: (fields.staffJobTitle as string | undefined) ?? person.jobTitle,
      isProcessed: processed,
      processedAt: processed ? now : undefined,
      createdAt: now,
      createdBy: user.id,
      updatedAt: now,
      updatedBy: user.id,
    } as Mail
    await db.mails.add(mail)

    if (flow === 'incoming') {
      const accounts = await db.users.where('staffId').equals(personId).toArray()
      const notifications: AppNotification[] = accounts
        .filter((a) => a.isActive === 1 && a.id !== user.id)
        .map((a) => ({
          id: crypto.randomUUID(),
          recipientUserId: a.id,
          title: `Nouveau courrier : ${mail.subject}`,
          entityType: 'mail',
          entityId: id,
          createdAt: now,
        }))
      if (notifications.length) await db.notifications.bulkAdd(notifications)
    }
    await appendAudit(tx, { action: 'mail.created', entityType: 'mail', entityId: id, entityLabel: label(mail) })
  })
  return { id, reference }
}

export async function updateMail(id: string, input: unknown): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.mails, db.staff, db.departments, db.partners, db.lookups, db.auditLog], async (tx) => {
    const before = await db.mails.get(id)
    if (!before || before.deletedAt || !canSeeMail(before, user)) throw new ValidationError('Ce courrier n’existe plus.')
    const { isProcessed, ...fields } = parseFor(before.flow, input)
    const now = new Date().toISOString()
    const processed: Flag | undefined = before.flow === 'incoming' ? (isProcessed === true ? 1 : 0) : undefined
    const after = { ...before, ...(fields as Partial<Mail>) } as Mail
    if (processed !== undefined) {
      after.isProcessed = processed
      after.processedAt = processed ? (before.isProcessed ? before.processedAt : now) : undefined
    }
    const changes = diffChanges(before, after)
    if (Object.keys(changes).length === 0) return
    await db.mails.put({ ...after, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, {
      action: actionFor(changes),
      entityType: 'mail',
      entityId: id,
      entityLabel: label(after),
      changes: await labelChanges(tx, changes),
    })
  })
}

function actionFor(changes: Record<string, unknown>) {
  const keys = Object.keys(changes)
  if (keys.every((k) => k === 'isProcessed' || k === 'processedAt') && changes.isProcessed) return 'mail.processed' as const
  if (keys.length === 1 && keys[0] === 'positionId') return 'mail.positionChanged' as const
  return 'mail.updated' as const
}

/** Passage à traité : processedAt = maintenant (équivalent de date_traite + heure_traite de WinDev). */
export async function markProcessed(id: string): Promise<void> {
  const user = requireUser()
  await db.transaction('rw', [db.mails, db.auditLog], async (tx) => {
    const mail = await db.mails.get(id)
    if (!mail || mail.deletedAt || !canSeeMail(mail, user)) throw new ValidationError('Ce courrier n’existe plus.')
    if (mail.flow !== 'incoming') throw new ValidationError('Seuls les courriers arrivés se marquent comme traités.')
    if (!canTreat(mail, user)) throw new PermissionError()
    if (mail.isProcessed === 1) return
    const now = new Date().toISOString()
    await db.mails.update(id, { isProcessed: 1, processedAt: now, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, {
      action: 'mail.processed',
      entityType: 'mail',
      entityId: id,
      entityLabel: label(mail),
      changes: { isProcessed: [0, 1] },
    })
  })
}

export async function changePosition(id: string, positionId: string): Promise<void> {
  const user = requireUser()
  await db.transaction('rw', [db.mails, db.lookups, db.auditLog], async (tx) => {
    const mail = await db.mails.get(id)
    if (!mail || mail.deletedAt || !canSeeMail(mail, user)) throw new ValidationError('Ce courrier n’existe plus.')
    if (mail.flow !== 'incoming') throw new ValidationError('La position ne concerne que les courriers arrivés.')
    if (!canTreat(mail, user)) throw new PermissionError()
    const next = await db.lookups.get(positionId)
    if (!next || next.category !== 'position') throw new ValidationError('Cette position n’existe pas.')
    if (mail.positionId === positionId) return
    await db.mails.update(id, { positionId, updatedAt: new Date().toISOString(), updatedBy: user.id })
    await appendAudit(tx, {
      action: 'mail.positionChanged',
      entityType: 'mail',
      entityId: id,
      entityLabel: label(mail),
      changes: await labelChanges(tx, { positionId: [mail.positionId, positionId] }),
    })
  })
}

/** Suppression logique : le numéro n'est jamais réutilisé. */
export async function deleteMail(id: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.mails, db.auditLog], async (tx) => {
    const mail = await db.mails.get(id)
    if (!mail || mail.deletedAt || !canSeeMail(mail, user)) throw new ValidationError('Ce courrier n’existe plus.')
    const now = new Date().toISOString()
    await db.mails.update(id, { deletedAt: now, deletedBy: user.id, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, { action: 'mail.deleted', entityType: 'mail', entityId: id, entityLabel: label(mail) })
  })
}

/** Restauration : l'admin, ou l'archiviste qui vient de supprimer (bouton « Annuler »). */
export async function restoreMail(id: string): Promise<void> {
  const user = requireRole('admin', 'archivist')
  await db.transaction('rw', [db.mails, db.auditLog], async (tx) => {
    const mail = await db.mails.get(id)
    if (!mail || !mail.deletedAt) throw new ValidationError('Ce courrier n’est pas supprimé.')
    if (user.role !== 'admin' && mail.deletedBy !== user.id) throw new PermissionError()
    const now = new Date().toISOString()
    await db.mails.update(id, { deletedAt: undefined, deletedBy: undefined, updatedAt: now, updatedBy: user.id })
    await appendAudit(tx, { action: 'mail.restored', entityType: 'mail', entityId: id, entityLabel: label(mail) })
  })
}

/** Aperçu du numéro « attribué à l'enregistrement » : non réservé, le vrai numéro est donné à l'enregistrement. */
export function useNextReference(flow: MailFlow): string | undefined {
  return useLiveQuery(async () => {
    const settings = await getSettings()
    const scope = flow === 'incoming' ? 'mailIncoming' : 'mailOutgoing'
    const year = currentYear(settings.timezone)
    return formatReference(referenceFormatFor(settings, scope), await peekNextSequence(scope, year), year)
  }, [flow])
}
