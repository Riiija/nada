import { appendAudit, appendAuditBatch, type BatchAuditInput } from '../audit'
import { db } from '../db'
import { ValidationError } from '../errors'
import { hashPassword } from '../password'
import { requireRole } from '../session'
import { addDays, todayIn } from '@/lib/dates'
import { flowLabels } from '../repositories/mails'
import { registerDefinitions, type RegisterRow } from '../repositories/registers'
import { defaultSettings } from '../repositories/settings'
import type { Actor } from '../session'
import { buildDocuments } from './documents'
import { buildRegisters } from './registers'
import { mulberry32 } from './rng'
import type { DemoDeps } from './types'
import type { Counter, Department, Lookup, LookupCategory, Mail, Partner, PartnerKind, Role, Staff, User } from '../types'

export interface DemoAccount {
  username: string
  fullName: string
  role: Role
  password: string
  note?: string
}

const DEPARTMENTS: [code: string, name: string][] = [
  ['CAB', 'Cabinet'],
  ['DSI', 'DSI'],
  ['DAF', 'DAF'],
  ['DB', 'Direction du budget'],
  ['DRH', 'Direction des ressources humaines'],
  ['SG', 'Secrétariat général'],
]

// Noms fictifs : [nom complet, fonction, code de direction]
const STAFF: [string, string, string][] = [
  ['Nadia Ahmed', 'Cheffe du bureau d’ordre', 'SG'],
  ['Karim Mansour', 'Directeur de cabinet', 'CAB'],
  ['Salma Idriss', 'Conseillère juridique', 'CAB'],
  ['Omar Bakari', 'Chef du service informatique', 'DSI'],
  ['Leïla Hamidi', 'Ingénieure systèmes', 'DSI'],
  ['Yacine Daoud', 'Administrateur réseau', 'DSI'],
  ['Fatima Soilihi', 'Directrice administrative et financière', 'DAF'],
  ['Mehdi Abdallah', 'Comptable principal', 'DAF'],
  ['Amina Said', 'Chargée de la trésorerie', 'DAF'],
  ['Rachid Tahar', 'Directeur du budget', 'DB'],
  ['Inès Moussa', 'Analyste budgétaire', 'DB'],
  ['Hassan Youssouf', 'Contrôleur de gestion', 'DB'],
  ['Zaïnab Ali', 'Directrice des ressources humaines', 'DRH'],
  ['Bilal Cassim', 'Gestionnaire de carrière', 'DRH'],
  ['Samira Oumouri', 'Chargée de la formation', 'DRH'],
  ['Tarek Mohamed', 'Secrétaire général', 'SG'],
  ['Hadja Ben Ali', 'Secrétaire de direction', 'SG'],
  ['Idriss Combo', 'Archiviste', 'SG'],
  ['Mariam Fakih', 'Agente du courrier', 'SG'],
  ['Anis Boinali', 'Chargé de mission', 'CAB'],
]

const PARTNERS: [string, PartnerKind][] = [
  ['UNICEF', 'internationalOrg'],
  ['Cabinet présidentiel', 'presidency'],
  ['Banque centrale', 'publicBody'],
  ['PNUD', 'internationalOrg'],
  ['Ministère des Finances', 'ministry'],
  ['Ministère de l’Éducation nationale', 'ministry'],
  ['Ministère de la Santé', 'ministry'],
  ['Ministère des Affaires étrangères', 'ministry'],
  ['Ministère de la Justice', 'ministry'],
  ['Direction générale des impôts', 'publicBody'],
  ['Banque mondiale', 'internationalOrg'],
  ['Union européenne', 'internationalOrg'],
  ['Imprimerie nationale', 'publicBody'],
  ['Société Horizon Fournitures', 'company'],
  ['Cabinet d’audit Lumière', 'company'],
]

const LOOKUPS: Record<LookupCategory, string[]> = {
  mailType: ['Lettre', 'Note', 'Invitation', 'Facture', 'Rapport', 'Demande'],
  followUp: ['À traiter', 'Pour information', 'Pour avis', 'Urgent'],
  position: ['Au bureau d’ordre', 'Au cabinet', 'En traitement', 'Parti à destination', 'Classé'],
}

const SUBJECTS = [
  'Visite du musée',
  'Moyen de paiement',
  'Fiche comptable',
  'Recouvrement des prêts',
  'Demande de subvention',
  'Invitation à la conférence annuelle',
  'Rapport d’activité du trimestre',
  'Convocation du comité de pilotage',
  'Renouvellement du contrat de maintenance',
  'Transmission du budget prévisionnel',
  'Demande d’audience',
  'Facture de fournitures de bureau',
  'Compte rendu de mission',
  'Nomination d’un point focal',
  'Avis sur le projet de décret',
  'Programme de formation du personnel',
]

interface MailSeedContext {
  staff: Staff[]
  partners: Partner[]
  lookups: Lookup[]
  recipientId: string
  /** Comptes qui enregistrent les courriers : l'archiviste en saisit la majorité. */
  creators: string[]
}

/** ~180 courriers arrivés et ~120 départs sur 12 mois, environ 20 % non traités (DOMAIN.md §11). */
function generateMails({ staff, partners, lookups, recipientId, creators }: MailSeedContext) {
  const rand = mulberry32(2026)
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]!
  const byCategory = (c: LookupCategory) => lookups.filter((l) => l.category === c)
  const today = todayIn(defaultSettings().timezone)
  const position = (label: string) => byCategory('position').find((l) => l.label === label)!.id
  const mails: Mail[] = []
  const counters = new Map<string, Counter>()

  const build = (flow: Mail['flow'], count: number) => {
    const dates = Array.from({ length: count }, () => addDays(today, -Math.floor(rand() * 365))).sort()
    for (const mailDate of dates) {
      const year = Number(mailDate.slice(0, 4))
      const scope = flow === 'incoming' ? 'mailIncoming' : 'mailOutgoing'
      const counter = counters.get(`${scope}${year}`) ?? { scope, year, lastSeq: 0 }
      counter.lastSeq += 1
      counters.set(`${scope}${year}`, counter)
      const person = flow === 'incoming' && rand() < 0.08 ? staff.find((s) => s.id === recipientId)! : pick(staff)
      const createdAt = `${mailDate}T08:00:00.000Z`
      const creator = pick(creators)
      const base = {
        id: crypto.randomUUID(),
        flow,
        seq: counter.lastSeq,
        year,
        reference: `${counter.lastSeq}/${String(year % 100).padStart(2, '0')}`,
        mailDate,
        subject: pick(SUBJECTS),
        departmentId: person.departmentId,
        staffJobTitle: person.jobTitle,
        confidentiality: 'normal' as const,
        createdAt,
        createdBy: creator,
        updatedAt: createdAt,
        updatedBy: creator,
      }
      if (flow === 'incoming') {
        const recent = mailDate > addDays(today, -60)
        const pending = rand() < (recent ? 0.55 : 0.12)
        mails.push({
          ...base,
          assignedStaffId: person.id,
          sourcePartnerId: pick(partners).id,
          mailTypeId: pick(byCategory('mailType')).id,
          followUpId: pick(byCategory('followUp')).id,
          positionId: pending
            ? position(pick(['Au bureau d’ordre', 'Au cabinet', 'En traitement']))
            : position(pick(['Parti à destination', 'Classé'])),
          fileNumber: `D${String(Math.floor(rand() * 1e8)).padStart(8, '0')}-${String(year % 100).padStart(2, '0')}`,
          isProcessed: pending ? 0 : 1,
          processedAt: pending ? undefined : `${addDays(mailDate, 1 + Math.floor(rand() * 6))}T10:00:00.000Z`,
          confidentiality: rand() < 0.02 ? 'restricted' : 'normal',
        })
      } else {
        const free = rand() < 0.1
        mails.push({
          ...base,
          signedByStaffId: person.id,
          ...(free ? { recipientLabel: 'Mission permanente, New York' } : { recipientPartnerId: pick(partners).id }),
          isProcessed: 0,
        })
      }
    }
  }
  build('incoming', 180)
  build('outgoing', 120)
  return { mails, counters: [...counters.values()] }
}

const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('')
}

/**
 * Données de démonstration (DOMAIN.md §11), partie référentiels et comptes de test.
 * Uniquement sur une base sans référentiel. Les mots de passe sont rendus une seule fois.
 */
export async function loadDemoData(deps: DemoDeps = {}): Promise<{ accounts: DemoAccount[] }> {
  const admin = requireRole('admin')
  const departments: Department[] = DEPARTMENTS.map(([code, name]) => ({ id: crypto.randomUUID(), code, name, isActive: 1 }))
  const byCode = new Map(DEPARTMENTS.map(([code], i) => [code, departments[i]!.id]))
  const staff: Staff[] = STAFF.map(([fullName, jobTitle, code]) => ({
    id: crypto.randomUUID(),
    fullName,
    jobTitle,
    departmentId: byCode.get(code),
    isActive: 1,
  }))
  const partners: Partner[] = PARTNERS.map(([name, kind]) => ({ id: crypto.randomUUID(), name, kind, isActive: 1 }))
  const lookups: Lookup[] = (Object.entries(LOOKUPS) as [LookupCategory, string[]][]).flatMap(([category, labels]) =>
    labels.map((label, i) => ({ id: crypto.randomUUID(), category, label, sortOrder: i + 1, isActive: 1 as const })),
  )

  const recipient = staff.find((s) => s.fullName === 'Karim Mansour')!
  const accounts: DemoAccount[] = [
    { username: 'archiviste', fullName: 'Mariam Fakih', role: 'archivist', password: randomPassword() },
    { username: 'lecteur', fullName: 'Idriss Combo', role: 'reader', password: randomPassword() },
    { username: 'destinataire', fullName: recipient.fullName, role: 'reader', password: randomPassword(), note: 'Destinataire des courriers du cabinet' },
  ]
  const now = new Date().toISOString()
  const users: User[] = await Promise.all(
    accounts.map(async (a) => {
      const hashed = await hashPassword(a.password)
      return {
        id: crypto.randomUUID(),
        username: a.username,
        fullName: a.fullName,
        role: a.role,
        staffId: a.username === 'destinataire' ? recipient.id : undefined,
        isActive: 1 as const,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        createdAt: now,
      }
    }),
  )
  const archivist = users.find((u) => u.username === 'archiviste')!

  const today = todayIn(defaultSettings().timezone)
  const creators = [archivist.id, archivist.id, archivist.id, admin.id]
  const { mails, counters } = generateMails({ staff, partners, lookups, recipientId: recipient.id, creators })
  const counterMap = new Map(counters.map((c) => [`${c.scope}${c.year}`, c]))
  const registers = buildRegisters({ rand: mulberry32(7), today, creatorId: archivist.id, departments, staff, partners, counters: counterMap })
  const incoming = mails.filter((m) => m.flow === 'incoming')
  const outgoing = mails.filter((m) => m.flow === 'outgoing')
  const seededDocuments = await buildDocuments(
    {
      rand: mulberry32(11),
      today,
      creatorId: archivist.id,
      incoming,
      outgoing,
      decrees: registers.decrees,
      ministerialOrders: registers.ministerialOrders,
      incomingInvoices: registers.incomingInvoices,
      ledgerEntries: registers.ledgerEntries,
    },
    deps,
  )

  const actors = new Map<string, Actor>([
    [admin.id, { id: admin.id, name: admin.fullName, role: 'admin' }],
    [archivist.id, { id: archivist.id, name: archivist.fullName, role: 'archivist' }],
  ])
  const events = buildEvents({ mails, lookups, registers, documents: seededDocuments, actors, defaultActor: actors.get(archivist.id)! })

  await db.transaction(
    'rw',
    [
      db.departments, db.staff, db.partners, db.lookups, db.officials, db.users,
      db.mails, db.decrees, db.ministerialOrders, db.serviceNotes, db.incomingInvoices, db.ledgerEntries,
      db.documents, db.files, db.thumbnails, db.documentPages, db.documentLinks, db.counters, db.auditLog,
    ],
    async (tx) => {
      const existing = await Promise.all([db.departments.count(), db.staff.count(), db.partners.count(), db.lookups.count(), db.mails.count(), db.documents.count()])
      if (existing.some((n) => n > 0)) throw new ValidationError('Les données de démonstration ne se chargent que sur une base sans référentiel.')
      if (await db.users.where('username').anyOf(accounts.map((a) => a.username)).count()) {
        throw new ValidationError('Un compte de démonstration existe déjà.')
      }
      await db.departments.bulkAdd(departments)
      await db.staff.bulkAdd(staff)
      await db.partners.bulkAdd(partners)
      await db.lookups.bulkAdd(lookups)
      await db.officials.bulkAdd(registers.officials)
      await db.users.bulkAdd(users)
      await db.mails.bulkAdd(mails)
      await db.decrees.bulkAdd(registers.decrees as never)
      await db.ministerialOrders.bulkAdd(registers.ministerialOrders as never)
      await db.serviceNotes.bulkAdd(registers.serviceNotes as never)
      await db.incomingInvoices.bulkAdd(registers.incomingInvoices as never)
      await db.ledgerEntries.bulkAdd(registers.ledgerEntries)
      await db.documents.bulkAdd(seededDocuments.documents)
      await db.files.bulkAdd(seededDocuments.files)
      await db.thumbnails.bulkAdd(seededDocuments.thumbnails)
      await db.documentPages.bulkAdd(seededDocuments.pages)
      await db.documentLinks.bulkAdd(seededDocuments.links)
      await db.counters.bulkPut([...counterMap.values()])
      await appendAuditBatch(tx, events)
      await appendAudit(tx, {
        action: 'demo.loaded',
        entityType: 'demo',
        entityId: 'demo',
        entityLabel: 'Données de démonstration',
        metadata: {
          departments: departments.length,
          staff: staff.length,
          partners: partners.length,
          lookups: lookups.length,
          users: users.length,
          incomingMails: incoming.length,
          outgoingMails: outgoing.length,
          decrees: registers.decrees.length,
          ministerialOrders: registers.ministerialOrders.length,
          serviceNotes: registers.serviceNotes.length,
          invoices: registers.incomingInvoices.length,
          ledgerEntries: registers.ledgerEntries.length,
          documents: seededDocuments.documents.length,
        },
      })
    },
  )
  return { accounts }
}

interface EventContext {
  mails: Mail[]
  lookups: Lookup[]
  registers: ReturnType<typeof buildRegisters>
  documents: Awaited<ReturnType<typeof buildDocuments>>
  actors: Map<string, Actor>
  defaultActor: Actor
}

const addMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()

/**
 * Raconte l'année d'activité dans le journal : un enregistrement par courrier et par acte, les changements
 * de position, les traitements, l'import et la lecture de chaque document. Les entrées sont datées de leur
 * jour d'origine et chaînées dans l'ordre chronologique.
 */
function buildEvents({ mails, lookups, registers, documents, actors, defaultActor }: EventContext): BatchAuditInput[] {
  const events: BatchAuditInput[] = []
  const actorOf = (id: string) => actors.get(id) ?? defaultActor
  const label = new Map(lookups.map((l) => [l.id, l.label]))
  const firstPosition = lookups.find((l) => l.category === 'position' && l.label === 'Au bureau d’ordre')!

  for (const mail of mails) {
    const entityLabel = `${flowLabels[mail.flow]} ${mail.reference} : ${mail.subject}`
    const actor = actorOf(mail.createdBy)
    events.push({ at: mail.createdAt, actor, action: 'mail.created', entityType: 'mail', entityId: mail.id, entityLabel })
    if (mail.flow === 'incoming' && mail.isProcessed === 1 && mail.processedAt) {
      if (mail.positionId && mail.positionId !== firstPosition.id) {
        events.push({
          at: `${addDays(mail.mailDate, 1)}T11:00:00.000Z`,
          actor,
          action: 'mail.positionChanged',
          entityType: 'mail',
          entityId: mail.id,
          entityLabel,
          changes: { position: [firstPosition.label, label.get(mail.positionId) ?? null] },
        })
      }
      events.push({ at: mail.processedAt, actor, action: 'mail.processed', entityType: 'mail', entityId: mail.id, entityLabel, changes: { isProcessed: [0, 1] } })
    }
  }

  const registerEvents = (type: keyof typeof registerDefinitions, rows: { id: string; createdAt: string; createdBy: string }[]) => {
    const def = registerDefinitions[type]
    for (const row of rows) {
      events.push({
        at: row.createdAt,
        actor: actorOf(row.createdBy),
        action: `${def.entity}.created`,
        entityType: type,
        entityId: row.id,
        entityLabel: def.label(row as unknown as RegisterRow),
      })
    }
  }
  registerEvents('decrees', registers.decrees)
  registerEvents('ministerialOrders', registers.ministerialOrders)
  registerEvents('serviceNotes', registers.serviceNotes)
  registerEvents('incomingInvoices', registers.incomingInvoices)
  registerEvents('ledgerEntries', registers.ledgerEntries)
  for (const invoice of registers.incomingInvoices.filter((r) => r.status === 'paid')) {
    events.push({
      at: `${addDays(String(invoice.receivedOn), 10)}T14:00:00.000Z`,
      actor: actorOf(invoice.createdBy),
      action: 'incomingInvoice.updated',
      entityType: 'incomingInvoices',
      entityId: invoice.id,
      entityLabel: registerDefinitions.incomingInvoices.label(invoice),
      changes: { status: ['validated', 'paid'] },
    })
  }

  for (const doc of documents.documents) {
    const actor = actorOf(doc.createdBy)
    const entityLabel = `Document : ${doc.title}`
    events.push({
      at: doc.createdAt,
      actor,
      action: 'document.imported',
      entityType: 'document',
      entityId: doc.id,
      entityLabel,
      metadata: { sizeBytes: doc.sizeBytes, pages: doc.pageCount, category: doc.category, sha256: doc.sha256 },
    })
    const link = documents.links.find((l) => l.documentId === doc.id)
    if (link) {
      events.push({
        at: addMinutes(doc.createdAt, 1),
        actor,
        action: 'document.linked',
        entityType: 'document',
        entityId: doc.id,
        entityLabel,
        metadata: { entityType: link.entityType, entityId: link.entityId },
      })
    }
    if (doc.ocrStatus === 'done') {
      events.push({
        at: addMinutes(doc.createdAt, 2),
        actor,
        action: 'document.ocrCompleted',
        entityType: 'document',
        entityId: doc.id,
        entityLabel,
        metadata: { pages: doc.pageCount, source: doc.ocrSource, confidence: doc.ocrConfidence, durationMs: 900 + doc.pageCount * 650 },
      })
    }
  }
  return events
}
