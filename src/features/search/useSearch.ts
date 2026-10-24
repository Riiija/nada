import { useEffect, useState } from 'react'
import { searchContent, type SearchFilters, type SearchResult } from '@/data/repositories/search'

export interface SearchState {
  results: SearchResult[] | undefined
  loading: boolean
}

/**
 * Recherche après `delay` ms de pause dans la saisie. Les résultats se rafraîchissent aussi
 * quand l'index change (nouveau courrier, fin d'une lecture OCR).
 */
export function useSearch(query: string, filters: SearchFilters = {}, delay = 150): SearchState {
  const [state, setState] = useState<{ key: string; results: SearchResult[] } | null>(null)
  const filterKey = JSON.stringify(filters)
  const key = `${query.trim()}|${filterKey}`

  useEffect(() => {
    if (!query.trim()) return
    let alive = true
    const timer = setTimeout(() => {
      searchContent(query, JSON.parse(filterKey) as SearchFilters).then(
        (results) => alive && setState({ key, results }),
        () => alive && setState({ key, results: [] }),
      )
    }, delay)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, filterKey, key, delay])

  if (!query.trim()) return { results: [], loading: false }
  return { results: state?.key === key ? state.results : state?.results, loading: state?.key !== key }
}
