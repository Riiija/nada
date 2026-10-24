import { useStore } from 'zustand'
import { errorMessage } from '@/data/errors'
import { findDuplicate, saveImportedDocument } from '@/data/repositories/documents'
import { getSettings } from '@/data/repositories/settings'
import { getStorageStatus } from '../storage'
import { sha256InWorker } from './hash'
import { prepareFile } from './prepare'
import { createImportQueue, type ImportQueueState } from './queue'
import { detectFile } from './validate'

/** File d'import globale : le panneau « Imports » survit à la navigation. */
export const importQueue = createImportQueue({
  detect: detectFile,
  limits: async () => {
    const [settings, storage] = await Promise.all([getSettings(), getStorageStatus()])
    return { maxUploadMb: settings.maxUploadMb, usage: storage.usage, quota: storage.quota }
  },
  hash: sha256InWorker,
  findDuplicate,
  prepare: prepareFile,
  save: saveImportedDocument,
  errorMessage: (error) => errorMessage(error, "L'import de ce fichier a échoué. Réessayez."),
})

export function useImportQueue<T>(selector: (state: ImportQueueState) => T): T {
  return useStore(importQueue.store, selector)
}

export { isActive, type ImportItem, type ImportOptions, type ImportState } from './queue'
