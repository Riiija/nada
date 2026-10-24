import { z } from 'zod'
import { isValidDate } from '@/lib/dates'

const requiredDate = (message: string) =>
  z.string().trim().min(1, message).refine(isValidDate, 'Saisissez une date valide (jj/mm/aaaa).')

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))

const confidentiality = z.enum(['normal', 'restricted']).default('normal')

/** Obligatoires comme dans WinDev : date, objet, direction, n° dossier, suivi, position, destinataire. */
export const incomingMailSchema = z.object({
  mailDate: requiredDate('Indiquez la date du courrier.'),
  subject: z.string().trim().min(1, "Indiquez l'objet du courrier."),
  departmentId: z.string().min(1, 'Choisissez la direction.'),
  fileNumber: z.string().trim().min(1, 'Indiquez le numéro de dossier.'),
  followUpId: z.string().min(1, 'Choisissez le suivi.'),
  positionId: z.string().min(1, 'Choisissez la position.'),
  assignedStaffId: z.string().min(1, 'Choisissez le destinataire.'),
  staffJobTitle: optionalText,
  sourcePartnerId: optionalId,
  mailTypeId: optionalId,
  isProcessed: z.boolean().default(false),
  confidentiality,
})
export type IncomingMailInput = z.input<typeof incomingMailSchema>

/** Obligatoires comme dans WinDev : date, objet, paraphé par. */
export const outgoingMailSchema = z.object({
  mailDate: requiredDate('Indiquez la date du courrier.'),
  subject: z.string().trim().min(1, "Indiquez l'objet du courrier."),
  signedByStaffId: z.string().min(1, 'Choisissez qui a paraphé le courrier.'),
  staffJobTitle: optionalText,
  departmentId: optionalId,
  recipientPartnerId: optionalId,
  recipientLabel: optionalText,
  confidentiality,
})
export type OutgoingMailInput = z.input<typeof outgoingMailSchema>
