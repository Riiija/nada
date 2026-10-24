import { useEffect, useState, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { restoreSession, useUserCount } from '@/data/repositories/auth'
import { useSession } from '@/data/session'
import { LockScreen } from './LockScreen'
import { LoginScreen } from './LoginScreen'
import { SetupScreen } from './SetupScreen'
import { useIdleLock } from './useIdleLock'

/** Premier lancement, connexion, verrouillage : ne montre l'application qu'à un compte actif. */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession()
  const userCount = useUserCount()

  useEffect(() => {
    void restoreSession()
  }, [])

  if (session.status === 'loading' || userCount === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-label="Chargement">
        <Skeleton className="h-40 w-[380px] max-w-[90vw]" />
      </div>
    )
  }
  return <Gate firstRun={userCount === 0}>{children}</Gate>
}

/**
 * `firstRun` est figé au montage : l'écran de configuration reste affiché après la création
 * du compte, le temps de noter la clé de récupération (le compteur d'utilisateurs, lui,
 * passe à 1 immédiatement).
 */
function Gate({ firstRun, children }: { firstRun: boolean; children: ReactNode }) {
  const session = useSession()
  const [setupOpen, setSetupOpen] = useState(firstRun)
  useIdleLock(session.status === 'active')

  if (setupOpen) return <SetupScreen onDone={() => setSetupOpen(false)} />
  if (session.status === 'signedOut') return <LoginScreen />
  if (session.status === 'locked') return <LockScreen user={session.user} />
  return <>{children}</>
}
