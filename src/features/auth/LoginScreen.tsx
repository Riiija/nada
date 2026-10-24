import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { errorMessage } from '@/data/errors'
import { resetAdminPassword, signIn } from '@/data/repositories/auth'
import { recoverySchema, signInSchema } from '@/data/schemas/auth'
import { AuthShell } from './AuthShell'
import { RecoveryKeyBlock } from './SetupScreen'

export function LoginScreen() {
  const [forgot, setForgot] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signInSchema>>({ resolver: zodResolver(signInSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn(values)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <AuthShell
      title="Connexion"
      description="Connectez-vous avec le compte créé sur ce poste."
      footer={
        <button type="button" className="underline underline-offset-2 hover:text-text" onClick={() => setForgot(true)}>
          Mot de passe administrateur oublié
        </button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Identifiant" error={errors.username?.message}>
          {(p) => <Input {...p} autoComplete="username" autoCapitalize="none" autoFocus {...register('username')} />}
        </Field>
        <Field label="Mot de passe" error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        {errors.root ? <p role="alert" className="text-xs text-danger">{errors.root.message}</p> : null}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
          Se connecter
        </Button>
      </form>
      <RecoveryDialog open={forgot} onOpenChange={setForgot} />
    </AuthShell>
  )
}

function RecoveryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [newKey, setNewKey] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof recoverySchema>>({ resolver: zodResolver(recoverySchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { recoveryKey } = await resetAdminPassword(values)
      toast.success('Mot de passe réinitialisé')
      setNewKey(recoveryKey)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setNewKey(null)
      reset()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={newKey ? 'Nouvelle clé de récupération' : 'Réinitialiser le mot de passe administrateur'}
      description={
        newKey
          ? "L'ancienne clé ne fonctionne plus. Conservez celle-ci : elle ne sera plus affichée."
          : 'Saisissez la clé de récupération donnée à la création du compte.'
      }
    >
      {newKey ? (
        <div className="mt-4 flex flex-col gap-4">
          <RecoveryKeyBlock recoveryKey={newKey} />
          <Button variant="primary" onClick={() => close(false)}>
            Retourner à la connexion
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4" noValidate>
          <Field label="Clé de récupération" error={errors.recoveryKey?.message}>
            {(p) => <Input {...p} autoComplete="off" autoCapitalize="characters" {...register('recoveryKey')} />}
          </Field>
          <Field label="Nouveau mot de passe" help="Au moins 8 caractères." error={errors.password?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
          </Field>
          <Field label="Confirmer le mot de passe" error={errors.confirmPassword?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirmPassword')} />}
          </Field>
          {errors.root ? <p role="alert" className="text-xs text-danger">{errors.root.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => close(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Réinitialiser le mot de passe
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
