import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { errorMessage } from '@/data/errors'
import { updateSettings, useSettings, type AppSettings } from '@/data/repositories/settings'
import { counterScopes, settingsSchema } from '@/data/schemas/settings'
import { formatBytes, getStorageStatus, requestPersistence, type StorageStatus } from '@/lib/storage'

type FormInput = z.input<typeof settingsSchema>
type FormOutput = z.output<typeof settingsSchema>

const scopeLabels: Record<(typeof counterScopes)[number], string> = {
  mailIncoming: 'Courriers arrivés',
  mailOutgoing: 'Courriers départ',
  decree: 'Décrets présidentiels',
  ministerialOrder: 'Arrêtés ministériels',
  serviceNote: 'Notes de service',
  incomingInvoice: 'Factures arrivées',
}

export function SettingsPage() {
  const settings = useSettings()
  return (
    <>
      <PageHeader title="Paramètres" description="Organisation, numérotation, lecture OCR et sécurité de la session." />
      {settings ? (
        <SettingsForm settings={settings} />
      ) : (
        <div role="status" aria-label="Chargement" className="space-y-3">
          <Skeleton className="h-10 w-full max-w-[600px]" />
          <Skeleton className="h-10 w-full max-w-[600px]" />
          <Skeleton className="h-10 w-full max-w-[600px]" />
        </div>
      )}
    </>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 lg:grid-cols-[280px_1fr] lg:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 max-w-[40ch] text-[13px] text-text-muted">{description}</p> : null}
      </div>
      <div className="grid max-w-[600px] gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const timezones = Intl.supportedValuesOf('timeZone')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      organizationName: settings.organizationName,
      appName: settings.appName,
      timezone: settings.timezone,
      referenceFormats: Object.fromEntries(counterScopes.map((s) => [s, settings.referenceFormats[s] ?? ''])),
      ocrLanguages: settings.ocrLanguages,
      maxUploadMb: settings.maxUploadMb,
      currency: settings.currency ?? '',
      staleAfterDays: settings.staleAfterDays,
      lockAfterMinutes: settings.lockAfterMinutes,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateSettings(values)
      reset(undefined, { keepValues: true })
      toast.success('Paramètres enregistrés')
    } catch (error) {
      setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <Section title="Organisation" description="Ces noms apparaissent dans la barre latérale.">
        <Field label="Nom de l’organisation" required error={errors.organizationName?.message}>
          {(p) => <Input {...p} {...register('organizationName')} />}
        </Field>
        <Field label="Nom de l’application" required error={errors.appName?.message}>
          {(p) => <Input {...p} {...register('appName')} />}
        </Field>
        <Field label="Fuseau horaire" help="Détermine l’année utilisée pour la numérotation." error={errors.timezone?.message}>
          {(p) => (
            <Select {...p} {...register('timezone')}>
              {(timezones.includes(settings.timezone) ? timezones : [settings.timezone, ...timezones]).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <Section
        title="Numérotation"
        description="{n} est le numéro, {yy} les deux derniers chiffres de l’année. Le numéro repart à 1 chaque année."
      >
        {counterScopes.map((scope) => (
          <Field key={scope} label={scopeLabels[scope]} help="Par défaut : {n}/{yy}" error={errors.referenceFormats?.[scope]?.message}>
            {(p) => <Input {...p} placeholder="{n}/{yy}" {...register(`referenceFormats.${scope}`)} />}
          </Field>
        ))}
      </Section>

      <Section title="Documents et lecture" description="Appliqué aux prochains imports.">
        <Field label="Langues de lecture OCR" error={errors.ocrLanguages?.message}>
          {(p) => (
            <Select {...p} {...register('ocrLanguages')}>
              <option value="fra">Français</option>
              <option value="fra+ara">Français et arabe</option>
            </Select>
          )}
        </Field>
        <Field label="Taille maximale par fichier (Mo)" error={errors.maxUploadMb?.message}>
          {(p) => <Input {...p} type="number" inputMode="numeric" {...register('maxUploadMb')} />}
        </Field>
        <Field label="Devise" help="Utilisée par le journal des opérations." error={errors.currency?.message}>
          {(p) => <Input {...p} {...register('currency')} />}
        </Field>
      </Section>

      <Section title="Suivi et sécurité" description="Les comptes organisent le travail, ils ne protègent pas les données du navigateur.">
        <Field label="Courrier en retard après (jours)" error={errors.staleAfterDays?.message}>
          {(p) => <Input {...p} type="number" inputMode="numeric" {...register('staleAfterDays')} />}
        </Field>
        <Field label="Verrouillage après inactivité (minutes)" help="0 désactive le verrouillage." error={errors.lockAfterMinutes?.message}>
          {(p) => <Input {...p} type="number" inputMode="numeric" {...register('lockAfterMinutes')} />}
        </Field>
      </Section>

      {errors.root ? <p role="alert" className="mb-3 text-xs text-danger">{errors.root.message}</p> : null}
      <div className="flex items-center gap-3 border-t border-border pt-5">
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
          Enregistrer les paramètres
        </Button>
      </div>

      <StorageSection />
    </form>
  )
}

function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null)

  useEffect(() => {
    let alive = true
    void getStorageStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  async function ask() {
    const granted = await requestPersistence()
    setStatus(await getStorageStatus())
    if (granted) toast.success('Stockage persistant activé')
    else toast.error('Le navigateur a refusé le stockage persistant. Installez l’application pour augmenter les chances.')
  }

  return (
    <section className="mt-8 grid gap-4 border-t border-border pt-6 lg:grid-cols-[280px_1fr] lg:gap-10">
      <div>
        <h2 className="text-base font-semibold">Stockage dans ce navigateur</h2>
        <p className="mt-1 max-w-[40ch] text-[13px] text-text-muted">
          Les données n’existent que sur ce poste. Effacer les données du navigateur les supprime : faites des sauvegardes.
        </p>
      </div>
      <div className="max-w-[600px] space-y-3 text-sm">
        {status === null ? (
          <Skeleton className="h-5 w-64" />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-text-muted">Stockage persistant</span>
              {status.persisted === null ? (
                <span className="text-text-muted">Non disponible</span>
              ) : status.persisted ? (
                <Badge tone="teal">Activé</Badge>
              ) : (
                <Badge tone="amber">Non activé</Badge>
              )}
              {status.persisted === false ? (
                <Button type="button" size="sm" onClick={() => void ask()}>
                  Demander à nouveau
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-text-muted">Espace utilisé</span>
              <span>
                {status.usage === null || status.quota === null
                  ? 'Non disponible'
                  : `${formatBytes(status.usage)} sur ${formatBytes(status.quota)}`}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
