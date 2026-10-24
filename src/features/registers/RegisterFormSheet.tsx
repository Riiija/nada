import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DatePicker } from '@/components/ui/DatePicker'
import { Field, Input } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { errorMessage } from '@/data/errors'
import { linkDocuments, useDocumentsForEntity } from '@/data/repositories/documents'
import { saveReference } from '@/data/repositories/referenceData'
import { createRegisterEntry, registerDefinitions, updateRegisterEntry, useNextRegisterReference, type RegisterRow } from '@/data/repositories/registers'
import { useSettings } from '@/data/repositories/settings'
import { invoiceStatusLabels } from '@/data/schemas/registers'
import { AttachmentsField, type PendingAttachments } from '@/features/mails/MailAttachments'
import { todayIn } from '@/lib/dates'
import { importQueue } from '@/lib/import'
import { moneyToInput } from '@/lib/money'
import type { RegisterConfig } from './config'
import { CREATE_INPUT, SOURCE_TYPE, useRegisterLookups } from './useRegisterLookups'

type Values = Record<string, string>

type Props = {
  config: RegisterConfig
  /** null = création. */
  row: RegisterRow | null
  open: boolean
  onClose: () => void
}

export function RegisterFormSheet({ config, row, open, onClose }: Props) {
  // Remonté à chaque ouverture : valeurs et erreurs repartent de zéro.
  return open ? <Form key={row?.id ?? 'new'} config={config} row={row} onClose={onClose} /> : null
}

function initial(config: RegisterConfig, row: RegisterRow | null, today: string, kept: Values | null): Values {
  return Object.fromEntries(
    config.fields.map((f) => {
      const stored = row?.[f.name]
      if (f.kind === 'money') return [f.name, moneyToInput(typeof stored === 'number' ? stored : undefined)]
      if (stored !== undefined && stored !== null) return [f.name, String(stored)]
      if (!row && kept && f.name in kept) return [f.name, kept[f.name]!]
      if (!row && f.name === config.dateField) return [f.name, today]
      if (!row && f.kind === 'status') return [f.name, 'received']
      return [f.name, '']
    }),
  )
}

function Form({ config, row, onClose }: Omit<Props, 'open'>) {
  const settings = useSettings()
  const lookups = useRegisterLookups()
  const nextReference = useNextRegisterReference(config.type)
  const existing = useDocumentsForEntity(config.entityType, row?.id)
  const [confirmClose, setConfirmClose] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachments>({ files: [], documentIds: [] })
  const today = todayIn(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const isNew = row === null

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: initial(config, row, today, null),
    resolver: zodResolver(registerDefinitions[config.type].schema as never) as unknown as Resolver<Values>,
  })

  const hasAttachments = attachments.files.length + attachments.documentIds.length > 0
  const requestClose = () => (isDirty || hasAttachments ? setConfirmClose(true) : onClose())

  const save = (andNew: boolean) =>
    handleSubmit(async (values) => {
      try {
        let id = row?.id ?? ''
        if (isNew) {
          const created = await createRegisterEntry(config.type, values)
          id = created.id
          toast.success(config.saved, { description: created.reference ? `N° ${created.reference}` : undefined })
        } else {
          await updateRegisterEntry(config.type, row.id, values)
          toast.success('Modifications enregistrées')
        }
        if (attachments.files.length > 0) {
          importQueue.enqueue(attachments.files, { category: config.category, archivedAt: today, link: { entityType: config.entityType, entityId: id } })
        }
        if (attachments.documentIds.length > 0) await linkDocuments(attachments.documentIds, config.entityType, id)
        setAttachments({ files: [], documentIds: [] })
        if (andNew && isNew) {
          reset(initial(config, null, today, { [config.dateField]: values[config.dateField] ?? today }))
          queueMicrotask(() => document.querySelector<HTMLElement>('[role="dialog"] form input')?.focus())
        } else {
          onClose()
        }
      } catch (error) {
        setError(config.fields[0]!.name, { message: errorMessage(error) })
      }
    })

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      title={isNew ? config.newTitle : `${config.editTitle}${row.reference ? ` ${row.reference}` : ''}`}
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
          <section className="px-6 py-5">
            <h3 className="mb-4 text-base font-semibold">Informations</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {config.numbered ? (
                <Field label="N° attribué à l’enregistrement" help={isNew ? 'Le numéro définitif apparaît à l’enregistrement.' : undefined}>
                  {(p) => <Input {...p} readOnly value={row?.reference ?? nextReference ?? ''} className="bg-surface-muted" />}
                </Field>
              ) : null}
              {config.fields.map((field) => {
                const wide = field.kind === 'textarea' || field.name === 'subject' || field.name === 'label'
                const error = errors[field.name]?.message
                return (
                  <div key={field.name} className={wide ? 'sm:col-span-2' : undefined}>
                    <Field label={field.label} required={field.required} help={field.help} error={error}>
                      {(p) => {
                        if (field.kind === 'date') {
                          return <Controller control={control} name={field.name} render={({ field: f }) => <DatePicker {...p} value={f.value} onChange={f.onChange} />} />
                        }
                        if (field.kind === 'select' && field.source) {
                          const source = field.source
                          return (
                            <Controller
                              control={control}
                              name={field.name}
                              render={({ field: f }) => (
                                <Combobox
                                  {...p}
                                  value={f.value}
                                  onChange={f.onChange}
                                  options={lookups.options(source, typeof row?.[field.name] === 'string' ? (row[field.name] as string) : undefined)}
                                  clearLabel={field.clearLabel}
                                  onCreate={(label) => saveReference(SOURCE_TYPE[source], null, CREATE_INPUT[source](label))}
                                />
                              )}
                            />
                          )
                        }
                        if (field.kind === 'status') {
                          return (
                            <Select {...p} {...register(field.name)}>
                              {Object.entries(invoiceStatusLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                          )
                        }
                        if (field.kind === 'textarea') {
                          return (
                            <textarea
                              {...p}
                              rows={3}
                              {...register(field.name)}
                              className="min-h-[76px] w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none aria-[invalid=true]:border-danger"
                            />
                          )
                        }
                        return (
                          <Input
                            {...p}
                            autoComplete="off"
                            inputMode={field.kind === 'money' ? 'decimal' : undefined}
                            placeholder={field.kind === 'money' ? `0${settings?.currency ? ` ${settings.currency}` : ''}` : undefined}
                            className={field.kind === 'money' ? 'text-right' : undefined}
                            {...register(field.name)}
                          />
                        )
                      }}
                    </Field>
                  </div>
                )
              })}
            </div>
          </section>
          <section className="border-t border-border px-6 py-5">
            <h3 className="mb-4 text-base font-semibold">Pièces jointes</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <AttachmentsField value={attachments} onChange={setAttachments} excludeIds={(existing ?? []).map((d) => d.id)} />
            </div>
          </section>
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
            {config.saveLabel}
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
