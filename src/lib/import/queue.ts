import { createStore } from 'zustand/vanilla'
import type { ImportFileMeta, ImportInput, ImportResult } from '@/data/repositories/documents'
import type { DocumentCategory, LinkEntityType } from '@/data/types'
import type { PreparedFile } from './prepare'
import { REJECT_FORMAT, sizeError, spaceError, titleFromFilename, type DetectedFile } from './validate'

/** queued, reading, saving puis ocrQueued (en attente de lecture), sorties : duplicate, rejected, failed, canceled. */
export type ImportState =
  | 'queued'
  | 'reading'
  | 'saving'
  | 'ocrQueued'
  | 'ocrRunning'
  | 'done'
  | 'duplicate'
  | 'rejected'
  | 'failed'
  | 'canceled'

export interface ImportOptions {
  category: DocumentCategory
  /** AAAA-MM-JJ */
  archivedAt: string
  link?: { entityType: LinkEntityType; entityId: string }
}

export interface ImportItem {
  id: string
  file: File
  name: string
  size: number
  options: ImportOptions
  state: ImportState
  /** 0 à 1, pour l'étape en cours. */
  progress: number
  /** Libellé de l'étape en cours. */
  step: string
  /** Cause d'un refus, d'une erreur ou d'un doublon. */
  message?: string
  warning?: string
  documentId?: string
  existingId?: string
  pageCount?: number
}

export interface ImportDeps {
  detect(file: File): Promise<DetectedFile | null>
  limits(): Promise<{ maxUploadMb: number; usage: number | null; quota: number | null }>
  hash(file: File, onProgress: (read: number, total: number) => void, signal: AbortSignal): Promise<string>
  findDuplicate(sha256: string): Promise<{ id: string; title: string } | undefined>
  prepare(file: File, kind: 'pdf' | 'image'): Promise<PreparedFile>
  save(input: ImportInput): Promise<ImportResult>
  /** Imports simultanés (3 par défaut). */
  concurrency?: number
  errorMessage(error: unknown): string
}

export interface ImportQueueState {
  items: ImportItem[]
  /** Panneau « Imports » : ouvert dès qu'un import commence, réductible. */
  trayOpen: boolean
  trayCollapsed: boolean
}

const ACTIVE: ImportState[] = ['queued', 'reading', 'saving']
export const isActive = (s: ImportState) => ACTIVE.includes(s)

export function createImportQueue(deps: ImportDeps) {
  const store = createStore<ImportQueueState>(() => ({ items: [], trayOpen: false, trayCollapsed: false }))
  const controllers = new Map<string, AbortController>()
  const concurrency = deps.concurrency ?? 3
  let running = 0

  const update = (id: string, patch: Partial<ImportItem>) =>
    store.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const get = (id: string) => store.getState().items.find((i) => i.id === id)

  async function run(id: string) {
    const item = get(id)
    if (!item) return
    const controller = new AbortController()
    controllers.set(id, controller)
    const { signal } = controller
    const stop = () => signal.aborted
    const { file, options } = item

    try {
      update(id, { state: 'reading', progress: 0, step: 'Contrôle du fichier' })
      const detected = await deps.detect(file)
      if (stop()) return
      if (!detected) return update(id, { state: 'rejected', message: REJECT_FORMAT, step: 'Refusé' })

      const limits = await deps.limits()
      const refusal = sizeError(file.size, limits.maxUploadMb) ?? spaceError(file.size, limits)
      if (refusal) return update(id, { state: 'rejected', message: refusal, step: 'Refusé' })

      update(id, { step: 'Lecture du fichier' })
      const sha256 = await deps.hash(file, (read, total) => update(id, { progress: total ? read / total : 1 }), signal)
      if (stop()) return

      const duplicate = await deps.findDuplicate(sha256)
      if (duplicate) {
        // On passe aussi par save() : il écrit la trace du refus dans le journal, dans sa transaction.
        const result = await deps.save({ blob: file, meta: metaOf(file, detected, sha256, 1), category: options.category, archivedAt: options.archivedAt })
        return update(id, {
          state: 'duplicate',
          step: 'Déjà archivé',
          message: 'Déjà archivé',
          existingId: result.status === 'duplicate' ? result.existingId : duplicate.id,
        })
      }

      update(id, { step: 'Préparation', progress: 1 })
      const prepared = await deps.prepare(file, detected.kind)
      if (stop()) return

      update(id, { state: 'saving', step: 'Enregistrement', pageCount: prepared.pageCount })
      const result = await deps.save({
        blob: file,
        thumbnail: prepared.thumbnail,
        meta: { ...metaOf(file, detected, sha256, prepared.pageCount), width: prepared.width, height: prepared.height },
        category: options.category,
        archivedAt: options.archivedAt,
        link: options.link,
      })
      if (result.status === 'duplicate') {
        return update(id, { state: 'duplicate', step: 'Déjà archivé', message: 'Déjà archivé', existingId: result.existingId })
      }
      update(id, {
        state: 'ocrQueued',
        step: 'En attente de lecture',
        progress: 1,
        documentId: result.id,
        warning: result.sameNameCount > 0 ? 'Un document du même nom existe déjà avec un contenu différent.' : undefined,
      })
    } catch (error) {
      if (stop()) return
      update(id, { state: 'failed', step: 'Échec', message: deps.errorMessage(error) })
    } finally {
      controllers.delete(id)
    }
  }

  function metaOf(file: File, detected: DetectedFile, sha256: string, pageCount: number): ImportFileMeta {
    return {
      title: titleFromFilename(file.name),
      originalFilename: file.name,
      kind: detected.kind,
      mimeType: detected.mimeType as ImportFileMeta['mimeType'],
      sizeBytes: file.size,
      sha256,
      pageCount,
    }
  }

  function pump() {
    for (const item of store.getState().items) {
      if (running >= concurrency) return
      if (item.state !== 'queued' || controllers.has(item.id)) continue
      running++
      void run(item.id).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    store,
    enqueue(files: File[], options: ImportOptions): string[] {
      const added: ImportItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        options,
        state: 'queued',
        progress: 0,
        step: 'En attente',
      }))
      store.setState((s) => ({ items: [...s.items, ...added], trayOpen: true, trayCollapsed: false }))
      pump()
      return added.map((i) => i.id)
    },
    cancel(id: string) {
      const item = get(id)
      if (!item || !isActive(item.state)) return
      controllers.get(id)?.abort()
      update(id, { state: 'canceled', step: 'Annulé', message: 'Import annulé.' })
    },
    retry(id: string) {
      const item = get(id)
      if (!item || (item.state !== 'failed' && item.state !== 'canceled')) return
      update(id, { state: 'queued', progress: 0, step: 'En attente', message: undefined })
      pump()
    },
    /** Retire les lignes terminées de la liste (les documents restent archivés). */
    clearFinished() {
      store.setState((s) => ({ items: s.items.filter((i) => isActive(i.state)) }))
    },
    setTray(patch: Partial<Pick<ImportQueueState, 'trayOpen' | 'trayCollapsed'>>) {
      store.setState(patch)
    },
  }
}

export type ImportQueue = ReturnType<typeof createImportQueue>
