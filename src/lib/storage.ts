export interface StorageStatus {
  persisted: boolean | null
  usage: number | null
  quota: number | null
}

/** Stockage persistant et espace utilisé, lus auprès du navigateur (null = non disponible). */
export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  const [persisted, estimate] = await Promise.all([
    storage?.persisted?.().catch(() => null) ?? null,
    storage?.estimate?.().catch(() => null) ?? null,
  ])
  return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const digits = i === 0 || value >= 100 ? 0 : 1
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value)} ${units[i]}`
}
