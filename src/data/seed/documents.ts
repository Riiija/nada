import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sha256Stream } from '@/lib/import/hash'
import { addDays } from '@/lib/dates'
import type { RegisterRow } from '../repositories/registers'
import type { DocumentCategory, DocumentLink, DocumentPage, DocumentRecord, LinkEntityType, LedgerEntry, Mail, StoredFile, Thumbnail } from '../types'
import type { Rand } from './rng'
import { picker } from './rng'
import type { DemoDeps, ImageSpec } from './types'

type Link = 'mail-in' | 'mail-out' | 'decree' | 'order' | 'invoice' | 'ledger' | 'none'

interface Spec {
  title: string
  filename: string
  kind: 'text-pdf' | 'image-pdf' | 'png' | 'jpeg'
  category: DocumentCategory
  link: Link
  /** Début du sujet du courrier auquel le document se rapporte, pour que la pièce jointe soit cohérente. */
  match?: string
  /** Texte de chaque page, une ligne par élément. */
  pages: string[][]
  /** Les trois documents image laissés « en attente » pour montrer la lecture OCR. */
  pending?: boolean
}

const TEXT_PDFS: Spec[] = [
  { title: 'Fiche comptable du premier trimestre', filename: 'fiche-comptable-t1.pdf', kind: 'text-pdf', category: 'archive', link: 'ledger', pages: [['FICHE COMPTABLE, PREMIER TRIMESTRE', 'Dotation reçue : 1 800 000', 'Dépenses de fonctionnement : 1 126 500', 'Solde disponible : 673 500', 'Visa du chef du service comptable.'], ['Détail des dépenses', 'Fournitures de bureau : 255 000', 'Maintenance informatique : 420 000', 'Frais de mission : 451 500']] },
  { title: 'Rapport sur le recouvrement des prêts', filename: 'rapport-recouvrement-prets.pdf', match: 'Recouvrement des prêts', kind: 'text-pdf', category: 'archive', link: 'mail-in', pages: [['RAPPORT SUR LE RECOUVREMENT DES PRÊTS', 'Le recouvrement des prêts consentis aux agents a progressé de douze pour cent au cours du dernier semestre.', 'Les retards de remboursement concernent principalement les prêts de plus de trois ans.'], ['Recommandations', 'Mettre en place un moyen de paiement par prélèvement sur salaire.', 'Relancer les débiteurs par courrier recommandé.'], ['Annexe : tableau des remboursements par direction.']] },
  { title: 'Convention de partenariat avec l’UNICEF', filename: 'convention-unicef.pdf', match: 'Visite du musée', kind: 'text-pdf', category: 'archive', link: 'mail-in', pages: [['CONVENTION DE PARTENARIAT', 'Entre le ministère et le Fonds des Nations unies pour l’enfance.', 'Article premier : objet de la convention.', 'La présente convention fixe les conditions de la visite du musée national par les élèves des écoles partenaires.'], ['Article 2 : durée et reconduction.', 'La convention est conclue pour une durée de trois ans.']] },
  { title: 'Décret portant organisation du ministère', filename: 'decret-organisation-ministere.pdf', kind: 'text-pdf', category: 'decree', link: 'decree', pages: [['DÉCRET PORTANT ORGANISATION DU MINISTÈRE', 'Vu la Constitution ;', 'Sur proposition du ministre de la Fonction publique ;', 'Le Président de la République décrète :'], ['Article premier : le ministère comprend un cabinet, un secrétariat général et cinq directions.']] },
  { title: 'Arrêté fixant les horaires du bureau d’ordre', filename: 'arrete-horaires-bureau-ordre.pdf', kind: 'text-pdf', category: 'ministerialOrder', link: 'order', pages: [['ARRÊTÉ FIXANT LES HORAIRES DE SERVICE DU BUREAU D’ORDRE', 'Le bureau d’ordre reçoit le courrier du lundi au vendredi, de huit heures à seize heures.', 'Les courriers urgents sont enregistrés sans délai.']] },
  { title: 'Note de service sur la conservation des originaux', filename: 'note-conservation-originaux.pdf', kind: 'text-pdf', category: 'serviceNote', link: 'none', pages: [['NOTE DE SERVICE', 'Objet : conservation des documents originaux.', 'Les originaux reçus par le bureau d’ordre sont archivés dans les trente jours suivant leur traitement.', 'Une copie numérique est jointe à chaque courrier enregistré.']] },
  { title: 'Facture de fournitures de bureau', filename: 'facture-fournitures-bureau.pdf', kind: 'text-pdf', category: 'invoice', link: 'invoice', pages: [['FACTURE', 'Société Horizon Fournitures', 'Fournitures de bureau pour le secrétariat général.', 'Montant à payer sous trente jours.', 'Merci de joindre le bon de commande au règlement.']] },
  { title: 'Compte rendu de la mission à New York', filename: 'compte-rendu-mission-new-york.pdf', match: 'Compte rendu de mission', kind: 'text-pdf', category: 'archive', link: 'mail-out', pages: [['COMPTE RENDU DE MISSION', 'La délégation a rencontré la mission permanente à New York.', 'Les discussions ont porté sur la demande de subvention et l’invitation à la conférence annuelle.'], ['Suites à donner : transmettre le budget prévisionnel avant la fin du mois.']] },
  { title: 'Programme de formation du personnel', filename: 'programme-formation-personnel.pdf', match: 'Programme de formation', kind: 'text-pdf', category: 'archive', link: 'mail-in', pages: [['PROGRAMME DE FORMATION DU PERSONNEL', 'Module 1 : gestion du courrier et des archives.', 'Module 2 : initiation aux outils numériques.', 'Module 3 : rédaction administrative.'], ['Calendrier : une session par trimestre, de trois jours.']] },
  { title: 'Budget prévisionnel de l’exercice', filename: 'budget-previsionnel.pdf', match: 'Transmission du budget', kind: 'text-pdf', category: 'archive', link: 'mail-out', pages: [['BUDGET PRÉVISIONNEL DE L’EXERCICE', 'Recettes attendues : 7 200 000.', 'Dépenses de personnel : 4 100 000.', 'Dépenses de fonctionnement : 2 300 000.'], ['Investissements : 800 000, dont le renouvellement du parc informatique.']] },
]

const IMAGE_PDFS: Spec[] = [
  { title: 'Courrier de la Banque centrale sur le moyen de paiement', filename: 'courrier-banque-centrale.pdf', match: 'Moyen de paiement', kind: 'image-pdf', category: 'mailAttachment', link: 'mail-in', pages: [['BANQUE CENTRALE', 'Objet : moyen de paiement', 'Nous vous informons que le règlement des factures se fera désormais par virement.', 'Veuillez agréer nos salutations distinguées.']] },
  { title: 'Lettre du PNUD, demande d’audience', filename: 'lettre-pnud-audience.pdf', match: 'Demande d’audience', kind: 'image-pdf', category: 'mailAttachment', link: 'mail-in', pages: [['PROGRAMME DES NATIONS UNIES POUR LE DÉVELOPPEMENT', 'Objet : demande d’audience', 'Le représentant résident sollicite un entretien avec le secrétaire général.'], ['Pièce jointe : ordre du jour proposé.']] },
  { title: 'Invitation à la conférence annuelle', filename: 'invitation-conference-annuelle.pdf', match: 'Invitation à la conférence', kind: 'image-pdf', category: 'mailAttachment', link: 'mail-in', pages: [['INVITATION', 'Vous êtes invité à la conférence annuelle sur la modernisation de l’administration.', 'Réponse souhaitée avant le quinze du mois.']] },
  { title: 'Avis sur le projet de décret', filename: 'avis-projet-decret.pdf', match: 'Avis sur le projet', kind: 'image-pdf', category: 'mailAttachment', link: 'mail-out', pages: [['AVIS SUR LE PROJET DE DÉCRET', 'Après examen, la direction juridique n’a pas d’objection.', 'Elle recommande de préciser l’article trois.']] },
  { title: 'Bon de commande de fournitures', filename: 'bon-de-commande-fournitures.pdf', kind: 'image-pdf', category: 'ledger', link: 'ledger', pages: [['BON DE COMMANDE', 'Fournitures de bureau, papier et cartouches.', 'Livraison au secrétariat général.']] },
  { title: 'Facture du cabinet d’audit', filename: 'facture-cabinet-audit.pdf', kind: 'image-pdf', category: 'invoice', link: 'invoice', pages: [['CABINET D’AUDIT LUMIÈRE', 'Honoraires de la mission d’audit des comptes.', 'Règlement à trente jours.']] },
]

const IMAGES: Spec[] = [
  { title: 'Courrier reçu, visite du musée', filename: 'courrier-visite-musee.png', match: 'Visite du musée', kind: 'png', category: 'mailAttachment', link: 'mail-in', pages: [['MUSÉE NATIONAL', 'Objet : visite du musée', 'Nous avons le plaisir de vous proposer une visite guidée pour vos équipes.']] },
  { title: 'Courrier reçu, fiche comptable', filename: 'courrier-fiche-comptable.png', match: 'Fiche comptable', kind: 'png', category: 'mailAttachment', link: 'mail-in', pages: [['DIRECTION DU BUDGET', 'Objet : fiche comptable', 'Veuillez trouver ci-joint la fiche comptable du mois écoulé.']] },
  { title: 'Courrier reçu, renouvellement du contrat', filename: 'courrier-renouvellement-contrat.jpg', match: 'Renouvellement du contrat', kind: 'jpeg', category: 'mailAttachment', link: 'mail-in', pages: [['SOCIÉTÉ HORIZON FOURNITURES', 'Objet : renouvellement du contrat de maintenance', 'Le contrat arrive à échéance le trente du mois prochain.']] },
  { title: 'Courrier reçu, convocation du comité', filename: 'courrier-convocation-comite.jpg', match: 'Convocation du comité', kind: 'jpeg', category: 'mailAttachment', link: 'mail-in', pages: [['SECRÉTARIAT GÉNÉRAL', 'CONVOCATION', 'Le comité de pilotage se réunira jeudi à neuf heures, salle des conseils.']] },
  { title: 'Réponse, nomination d’un point focal', filename: 'reponse-point-focal.png', match: 'Nomination d’un point focal', kind: 'png', category: 'mailAttachment', link: 'mail-out', pages: [['MINISTÈRE, BUREAU D’ORDRE', 'Objet : nomination d’un point focal', 'Nous avons désigné un point focal pour le suivi de ce dossier.']] },
  { title: 'Note manuscrite, rapport d’activité', filename: 'note-rapport-activite.jpg', kind: 'jpeg', category: 'archive', link: 'none', pages: [['RAPPORT D’ACTIVITÉ DU TRIMESTRE', 'Courriers enregistrés : 412', 'Documents archivés : 187']] },
  { title: 'Courrier à lire, demande de subvention', filename: 'courrier-demande-subvention.png', match: 'Demande de subvention', kind: 'png', category: 'mailAttachment', link: 'mail-in', pending: true, pages: [['ASSOCIATION DES AMIS DU MUSÉE', 'Objet : demande de subvention', 'Nous sollicitons une aide pour l’exposition de l’automne.']] },
  { title: 'Courrier à lire, transmission du budget', filename: 'courrier-transmission-budget.png', match: 'Transmission du budget', kind: 'png', category: 'mailAttachment', link: 'mail-in', pending: true, pages: [['DIRECTION DU BUDGET', 'Objet : transmission du budget prévisionnel', 'Veuillez trouver le projet de budget pour avis.']] },
  { title: 'Courrier à lire, recouvrement des prêts', filename: 'courrier-recouvrement-prets.png', match: 'Recouvrement des prêts', kind: 'png', category: 'mailAttachment', link: 'mail-in', pending: true, pages: [['DIRECTION DES RESSOURCES HUMAINES', 'Objet : recouvrement des prêts', 'Merci de nous transmettre l’état des retenues sur salaire.']] },
]

const A4 = { width: 595.28, height: 841.89 }

function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word
    if (measure(attempt) > width && line) {
      out.push(line)
      line = word
    } else {
      line = attempt
    }
  }
  if (line) out.push(line)
  return out
}

/** PDF avec couche texte : le texte est lisible tout de suite, sans OCR. */
async function textPdf(title: string, pages: string[][]): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  for (const lines of pages) {
    const page = pdf.addPage([A4.width, A4.height])
    let y = A4.height - 90
    lines.forEach((text, i) => {
      const heading = i === 0
      const f = heading ? bold : font
      const size = heading ? 15 : 11.5
      for (const line of wrap(text, A4.width - 120, (s) => f.widthOfTextAtSize(s, size))) {
        page.drawText(line, { x: 60, y, size, font: f, color: rgb(0.09, 0.09, 0.1) })
        y -= heading ? 30 : 18
      }
      y -= heading ? 6 : 8
    })
  }
  return new Uint8Array(await pdf.save())
}

/** PDF composé uniquement d'images : sans couche texte, il passe par l'OCR. */
async function imagePdf(title: string, renders: Blob[]): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  for (const blob of renders) {
    const image = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()))
    const page = pdf.addPage([A4.width, A4.height])
    page.drawImage(image, { x: 0, y: 0, width: A4.width, height: A4.height })
  }
  return new Uint8Array(await pdf.save())
}

function pageSpec(lines: string[], format: ImageSpec['format'], rand: Rand): ImageSpec {
  return {
    width: 1240,
    height: 1754,
    format,
    tilt: (rand() - 0.5) * 0.8,
    lines: lines.map((text, i) => ({ text, size: i === 0 ? 46 : 34, bold: i === 0, align: i === 0 ? 'center' : 'left', gap: i === 0 ? 70 : 30 })),
  }
}

export interface DocumentsContext {
  rand: Rand
  today: string
  creatorId: string
  incoming: Mail[]
  outgoing: Mail[]
  decrees: RegisterRow[]
  ministerialOrders: RegisterRow[]
  incomingInvoices: RegisterRow[]
  ledgerEntries: LedgerEntry[]
}

export interface SeededDocuments {
  documents: DocumentRecord[]
  files: StoredFile[]
  thumbnails: Thumbnail[]
  pages: DocumentPage[]
  links: DocumentLink[]
}

/** ~25 documents : PDF avec texte, PDF d'images, scans PNG et JPEG, dont 3 « en attente » de lecture. */
export async function buildDocuments(ctx: DocumentsContext, deps: DemoDeps): Promise<SeededDocuments> {
  const pick = picker(ctx.rand)
  const canRender = typeof deps.renderImage === 'function'
  const specs = [...TEXT_PDFS, ...(canRender ? [...IMAGE_PDFS, ...IMAGES] : [])]
  const result: SeededDocuments = { documents: [], files: [], thumbnails: [], pages: [], links: [] }

  const visible = (mails: Mail[]) => mails.filter((m) => m.confidentiality === 'normal')
  const used = new Set<string>()
  const target = (link: Link, match?: string): { type: LinkEntityType; id: string; date: string } | undefined => {
    const choose = <T extends { id: string }>(rows: T[], type: LinkEntityType, dateOf: (r: T) => string, wanted?: (r: T) => boolean) => {
      const free = rows.filter((r) => !used.has(r.id))
      if (free.length === 0) return undefined
      const preferred = wanted ? free.filter(wanted) : []
      const row = pick(preferred.length > 0 ? preferred : free)
      used.add(row.id)
      return { type, id: row.id, date: dateOf(row) }
    }
    switch (link) {
      case 'mail-in':
        return choose(visible(ctx.incoming), 'mail', (m) => m.mailDate, (m) => !!match && m.subject.startsWith(match))
      case 'mail-out':
        return choose(visible(ctx.outgoing), 'mail', (m) => m.mailDate, (m) => !!match && m.subject.startsWith(match))
      case 'decree':
        return choose(ctx.decrees, 'decree', (r) => String(r.signedOn))
      case 'order':
        return choose(ctx.ministerialOrders, 'ministerialOrder', (r) => String(r.signedOn))
      case 'invoice':
        return choose(ctx.incomingInvoices, 'incomingInvoice', (r) => String(r.receivedOn))
      case 'ledger':
        return choose(ctx.ledgerEntries, 'ledgerEntry', (e) => e.operationDate)
      default:
        return undefined
    }
  }

  for (const spec of specs) {
    const linked = target(spec.link, spec.match)
    const archivedAt = linked?.date ?? addDays(ctx.today, -Math.floor(ctx.rand() * 300) - 10)
    const format = spec.kind === 'jpeg' ? 'jpeg' : 'png'

    let blob: Blob
    let mimeType: DocumentRecord['mimeType']
    let kind: DocumentRecord['kind'] = 'pdf'
    let width: number | undefined
    let height: number | undefined

    if (spec.kind === 'text-pdf') {
      blob = new Blob([await textPdf(spec.title, spec.pages)], { type: 'application/pdf' })
      mimeType = 'application/pdf'
    } else if (spec.kind === 'image-pdf') {
      const renders = await Promise.all(spec.pages.map((lines) => deps.renderImage!(pageSpec(lines, 'png', ctx.rand))))
      blob = new Blob([await imagePdf(spec.title, renders)], { type: 'application/pdf' })
      mimeType = 'application/pdf'
    } else {
      blob = await deps.renderImage!(pageSpec(spec.pages[0]!, format, ctx.rand))
      mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
      kind = 'image'
      width = 1240
      height = 1754
    }

    const prepared = deps.prepare ? await deps.prepare(blob, kind).catch(() => undefined) : undefined
    const id = crypto.randomUUID()
    const done = !spec.pending
    const nativeText = spec.kind === 'text-pdf'
    const text = spec.pages.map((lines) => lines.join('\n'))
    const stamp = `${archivedAt}T09:30:00.000Z`

    result.documents.push({
      id,
      category: spec.category,
      title: spec.title,
      originalFilename: spec.filename,
      kind,
      mimeType,
      sizeBytes: blob.size,
      sha256: await sha256Stream(blob),
      pageCount: prepared?.pageCount ?? spec.pages.length,
      width: prepared?.width ?? width,
      height: prepared?.height ?? height,
      rotation: 0,
      ocrStatus: done ? 'done' : 'pending',
      ...(done
        ? {
            ocrSource: nativeText ? ('nativeText' as const) : ('tesseract' as const),
            ocrLanguage: nativeText ? undefined : 'fra',
            ocrConfidence: nativeText ? undefined : 84 + Math.floor(ctx.rand() * 12),
            ocrCompletedAt: stamp,
            contentText: text.join('\n\n'),
          }
        : {}),
      archivedAt,
      confidentiality: 'normal',
      createdAt: stamp,
      createdBy: ctx.creatorId,
      updatedAt: stamp,
      updatedBy: ctx.creatorId,
    })
    result.files.push({ documentId: id, blob })
    if (prepared?.thumbnail) result.thumbnails.push({ documentId: id, blob: prepared.thumbnail })
    if (done) {
      text.forEach((pageText, i) => result.pages.push({ documentId: id, pageNumber: i + 1, text: pageText, confidence: nativeText ? undefined : 82 + Math.floor(ctx.rand() * 14) }))
    }
    if (linked) result.links.push({ documentId: id, entityType: linked.type, entityId: linked.id, linkedBy: ctx.creatorId, linkedAt: stamp })
  }
  return result
}
