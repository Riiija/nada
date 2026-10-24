import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DatePicker } from '@/components/ui/DatePicker'
import { Dropzone } from '@/components/ui/Dropzone'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useMails } from '@/data/repositories/mails'
import { useSettings } from '@/data/repositories/settings'
import { categoryLabels, documentCategories } from '@/data/schemas/document'
import type { DocumentCategory } from '@/data/types'
import { isValidDate, todayIn } from '@/lib/dates'
import { formatNumber } from '@/lib/format'
import { importQueue, useImportQueue } from '@/lib/import'
import { ImportRow } from './ImportRow'

/** Import en masse (équivalent du traitement WinDev de sélection multiple de PDF). */
export function ArchivagePage() {
  const settings = useSettings()
  const items = useImportQueue((s) => s.items)
  const incoming = useMails('incoming')
  const outgoing = useMails('outgoing')
  const [category, setCategory] = useState<DocumentCategory>('archive')
  const [date, setDate] = useState('')
  const [linkId, setLinkId] = useState('')
  const today = todayIn(settings?.timezone ?? 'UTC')
  const archivedAt = date || today
  const dateError = date && !isValidDate(date) ? "Saisissez une date d'archivage valide (jj/mm/aaaa)." : undefined

  const mailOptions = useMemo(
    () => [
      ...(incoming ?? []).map((m) => ({ value: m.id, label: `Arrivé ${m.reference} : ${m.subject}` })),
      ...(outgoing ?? []).map((m) => ({ value: m.id, label: `Départ ${m.reference} : ${m.subject}` })),
    ],
    [incoming, outgoing],
  )

  const count = (...states: string[]) => items.filter((i) => states.includes(i.state)).length
  const recap = [
    ['Sélectionnés', items.length],
    ['Ajoutés', count('ocrQueued', 'ocrRunning', 'done')],
    ['Doublons ignorés', count('duplicate')],
    ['Refusés', count('rejected')],
    ['Erreurs', count('failed', 'canceled')],
  ] as const
  const finished = items.length > 0 && items.every((i) => !['queued', 'reading', 'saving'].includes(i.state))

  return (
    <>
      <PageHeader title="Importer des documents" description="Ajoutez des PDF et des images par lot. Aucune boîte de dialogue ne bloque le traitement." />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="batch-title">
            <h2 id="batch-title" className="mb-4 text-base font-semibold">
              Options du lot
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Catégorie">
                {(p) => (
                  <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                    {documentCategories.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabels[c]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Date d’archivage" help="Aujourd’hui par défaut." error={dateError}>
                {(p) => <DatePicker {...p} value={date || today} onChange={setDate} />}
              </Field>
              <Field label="Lier à un courrier" help="Facultatif.">
                {(p) => <Combobox {...p} value={linkId} onChange={setLinkId} options={mailOptions} clearLabel="Aucun courrier" placeholder="Aucun courrier" />}
              </Field>
            </div>
          </section>

          <Dropzone
            maxMb={settings?.maxUploadMb}
            disabled={!!dateError}
            onFiles={(files) =>
              importQueue.enqueue(files, {
                category,
                archivedAt,
                link: linkId ? { entityType: 'mail', entityId: linkId } : undefined,
              })
            }
          />

          {items.length > 0 ? (
            <section className="rounded-card border border-border bg-surface shadow-card" aria-label="File d’import">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold">File d’import</h2>
                {finished ? (
                  <Button size="sm" onClick={() => importQueue.clearFinished()}>
                    Vider la liste
                  </Button>
                ) : null}
              </div>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <ImportRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="recap-title">
          <h2 id="recap-title" className="mb-4 text-base font-semibold">
            Récapitulatif
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            {recap.map(([label, value]) => (
              <div key={label}>
                <dd className="text-[22px] leading-7 font-bold">{formatNumber(value)}</dd>
                <dt className="text-xs text-text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <Button asChild className="mt-5 w-full">
            <Link to="/documents">Voir les documents ajoutés</Link>
          </Button>
        </aside>
      </div>
    </>
  )
}
