import { Briefcase, Building2, Flag, Handshake, ListChecks, MapPin, Tags, Users, type LucideIcon } from 'lucide-react'
import type { ReferenceType } from '@/data/repositories/referenceData'
import { partnerKindLabels } from '@/data/schemas/reference'
import { formatDate } from '@/lib/format'

export interface FieldConfig {
  name: string
  label: string
  kind: 'text' | 'email' | 'date' | 'number' | 'select'
  required?: boolean
  help?: string
  options?: { value: string; label: string }[]
  /** Options tirées d'un autre référentiel (valeur = identifiant). */
  optionsFrom?: ReferenceType
  emptyLabel?: string
}

export interface ColumnSpec {
  key: string
  label: string
  /** Mise en forme de la valeur ; reçoit la ligne et les libellés des directions. */
  format?: (row: Record<string, unknown>, lookups: { departments: Map<string, string> }) => string
  sortable?: boolean
}

export interface ReferenceConfig {
  type: ReferenceType
  slug: string
  tab: string
  icon: LucideIcon
  title: string
  description: string
  addLabel: string
  newTitle: string
  editTitle: string
  saved: string
  searchLabel: string
  emptyTitle: string
  emptyText: string
  fields: FieldConfig[]
  columns: ColumnSpec[]
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const mandate = (row: Record<string, unknown>) => {
  const start = str(row.termStart)
  const end = str(row.termEnd)
  if (!start && !end) return '–'
  return `${start ? formatDate(start) : '…'} au ${end ? formatDate(end) : 'aujourd’hui'}`
}

const officialFields: FieldConfig[] = [
  { name: 'fullName', label: 'Nom complet', kind: 'text', required: true },
  { name: 'title', label: 'Titre ou fonction', kind: 'text' },
  { name: 'termStart', label: 'Début du mandat', kind: 'date' },
  { name: 'termEnd', label: 'Fin du mandat', kind: 'date' },
]
const officialColumns: ColumnSpec[] = [
  { key: 'fullName', label: 'Nom', sortable: true },
  { key: 'title', label: 'Titre' },
  { key: 'termStart', label: 'Mandat', format: mandate },
]

const lookupFields: FieldConfig[] = [
  { name: 'label', label: 'Libellé', kind: 'text', required: true },
  { name: 'sortOrder', label: 'Ordre d’affichage', kind: 'number', help: 'Laissez vide pour ajouter à la fin de la liste.' },
]
const lookupColumns: ColumnSpec[] = [
  { key: 'label', label: 'Libellé', sortable: true },
  { key: 'sortOrder', label: 'Ordre', sortable: true },
]

export const referenceConfigs: ReferenceConfig[] = [
  {
    type: 'departments',
    slug: 'directions',
    tab: 'Directions',
    icon: Building2,
    title: 'Directions',
    description: 'Les services destinataires et émetteurs des courriers.',
    addLabel: 'Ajouter une direction',
    newTitle: 'Nouvelle direction',
    editTitle: 'Modifier la direction',
    saved: 'Direction enregistrée',
    searchLabel: 'Rechercher une direction',
    emptyTitle: 'Aucune direction',
    emptyText: 'Ajoutez les directions pour pouvoir les choisir dans les courriers.',
    fields: [
      { name: 'name', label: 'Nom de la direction', kind: 'text', required: true },
      { name: 'code', label: 'Code', kind: 'text', help: 'Abréviation facultative, par exemple DAF.' },
    ],
    columns: [
      { key: 'name', label: 'Direction', sortable: true },
      { key: 'code', label: 'Code' },
    ],
  },
  {
    type: 'staff',
    slug: 'collaborateurs',
    tab: 'Collaborateurs',
    icon: Users,
    title: 'Collaborateurs',
    description: 'Le personnel destinataire ou signataire des courriers.',
    addLabel: 'Ajouter un collaborateur',
    newTitle: 'Nouveau collaborateur',
    editTitle: 'Modifier le collaborateur',
    saved: 'Collaborateur enregistré',
    searchLabel: 'Rechercher un collaborateur',
    emptyTitle: 'Aucun collaborateur',
    emptyText: 'Ajoutez le personnel pour l’indiquer comme destinataire ou signataire.',
    fields: [
      { name: 'fullName', label: 'Nom complet', kind: 'text', required: true },
      { name: 'jobTitle', label: 'Fonction occupée', kind: 'text' },
      { name: 'departmentId', label: 'Direction', kind: 'select', optionsFrom: 'departments', emptyLabel: 'Aucune direction' },
      { name: 'email', label: 'Adresse e-mail', kind: 'email' },
    ],
    columns: [
      { key: 'fullName', label: 'Nom', sortable: true },
      { key: 'jobTitle', label: 'Fonction' },
      { key: 'departmentId', label: 'Direction', format: (row, l) => l.departments.get(str(row.departmentId)) ?? '–' },
      { key: 'email', label: 'E-mail' },
    ],
  },
  {
    type: 'partners',
    slug: 'partenaires',
    tab: 'Partenaires',
    icon: Handshake,
    title: 'Partenaires',
    description: 'Les organismes et personnes dont viennent ou vers qui partent les courriers.',
    addLabel: 'Ajouter un partenaire',
    newTitle: 'Nouveau partenaire',
    editTitle: 'Modifier le partenaire',
    saved: 'Partenaire enregistré',
    searchLabel: 'Rechercher un partenaire',
    emptyTitle: 'Aucun partenaire',
    emptyText: 'Ajoutez les expéditeurs et destinataires habituels des courriers.',
    fields: [
      { name: 'name', label: 'Nom', kind: 'text', required: true },
      {
        name: 'kind',
        label: 'Type de partenaire',
        kind: 'select',
        required: true,
        emptyLabel: 'Choisir un type',
        options: Object.entries(partnerKindLabels).map(([value, label]) => ({ value, label })),
      },
    ],
    columns: [
      { key: 'name', label: 'Partenaire', sortable: true },
      { key: 'kind', label: 'Type', format: (row) => partnerKindLabels[str(row.kind) as keyof typeof partnerKindLabels] ?? '–', sortable: true },
    ],
  },
  {
    type: 'headsOfState',
    slug: 'chefs-etat',
    tab: 'Chefs de l’État',
    icon: Flag,
    title: 'Chefs de l’État',
    description: 'Les signataires des décrets présidentiels.',
    addLabel: 'Ajouter un chef de l’État',
    newTitle: 'Nouveau chef de l’État',
    editTitle: 'Modifier le chef de l’État',
    saved: 'Chef de l’État enregistré',
    searchLabel: 'Rechercher un chef de l’État',
    emptyTitle: 'Aucun chef de l’État',
    emptyText: 'Ajoutez les signataires pour renseigner les décrets.',
    fields: officialFields,
    columns: officialColumns,
  },
  {
    type: 'ministers',
    slug: 'ministres',
    tab: 'Ministres',
    icon: Briefcase,
    title: 'Ministres',
    description: 'Les signataires des arrêtés ministériels.',
    addLabel: 'Ajouter un ministre',
    newTitle: 'Nouveau ministre',
    editTitle: 'Modifier le ministre',
    saved: 'Ministre enregistré',
    searchLabel: 'Rechercher un ministre',
    emptyTitle: 'Aucun ministre',
    emptyText: 'Ajoutez les signataires pour renseigner les arrêtés.',
    fields: officialFields,
    columns: officialColumns,
  },
  {
    type: 'mailTypes',
    slug: 'types-courrier',
    tab: 'Types de courrier',
    icon: Tags,
    title: 'Types de courrier',
    description: 'La nature des courriers : lettre, note, invitation…',
    addLabel: 'Ajouter un type',
    newTitle: 'Nouveau type de courrier',
    editTitle: 'Modifier le type de courrier',
    saved: 'Type de courrier enregistré',
    searchLabel: 'Rechercher un type de courrier',
    emptyTitle: 'Aucun type de courrier',
    emptyText: 'Ajoutez les types pour classer les courriers arrivés.',
    fields: lookupFields,
    columns: lookupColumns,
  },
  {
    type: 'followUps',
    slug: 'suivis',
    tab: 'Suivis',
    icon: ListChecks,
    title: 'Suivis',
    description: 'Ce qui est attendu d’un courrier : à traiter, pour avis, urgent…',
    addLabel: 'Ajouter un suivi',
    newTitle: 'Nouveau suivi',
    editTitle: 'Modifier le suivi',
    saved: 'Suivi enregistré',
    searchLabel: 'Rechercher un suivi',
    emptyTitle: 'Aucun suivi',
    emptyText: 'Ajoutez les suivis pour indiquer ce qui est attendu de chaque courrier.',
    fields: lookupFields,
    columns: lookupColumns,
  },
  {
    type: 'positions',
    slug: 'positions',
    tab: 'Positions',
    icon: MapPin,
    title: 'Positions',
    description: 'Où se trouve un courrier : au cabinet, en traitement, classé…',
    addLabel: 'Ajouter une position',
    newTitle: 'Nouvelle position',
    editTitle: 'Modifier la position',
    saved: 'Position enregistrée',
    searchLabel: 'Rechercher une position',
    emptyTitle: 'Aucune position',
    emptyText: 'Ajoutez les positions pour suivre le parcours des courriers.',
    fields: lookupFields,
    columns: lookupColumns,
  },
]

export function configBySlug(slug: string | undefined) {
  return referenceConfigs.find((c) => c.slug === slug)
}
