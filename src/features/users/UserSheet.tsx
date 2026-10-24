import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { errorMessage } from '@/data/errors'
import { useReference } from '@/data/repositories/referenceData'
import { createUser, updateUser, type UserRow } from '@/data/repositories/users'
import { createUserSchema, roleLabels, updateUserSchema } from '@/data/schemas/users'

type Values = { fullName: string; username: string; role: string; staffId: string; password: string }

type Props = {
  /** null = création. */
  user: UserRow | null
  /** Identifiant du compte connecté : son propre rôle n'est pas modifiable. */
  currentUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserSheet({ user, currentUserId, open, onOpenChange }: Props) {
  return open ? <Form key={user?.id ?? 'new'} user={user} currentUserId={currentUserId} onClose={() => onOpenChange(false)} /> : null
}

function Form({ user, currentUserId, onClose }: { user: UserRow | null; currentUserId: string; onClose: () => void }) {
  const [confirmClose, setConfirmClose] = useState(false)
  const staff = useReference('staff')
  const isNew = user === null
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: {
      fullName: user?.fullName ?? '',
      username: user?.username ?? '',
      role: user?.role ?? 'archivist',
      staffId: user?.staffId ?? '',
      password: '',
    },
    resolver: zodResolver((isNew ? createUserSchema : updateUserSchema) as never) as unknown as Resolver<Values>,
  })

  const requestClose = () => (isDirty ? setConfirmClose(true) : onClose())

  const submit = handleSubmit(async (values) => {
    try {
      if (isNew) await createUser(values)
      else await updateUser(user.id, values)
      toast.success('Compte enregistré')
      onClose()
    } catch (error) {
      setError(isNew ? 'username' : 'fullName', { message: errorMessage(error) })
    }
  })

  const isSelf = user?.id === currentUserId

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      title={isNew ? 'Nouveau compte' : 'Modifier le compte'}
      description={isNew ? 'Le compte pourra se connecter sur ce poste avec ce mot de passe.' : undefined}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit(e)
        }}
        noValidate
        className="flex h-full flex-col"
      >
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Nom complet" required error={errors.fullName?.message}>
            {(p) => <Input {...p} autoFocus autoComplete="off" {...register('fullName')} />}
          </Field>
          {isNew ? (
            <Field label="Identifiant" required help="Lettres, chiffres, points et tirets. Non modifiable ensuite." error={errors.username?.message}>
              {(p) => <Input {...p} autoComplete="off" autoCapitalize="none" {...register('username')} />}
            </Field>
          ) : null}
          <Field
            label="Rôle"
            required
            help={isSelf ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}
            error={errors.role?.message}
          >
            {(p) => (
              <Select {...p} disabled={isSelf} {...register('role')}>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Collaborateur lié"
            help="Un compte lié reçoit les courriers adressés à ce collaborateur."
            error={errors.staffId?.message}
          >
            {(p) => (
              <Select {...p} {...register('staffId')}>
                <option value="">Aucun collaborateur</option>
                {(staff ?? [])
                  .filter((s) => s.isActive === 1 || s.id === user?.staffId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.fullName)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          {isNew ? (
            <Field label="Mot de passe" required help="Au moins 8 caractères." error={errors.password?.message}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
            </Field>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button type="button" onClick={requestClose}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {isNew ? 'Créer le compte' : 'Enregistrer'}
          </Button>
        </div>
        <ConfirmDialog
          open={confirmClose}
          onOpenChange={setConfirmClose}
          title="Fermer sans enregistrer ?"
          description="Les modifications de ce formulaire seront perdues."
          confirmLabel="Fermer sans enregistrer"
          danger
          onConfirm={onClose}
        />
      </form>
    </Sheet>
  )
}
