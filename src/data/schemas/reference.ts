import { z } from 'zod'

/** Champ facultatif saisi en texte : vide = absent. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Saisissez une date valide.')

export const departmentSchema = z.object({
  code: optionalText,
  name: z.string().trim().min(1, 'Indiquez le nom de la direction.'),
})

export const staffSchema = z.object({
  fullName: z.string().trim().min(1, 'Indiquez le nom du collaborateur.'),
  jobTitle: optionalText,
  departmentId: optionalText,
  email: optionalText.refine((v) => v === undefined || z.email().safeParse(v).success, 'Saisissez une adresse e-mail valide.'),
})

export const partnerKinds = [
  'presidency',
  'ministry',
  'publicBody',
  'internationalOrg',
  'company',
  'individual',
  'other',
] as const

export const partnerKindLabels: Record<(typeof partnerKinds)[number], string> = {
  presidency: 'Présidence',
  ministry: 'Ministère',
  publicBody: 'Organisme public',
  internationalOrg: 'Organisation internationale',
  company: 'Entreprise',
  individual: 'Particulier',
  other: 'Autre',
}

export const partnerSchema = z.object({
  name: z.string().trim().min(1, 'Indiquez le nom du partenaire.'),
  kind: z.enum(partnerKinds, 'Choisissez le type de partenaire.'),
})

export const officialSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Indiquez le nom complet.'),
    title: optionalText,
    termStart: optionalDate,
    termEnd: optionalDate,
  })
  .refine((v) => !v.termStart || !v.termEnd || v.termStart <= v.termEnd, {
    path: ['termEnd'],
    message: 'La fin du mandat doit suivre son début.',
  })

export const lookupSchema = z.object({
  label: z.string().trim().min(1, 'Indiquez le libellé.'),
  sortOrder: z.coerce.number('Saisissez un nombre.').int('Saisissez un nombre entier.').min(0, 'Saisissez un nombre positif.').optional(),
})
