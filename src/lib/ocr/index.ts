import { useStore } from 'zustand'
import { errorMessage } from '@/data/errors'
import { claimOcr, failOcr, observePendingOcr, readFileForOcr, releaseOcr, requeueOcr, resetInterruptedOcr, saveOcrResult } from '@/data/repositories/ocr'
import { terminateEngine } from './engine'
import { readDocument } from './extract'
import { createOcrRunner, type OcrJobState } from './runner'

/** Un seul onglet lit à la fois (Web Locks) ; les autres reprennent la main s'il se ferme. */
async function withLock<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (typeof navigator !== 'undefined' && navigator.locks) return (await navigator.locks.request('ged-ocr', task)) as T
  return task()
}

export const ocrRunner = createOcrRunner({
  observePending: observePendingOcr,
  resetInterrupted: resetInterruptedOcr,
  claim: claimOcr,
  readFile: readFileForOcr,
  process: readDocument,
  save: saveOcrResult,
  fail: failOcr,
  release: releaseOcr,
  requeue: requeueOcr,
  abortEngine: terminateEngine,
  withLock,
  errorMessage: (error) => errorMessage(error, 'La lecture de ce document a échoué. Réessayez.'),
})

export function useOcrJob(documentId: string | undefined): OcrJobState | undefined {
  return useStore(ocrRunner.store, (s) => (documentId ? s.jobs[documentId] : undefined))
}

export function useOcrJobs(): OcrJobState[] {
  const jobs = useStore(ocrRunner.store, (s) => s.jobs)
  return Object.values(jobs)
}

export type { OcrJobState }
