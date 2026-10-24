import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { LinkEntityType } from '../types'

/** Nombre de pièces jointes par élément, pour la colonne « Pièces jointes » des listes. */
export function useLinkCounts(entityType: LinkEntityType): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const links = await db.documentLinks.where('[entityType+entityId]').between([entityType, ''], [entityType, '￿'], true, true).toArray()
    const counts = new Map<string, number>()
    for (const link of links) counts.set(link.entityId, (counts.get(link.entityId) ?? 0) + 1)
    return counts
  }, [entityType])
}
