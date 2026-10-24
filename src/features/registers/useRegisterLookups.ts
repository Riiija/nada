import { useMemo } from 'react'
import type { ComboOption } from '@/components/ui/Combobox'
import { useReference, type ReferenceRow, type ReferenceType } from '@/data/repositories/referenceData'

export type LookupSource = 'headsOfState' | 'ministers' | 'departments' | 'staff' | 'partners'

const LABEL: Record<LookupSource, string> = { headsOfState: 'fullName', ministers: 'fullName', departments: 'name', staff: 'fullName', partners: 'name' }

const names = (rows: ReferenceRow[] | undefined, field: string) => new Map((rows ?? []).map((r) => [r.id, String(r[field] ?? '')]))

/** Référentiels des registres : libellés pour l'affichage, options pour les formulaires et les filtres. */
export function useRegisterLookups() {
  const headsOfState = useReference('headsOfState')
  const ministers = useReference('ministers')
  const departments = useReference('departments')
  const staff = useReference('staff')
  const partners = useReference('partners')

  return useMemo(() => {
    const rows: Record<LookupSource, ReferenceRow[] | undefined> = { headsOfState, ministers, departments, staff, partners }
    const all = {
      official: new Map([...names(headsOfState, 'fullName'), ...names(ministers, 'fullName')]),
      department: names(departments, 'name'),
      staff: names(staff, 'fullName'),
      partner: names(partners, 'name'),
    }
    return {
      loading: Object.values(rows).some((r) => r === undefined),
      names: all,
      /** Valeurs actives, plus celle déjà enregistrée même si elle a été désactivée depuis. */
      options: (source: LookupSource, current?: string): ComboOption[] =>
        (rows[source] ?? []).filter((r) => r.isActive === 1 || r.id === current).map((r) => ({ value: r.id, label: String(r[LABEL[source]] ?? '') })),
    }
  }, [headsOfState, ministers, departments, staff, partners])
}

export type RegisterLookups = ReturnType<typeof useRegisterLookups>

/** Création à la volée depuis un champ de sélection (administrateur et archiviste). */
export const CREATE_INPUT: Record<LookupSource, (label: string) => Record<string, unknown>> = {
  headsOfState: (fullName) => ({ fullName }),
  ministers: (fullName) => ({ fullName }),
  departments: (name) => ({ name }),
  staff: (fullName) => ({ fullName }),
  partners: (name) => ({ name, kind: 'other' }),
}

export const SOURCE_TYPE: Record<LookupSource, ReferenceType> = {
  headsOfState: 'headsOfState',
  ministers: 'ministers',
  departments: 'departments',
  staff: 'staff',
  partners: 'partners',
}
