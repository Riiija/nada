import { appendAudit } from '../audit'
import { db } from '../db'
import { requireRole } from '../session'

/**
 * Trace un export CSV d'une liste (`export.generated`). Le fichier est construit par l'écran avec les
 * lignes filtrées qu'il affiche ; cette fonction vérifie le droit d'exporter et journalise avant la remise.
 */
export async function recordExport(what: string, count: number, filters: Record<string, unknown> = {}): Promise<void> {
  requireRole('admin', 'archivist')
  await db.transaction('rw', db.auditLog, (tx) =>
    appendAudit(tx, { action: 'export.generated', entityType: 'export', entityId: what, entityLabel: `Export : ${what}`, metadata: { count, filters } }),
  )
}
