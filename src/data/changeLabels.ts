import type { Transaction } from 'dexie'

const ID_FIELDS: Record<string, { table: 'departments' | 'staff' | 'partners' | 'lookups' | 'officials'; field: string }> = {
  departmentId: { table: 'departments', field: 'name' },
  assignedStaffId: { table: 'staff', field: 'fullName' },
  signedByStaffId: { table: 'staff', field: 'fullName' },
  sourcePartnerId: { table: 'partners', field: 'name' },
  recipientPartnerId: { table: 'partners', field: 'name' },
  mailTypeId: { table: 'lookups', field: 'label' },
  followUpId: { table: 'lookups', field: 'label' },
  positionId: { table: 'lookups', field: 'label' },
  officialId: { table: 'officials', field: 'fullName' },
  supplierPartnerId: { table: 'partners', field: 'name' },
}

/** Remplace les identifiants du diff par des libellés lisibles (`positionId` devient `position`). */
export async function labelChanges(tx: Transaction, changes: Record<string, [unknown, unknown]>) {
  const out: Record<string, [unknown, unknown]> = {}
  for (const [key, [from, to]] of Object.entries(changes)) {
    const def = ID_FIELDS[key]
    if (!def) {
      out[key] = [from, to]
      continue
    }
    const name = async (id: unknown) =>
      typeof id === 'string' ? (((await tx.table(def.table).get(id)) as Record<string, unknown> | undefined)?.[def.field] ?? id) : null
    out[key.replace(/Id$/, '')] = [await name(from), await name(to)]
  }
  return out
}

