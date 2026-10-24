import { Check, Download, Link2, Lock, Pencil, Printer, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyMailbox } from '@/components/icons/EmptyIllustration'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { errorMessage } from '@/data/errors'
import {
  deleteDocument,
  downloadDocument,
  linkDocuments,
  openDocument,
  printDocument,
  restoreDocument,
  rotateDocument,
  updateDocumentTitle,
  useDocument,
} from '@/data/repositories/documents'
import { useEntityHistory } from '@/data/repositories/history'
import { useMails } from '@/data/repositories/mails'
import { categoryLabels } from '@/data/schemas/document'
import { useSession } from '@/data/session'
import type { DocumentRecord } from '@/data/types'
import { ocrRunner } from '@/lib/ocr'
import { printBlob, saveBlob } from '@/lib/viewer/actions'
import { OcrBadge } from './DocumentsListPage'
import { HistoryTab, InfoTab, TextTab } from './DocumentPanel'
import { useShortcuts } from './useShortcuts'

const PdfViewer = lazy(() => import('./PdfViewer'))
const ImageViewer = lazy(() => import('./ImageViewer'))

type Opened = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; blob: Blob; url: string | undefined }

/**
 * Ouvre le document par `openDocument` (qui journalise la consultation), puis garde le fichier
 * en mémoire. L'URL `blob:` d'une image est révoquée au démontage.
 */
function useOpenedDocument(id: string | undefined, kind: DocumentRecord['kind'] | undefined): Opened {
  const [state, setState] = useState<Opened>({ status: 'loading' })

  useEffect(() => {
    if (!id || !kind) return
    let alive = true
    let url: string | undefined
    openDocument(id).then(
      ({ blob }) => {
        if (!alive) return
        url = kind === 'image' ? URL.createObjectURL(blob) : undefined
        setState({ status: 'ready', blob, url })
      },
      (error) => alive && setState({ status: 'error', message: errorMessage(error) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, kind])

  return state
}

export function DocumentPage() {
  const { id } = useParams()
  const doc = useDocument(id)

  if (doc === undefined) {
    return (
      <div role="status" aria-label="Chargement" className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-12 w-96 max-w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    )
  }
  if (doc === null) {
    return (
      <>
        <Breadcrumb items={[{ label: 'Tous les documents', to: '/documents' }, { label: 'Introuvable' }]} />
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            illustration={<EmptyMailbox />}
            title="Document introuvable"
            description="Il a peut-être été supprimé, ou vous n’avez pas le droit de le consulter."
            action={
              <Button asChild>
                <Link to="/documents">Retourner à la liste</Link>
              </Button>
            }
          />
        </div>
      </>
    )
  }
  return <Viewer key={doc.id} doc={doc} />
}

function Viewer({ doc }: { doc: DocumentRecord }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canEdit = useSession().user?.role !== 'reader'
  const opened = useOpenedDocument(doc.id, doc.kind)
  const history = useEntityHistory('document', doc.id)
  const searchRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'info' | 'text' | 'history'>(params.get('q') ? 'text' : 'info')
  const [linking, setLinking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = params.get('q') ?? ''
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  useShortcuts({
    '/': () => {
      setTab('text')
      queueMicrotask(() => searchRef.current?.focus())
    },
  })

  async function download() {
    try {
      const { doc: d, blob } = await downloadDocument(doc.id)
      saveBlob(blob, d.originalFilename)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  async function print() {
    try {
      const { doc: d, blob } = await printDocument(doc.id)
      printBlob(blob, d.kind)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  async function rotate(direction: 1 | -1) {
    try {
      await rotateDocument(doc.id, direction)
      // La rotation s'applique aussi à la lecture : on propose de relire l'image.
      if (doc.ocrStatus === 'done') {
        toast('Image pivotée', { duration: 6000, action: { label: 'Relancer la lecture', onClick: () => void ocrRunner.retry([doc.id]) } })
      }
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  async function relaunch() {
    try {
      await ocrRunner.retry([doc.id])
      toast.success('Lecture relancée')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  async function remove() {
    try {
      await deleteDocument(doc.id)
      navigate('/documents', { replace: true })
      toast.success(`Document « ${doc.title} » supprimé`, {
        duration: 6000,
        action: {
          label: 'Annuler',
          onClick: () =>
            void restoreDocument(doc.id).then(
              () => toast.success('Document restauré'),
              (error) => toast.error(errorMessage(error)),
            ),
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Tous les documents', to: '/documents' }, { label: doc.title }]} />
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <FileTypeIcon kind={doc.kind} label={doc.originalFilename.split('.').pop()} size={48} />
          <div className="min-w-0">
            <EditableTitle doc={doc} canEdit={canEdit} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="petrol">{categoryLabels[doc.category]}</Badge>
              <OcrBadge status={doc.ocrStatus} />
              {doc.confidentiality === 'restricted' ? (
                <Badge>
                  <Icon icon={Lock} size={14} />
                  Restreint
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void download()}>
            <Icon icon={Download} />
            Télécharger
          </Button>
          <Button onClick={() => void print()}>
            <Icon icon={Printer} />
            Imprimer
          </Button>
          {canEdit ? (
            <>
              {doc.ocrStatus !== 'pending' && doc.ocrStatus !== 'processing' ? <Button onClick={() => void relaunch()}>Relancer la lecture</Button> : null}
              <Button onClick={() => setLinking(true)}>
                <Icon icon={Link2} />
                Lier à un courrier
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                <Icon icon={Trash2} />
                Supprimer
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="h-[72vh] min-h-[420px] overflow-hidden rounded-card border border-border bg-surface shadow-card" aria-label="Aperçu du document">
          {opened.status === 'loading' ? (
            <Skeleton className="m-6 h-[480px] w-[360px] max-w-full" />
          ) : opened.status === 'error' ? (
            <EmptyState illustration={<EmptyMailbox />} title="Ce document ne peut pas être ouvert" description={opened.message} />
          ) : (
            <Suspense fallback={<Skeleton className="m-6 h-[480px] w-[360px] max-w-full" />}>
              {doc.kind === 'pdf' ? (
                <PdfViewer blob={opened.blob} page={page} onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')} />
              ) : (
                <ImageViewer
                  src={opened.url!}
                  alt={doc.title}
                  rotation={doc.rotation}
                  onRotate={canEdit ? (direction) => void rotate(direction) : undefined}
                />
              )}
            </Suspense>
          )}
        </section>

        <aside className="flex h-[72vh] min-h-[420px] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card" aria-label="Détails du document">
          <div className="border-b border-border p-3">
            <Segmented
              label="Panneau"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'info', label: 'Informations' },
                { value: 'text', label: 'Texte' },
                { value: 'history', label: 'Historique' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'info' ? <InfoTab doc={doc} history={history} /> : null}
            {tab === 'text' ? <TextTab doc={doc} page={page} query={query} onQuery={(q) => setParam('q', q)} searchRef={searchRef} /> : null}
            {tab === 'history' ? <HistoryTab history={history} /> : null}
          </div>
        </aside>
      </div>

      <LinkDialog documentId={doc.id} open={linking} onOpenChange={setLinking} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Supprimer « ${doc.title} » ?`}
        description="Il disparaîtra des listes et des courriers auxquels il est rattaché. L’opération est enregistrée dans l’historique."
        confirmLabel="Supprimer le document"
        danger
        onConfirm={remove}
      />
    </>
  )
}

function EditableTitle({ doc, canEdit }: { doc: DocumentRecord; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(doc.title)
  const [error, setError] = useState<string>()

  async function save() {
    try {
      await updateDocumentTitle(doc.id, value)
      setEditing(false)
      setError(undefined)
      toast.success('Titre enregistré')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="truncate text-[26px] leading-8 font-bold tracking-[-0.015em]">{doc.title}</h1>
        {canEdit ? (
          <button
            type="button"
            aria-label="Modifier le titre"
            onClick={() => {
              setValue(doc.title)
              setEditing(true)
            }}
            className="grid size-8 shrink-0 place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <Icon icon={Pencil} />
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        aria-label="Titre du document"
        aria-invalid={!!error}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="h-10 min-w-[280px] rounded-control border border-border bg-surface px-3 text-lg font-semibold focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none aria-[invalid=true]:border-danger"
      />
      <Button type="submit" size="icon" variant="primary" aria-label="Enregistrer le titre">
        <Icon icon={Check} />
      </Button>
      <Button type="button" size="icon" aria-label="Annuler la modification" onClick={() => setEditing(false)}>
        <Icon icon={X} />
      </Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </form>
  )
}

function LinkDialog({ documentId, open, onOpenChange }: { documentId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const incoming = useMails('incoming')
  const outgoing = useMails('outgoing')
  const [mailId, setMailId] = useState('')
  const options = useMemo(
    () => [
      ...(incoming ?? []).map((m) => ({ value: m.id, label: `Arrivé ${m.reference} : ${m.subject}` })),
      ...(outgoing ?? []).map((m) => ({ value: m.id, label: `Départ ${m.reference} : ${m.subject}` })),
    ],
    [incoming, outgoing],
  )

  async function link() {
    try {
      await linkDocuments([documentId], 'mail', mailId)
      toast.success('Document rattaché')
      setMailId('')
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Lier à un courrier" description="Le document apparaîtra dans les pièces jointes du courrier choisi.">
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Courrier">{(p) => <Combobox {...p} value={mailId} onChange={setMailId} options={options} placeholder="Choisir un courrier" />}</Field>
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="primary" disabled={!mailId} onClick={() => void link()}>
            Lier le document
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
