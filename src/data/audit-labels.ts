import { formatMoney } from '@/lib/money'
import type { AuditEntry } from './types'

const fixed: Record<string, string> = {
  'auth.signedIn': 's’est connecté',
  'auth.signedOut': 's’est déconnecté',
  'auth.signInFailed': 'a échoué à se connecter',
  'auth.locked': 'a verrouillé la session',
  'auth.unlocked': 'a déverrouillé la session',
  'auth.passwordChanged': 'a changé son mot de passe',
  'mail.created': 'a enregistré le courrier',
  'mail.updated': 'a modifié le courrier',
  'mail.processed': 'a marqué le courrier comme traité',
  'mail.deleted': 'a supprimé le courrier',
  'mail.restored': 'a restauré le courrier',
  'document.imported': 'a importé le document',
  'document.duplicateRejected': 'a tenté d’importer un doublon',
  'document.ocrCompleted': 'a terminé la lecture du document',
  'document.ocrFailed': 'n’a pas pu lire le document',
  'document.viewed': 'a consulté le document',
  'document.downloaded': 'a téléchargé le document',
  'document.printed': 'a imprimé le document',
  'document.linked': 'a rattaché le document',
  'document.unlinked': 'a détaché le document',
  'document.updated': 'a modifié le document',
  'document.rotated': 'a pivoté le document',
  'document.deleted': 'a supprimé le document',
  'document.restored': 'a restauré le document',
  'referenceData.created': 'a ajouté à un référentiel',
  'referenceData.updated': 'a modifié un référentiel',
  'referenceData.deactivated': 'a désactivé dans un référentiel',
  'user.created': 'a créé le compte',
  'user.roleChanged': 'a changé le rôle du compte',
  'user.updated': 'a modifié le compte',
  'user.deactivated': 'a désactivé le compte',
  'user.reactivated': 'a réactivé le compte',
  'user.passwordReset': 'a réinitialisé le mot de passe du compte',
  'export.generated': 'a exporté des données',
  'audit.exported': 'a exporté l’historique',
  'audit.verified': 'a vérifié l’intégrité de l’historique',
  'backup.exported': 'a sauvegardé les données',
  'backup.restored': 'a restauré une sauvegarde',
  'settings.updated': 'a modifié les paramètres',
  'demo.loaded': 'a chargé les données de démonstration',
  'legacy.imported': 'a importé des données WinDev',
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? 'vide' : String(v))

/** Phrase française d'une entrée du journal, sans le nom de l'auteur (« a changé la position : A → B »). */
export function describeAudit(entry: AuditEntry): string {
  if (entry.action === 'mail.positionChanged') {
    const [from, to] = entry.changes?.position ?? []
    return `a changé la position : ${show(from)} → ${show(to)}`
  }
  const verb = fixed[entry.action]
  if (verb) return verb
  const [family, op] = entry.action.split('.')
  const ops: Record<string, string> = { created: 'a créé', updated: 'a modifié', deleted: 'a supprimé', restored: 'a restauré' }
  return `${ops[op ?? ''] ?? 'a effectué une action sur'} ${family === 'decree' ? 'le décret' : family === 'ministerialOrder' ? 'l’arrêté' : family === 'serviceNote' ? 'la note de service' : family === 'incomingInvoice' ? 'la facture' : 'l’écriture du journal'}`
}

const FIELDS: Record<string, string> = {
  subject: 'Objet',
  mailDate: 'Date',
  fileNumber: 'N° dossier',
  staffJobTitle: 'Fonction',
  isProcessed: 'Traité',
  processedAt: 'Traité le',
  confidentiality: 'Confidentialité',
  position: 'Position',
  department: 'Direction',
  assignedStaff: 'Au bureau de',
  signedByStaff: 'Paraphé par',
  sourcePartner: 'Provenance',
  recipientPartner: 'Adressé à',
  recipientLabel: 'Adressé à (libellé libre)',
  mailType: 'Type',
  followUp: 'Suivi',
  title: 'Titre',
  rotation: 'Rotation',
  isActive: 'Actif',
  role: 'Rôle',
  fullName: 'Nom complet',
  staffId: 'Collaborateur lié',
  name: 'Nom',
  code: 'Code',
  label: 'Libellé',
  sortOrder: 'Ordre',
  jobTitle: 'Fonction',
  email: 'E-mail',
  kind: 'Type',
  termStart: 'Début du mandat',
  termEnd: 'Fin du mandat',
  organizationName: "Nom de l'organisation",
  appName: "Nom de l'application",
  timezone: 'Fuseau horaire',
  referenceFormats: 'Formats de numérotation',
  ocrLanguages: 'Langues de lecture',
  maxUploadMb: 'Taille maximale (Mo)',
  currency: 'Devise',
  staleAfterDays: 'Seuil de retard (jours)',
  lockAfterMinutes: 'Verrouillage (minutes)',
  officialNumber: 'N° officiel',
  signedOn: 'Date de signature',
  publishedOn: 'Date de publication',
  notes: 'Notes',
  official: 'Signataire',
  issuedOn: 'Date de la note',
  audience: 'Destinataires',
  supplierPartner: 'Fournisseur',
  invoiceNumber: 'N° de facture',
  invoiceDate: 'Date de la facture',
  receivedOn: 'Date de réception',
  amount: 'Montant',
  dueDate: 'Échéance',
  status: 'État',
  operationDate: 'Date',
  orderNumber: 'N° de commande',
  chequeNumber: 'N° de chèque',
  debit: 'Débit',
  credit: 'Crédit',
  observation: 'Observation',
}

export const fieldLabel = (key: string) => FIELDS[key] ?? key

const BOOLEAN_FIELDS = new Set(['isProcessed', 'isActive'])
const MONEY_FIELDS = new Set(['amount', 'debit', 'credit'])
const VALUES: Record<string, string> = {
  normal: 'Normal',
  restricted: 'Restreint',
  admin: 'Administrateur',
  archivist: 'Archiviste',
  reader: 'Lecteur',
  received: 'Reçue',
  validated: 'Validée',
  paid: 'Payée',
  rejected: 'Rejetée',
}

/** Valeur d'un diff lisible : « vide », oui ou non pour les 0 et 1, rôles et confidentialité en français. */
export function formatChangeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'vide'
  if (BOOLEAN_FIELDS.has(key)) return value === 1 || value === true ? 'oui' : 'non'
  if (MONEY_FIELDS.has(key) && typeof value === 'number') return formatMoney(value)
  if (typeof value === 'string') return VALUES[value] ?? value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
