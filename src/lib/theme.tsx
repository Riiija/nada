import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
const KEY = 'ged.theme'

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* stockage indisponible */
  }
  return 'system'
}

function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

type ThemeContextValue = { preference: ThemePreference; isDark: boolean; setPreference: (p: ThemePreference) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(systemIsDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = preference === 'dark' || (preference === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* stockage indisponible */
    }
  }, [])

  const value = useMemo(() => ({ preference, isDark, setPreference }), [preference, isDark, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme doit être utilisé dans ThemeProvider')
  return ctx
}
