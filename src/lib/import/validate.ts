import { formatBytes } from '../storage'

export type DetectedFile = { kind: 'pdf' | 'image'; mimeType: string }

export const REJECT_FORMAT = "Ce fichier n'est pas un PDF ni une image JPEG, PNG ou WebP."

const EXTENSIONS: Record<string, DetectedFile & { family: string }> = {
  pdf: { family: 'pdf', kind: 'pdf', mimeType: 'application/pdf' },
  jpg: { family: 'jpeg', kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { family: 'jpeg', kind: 'image', mimeType: 'image/jpeg' },
  png: { family: 'png', kind: 'image', mimeType: 'image/png' },
  webp: { family: 'webp', kind: 'image', mimeType: 'image/webp' },
}

function familyFromBytes(b: Uint8Array): string | null {
  const is = (offset: number, ...values: number[]) => values.every((v, i) => b[offset + i] === v)
  if (is(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf' // %PDF-
  if (is(0, 0xff, 0xd8, 0xff)) return 'jpeg'
  if (is(0, 0x89, 0x50, 0x4e, 0x47)) return 'png'
  if (is(0, 0x52, 0x49, 0x46, 0x46) && is(8, 0x57, 0x45, 0x42, 0x50)) return 'webp' // RIFF....WEBP
  return null
}

/**
 * Contrôle l'extension ET la signature du fichier, pas seulement le type MIME.
 * Retourne null si le fichier n'est pas un PDF, un JPEG, un PNG ou un WebP, ou si
 * l'extension ne correspond pas au contenu.
 */
export async function detectFile(file: Blob & { name: string }): Promise<DetectedFile | null> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExtension = EXTENSIONS[extension]
  if (!byExtension) return null
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (familyFromBytes(head) !== byExtension.family) return null
  return { kind: byExtension.kind, mimeType: byExtension.mimeType }
}

export function sizeError(sizeBytes: number, maxMb: number): string | null {
  if (sizeBytes === 0) return 'Le fichier est vide.'
  return sizeBytes > maxMb * 1024 * 1024 ? `Le fichier dépasse ${maxMb} Mo.` : null
}

export function spaceError(sizeBytes: number, storage: { usage: number | null; quota: number | null }): string | null {
  if (storage.usage === null || storage.quota === null) return null
  const available = storage.quota - storage.usage
  return available < sizeBytes
    ? `Espace insuffisant dans ce navigateur : ${formatBytes(Math.max(0, available))} disponibles. Faites une sauvegarde puis supprimez des documents.`
    : null
}

export function titleFromFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim() || name
}
