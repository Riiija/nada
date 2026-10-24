import { z } from 'zod'
import { isValidDate } from '@/lib/dates'
import { parseMoney } from '@/lib/money'

const requiredDate = (message: string) => z.string().trim().min(1, message).refine(isValidDate, 'Saisissez une date valide (jj/mm/aaaa).')

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isValidDate(v), 'Saisissez une date valide (jj/mm/aaaa).')

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))

/**
 * Montant : une saisie texte est en unités (« 1 750 000,50 »), un nombre est déjà en centimes.
 * Le résultat est toujours un entier de centimes, jamais négatif.
 */
const money = z.preprocess(
  (v) => (typeof v === 'string' ? (parseMoney(v) ?? Number.NaN) : v),
  z.number('Saisissez un montant valide.').int('Saisissez un montant valide.').min(0, 'Le montant ne peut pas être négatif.'),
)

// Champs proposés dans DOMAIN.md §4, « à valider avec le métier » : seuls la date, l'objet et le
// signataire (ou l'équivalent) sont obligatoires, le reste est facultatif.

export const decreeSchema = z.object({
  officialNumber: optionalText,
  signedOn: requiredDate('Indiquez la date de signature.'),
  subject: z.string().trim().min(1, "Indiquez l'objet du décret."),
  officialId: z.string().min(1, 'Choisissez le chef de l’État signataire.'),
  publishedOn: optionalDate,
  notes: optionalText,
})

export const ministerialOrderSchema = z.object({
  officialNumber: optionalText,
  signedOn: requiredDate('Indiquez la date de signature.'),
  subject: z.string().trim().min(1, "Indiquez l'objet de l'arrêté."),
  officialId: z.string().min(1, 'Choisissez le ministre signataire.'),
  departmentId: optionalId,
  publishedOn: optionalDate,
  notes: optionalText,
})

export const serviceNoteSchema = z.object({
  issuedOn: requiredDate("Indiquez la date de la note."),
  subject: z.string().trim().min(1, "Indiquez l'objet de la note."),
  departmentId: optionalId,
  audience: optionalText,
  signedByStaffId: optionalId,
})

export const invoiceStatuses = ['received', 'validated', 'paid', 'rejected'] as const
export const invoiceStatusLabels: Record<(typeof invoiceStatuses)[number], string> = {
  received: 'Reçue',
  validated: 'Validée',
  paid: 'Payée',
  rejected: 'Rejetée',
}

export const incomingInvoiceSchema = z.object({
  supplierPartnerId: z.string().min(1, 'Choisissez le fournisseur.'),
  invoiceNumber: optionalText,
  invoiceDate: requiredDate('Indiquez la date de la facture.'),
  receivedOn: requiredDate('Indiquez la date de réception.'),
  amount: money.refine((v) => v > 0, 'Indiquez le montant de la facture.'),
  dueDate: optionalDate,
  status: z.enum(invoiceStatuses, 'Choisissez l’état de la facture.').default('received'),
  departmentId: optionalId,
})

export const ledgerEntrySchema = z
  .object({
    operationDate: requiredDate("Indiquez la date de l'opération."),
    label: z.string().trim().min(1, "Indiquez l'intitulé de l'opération."),
    orderNumber: optionalText,
    chequeNumber: optionalText,
    debit: money.default(0),
    credit: money.default(0),
    observation: optionalText,
  })
  .refine((v) => v.debit > 0 || v.credit > 0, { path: ['debit'], message: 'Saisissez un débit ou un crédit.' })
