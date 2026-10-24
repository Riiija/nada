import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { RowActions } from '@/components/ui/RowActions'
import { SearchInput } from '@/components/ui/SearchInput'
import { errorMessage } from '@/data/errors'
import { useReference } from '@/data/repositories/referenceData'
import { resetUserPassword, setUserActive, useUsers, type UserRow } from '@/data/repositories/users'
import { resetPasswordSchema, roleLabels } from '@/data/schemas/users'
import { useSession } from '@/data/session'
import { formatDateTime, formatNumber } from '@/lib/format'
import { UserSheet } from './UserSheet'

export function UsersPage() {
  const users = useUsers()
  const staff = useReference('staff')
  const currentUserId = useSession().user?.id ?? ''
  const [filter, setFilter] = useState('')
  const [sheet, setSheet] = useState<{ user: UserRow | null } | null>(null)
  const [deactivate, setDeactivate] = useState<UserRow | null>(null)
  const [reset, setReset] = useState<UserRow | null>(null)

  const staffNames = useMemo(() => new Map((staff ?? []).map((s) => [s.id, String(s.fullName)])), [staff])

  async function toggle(user: UserRow, active: boolean) {
    try {
      await setUserActive(user.id, active)
      toast.success(active ? 'Compte réactivé' : 'Compte désactivé')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const status = (u: UserRow) => (u.isActive === 1 ? <Badge tone="teal">Actif</Badge> : <Badge tone="neutral">Désactivé</Badge>)

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'fullName',
        header: 'Nom',
        accessorFn: (u) => u.fullName,
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-3">
            <Avatar name={u.fullName} size={32} />
            <div className="min-w-0">
              <div className={u.isActive === 0 ? 'truncate font-medium text-text-subtle' : 'truncate font-medium'}>{u.fullName}</div>
              <div className="truncate text-xs text-text-muted">{u.username}</div>
            </div>
          </div>
        ),
      },
      { id: 'role', header: 'Rôle', accessorFn: (u) => roleLabels[u.role], enableSorting: false },
      {
        id: 'staff',
        header: 'Collaborateur lié',
        accessorFn: (u) => (u.staffId ? (staffNames.get(u.staffId) ?? '–') : '–'),
        enableSorting: false,
      },
      { id: 'lastLoginAt', header: 'Dernière connexion', accessorFn: (u) => formatDateTime(u.lastLoginAt), enableSorting: false },
      { id: 'status', header: 'Statut', enableSorting: false, cell: ({ row }) => status(row.original) },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row: { original: u } }) => (
          <RowActions
            label={`Actions pour ${u.fullName}`}
            actions={[
              { label: 'Modifier', onSelect: () => setSheet({ user: u }) },
              { label: 'Réinitialiser le mot de passe', onSelect: () => setReset(u) },
              u.isActive === 1
                ? { label: 'Désactiver', danger: true, onSelect: () => setDeactivate(u) }
                : { label: 'Réactiver', onSelect: () => void toggle(u, true) },
            ]}
          />
        ),
      },
    ],
    [staffNames],
  )

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes locaux de ce navigateur. Un compte lié à un collaborateur reçoit ses courriers."
        actions={
          <Button variant="primary" onClick={() => setSheet({ user: null })}>
            <Icon icon={Plus} />
            Créer un compte
          </Button>
        }
      />
      <section className="rounded-card border border-border bg-surface shadow-card" aria-label="Comptes">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-[13px] text-text-muted">{users ? `${formatNumber(users.length)} compte${users.length > 1 ? 's' : ''}` : ' '}</p>
          <SearchInput value={filter} onChange={setFilter} placeholder="Rechercher" label="Rechercher un compte" />
        </div>
        <DataTable
          label="Comptes"
          data={users}
          columns={columns}
          filter={filter}
          getRowId={(u) => u.id}
          onRowClick={(u) => setSheet({ user: u })}
          mobileRow={(u) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{u.fullName}</div>
                <div className="truncate text-xs text-text-muted">
                  {u.username}, {roleLabels[u.role]}
                </div>
              </div>
              {status(u)}
            </div>
          )}
          empty={
            <EmptyState
              illustration={<EmptyMailbox />}
              title={filter ? 'Aucun résultat' : 'Aucun compte'}
              description={filter ? 'Aucun compte ne correspond à cette recherche.' : 'Créez un compte pour chaque personne qui utilise ce poste.'}
              action={filter ? <Button onClick={() => setFilter('')}>Effacer la recherche</Button> : undefined}
            />
          }
        />
      </section>

      <UserSheet
        user={sheet?.user ?? null}
        currentUserId={currentUserId}
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
      />
      <ConfirmDialog
        open={deactivate !== null}
        onOpenChange={(open) => !open && setDeactivate(null)}
        title={deactivate ? `Désactiver le compte de ${deactivate.fullName} ?` : ''}
        description="Cette personne ne pourra plus se connecter. Ses actions passées restent dans l’historique. L’opération est enregistrée."
        confirmLabel="Désactiver le compte"
        danger
        onConfirm={() => (deactivate ? toggle(deactivate, false) : undefined)}
      />
      <ResetPasswordDialog user={reset} onClose={() => setReset(null)} />
    </>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={user ? `Réinitialiser le mot de passe de ${user.fullName}` : ''}
      description="Communiquez le nouveau mot de passe à la personne. L’ancien cesse de fonctionner."
    >
      {user ? <ResetForm key={user.id} user={user} onClose={onClose} /> : null}
    </Dialog>
  )
}

function ResetForm({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema) })

  const submit = handleSubmit(async (values) => {
    try {
      await resetUserPassword(user.id, values)
      toast.success('Mot de passe réinitialisé')
      onClose()
    } catch (error) {
      setError('password', { message: errorMessage(error) })
    }
  })

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
      <Field label="Nouveau mot de passe" required help="Au moins 8 caractères." error={errors.password?.message}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" autoFocus {...register('password')} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Réinitialiser le mot de passe
        </Button>
      </div>
    </form>
  )
}
