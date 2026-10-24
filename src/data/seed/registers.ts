import { addDays } from '@/lib/dates'
import type { RegisterRow } from '../repositories/registers'
import type { Counter, CounterScope, Department, LedgerEntry, Official, Partner, Staff } from '../types'
import type { Rand } from './rng'
import { picker } from './rng'

// Noms fictifs : aucune personne réelle.
const HEADS: [name: string, title: string, start: string, end?: string][] = [
  ['Idriss Kassim', 'Président de la République', '2022-06-01'],
  ['Omar Benali', 'Président de la République', '2016-05-15', '2022-05-31'],
]
const MINISTERS: [name: string, title: string, start: string][] = [
  ['Nasser Abdallah', 'Ministre des Finances et du Budget', '2024-01-10'],
  ['Hawa Mouigni', 'Ministre de la Fonction publique', '2024-01-10'],
  ['Saïd Bacar', 'Ministre de l’Éducation nationale', '2024-01-10'],
  ['Zahra Idi', 'Ministre de la Santé', '2024-01-10'],
]

const DECREES = [
  'Portant nomination du directeur général du budget',
  'Portant organisation du ministère',
  'Portant création d’une commission de recouvrement des prêts',
  'Fixant les modalités de gestion des archives administratives',
  'Portant ouverture de crédits supplémentaires',
  'Portant régime indemnitaire des agents',
]
const ORDERS = [
  'Portant délégation de signature au secrétaire général',
  'Fixant les horaires de service du bureau d’ordre',
  'Portant désignation des membres du comité de pilotage',
  'Relatif à la tenue des registres de courrier',
  'Portant attribution de primes de rendement',
  'Fixant la liste des pièces à fournir pour les demandes de prêt',
]
const NOTES: [subject: string, audience: string][] = [
  ['Rappel sur la conservation des documents originaux', 'Tout le personnel'],
  ['Calendrier des congés de fin d’année', 'Tout le personnel'],
  ['Mise à jour des mots de passe de la messagerie', 'Direction des systèmes d’information'],
  ['Procédure de visa des factures fournisseurs', 'Direction administrative et financière'],
  ['Ouverture du guichet unique du courrier', 'Chefs de service'],
]
const SUPPLIERS = ['Société Horizon Fournitures', 'Cabinet d’audit Lumière', 'Imprimerie nationale']
const LEDGER_DEBITS: [string, number][] = [
  ['Achat de fournitures de bureau', 85_000],
  ['Frais de mission', 120_000],
  ['Maintenance du parc informatique', 210_000],
  ['Abonnement internet', 65_000],
  ['Impression de formulaires', 48_000],
  ['Entretien des locaux', 95_000],
  ['Carburant des véhicules de service', 72_000],
  ['Frais de réception', 54_000],
]
const LEDGER_CREDITS: [string, number][] = [
  ['Dotation trimestrielle du ministère des Finances', 1_800_000],
  ['Subvention reçue', 750_000],
  ['Remboursement de frais de mission', 140_000],
]

export interface RegistersContext {
  rand: Rand
  today: string
  creatorId: string
  departments: Department[]
  staff: Staff[]
  partners: Partner[]
  counters: Map<string, Counter>
}

export interface SeededRegisters {
  officials: Official[]
  decrees: RegisterRow[]
  ministerialOrders: RegisterRow[]
  serviceNotes: RegisterRow[]
  incomingInvoices: RegisterRow[]
  ledgerEntries: LedgerEntry[]
}

/** Décrets, arrêtés, notes, factures et journal des opérations répartis sur 12 mois. */
export function buildRegisters(ctx: RegistersContext): SeededRegisters {
  const pick = picker(ctx.rand)
  const stamp = (date: string) => ({ createdAt: `${date}T09:00:00.000Z`, createdBy: ctx.creatorId, updatedAt: `${date}T09:00:00.000Z`, updatedBy: ctx.creatorId })
  const spread = (count: number) => Array.from({ length: count }, () => addDays(ctx.today, -Math.floor(ctx.rand() * 330) - 5)).sort()

  const officials: Official[] = [
    ...HEADS.map(([fullName, title, termStart, termEnd]) => ({ id: crypto.randomUUID(), kind: 'headOfState' as const, fullName, title, termStart, termEnd, isActive: 1 as const })),
    ...MINISTERS.map(([fullName, title, termStart]) => ({ id: crypto.randomUUID(), kind: 'minister' as const, fullName, title, termStart, isActive: 1 as const })),
  ]
  const head = officials.find((o) => o.kind === 'headOfState' && !o.termEnd)!
  const ministers = officials.filter((o) => o.kind === 'minister')

  const number = (scope: CounterScope, date: string) => {
    const year = Number(date.slice(0, 4))
    const counter = ctx.counters.get(`${scope}${year}`) ?? { scope, year, lastSeq: 0 }
    counter.lastSeq += 1
    ctx.counters.set(`${scope}${year}`, counter)
    return { year, seq: counter.lastSeq, reference: `${counter.lastSeq}/${String(year % 100).padStart(2, '0')}` }
  }

  const decrees = spread(DECREES.length).map<RegisterRow>((signedOn, i) => ({
    id: crypto.randomUUID(),
    ...number('decree', signedOn),
    officialNumber: `D-${signedOn.slice(0, 4)}-${String(i + 1).padStart(3, '0')}`,
    signedOn,
    subject: DECREES[i]!,
    officialId: head.id,
    publishedOn: addDays(signedOn, 4 + Math.floor(ctx.rand() * 10)),
    ...stamp(signedOn),
  }))

  const ministerialOrders = spread(ORDERS.length).map<RegisterRow>((signedOn, i) => ({
    id: crypto.randomUUID(),
    ...number('ministerialOrder', signedOn),
    officialNumber: `A-${signedOn.slice(0, 4)}-${String(i + 1).padStart(3, '0')}`,
    signedOn,
    subject: ORDERS[i]!,
    officialId: pick(ministers).id,
    departmentId: pick(ctx.departments).id,
    ...stamp(signedOn),
  }))

  const serviceNotes = spread(NOTES.length).map<RegisterRow>((issuedOn, i) => {
    const department = pick(ctx.departments)
    return {
      id: crypto.randomUUID(),
      ...number('serviceNote', issuedOn),
      issuedOn,
      subject: NOTES[i]![0],
      audience: NOTES[i]![1],
      departmentId: department.id,
      signedByStaffId: pick(ctx.staff.filter((s) => s.departmentId === department.id)).id,
      ...stamp(issuedOn),
    }
  })

  const suppliers = SUPPLIERS.map((name) => ctx.partners.find((p) => p.name === name)!)
  const statuses = ['paid', 'paid', 'validated', 'received', 'paid', 'rejected', 'received', 'validated']
  const incomingInvoices = spread(statuses.length).map<RegisterRow>((receivedOn, i) => ({
    id: crypto.randomUUID(),
    ...number('incomingInvoice', receivedOn),
    supplierPartnerId: suppliers[i % suppliers.length]!.id,
    invoiceNumber: `FA-${receivedOn.slice(0, 4)}-${String(100 + i * 7)}`,
    invoiceDate: addDays(receivedOn, -3),
    receivedOn,
    amount: (150_000 + Math.floor(ctx.rand() * 900) * 1000) * 100,
    dueDate: addDays(receivedOn, 30),
    status: statuses[i]!,
    departmentId: pick(ctx.departments).id,
    ...stamp(receivedOn),
  }))

  // Journal des opérations : dépenses et recettes courantes, plus le paiement de chaque facture payée.
  const ledgerEntries: LedgerEntry[] = []
  let cheque = 7000
  let order = 100
  for (const date of spread(37)) {
    const credit = ctx.rand() < 0.2
    const [label, base] = credit ? pick(LEDGER_CREDITS) : pick(LEDGER_DEBITS)
    const amount = Math.round((base * (0.8 + ctx.rand() * 0.5)) / 500) * 500 * 100
    ledgerEntries.push({
      id: crypto.randomUUID(),
      operationDate: date,
      label,
      ...(credit ? { credit: amount, debit: 0 } : { debit: amount, credit: 0, orderNumber: `CMD-${++order}`, chequeNumber: `CHQ-${++cheque}` }),
      observation: ctx.rand() < 0.25 ? 'Pièce justificative classée au dossier comptable.' : undefined,
      ...stamp(date),
    })
  }
  for (const invoice of incomingInvoices.filter((r) => r.status === 'paid')) {
    const date = addDays(String(invoice.receivedOn), 12)
    ledgerEntries.push({
      id: crypto.randomUUID(),
      operationDate: date <= ctx.today ? date : ctx.today,
      label: `Paiement de la facture ${invoice.reference}`,
      debit: Number(invoice.amount),
      credit: 0,
      orderNumber: `CMD-${++order}`,
      chequeNumber: `CHQ-${++cheque}`,
      observation: `Facture n° ${String(invoice.invoiceNumber)}`,
      ...stamp(date <= ctx.today ? date : ctx.today),
    })
  }
  ledgerEntries.sort((a, b) => a.operationDate.localeCompare(b.operationDate))

  return { officials, decrees, ministerialOrders, serviceNotes, incomingInvoices, ledgerEntries }
}
