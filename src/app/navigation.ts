import {
  Archive,
  Inbox,
  BookOpenText,
  Building2,
  DatabaseBackup,
  FolderInput,
  Gavel,
  History,
  Landmark,
  LayoutGrid,
  NotebookPen,
  Receipt,
  Search,
  Send,
  Settings,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/data/types'

export type NavItem = { label: string; to: string; icon: LucideIcon; title: string; description: string; activePrefix?: string }
export type NavGroup = { label: string; items: NavItem[] }

export const navigation: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { label: 'Tableau de bord', to: '/tableau-de-bord', icon: LayoutGrid, title: 'Tableau de bord', description: "L'activité du bureau d'ordre." },
      { label: 'Recherche', to: '/recherche', icon: Search, title: 'Recherche', description: 'Courriers et documents, texte des pages compris.' },
    ],
  },
  {
    label: 'Courriers',
    items: [
      { label: 'Courriers arrivés', to: '/courriers/arrives', icon: Inbox, title: 'Courriers arrivés', description: 'Les courriers reçus par le bureau d’ordre.' },
      { label: 'Courriers départ', to: '/courriers/departs', icon: Send, title: 'Courriers départ', description: 'Les courriers envoyés par le bureau d’ordre.' },
    ],
  },
  {
    label: 'Actes et documents',
    items: [
      { label: 'Décrets présidentiels', to: '/decrets', icon: Landmark, title: 'Décrets présidentiels', description: 'Registre des décrets.' },
      { label: 'Arrêtés ministériels', to: '/arretes', icon: Gavel, title: 'Arrêtés ministériels', description: 'Registre des arrêtés.' },
      { label: 'Notes de service', to: '/notes-de-service', icon: NotebookPen, title: 'Notes de service', description: 'Registre des notes de service.' },
      { label: 'Factures arrivées', to: '/factures', icon: Receipt, title: 'Factures arrivées', description: 'Registre des factures reçues.' },
      { label: 'Journal des opérations', to: '/journal-operations', icon: BookOpenText, title: 'Journal des opérations', description: 'Opérations de caisse et de banque.' },
    ],
  },
  {
    label: 'Archives',
    items: [
      { label: 'Tous les documents', to: '/documents', icon: Archive, title: 'Tous les documents', description: 'Les documents archivés dans ce navigateur.' },
      { label: 'Importer des documents', to: '/archivage', icon: FolderInput, title: 'Importer des documents', description: 'Ajoutez des PDF et des images par lot.' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Historique des opérations', to: '/historique', icon: History, title: 'Historique des opérations', description: 'Toutes les actions enregistrées.' },
      { label: 'Référentiels', to: '/referentiels/directions', icon: Building2, title: 'Référentiels', activePrefix: '/referentiels', description: 'Directions, collaborateurs, partenaires et listes.' },
      { label: 'Utilisateurs', to: '/utilisateurs', icon: UserCog, title: 'Utilisateurs', description: 'Comptes locaux et rôles.' },
      { label: 'Sauvegarde et restauration', to: '/sauvegarde', icon: DatabaseBackup, title: 'Sauvegarde et restauration', description: 'Les données ne sont enregistrées que dans ce navigateur.' },
      { label: 'Paramètres', to: '/parametres', icon: Settings, title: 'Paramètres', description: "Organisation, numérotation, lecture OCR." },
    ],
  },
]

export const allItems = navigation.flatMap((g) => g.items)

/** Routes réservées à certains rôles (DOMAIN.md §3). Les autres sont ouvertes à tous les comptes. */
const restricted: Record<string, Role[]> = {
  '/archivage': ['admin', 'archivist'],
  '/referentiels/directions': ['admin', 'archivist'],
  '/utilisateurs': ['admin'],
  '/sauvegarde': ['admin'],
  '/parametres': ['admin'],
}

export function canAccess(item: NavItem, role: Role): boolean {
  return restricted[item.to]?.includes(role) ?? true
}
