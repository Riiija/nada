import { toast } from 'sonner'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { AppError, errorMessage } from '@/data/errors'
import { backupFilename, createBackup, memorySink, type BackupProgress, type BackupSink } from '@/data/backup'
import { getSettings } from '@/data/repositories/settings'
import { formatBytes } from '@/lib/storage'

interface BackupState {
  status: 'idle' | 'running' | 'error'
  progress?: BackupProgress
  error?: string
  /** L'historique est altéré : on propose de sauvegarder quand même. */
  chainBroken: boolean
}

interface FilePickerWindow {
  showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
    createWritable: () => Promise<{ write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }>
  }>
}

export const backupStore = createStore<BackupState>(() => ({ status: 'idle', chainBroken: false }))

export function useBackupState<T>(selector: (s: BackupState) => T): T {
  return useStore(backupStore, selector)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Lance une sauvegarde. Le fichier est choisi avant tout (le sélecteur exige un clic de l'utilisateur,
 * et annuler ne laisse aucune trace). Sans sélecteur (Firefox, Safari, tests automatisés), le zip
 * est assemblé en mémoire puis téléchargé.
 */
export async function runBackup(force = false) {
  if (backupStore.getState().status === 'running') return
  const { timezone } = await getSettings()
  const suggestedName = backupFilename(timezone)
  const picker = (window as FilePickerWindow).showSaveFilePicker
  let sink: BackupSink
  let memory: ReturnType<typeof memorySink> | undefined

  if (picker && !navigator.webdriver) {
    try {
      const handle = await picker.call(window, { suggestedName, types: [{ description: 'Sauvegarde (zip)', accept: { 'application/zip': ['.zip'] } }] })
      const writable = await handle.createWritable()
      sink = { write: (chunk) => writable.write(chunk), close: () => writable.close(), abort: () => writable.abort() }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      throw error
    }
  } else {
    memory = memorySink()
    sink = memory
  }

  backupStore.setState({ status: 'running', error: undefined, chainBroken: false, progress: { step: 'verify', label: 'Vérification de l’intégrité de l’historique', done: 0, total: 1 } })
  try {
    const result = await createBackup(sink, { force, onProgress: (progress) => backupStore.setState({ progress }) })
    if (memory) download(memory.blob(), result.filename)
    backupStore.setState({ status: 'idle', progress: undefined })
    toast.success('Sauvegarde enregistrée', { description: `${result.filename}, ${formatBytes(result.bytes)}` })
  } catch (error) {
    backupStore.setState({
      status: 'error',
      progress: undefined,
      error: errorMessage(error, 'La sauvegarde a échoué. Réessayez.'),
      chainBroken: error instanceof AppError && error.code === 'audit-chain',
    })
  }
}

export function dismissBackupError() {
  backupStore.setState({ status: 'idle', error: undefined, chainBroken: false })
}
