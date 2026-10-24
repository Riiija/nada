/**
 * Bus des modifications de données : l'index de recherche s'y abonne pour rester à jour
 * après chaque écriture, sans que les repositories aient à le connaître.
 */
export type ChangeKind = 'mail' | 'document' | 'page' | 'reference'

type Listener = (kind: ChangeKind, id: string) => void

const listeners = new Set<Listener>()

export function onDataChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitChange(kind: ChangeKind, id: string) {
  for (const listener of listeners) listener(kind, id)
}
