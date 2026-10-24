import { useEffect } from 'react'
import { lockSession } from '@/data/repositories/auth'
import { useSettings } from '@/data/repositories/settings'

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** Verrouille la session après `lockAfterMinutes` minutes sans activité. */
export function useIdleLock(enabled: boolean) {
  const minutes = useSettings()?.lockAfterMinutes

  useEffect(() => {
    if (!enabled || !minutes || minutes <= 0) return
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void lockSession().catch(() => undefined), minutes * 60_000)
    }
    arm()
    EVENTS.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    return () => {
      clearTimeout(timer)
      EVENTS.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [enabled, minutes])
}
