import { Gavel, Landmark, NotebookPen, Receipt, BookOpenText, type LucideIcon } from 'lucide-react'
import type { RegisterRow, RegisterType } from '@/data/repositories/registers'
import { invoiceStatusLabels } from '@/data/schemas/registers'
import type { DocumentCategory, LinkEntityType } from '@/data/types'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/money'
import type { LookupSource, RegisterLookups } from './useRegisterLookups'

export interface FieldDef {
  name: string
  label: string
  kind: 'text' | 'textarea' | 'date' | 'money' | 'select' | 'status'
  required?: boolean
  help?: string
  /** Référentiel d'un champ de sélection. */
  source?: LookupSource
  clearLabel?: string
}

export interface Ctx {
  lookups: RegisterLookups
  currency?: string
}

export interface ColumnDef {
  key: string
  label: string
  /** Valeur en texte : affichée, recherchée et exportée. */
  value: (row: RegisterRow, ctx: Ctx) => string
  align?: 'right'
  /** Valeur de tri si elle diffère du texte (montants, dates). */
  sort?: (row: RegisterRow) => string | number
  /** Masquée sous cette largeur d'écran. */
  hideBelow?: 'xl'
}

export interface FilterDef {
  param: string
  label: string
  field: string
  source?: LookupSource
  /** Options statiques (états d'une facture). */
  options?: { value: string; label: string }[]
}

export interface RegisterConfig {
  type: RegisterType
  /** Chemin de la liste, sans barre initiale. */
  slug: string
  entityType: LinkEntityType
  category: DocumentCategory
  icon: LucideIcon
  title: string
  singular: string
  /** « un décret », « une facture » : pour les messages. */
  indefinite: string
  /** « ce décret », « cette facture » : pour les pièces jointes. */
  demonstrative: string
  addLabel: string
  /** Bouton du formulaire et message de confirmation, avec le même verbe. */
  saveLabel: string
  saved: string
  newTitle: string
  editTitle: string
  numbered: boolean
  dateField: string
  dateLabel: string
  fields: FieldDef[]
  columns: ColumnDef[]
  filters: FilterDef[]
  /** Champs inclus dans la recherche libre, en plus des colonnes. */
  searchFields: string[]
  /** Intitulé principal de la fiche. */
  heading: (row: RegisterRow) => string
  emptyText: string
}

const str = (row: RegisterRow, field: string) => (typeof row[field] === 'string' ? (row[field] as string) : '')
const date = (field: string) => (row: RegisterRow) => formatDate(str(row, field) || undefined)
const dateSort = (field: string) => (row: RegisterRow) => str(row, field)
const plain = (field: string) => (row: RegisterRow) => str(row, field) || '–'
const named = (field: string, map: 'official' | 'department' | 'staff' | 'partner') => (row: RegisterRow, ctx: Ctx) => ctx.lookups.names[map].get(str(row, field)) ?? '–'
const money = (field: string) => (row: RegisterRow) => (typeof row[field] === 'number' && (row[field] as number) > 0 ? formatMoney(row[field] as number) : '–')
const amountSort = (field: string) => (row: RegisterRow) => Number(row[field] ?? 0)
const reference = (row: RegisterRow) => row.reference ?? '–'
const seqSort = (row: RegisterRow) => (row.year ?? 0) * 1_000_000 + (row.seq ?? 0)

const statusOptions = Object.entries(invoiceStatusLabels).map(([value, label]) => ({ value, label }))

const signed: FieldDef[] = [
  { name: 'signedOn', label: 'Date de signature', kind: 'date', required: true },
  { name: 'officialNumber', label: 'N° officiel', kind: 'text', help: 'Le numéro porté par l’acte, s’il en a un.' },
]

export const registerConfigs: Record<RegisterType, RegisterConfig> = {
  decrees: {
    type: 'decrees',
    slug: 'decrets',
    entityType: 'decree',
    category: 'decree',
    icon: Landmark,
    title: 'Décrets présidentiels',
    singular: 'Décret',
    indefinite: 'un décret',
    demonstrative: 'ce décret',
    addLabel: 'Enregistrer un décret',
    saveLabel: 'Enregistrer le décret',
    saved: 'Décret enregistré',
    newTitle: 'Enregistrer un décret',
    editTitle: 'Modifier le décret',
    numbered: true,
    dateField: 'signedOn',
    dateLabel: 'Date de signature',
    fields: [
      ...signed,
      { name: 'subject', label: 'Objet', kind: 'text', required: true },
      { name: 'officialId', label: 'Signé par', kind: 'select', source: 'headsOfState', required: true },
      { name: 'publishedOn', label: 'Date de publication', kind: 'date' },
      { name: 'notes', label: 'Notes', kind: 'textarea' },
    ],
    columns: [
      { key: 'signedOn', label: 'Date', value: date('signedOn'), sort: dateSort('signedOn') },
      { key: 'reference', label: 'N°', value: reference, sort: seqSort },
      { key: 'officialNumber', label: 'N° officiel', value: plain('officialNumber'), hideBelow: 'xl' },
      { key: 'subject', label: 'Objet', value: plain('subject') },
      { key: 'official', label: 'Signé par', value: named('officialId', 'official') },
      { key: 'publishedOn', label: 'Publié le', value: date('publishedOn'), hideBelow: 'xl' },
    ],
    filters: [{ param: 'signataire', label: 'Signé par', field: 'officialId', source: 'headsOfState' }],
    searchFields: ['notes', 'officialNumber'],
    heading: (r) => str(r, 'subject'),
    emptyText: 'Les décrets enregistrés apparaîtront ici.',
  },
  ministerialOrders: {
    type: 'ministerialOrders',
    slug: 'arretes',
    entityType: 'ministerialOrder',
    category: 'ministerialOrder',
    icon: Gavel,
    title: 'Arrêtés ministériels',
    singular: 'Arrêté',
    indefinite: 'un arrêté',
    demonstrative: 'cet arrêté',
    addLabel: 'Enregistrer un arrêté',
    saveLabel: 'Enregistrer l’arrêté',
    saved: 'Arrêté enregistré',
    newTitle: 'Enregistrer un arrêté',
    editTitle: 'Modifier l’arrêté',
    numbered: true,
    dateField: 'signedOn',
    dateLabel: 'Date de signature',
    fields: [
      ...signed,
      { name: 'subject', label: 'Objet', kind: 'text', required: true },
      { name: 'officialId', label: 'Signé par', kind: 'select', source: 'ministers', required: true },
      { name: 'departmentId', label: 'Direction', kind: 'select', source: 'departments', clearLabel: 'Aucune direction' },
      { name: 'publishedOn', label: 'Date de publication', kind: 'date' },
      { name: 'notes', label: 'Notes', kind: 'textarea' },
    ],
    columns: [
      { key: 'signedOn', label: 'Date', value: date('signedOn'), sort: dateSort('signedOn') },
      { key: 'reference', label: 'N°', value: reference, sort: seqSort },
      { key: 'officialNumber', label: 'N° officiel', value: plain('officialNumber'), hideBelow: 'xl' },
      { key: 'subject', label: 'Objet', value: plain('subject') },
      { key: 'official', label: 'Signé par', value: named('officialId', 'official') },
      { key: 'department', label: 'Direction', value: named('departmentId', 'department'), hideBelow: 'xl' },
    ],
    filters: [
      { param: 'signataire', label: 'Signé par', field: 'officialId', source: 'ministers' },
      { param: 'direction', label: 'Direction', field: 'departmentId', source: 'departments' },
    ],
    searchFields: ['notes', 'officialNumber'],
    heading: (r) => str(r, 'subject'),
    emptyText: 'Les arrêtés enregistrés apparaîtront ici.',
  },
  serviceNotes: {
    type: 'serviceNotes',
    slug: 'notes-de-service',
    entityType: 'serviceNote',
    category: 'serviceNote',
    icon: NotebookPen,
    title: 'Notes de service',
    singular: 'Note de service',
    indefinite: 'une note de service',
    demonstrative: 'cette note',
    addLabel: 'Enregistrer une note',
    saveLabel: 'Enregistrer la note',
    saved: 'Note enregistrée',
    newTitle: 'Enregistrer une note de service',
    editTitle: 'Modifier la note de service',
    numbered: true,
    dateField: 'issuedOn',
    dateLabel: 'Date de la note',
    fields: [
      { name: 'issuedOn', label: 'Date de la note', kind: 'date', required: true },
      { name: 'subject', label: 'Objet', kind: 'text', required: true },
      { name: 'departmentId', label: 'Direction', kind: 'select', source: 'departments', clearLabel: 'Aucune direction' },
      { name: 'audience', label: 'Destinataires', kind: 'text', help: 'À qui la note s’adresse, par exemple « Tout le personnel ».' },
      { name: 'signedByStaffId', label: 'Signée par', kind: 'select', source: 'staff', clearLabel: 'Personne' },
    ],
    columns: [
      { key: 'issuedOn', label: 'Date', value: date('issuedOn'), sort: dateSort('issuedOn') },
      { key: 'reference', label: 'N°', value: reference, sort: seqSort },
      { key: 'subject', label: 'Objet', value: plain('subject') },
      { key: 'department', label: 'Direction', value: named('departmentId', 'department') },
      { key: 'audience', label: 'Destinataires', value: plain('audience'), hideBelow: 'xl' },
      { key: 'signedBy', label: 'Signée par', value: named('signedByStaffId', 'staff'), hideBelow: 'xl' },
    ],
    filters: [{ param: 'direction', label: 'Direction', field: 'departmentId', source: 'departments' }],
    searchFields: ['audience'],
    heading: (r) => str(r, 'subject'),
    emptyText: 'Les notes de service enregistrées apparaîtront ici.',
  },
  incomingInvoices: {
    type: 'incomingInvoices',
    slug: 'factures',
    entityType: 'incomingInvoice',
    category: 'invoice',
    icon: Receipt,
    title: 'Factures arrivées',
    singular: 'Facture',
    indefinite: 'une facture',
    demonstrative: 'cette facture',
    addLabel: 'Enregistrer une facture',
    saveLabel: 'Enregistrer la facture',
    saved: 'Facture enregistrée',
    newTitle: 'Enregistrer une facture arrivée',
    editTitle: 'Modifier la facture',
    numbered: true,
    dateField: 'receivedOn',
    dateLabel: 'Date de réception',
    fields: [
      { name: 'receivedOn', label: 'Reçue le', kind: 'date', required: true },
      { name: 'supplierPartnerId', label: 'Fournisseur', kind: 'select', source: 'partners', required: true },
      { name: 'invoiceNumber', label: 'N° de facture', kind: 'text' },
      { name: 'invoiceDate', label: 'Date de la facture', kind: 'date', required: true },
      { name: 'amount', label: 'Montant', kind: 'money', required: true },
      { name: 'dueDate', label: 'Échéance', kind: 'date' },
      { name: 'status', label: 'État', kind: 'status', required: true },
      { name: 'departmentId', label: 'Direction', kind: 'select', source: 'departments', clearLabel: 'Aucune direction' },
    ],
    columns: [
      { key: 'receivedOn', label: 'Reçue le', value: date('receivedOn'), sort: dateSort('receivedOn') },
      { key: 'reference', label: 'N°', value: reference, sort: seqSort },
      { key: 'supplier', label: 'Fournisseur', value: named('supplierPartnerId', 'partner') },
      { key: 'invoiceNumber', label: 'N° de facture', value: plain('invoiceNumber'), hideBelow: 'xl' },
      { key: 'invoiceDate', label: 'Date facture', value: date('invoiceDate'), sort: dateSort('invoiceDate'), hideBelow: 'xl' },
      { key: 'amount', label: 'Montant', value: money('amount'), sort: amountSort('amount'), align: 'right' },
      { key: 'dueDate', label: 'Échéance', value: date('dueDate'), sort: dateSort('dueDate'), hideBelow: 'xl' },
      { key: 'status', label: 'État', value: (r) => invoiceStatusLabels[str(r, 'status') as keyof typeof invoiceStatusLabels] ?? '–' },
    ],
    filters: [
      { param: 'fournisseur', label: 'Fournisseur', field: 'supplierPartnerId', source: 'partners' },
      { param: 'etat', label: 'État', field: 'status', options: statusOptions },
    ],
    searchFields: ['invoiceNumber'],
    heading: (r) => `Facture ${r.reference ?? ''}${r.invoiceNumber ? `, n° ${String(r.invoiceNumber)}` : ''}`,
    emptyText: 'Les factures enregistrées apparaîtront ici.',
  },
  ledgerEntries: {
    type: 'ledgerEntries',
    slug: 'journal-operations',
    entityType: 'ledgerEntry',
    category: 'ledger',
    icon: BookOpenText,
    title: 'Journal des opérations',
    singular: 'Écriture',
    indefinite: 'une écriture',
    demonstrative: 'cette écriture',
    addLabel: 'Enregistrer une opération',
    saveLabel: 'Enregistrer l’opération',
    saved: 'Opération enregistrée',
    newTitle: 'Enregistrer une opération',
    editTitle: 'Modifier l’opération',
    numbered: false,
    dateField: 'operationDate',
    dateLabel: 'Date de l’opération',
    fields: [
      { name: 'operationDate', label: 'Date de l’opération', kind: 'date', required: true },
      { name: 'orderNumber', label: 'N° de commande', kind: 'text' },
      { name: 'chequeNumber', label: 'N° de chèque', kind: 'text' },
      { name: 'label', label: 'Intitulé de l’opération', kind: 'text', required: true },
      { name: 'debit', label: 'Débit', kind: 'money' },
      { name: 'credit', label: 'Crédit', kind: 'money' },
      { name: 'observation', label: 'Observation', kind: 'textarea' },
    ],
    columns: [
      { key: 'operationDate', label: 'Date', value: date('operationDate'), sort: dateSort('operationDate') },
      { key: 'orderNumber', label: 'N° commande', value: plain('orderNumber') },
      { key: 'chequeNumber', label: 'N° chèque', value: plain('chequeNumber') },
      { key: 'label', label: 'Intitulé', value: plain('label') },
      { key: 'debit', label: 'Débit', value: money('debit'), sort: amountSort('debit'), align: 'right' },
      { key: 'credit', label: 'Crédit', value: money('credit'), sort: amountSort('credit'), align: 'right' },
    ],
    filters: [],
    searchFields: ['observation'],
    heading: (r) => str(r, 'label'),
    emptyText: 'Les opérations enregistrées apparaîtront ici.',
  },
}

export const registerList = Object.values(registerConfigs)

export const configBySlug = (slug: string) => registerList.find((c) => c.slug === slug)
