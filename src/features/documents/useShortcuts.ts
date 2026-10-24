import { useEffect } from 'react'

type Handlers = Record<string, () => void>

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Raccourcis de la visionneuse, inactifs pendant la saisie et avec une touche de modification. */
export function useShortcuts(handlers: Handlers) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      const handler = handlers[event.key] ?? handlers[event.key.toLowerCase()]
      if (!handler) return
      event.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}
