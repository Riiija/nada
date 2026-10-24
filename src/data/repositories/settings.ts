import { useLiveQuery } from 'dexie-react-hooks'
import { appendAudit, diffChanges } from '../audit'
import { DEFAULT_REFERENCE_FORMAT } from '../counters'
import { db } from '../db'
import { ValidationError } from '../errors'
import { settingsPatchSchema } from '../schemas/settings'
import { requireRole } from '../session'
import type { CounterScope } from '../types'

export interface AppSettings {
  organizationName: string
  appName: string
  timezone: string
  referenceFormats: Partial<Record<CounterScope, string>>
  ocrLanguages: 'fra' | 'fra+ara'
  maxUploadMb: number
  currency?: string
  staleAfterDays: number
  lockAfterMinutes: number
  lastBackupAt?: string
  schemaVersion: number
}

export function defaultSettings(): AppSettings {
  return {
    organizationName: '',
    appName: 'Courrier et archives',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referenceFormats: {},
    ocrLanguages: 'fra',
    maxUploadMb: 50,
    staleAfterDays: 15,
    lockAfterMinutes: 15,
    schemaVersion: 1,
  }
}

const KEYS = Object.keys(defaultSettings()) as (keyof AppSettings)[]

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.bulkGet([...KEYS, 'currency', 'lastBackupAt'])
  const merged = defaultSettings() as unknown as Record<string, unknown>
  for (const row of rows) if (row) merged[row.key] = row.value
  return merged as unknown as AppSettings
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(getSettings, [])
}

export function referenceFormatFor(settings: AppSettings, scope: CounterScope): string {
  return settings.referenceFormats[scope] || DEFAULT_REFERENCE_FORMAT
}

/** Modifie les paramètres modifiables par l'administrateur (jamais lastBackupAt ni schemaVersion). */
export async function updateSettings(patch: unknown): Promise<void> {
  requireRole('admin')
  const parsed = settingsPatchSchema.safeParse(patch)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Paramètres invalides.')
  const data: Partial<AppSettings> = { ...parsed.data }
  if (data.referenceFormats) {
    data.referenceFormats = Object.fromEntries(Object.entries(data.referenceFormats).filter(([, v]) => v)) as AppSettings['referenceFormats']
  }
  if (data.currency === '') data.currency = undefined

  await db.transaction('rw', db.settings, db.auditLog, async (tx) => {
    const before = await getSettings()
    const after = { ...before, ...data }
    const changes = diffChanges(before, after)
    if (Object.keys(changes).length === 0) return
    await db.settings.bulkPut(Object.keys(changes).map((key) => ({ key, value: after[key as keyof AppSettings] })))
    await appendAudit(tx, {
      action: 'settings.updated',
      entityType: 'settings',
      entityId: 'settings',
      entityLabel: 'Paramètres',
      changes,
    })
  })
}
