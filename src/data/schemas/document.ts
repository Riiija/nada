import { z } from 'zod'
import { isValidDate } from '@/lib/dates'

export const documentCategories = ['mailAttachment', 'archive', 'decree', 'ministerialOrder', 'serviceNote', 'invoice', 'ledger'] as const

export const categoryLabels: Record<(typeof documentCategories)[number], string> = {
  mailAttachment: 'Pièce jointe de courrier',
  archive: 'Archive',
  decree: 'Décret',
  ministerialOrder: 'Arrêté',
  serviceNote: 'Note de service',
  invoice: 'Facture',
  ledger: 'Journal des opérations',
}

export const importSchema = z.object({
  title: z.string().trim().min(1, 'Le titre du document est vide.'),
  originalFilename: z.string().trim().min(1),
  kind: z.enum(['pdf', 'image']),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'Empreinte invalide.'),
  pageCount: z.number().int().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  category: z.enum(documentCategories, 'Choisissez une catégorie.'),
  archivedAt: z.string().refine(isValidDate, "Saisissez une date d'archivage valide (jj/mm/aaaa)."),
})
export type ImportMeta = z.infer<typeof importSchema>
