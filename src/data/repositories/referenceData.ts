import { useLiveQuery } from 'dexie-react-hooks'
import type { ZodType } from 'zod'
import { appendAudit, diffChanges } from '../audit'
import { db } from '../db'
import { ValidationError } from '../errors'
import {
  departmentSchema,
  lookupSchema,
  officialSchema,
  partnerSchema,
  staffSchema,
} from '../schemas/reference'
import { requireRole } from '../session'
import type { Flag } from '../types'

export type ReferenceType =
  | 'departments'
  | 'staff'
  | 'partners'
  | 'headsOfState'
  | 'ministers'
  | 'mailTypes'
  | 'followUps'
  | 'positions'

export interface ReferenceRow {
  id: string
  isActive: Flag
  [field: string]: unknown
}

type TableName = 'departments' | 'staff' | 'partners' | 'officials' | 'lookups'

interface Definition {
  table: TableName
  schema: ZodType
  /** Libellé français de l'élément, pour le journal. */
  noun: string
  /** Valeurs imposées à la création et utilisées pour filtrer la liste. */
  fixed?: Record<string, unknown>
  sortBy: string
  label: (row: ReferenceRow) => string
}

const text = (field: string) => (row: ReferenceRow) => String(row[field] ?? '')

export const referenceDefinitions: Record<ReferenceType, Definition> = {
  departments: { table: 'departments', schema: departmentSchema, noun: 'Direction', sortBy: 'name', label: text('name') },
  staff: { table: 'staff', schema: staffSchema, noun: 'Collaborateur', sortBy: 'fullName', label: text('fullName') },
  partners: { table: 'partners', schema: partnerSchema, noun: 'Partenaire', sortBy: 'name', label: text('name') },
  headsOfState: { table: 'officials', schema: officialSchema, noun: "Chef de l'État", fixed: { kind: 'headOfState' }, sortBy: 'fullName', label: text('fullName') },
  ministers: { table: 'officials', schema: officialSchema, noun: 'Ministre', fixed: { kind: 'minister' }, sortBy: 'fullName', label: text('fullName') },
  mailTypes: { table: 'lookups', schema: lookupSchema, noun: 'Type de courrier', fixed: { category: 'mailType' }, sortBy: 'sortOrder', label: text('label') },
  followUps: { table: 'lookups', schema: lookupSchema, noun: 'Suivi', fixed: { category: 'followUp' }, sortBy: 'sortOrder', label: text('label') },
  positions: { table: 'lookups', schema: lookupSchema, noun: 'Position', fixed: { category: 'position' }, sortBy: 'sortOrder', label: text('label') },
}

function tableOf(type: ReferenceType) {
  return db.table<ReferenceRow, string>(referenceDefinitions[type].table)
}

function matchesFixed(type: ReferenceType, row: ReferenceRow) {
  const fixed = referenceDefinitions[type].fixed ?? {}
  return Object.entries(fixed).every(([k, v]) => row[k] === v)
}

export async function listReference(type: ReferenceType): Promise<ReferenceRow[]> {
  const def = referenceDefinitions[type]
  const rows = (await tableOf(type).toArray()).filter((row) => matchesFixed(type, row))
  const key = def.sortBy
  return rows.sort((a, b) => {
    const x = a[key]
    const y = b[key]
    if (typeof x === 'number' && typeof y === 'number') return x - y
    return String(x ?? '').localeCompare(String(y ?? ''), 'fr', { sensitivity: 'base' })
  })
}

export function useReference(type: ReferenceType): ReferenceRow[] | undefined {
  return useLiveQuery(() => listReference(type), [type])
}

function parse(type: ReferenceType, input: unknown): Record<string, unknown> {
  const result = referenceDefinitions[type].schema.safeParse(input)
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Données invalides.')
  return result.data as Record<string, unknown>
}

function isConstraintError(error: unknown) {
  return error instanceof Error && error.name === 'ConstraintError'
}

/** Crée (id = null) ou modifie un élément de référentiel. Retourne son identifiant. */
export async function saveReference(type: ReferenceType, id: string | null, input: unknown): Promise<string> {
  requireRole('admin', 'archivist')
  const def = referenceDefinitions[type]
  const data = parse(type, input)
  const table = tableOf(type)
  let savedId = id ?? crypto.randomUUID()

  try {
    await db.transaction('rw', table, db.auditLog, async (tx) => {
      if (id === null) {
        let sortOrder = data.sortOrder
        if (def.table === 'lookups' && sortOrder === undefined) {
          const peers = (await table.toArray()).filter((row) => matchesFixed(type, row))
          sortOrder = peers.reduce((max, row) => Math.max(max, Number(row.sortOrder ?? 0)), 0) + 1
        }
        const row = { id: savedId, ...data, ...(sortOrder === undefined ? {} : { sortOrder }), ...def.fixed, isActive: 1 } as ReferenceRow
        await table.add(row)
        await appendAudit(tx, {
          action: 'referenceData.created',
          entityType: type,
          entityId: savedId,
          entityLabel: `${def.noun} : ${def.label(row)}`,
        })
        return
      }
      const before = await table.get(id)
      if (!before || !matchesFixed(type, before)) throw new ValidationError('Cet élément n’existe plus.')
      const after = { ...before, ...data } as ReferenceRow
      const changes = diffChanges(before, after)
      if (Object.keys(changes).length === 0) return
      savedId = id
      await table.put(after)
      await appendAudit(tx, {
        action: 'referenceData.updated',
        entityType: type,
        entityId: id,
        entityLabel: `${def.noun} : ${def.label(after)}`,
        changes,
      })
    })
  } catch (error) {
    if (isConstraintError(error)) throw new ValidationError('Cette valeur existe déjà.')
    throw error
  }
  return savedId
}

/** Un élément n'est jamais supprimé : on le désactive, il disparaît des formulaires. */
export async function setReferenceActive(type: ReferenceType, id: string, active: boolean): Promise<void> {
  requireRole('admin')
  const def = referenceDefinitions[type]
  const table = tableOf(type)
  await db.transaction('rw', table, db.auditLog, async (tx) => {
    const row = await table.get(id)
    if (!row || !matchesFixed(type, row)) throw new ValidationError('Cet élément n’existe plus.')
    const isActive: Flag = active ? 1 : 0
    if (row.isActive === isActive) return
    await table.update(id, { isActive })
    await appendAudit(tx, {
      action: active ? 'referenceData.updated' : 'referenceData.deactivated',
      entityType: type,
      entityId: id,
      entityLabel: `${def.noun} : ${def.label(row)}`,
      changes: { isActive: [row.isActive, isActive] },
    })
  })
}
