import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { errorMessage } from '@/data/errors'
import { signOut, unlockSession } from '@/data/repositories/auth'
import { unlockSchema } from '@/data/schemas/auth'
import type { CurrentUser } from '@/data/session'
import { AuthShell } from './AuthShell'

export function LockScreen({ user }: { user: CurrentUser }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof unlockSchema>>({ resolver: zodResolver(unlockSchema) })

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await unlockSession(password)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <AuthShell
      title="Session verrouillée"
      description={`${user.fullName}, saisissez votre mot de passe pour reprendre.`}
      avatar={<Avatar name={user.fullName} size={48} />}
      footer={
        <button type="button" className="underline underline-offset-2 hover:text-text" onClick={() => void signOut()}>
          Changer d'utilisateur
        </button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Mot de passe" error={errors.password?.message ?? errors.root?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" autoFocus {...register('password')} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
          Déverrouiller
        </Button>
      </form>
    </AuthShell>
  )
}
