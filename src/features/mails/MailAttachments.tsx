import { Paperclip, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Dialog } from '@/components/ui/Dialog'
import { Dropzone } from '@/components/ui/Dropzone'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { errorMessage } from '@/data/errors'
import { linkDocuments, unlinkDocument, useDocuments, useDocumentsForEntity, useThumbnailUrl } from '@/data/repositories/documents'
import { useSettings } from '@/data/repositories/settings'
import type { DocumentCategory, DocumentRecord, LinkEntityType } from '@/data/types'
import { todayIn } from '@/lib/dates'
import { importQueue } from '@/lib/import'
import { formatBytes } from '@/lib/storage'

function describe(d: DocumentRecord) {
  return `${d.kind === 'pdf' ? 'PDF' : 'Image'}, ${d.pageCount} page${d.pageCount > 1 ? 's' : ''}, ${formatBytes(d.sizeBytes)}`
}

/** Documents archivés qu'on peut encore rattacher (pas déjà choisis ni déjà liés). */
function useArchiveOptions(excludeIds: string[]) {
  const documents = useDocuments()
  return useMemo(
    () => (documents ?? []).filter((d) => !excludeIds.includes(d.id)).map((d) => ({ value: d.id, label: d.title })),
    [documents, excludeIds],
  )
}

function Card({ doc, onDetach }: { doc: DocumentRecord; onDetach?: () => void }) {
  const thumbnail = useThumbnailUrl(doc.id)
  return (
    <li className="flex items-center gap-3 rounded-control border border-border p-3">
      <div className="grid h-[60px] w-12 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-border bg-surface-muted">
        {thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover object-top" /> : <FileTypeIcon kind={doc.kind} label={doc.originalFilename.split('.').pop()} size={28} />}
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/documents/${doc.id}`} className="block truncate text-sm font-medium underline-offset-2 hover:underline" title={doc.title}>
          {doc.title}
        </Link>
        <p className="text-xs text-text-muted">{describe(doc)}</p>
      </div>
      {onDetach ? (
        <button
          type="button"
          aria-label={`Détacher ${doc.title}`}
          onClick={onDetach}
          className="grid size-8 place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <Icon icon={X} />
        </button>
      ) : null}
    </li>
  )
}

/** Pièces jointes de la fiche d'un élément (courrier, décret, facture…) : cartes avec miniature, ajout, rattachement, détachement. */
export function EntityAttachments({
  entityType,
  entityId,
  canEdit,
  category,
  noun,
}: {
  entityType: LinkEntityType
  entityId: string
  canEdit: boolean
  category: DocumentCategory
  noun: string
}) {
  const settings = useSettings()
  const docs = useDocumentsForEntity(entityType, entityId)
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState('')
  const linkedIds = useMemo(() => (docs ?? []).map((d) => d.id), [docs])
  const options = useArchiveOptions(linkedIds)

  async function attach() {
    try {
      await linkDocuments([pick], entityType, entityId)
      toast.success('Document rattaché')
      setPicking(false)
      setPick('')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function detach(doc: DocumentRecord) {
    try {
      await unlinkDocument(doc.id, entityType, entityId)
      toast.success('Document détaché', {
        duration: 6000,
        action: { label: 'Annuler', onClick: () => void linkDocuments([doc.id], entityType, entityId).catch((e) => toast.error(errorMessage(e))) },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="files-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="files-title" className="text-base font-semibold">
          Pièces jointes{docs?.length ? ` (${docs.length})` : ''}
        </h2>
        {canEdit ? (
          <Button size="sm" onClick={() => setPicking(true)}>
            <Icon icon={Paperclip} />
            Choisir dans les archives
          </Button>
        ) : null}
      </div>

      {docs && docs.length > 0 ? (
        <ul className="mb-4 grid gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <Card key={d.id} doc={d} onDetach={canEdit ? () => void detach(d) : undefined} />
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-[13px] text-text-muted">{`Aucune pièce jointe. Les documents rattachés à ${noun} apparaîtront ici.`}</p>
      )}

      {canEdit ? (
        <Dropzone
          compact
          maxMb={settings?.maxUploadMb}
          label="Ajouter des pièces jointes"
          onFiles={(files) =>
            importQueue.enqueue(files, {
              category,
              archivedAt: todayIn(settings?.timezone ?? 'UTC'),
              link: { entityType, entityId },
            })
          }
        />
      ) : null}

      <Dialog open={picking} onOpenChange={setPicking} title="Rattacher un document archivé" description={`Le document reste dans les archives et apparaît aussi sur ${noun}.`}>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Document">{(p) => <Combobox {...p} value={pick} onChange={setPick} options={options} placeholder="Choisir un document" />}</Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPicking(false)}>Annuler</Button>
            <Button variant="primary" disabled={!pick} onClick={() => void attach()}>
              Rattacher le document
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  )
}

export interface PendingAttachments {
  files: File[]
  documentIds: string[]
}

/** Section « Pièces jointes » du formulaire : les fichiers sont importés après l'enregistrement du courrier. */
export function AttachmentsField({ value, onChange, excludeIds = [] }: { value: PendingAttachments; onChange: (v: PendingAttachments) => void; excludeIds?: string[] }) {
  const settings = useSettings()
  const documents = useDocuments()
  const options = useArchiveOptions([...excludeIds, ...value.documentIds])
  const titles = new Map((documents ?? []).map((d) => [d.id, d.title]))

  const rows = [
    ...value.files.map((f, i) => ({ key: `f${i}`, label: f.name, onRemove: () => onChange({ ...value, files: value.files.filter((_, j) => j !== i) }) })),
    ...value.documentIds.map((id) => ({
      key: id,
      label: titles.get(id) ?? 'Document archivé',
      onRemove: () => onChange({ ...value, documentIds: value.documentIds.filter((d) => d !== id) }),
    })),
  ]

  return (
    <div className="space-y-3 sm:col-span-2">
      <Dropzone compact maxMb={settings?.maxUploadMb} label="Ajouter des pièces jointes" onFiles={(files) => onChange({ ...value, files: [...value.files, ...files] })} />
      <Field label="Choisir dans les archives">
        {(p) => <Combobox {...p} value="" onChange={(id) => id && onChange({ ...value, documentIds: [...value.documentIds, id] })} options={options} placeholder="Rattacher un document déjà archivé" />}
      </Field>
      {rows.length > 0 ? (
        <ul className="divide-y divide-border rounded-control border border-border" aria-label="Pièces jointes à ajouter">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Icon icon={Paperclip} className="text-text-muted" />
                <span className="truncate">{r.label}</span>
              </span>
              <button type="button" aria-label={`Retirer ${r.label}`} onClick={r.onRemove} className="grid size-7 place-items-center rounded-control text-text-muted hover:bg-surface-muted">
                <Icon icon={X} size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Pièces jointes d'un courrier. */
export function MailAttachments({ mailId, canEdit }: { mailId: string; canEdit: boolean }) {
  return <EntityAttachments entityType="mail" entityId={mailId} canEdit={canEdit} category="mailAttachment" noun="ce courrier" />
}
