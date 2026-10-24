import { z } from 'zod'
import { passwordSchema, usernameSchema } from './auth'

export const roleLabels = { admin: 'Administrateur', archivist: 'Archiviste', reader: 'Lecteur' } as const

const roleSchema = z.enum(['admin', 'archivist', 'reader'], 'Choisissez un rôle.')
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Indiquez le nom complet.'),
  username: usernameSchema,
  role: roleSchema,
  staffId: optionalId,
  password: passwordSchema,
})

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Indiquez le nom complet.'),
  role: roleSchema,
  staffId: optionalId,
})

export const resetPasswordSchema = z.object({ password: passwordSchema })
