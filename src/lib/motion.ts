import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(listener: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

/** Vrai si l'utilisateur a demandé moins de mouvement : pas de dessin de courbe ni d'animation. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
