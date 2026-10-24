import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DatePicker } from '@/components/ui/DatePicker'
import { Field, Input } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { errorMessage } from '@/data/errors'
import { linkDocuments } from '@/data/repositories/documents'
import { createMail, updateMail, useNextReference } from '@/data/repositories/mails'
import { saveReference } from '@/data/repositories/referenceData'
import { useSettings } from '@/data/repositories/settings'
import { incomingMailSchema, outgoingMailSchema } from '@/data/schemas/mail'
import type { Mail, MailFlow } from '@/data/types'
import { todayIn } from '@/lib/dates'
import { importQueue } from '@/lib/import'
import { AttachmentsField, type PendingAttachments } from './MailAttachments'
import { useMailLookups } from './useMailLookups'
import { useDocumentsForEntity } from '@/data/repositories/documents'

interface Values {
  mailDate: string
  subject: string
  departmentId: string
  fileNumber: string
  followUpId: string
  positionId: string
  assignedStaffId: string
  signedByStaffId: string
  staffJobTitle: string
  sourcePartnerId: string
  recipientPartnerId: string
  recipientLabel: string
  mailTypeId: string
  isProcessed: boolean
  confidentiality: 'normal' | 'restricted'
}

/** Valeurs conservées par « Enregistrer et nouveau » (équivalent du RAZ + DonneFocus de WinDev). */
export interface KeptValues {
  mailDate: string
  departmentId: string
}

type Props = {
  flow: MailFlow
  /** null = création. */
  mail: Mail | null
  open: boolean
  onClose: () => void
}

export function MailFormSheet({ flow, mail, open, onClose }: Props) {
  // Remonté à chaque ouverture : valeurs et erreurs repartent de zéro.
  return open ? <Form key={mail?.id ?? 'new'} flow={flow} mail={mail} onClose={onClose} /> : null
}

function initial(mail: Mail | null, today: string, kept: KeptValues | null): Values {
  return {
    mailDate: mail?.mailDate ?? kept?.mailDate ?? today,
    subject: mail?.subject ?? '',
    departmentId: mail?.departmentId ?? kept?.departmentId ?? '',
    fileNumber: mail?.fileNumber ?? '',
    followUpId: mail?.followUpId ?? '',
    positionId: mail?.positionId ?? '',
    assignedStaffId: mail?.assignedStaffId ?? '',
    signedByStaffId: mail?.signedByStaffId ?? '',
    staffJobTitle: mail?.staffJobTitle ?? '',
    sourcePartnerId: mail?.sourcePartnerId ?? '',
    recipientPartnerId: mail?.recipientPartnerId ?? '',
    recipientLabel: mail?.recipientLabel ?? '',
    mailTypeId: mail?.mailTypeId ?? '',
    isProcessed: mail ? mail.isProcessed === 1 : false,
    confidentiality: mail?.confidentiality ?? 'normal',
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-6 py-5 first:border-t-0">
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Form({ flow, mail, onClose }: Omit<Props, 'open'>) {
  const incoming = flow === 'incoming'
  const settings = useSettings()
  const lookups = useMailLookups()
  const nextReference = useNextReference(flow)
  const [confirmClose, setConfirmClose] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachments>({ files: [], documentIds: [] })
  const existing = useDocumentsForEntity('mail', mail?.id)
  const today = todayIn(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const isNew = mail === null
  const options = lookups.options({
    departmentId: mail?.departmentId,
    assignedStaffId: mail?.assignedStaffId,
    signedByStaffId: mail?.signedByStaffId,
    sourcePartnerId: mail?.sourcePartnerId,
    recipientPartnerId: mail?.recipientPartnerId,
    mailTypeId: mail?.mailTypeId,
    followUpId: mail?.followUpId,
    positionId: mail?.positionId,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: initial(mail, today, null),
    resolver: zodResolver((incoming ? incomingMailSchema : outgoingMailSchema) as never) as unknown as Resolver<Values>,
  })

  const hasAttachments = attachments.files.length + attachments.documentIds.length > 0
  const requestClose = () => (isDirty || hasAttachments ? setConfirmClose(true) : onClose())

  const save = (andNew: boolean) =>
    handleSubmit(async (values) => {
      try {
        let mailId = mail?.id ?? ''
        if (isNew) {
          const created = await createMail(flow, values)
          mailId = created.id
          toast.success('Courrier enregistré', { description: `N° ${created.reference}` })
        } else {
          await updateMail(mail.id, values)
          toast.success('Courrier enregistré')
        }
        // Les pièces jointes partent dans la file d'import une fois le courrier enregistré.
        if (attachments.files.length > 0) {
          importQueue.enqueue(attachments.files, {
            category: 'mailAttachment',
            archivedAt: today,
            link: { entityType: 'mail', entityId: mailId },
          })
        }
        if (attachments.documentIds.length > 0) await linkDocuments(attachments.documentIds, 'mail', mailId)
        setAttachments({ files: [], documentIds: [] })
        if (andNew && isNew) {
          const keep: KeptValues = { mailDate: values.mailDate, departmentId: values.departmentId }
          reset(initial(null, today, keep))
          queueMicrotask(() => document.querySelector<HTMLElement>('[role="dialog"] form input')?.focus())
        } else {
          onClose()
        }
      } catch (error) {
        setError('subject', { message: errorMessage(error) })
      }
    })

  const create = {
    staff: (name: string) => saveReference('staff', null, { fullName: name }),
    partner: (name: string) => saveReference('partners', null, { name, kind: 'other' }),
    department: (name: string) => saveReference('departments', null, { name }),
    followUp: (name: string) => saveReference('followUps', null, { label: name }),
    position: (name: string) => saveReference('positions', null, { label: name }),
    mailType: (name: string) => saveReference('mailTypes', null, { label: name }),
  }

  /** Choisir une personne pré-remplit sa fonction et sa direction ; les deux restent modifiables. */
  function prefillFrom(staffId: string) {
    const person = lookups.staffRows.find((s) => s.id === staffId)
    if (!person) return
    setValue('staffJobTitle', typeof person.jobTitle === 'string' ? person.jobTitle : '', { shouldDirty: true })
    if (typeof person.departmentId === 'string' && person.departmentId) setValue('departmentId', person.departmentId, { shouldDirty: true })
  }

  const title = `${isNew ? 'Enregistrer' : 'Modifier'} un courrier ${incoming ? 'arrivé' : 'départ'}`
  const recipientFree = useWatch({ control, name: 'recipientLabel' })

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      title={isNew ? title : `Modifier le courrier ${mail.reference}`}
      description="Les champs marqués d’un astérisque sont obligatoires."
    >
      <form
        onSubmit={save(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(false)(e)
        }}
        noValidate
        className="flex h-full flex-col"
      >
        <div className="flex-1 overflow-y-auto">
          <Section title="Enregistrement">
            <Field label="Date" required error={errors.mailDate?.message}>
              {(p) => <Controller control={control} name="mailDate" render={({ field }) => <DatePicker {...p} value={field.value} onChange={field.onChange} />} />}
            </Field>
            <Field label="N° attribué à l’enregistrement" help={isNew ? 'Le numéro définitif apparaît à l’enregistrement.' : undefined}>
              {(p) => <Input {...p} readOnly value={mail?.reference ?? nextReference ?? ''} className="bg-surface-muted" />}
            </Field>
            {incoming ? (
              <Field label="N° dossier" required error={errors.fileNumber?.message}>
                {(p) => <Input {...p} autoComplete="off" {...register('fileNumber')} />}
              </Field>
            ) : null}
          </Section>

          <Section title="Origine et destination">
            {incoming ? (
              <>
                <Field label="Provenance" error={errors.sourcePartnerId?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="sourcePartnerId"
                      render={({ field }) => (
                        <Combobox {...p} value={field.value} onChange={field.onChange} options={options.partners} clearLabel="Aucune provenance" onCreate={create.partner} />
                      )}
                    />
                  )}
                </Field>
                <Field label="Au bureau de" required error={errors.assignedStaffId?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="assignedStaffId"
                      render={({ field }) => (
                        <Combobox
                          {...p}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v)
                            prefillFrom(v)
                          }}
                          options={options.staff}
                          onCreate={create.staff}
                        />
                      )}
                    />
                  )}
                </Field>
              </>
            ) : (
              <>
                <Field label="Paraphé par" required error={errors.signedByStaffId?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="signedByStaffId"
                      render={({ field }) => (
                        <Combobox
                          {...p}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v)
                            prefillFrom(v)
                          }}
                          options={options.staff}
                          onCreate={create.staff}
                        />
                      )}
                    />
                  )}
                </Field>
                <Field label="Adressé à" error={errors.recipientPartnerId?.message ?? errors.recipientLabel?.message}>
                  {(p) => (
                    <Controller
                      control={control}
                      name="recipientPartnerId"
                      render={({ field }) => (
                        <Combobox
                          {...p}
                          value={field.value}
                          displayValue={recipientFree || undefined}
                          onChange={(v) => {
                            field.onChange(v)
                            setValue('recipientLabel', '', { shouldDirty: true })
                          }}
                          options={options.partners}
                          clearLabel="Aucun destinataire"
                          onCreate={create.partner}
                          onFreeText={(text) => {
                            field.onChange('')
                            setValue('recipientLabel', text, { shouldDirty: true })
                          }}
                          freeTextLabel={(text) => `Saisir « ${text} » sans l’ajouter aux partenaires`}
                        />
                      )}
                    />
                  )}
                </Field>
              </>
            )}
            <Field label="Fonction occupée" error={errors.staffJobTitle?.message}>
              {(p) => <Input {...p} autoComplete="off" {...register('staffJobTitle')} />}
            </Field>
            <Field label="Direction" required={incoming} error={errors.departmentId?.message}>
              {(p) => (
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <Combobox
                      {...p}
                      value={field.value}
                      onChange={field.onChange}
                      options={options.departments}
                      clearLabel={incoming ? undefined : 'Aucune direction'}
                      onCreate={create.department}
                    />
                  )}
                />
              )}
            </Field>
          </Section>

          <Section title="Contenu">
            <div className="sm:col-span-2">
              <Field label="Objet" required error={errors.subject?.message}>
                {(p) => <Input {...p} autoComplete="off" {...register('subject')} />}
              </Field>
            </div>
            {incoming ? (
              <Field label="Type" error={errors.mailTypeId?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="mailTypeId"
                    render={({ field }) => (
                      <Combobox {...p} value={field.value} onChange={field.onChange} options={options.mailTypes} clearLabel="Aucun type" onCreate={create.mailType} />
                    )}
                  />
                )}
              </Field>
            ) : null}
          </Section>

          {incoming ? (
            <Section title="Suivi">
              <Field label="Suivi" required error={errors.followUpId?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="followUpId"
                    render={({ field }) => <Combobox {...p} value={field.value} onChange={field.onChange} options={options.followUps} onCreate={create.followUp} />}
                  />
                )}
              </Field>
              <Field label="Position" required error={errors.positionId?.message}>
                {(p) => (
                  <Controller
                    control={control}
                    name="positionId"
                    render={({ field }) => <Combobox {...p} value={field.value} onChange={field.onChange} options={options.positions} onCreate={create.position} />}
                  />
                )}
              </Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Controller
                  control={control}
                  name="isProcessed"
                  render={({ field }) => <Switch id="mail-processed" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <label htmlFor="mail-processed" className="text-sm font-medium">
                  Traité
                </label>
              </div>
            </Section>
          ) : null}

          <Section title="Pièces jointes">
            <AttachmentsField value={attachments} onChange={setAttachments} excludeIds={(existing ?? []).map((d) => d.id)} />
          </Section>

          <Section title="Confidentialité">
            <div className="sm:col-span-2">
              <Controller
                control={control}
                name="confidentiality"
                render={({ field }) => (
                  <Segmented
                    label="Confidentialité"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'restricted', label: 'Restreint' },
                    ]}
                  />
                )}
              />
              <p className="mt-2 text-xs text-text-muted">
                Un courrier restreint n’est visible que de l’administrateur, de la personne qui l’a enregistré et de son destinataire.
              </p>
            </div>
          </Section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button type="button" onClick={requestClose}>
            Annuler
          </Button>
          {isNew ? (
            <Button type="button" disabled={isSubmitting} onClick={() => void save(true)()}>
              Enregistrer et nouveau
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Enregistrer le courrier
          </Button>
        </div>
        <ConfirmDialog
          open={confirmClose}
          onOpenChange={setConfirmClose}
          title="Fermer sans enregistrer ?"
          description="Les informations saisies dans ce formulaire seront perdues."
          confirmLabel="Fermer sans enregistrer"
          danger
          onConfirm={onClose}
        />
      </form>
    </Sheet>
  )
}
