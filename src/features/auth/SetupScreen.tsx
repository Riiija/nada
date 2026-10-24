import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { createFirstAdmin } from '@/data/repositories/auth'
import { errorMessage } from '@/data/errors'
import { adminSetupFormSchema } from '@/data/schemas/auth'
import { loadDemoData, type DemoAccount } from '@/data/seed/demo'
import { renderImage } from '@/lib/demo/renderImage'
import { prepareFile } from '@/lib/import/prepare'
import { roleLabels } from '@/data/schemas/users'
import { AuthShell } from './AuthShell'

type FormValues = z.infer<typeof adminSetupFormSchema>

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loadDemo, setLoadDemo] = useState(false)
  const [accounts, setAccounts] = useState<DemoAccount[]>([])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(adminSetupFormSchema) })

  if (recoveryKey) {
    return (
      <AuthShell
        title="Conservez votre clé de récupération"
        description="Elle permet de redéfinir le mot de passe administrateur si vous l'oubliez. Elle ne sera plus affichée."
      >
        <RecoveryKeyBlock recoveryKey={recoveryKey} />
        {accounts.length > 0 ? <DemoAccounts accounts={accounts} /> : null}
        <label className="mt-5 flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
          J'ai conservé la clé dans un endroit sûr.
        </label>
        <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!saved} onClick={onDone}>
          Ouvrir l'application
        </Button>
      </AuthShell>
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { recoveryKey } = await createFirstAdmin(values)
      toast.success('Compte administrateur créé')
      if (loadDemo) {
        try {
          setAccounts((await loadDemoData({ renderImage, prepare: prepareFile })).accounts)
          toast.success('Données de démonstration chargées')
        } catch (error) {
          toast.error(errorMessage(error, 'Les données de démonstration n’ont pas pu être chargées.'))
        }
      }
      setRecoveryKey(recoveryKey)
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <AuthShell
      title="Créer le compte administrateur"
      description="Les données de cette application sont enregistrées uniquement dans ce navigateur."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Nom de l'organisation" required error={errors.organizationName?.message}>
          {(p) => <Input {...p} autoComplete="organization" {...register('organizationName')} />}
        </Field>
        <Field label="Nom complet" required error={errors.fullName?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('fullName')} />}
        </Field>
        <Field label="Identifiant" required error={errors.username?.message}>
          {(p) => <Input {...p} autoComplete="username" autoCapitalize="none" {...register('username')} />}
        </Field>
        <Field label="Mot de passe" required help="Au moins 8 caractères." error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Field label="Confirmer le mot de passe" required error={errors.confirmPassword?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirmPassword')} />}
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={loadDemo} onChange={(e) => setLoadDemo(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
          <span>
            Charger des données de démonstration
            <span className="block text-xs text-text-muted">Directions, collaborateurs, partenaires, listes et trois comptes de test.</span>
          </span>
        </label>
        {errors.root ? <p role="alert" className="text-xs text-danger">{errors.root.message}</p> : null}
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="mt-1 w-full">
          Créer le compte administrateur
        </Button>
      </form>
    </AuthShell>
  )
}

export function RecoveryKeyBlock({ recoveryKey }: { recoveryKey: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      toast.success('Clé copiée')
    } catch {
      toast.error('Impossible de copier la clé. Notez-la à la main.')
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`Clé de récupération : ${recoveryKey}\n`], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'cle-de-recuperation.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div>
      <p className="rounded-control border border-border bg-surface-muted px-4 py-3 text-center text-lg font-semibold tracking-wide select-all">
        {recoveryKey}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={copy}>
          <Icon icon={Copy} />
          Copier la clé
        </Button>
        <Button size="sm" onClick={download}>
          <Icon icon={Download} />
          Télécharger la clé
        </Button>
      </div>
    </div>
  )
}

function DemoAccounts({ accounts }: { accounts: DemoAccount[] }) {
  return (
    <div className="mt-5">
      <h2 className="text-[13px] font-medium">Comptes de test</h2>
      <p className="text-xs text-text-muted">Les mots de passe ne seront plus affichés.</p>
      <ul className="mt-2 divide-y divide-border rounded-control border border-border text-[13px]">
        {accounts.map((a) => (
          <li key={a.username} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2">
            <span>
              <span className="font-medium">{a.username}</span>, {roleLabels[a.role].toLowerCase()}
            </span>
            <span className="select-all font-medium">{a.password}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
