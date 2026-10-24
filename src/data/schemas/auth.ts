import { z } from 'zod'

export const passwordSchema = z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.')

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "L'identifiant doit contenir au moins 3 caractères.")
  .regex(/^[a-z0-9._-]+$/, "L'identifiant ne peut contenir que des lettres, des chiffres, des points, des tirets et des tirets bas.")

/** Création du compte administrateur : validé par le formulaire ET par le repository. */
export const adminSetupSchema = z.object({
  organizationName: z.string().trim().min(1, "Indiquez le nom de l'organisation."),
  fullName: z.string().trim().min(1, 'Indiquez votre nom complet.'),
  username: usernameSchema,
  password: passwordSchema,
})
export type AdminSetupInput = z.infer<typeof adminSetupSchema>

export const adminSetupFormSchema = adminSetupSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les deux mots de passe ne correspondent pas.',
  })

export const signInSchema = z.object({
  username: z.string().trim().min(1, 'Saisissez votre identifiant.'),
  password: z.string().min(1, 'Saisissez votre mot de passe.'),
})
export type SignInInput = z.infer<typeof signInSchema>

export const unlockSchema = z.object({ password: z.string().min(1, 'Saisissez votre mot de passe.') })

export const recoverySchema = z
  .object({
    recoveryKey: z.string().trim().min(1, 'Saisissez la clé de récupération.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les deux mots de passe ne correspondent pas.',
  })

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Saisissez votre mot de passe actuel.'),
  newPassword: passwordSchema,
})
