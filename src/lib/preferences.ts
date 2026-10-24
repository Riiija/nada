import { useCallback, useState } from 'react'

/** Préférence d'interface persistée dans localStorage (jamais de donnée métier). */
export function useStoredPreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          /* stockage indisponible */
        }
        return resolved
      })
    },
    [key],
  )
  return [value, set] as const
}
