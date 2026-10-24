import { createStore } from 'zustand/vanilla'
import type { OcrJob, OcrResult } from '@/data/repositories/ocr'

export type OcrState = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface OcrJobState {
  id: string
  title: string
  state: OcrState
  /** 0 à 1 */
  progress: number
  label: string
  /** Confiance moyenne en fin de lecture, 0 à 100. */
  confidence?: number
  /** Lecture peu fiable : confiance sous 60 %. */
  lowConfidence?: boolean
  message?: string
}

export interface RunnerDeps {
  observePending(onChange: (ids: string[]) => void): () => void
  resetInterrupted(): Promise<void>
  claim(id: string): Promise<OcrJob | undefined>
  readFile(id: string): Promise<Blob>
  process(blob: Blob, job: OcrJob, progress: (fraction: number, label: string) => void, signal: AbortSignal): Promise<OcrResult>
  save(id: string, result: OcrResult): Promise<void>
  fail(id: string, reason: string): Promise<void>
  release(id: string): Promise<void>
  requeue(ids: string[]): Promise<number>
  /** Arrête le moteur en cours de lecture (annulation). */
  abortEngine(): Promise<void>
  /** Exclusion entre onglets : un seul onglet lit à la fois. */
  withLock<T>(task: () => Promise<T>): Promise<T | undefined>
  errorMessage(error: unknown): string
}

export const LOW_CONFIDENCE = 60

export function createOcrRunner(deps: RunnerDeps) {
  const store = createStore<{ jobs: Record<string, OcrJobState> }>(() => ({ jobs: {} }))
  const canceled = new Set<string>()
  let pending: string[] = []
  let busy = false
  let started = false
  let stopped = false
  let current: { id: string; controller: AbortController } | null = null
  let unobserve: (() => void) | null = null
  let release: (() => void) | null = null

  const patch = (id: string, change: Partial<OcrJobState>, base?: Partial<OcrJobState>) =>
    store.setState((s) => ({
      jobs: { ...s.jobs, [id]: { id, title: '', state: 'queued', progress: 0, label: 'En attente de lecture', ...s.jobs[id], ...base, ...change } },
    }))

  async function run(id: string) {
    const job = await deps.claim(id)
    if (!job) return
    const controller = new AbortController()
    current = { id, controller }
    patch(id, { state: 'running', title: job.title, progress: 0, label: 'Préparation du moteur de lecture', message: undefined })
    try {
      const blob = await deps.readFile(id)
      const result = await deps.process(blob, job, (fraction, label) => patch(id, { progress: fraction, ...(label ? { label } : {}) }), controller.signal)
      if (controller.signal.aborted) throw new DOMException('Annulé', 'AbortError')
      patch(id, { label: 'Indexation', progress: 1 })
      await deps.save(id, result)
      const confidence = result.confidence
      patch(id, { state: 'done', progress: 1, label: 'Indexé', confidence, lowConfidence: confidence !== undefined && confidence < LOW_CONFIDENCE })
    } catch (error) {
      if (controller.signal.aborted) {
        await deps.release(id)
        canceled.add(id)
        patch(id, { state: 'canceled', label: 'Lecture annulée', message: 'La lecture reprendra au prochain lancement.' })
      } else {
        const message = deps.errorMessage(error)
        await deps.fail(id, message).catch(() => undefined)
        patch(id, { state: 'failed', label: 'Lecture échouée', message })
      }
    } finally {
      current = null
    }
  }

  async function pump() {
    if (busy || stopped) return
    const next = pending.find((id) => !canceled.has(id))
    if (!next) return
    busy = true
    try {
      await run(next)
    } finally {
      busy = false
      // La liste à lire n'est rafraîchie qu'un peu plus tard : on écarte tout de suite le document traité.
      pending = pending.filter((id) => id !== next)
    }
    // La lecture d'un document modifie la liste à lire : on repart sur l'état à jour.
    await pump()
  }

  const onPending = (ids: string[]) => {
    pending = ids
    for (const id of ids) if (!store.getState().jobs[id] && !canceled.has(id)) patch(id, {})
    void pump()
  }

  return {
    store,
    /** Démarre la lecture automatique : reprend les documents interrompus puis suit les nouveaux. */
    start() {
      if (started) return
      started = true
      stopped = false
      void deps
        .withLock(async () => {
          if (stopped) return
          await deps.resetInterrupted()
          unobserve = deps.observePending(onPending)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        })
        .catch(() => undefined)
    },
    /** Arrête la lecture (déconnexion) : le travail en cours repasse « en attente ». */
    async stop() {
      stopped = true
      started = false
      unobserve?.()
      unobserve = null
      current?.controller.abort()
      await deps.abortEngine()
      release?.()
      release = null
      pending = []
    },
    cancel(id: string) {
      if (current?.id === id) {
        current.controller.abort()
        void deps.abortEngine()
      } else {
        canceled.add(id)
        patch(id, { state: 'canceled', label: 'Lecture annulée' })
      }
    },
    /** « Relancer la lecture » : un document en échec ou annulé retourne dans la file. */
    async retry(ids: string[]) {
      for (const id of ids) {
        canceled.delete(id)
        patch(id, { state: 'queued', progress: 0, label: 'En attente de lecture', message: undefined, lowConfidence: undefined })
      }
      await deps.requeue(ids)
      void pump()
    },
    clear(id: string) {
      store.setState((s) => {
        const { [id]: _removed, ...rest } = s.jobs
        void _removed
        return { jobs: rest }
      })
    },
  }
}

export type OcrRunner = ReturnType<typeof createOcrRunner>
