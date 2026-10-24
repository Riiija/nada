import { z } from 'zod'

export const counterScopes = ['mailIncoming', 'mailOutgoing', 'decree', 'ministerialOrder', 'serviceNote', 'incomingInvoice'] as const

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const settingsSchema = z.object({
  organizationName: z.string().trim().min(1, "Indiquez le nom de l'organisation."),
  appName: z.string().trim().min(1, "Indiquez le nom de l'application."),
  timezone: z.string().refine(isTimeZone, 'Choisissez un fuseau horaire valide.'),
  referenceFormats: z.partialRecord(
    z.enum(counterScopes),
    z.string().trim().refine((v) => v === '' || v.includes('{n}'), 'Le format doit contenir {n}.'),
  ),
  ocrLanguages: z.enum(['fra', 'fra+ara'], 'Choisissez une langue de lecture.'),
  maxUploadMb: z.coerce.number('Saisissez un nombre.').int('Saisissez un nombre entier.').min(1, 'Au moins 1 Mo.').max(500, '500 Mo au maximum.'),
  currency: z.string().trim().optional(),
  staleAfterDays: z.coerce.number('Saisissez un nombre.').int('Saisissez un nombre entier.').min(1, 'Au moins 1 jour.').max(365, '365 jours au maximum.'),
  lockAfterMinutes: z.coerce.number('Saisissez un nombre.').int('Saisissez un nombre entier.').min(0, 'Saisissez 0 pour désactiver.').max(240, '240 minutes au maximum.'),
})

export const settingsPatchSchema = settingsSchema.partial()
