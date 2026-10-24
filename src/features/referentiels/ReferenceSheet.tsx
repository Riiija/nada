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
import { referenceDefinitions, saveReference, useReference, type ReferenceRow } from '@/data/repositories/referenceData'
import type { ReferenceConfig } from './config'

type Values = Record<string, string>

type Props = {
  config: ReferenceConfig
  /** null = création. */
  row: ReferenceRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function initialValues(config: ReferenceConfig, row: ReferenceRow | null): Values {
  return Object.fromEntries(config.fields.map((f) => [f.name, row?.[f.name] == null ? '' : String(row[f.name])]))
}

export function ReferenceSheet({ config, row, open, onOpenChange }: Props) {
  // Le formulaire est remonté à chaque ouverture : valeurs et erreurs repartent de zéro.
  return open ? <SheetForm key={row?.id ?? 'new'} config={config} row={row} onClose={() => onOpenChange(false)} /> : null
}

function SheetForm({ config, row, onClose }: { config: ReferenceConfig; row: ReferenceRow | null; onClose: () => void }) {
  const [confirmClose, setConfirmClose] = useState(false)
  const departments = useReference('departments')
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    defaultValues: initialValues(config, row),
    resolver: zodResolver(referenceDefinitions[config.type].schema as never) as unknown as Resolver<Values>,
  })

  const save = (andNew: boolean) =>
    handleSubmit(async (values) => {
      try {
        await saveReference(config.type, row?.id ?? null, values)
        toast.success(config.saved)
        if (andNew && !row) {
          reset(initialValues(config, null))
          setFocus(config.fields[0]!.name)
        } else {
          onClose()
        }
      } catch (error) {
        setError(config.fields[0]!.name, { message: errorMessage(error) })
      }
    })

  const requestClose = () => (isDirty ? setConfirmClose(true) : onClose())

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      title={row ? config.editTitle : config.newTitle}
      description={row ? undefined : 'Les champs marqués d’un astérisque sont obligatoires.'}
    >
    <form
      onSubmit={save(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(false)(e)
      }}
      noValidate
      className="flex h-full flex-col"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {config.fields.map((field, index) => {
          const error = errors[field.name]?.message
          const options =
            field.optionsFrom === 'departments'
              ? (departments ?? [])
                  .filter((d) => d.isActive === 1 || d.id === row?.[field.name])
                  .map((d) => ({ value: d.id, label: String(d.name) }))
              : (field.options ?? [])
          return (
            <Field key={field.name} label={field.label} required={field.required} help={field.help} error={error}>
              {(p) =>
                field.kind === 'select' ? (
                  <Select {...p} {...register(field.name)}>
                    <option value="">{field.emptyLabel ?? 'Choisir…'}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    {...p}
                    type={field.kind === 'text' ? 'text' : field.kind}
                    inputMode={field.kind === 'number' ? 'numeric' : undefined}
                    autoFocus={index === 0}
                    {...register(field.name)}
                  />
                )
              }
            </Field>
          )
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-6 py-4">
        <Button type="button" onClick={requestClose}>
          Annuler
        </Button>
        {row ? null : (
          <Button type="button" disabled={isSubmitting} onClick={() => void save(true)()}>
            Enregistrer et nouveau
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Enregistrer
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
