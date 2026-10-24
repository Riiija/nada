import { useEffect } from 'react'
import { startSearch } from '@/data/repositories/search'
import { useSession } from '@/data/session'
import { ocrRunner } from '@/lib/ocr'

/**
 * Services de fond d'une session ouverte : l'index de recherche suit les écritures, et la lecture
 * OCR reprend les documents en attente (administrateur et archiviste, qui peuvent écrire le résultat).
 */
export function BackgroundServices() {
  const { status, user } = useSession()
  const role = user?.role
  const active = status === 'active'

  useEffect(() => {
    if (active) void startSearch().catch(() => undefined)
  }, [active])

  const canRead = active && (role === 'admin' || role === 'archivist')
  useEffect(() => {
    if (!canRead) return
    ocrRunner.start()
    return () => {
      void ocrRunner.stop()
    }
  }, [canRead])

  return null
}
