import { useMemo } from 'react'
import type { ComboOption } from '@/components/ui/Combobox'
import { useReference, type ReferenceRow } from '@/data/repositories/referenceData'

function labels(rows: ReferenceRow[] | undefined, field: string) {
  return new Map((rows ?? []).map((r) => [r.id, String(r[field] ?? '')]))
}

/** Active ceux qu'on peut choisir, plus la valeur déjà enregistrée même si elle a été désactivée depuis. */
function options(rows: ReferenceRow[] | undefined, field: string, current: (string | undefined)[] = []): ComboOption[] {
  return (rows ?? [])
    .filter((r) => r.isActive === 1 || current.includes(r.id))
    .map((r) => ({ value: r.id, label: String(r[field] ?? '') }))
}

/** Référentiels des courriers : libellés pour l'affichage, options pour les formulaires. */
export function useMailLookups() {
  const departments = useReference('departments')
  const staff = useReference('staff')
  const partners = useReference('partners')
  const mailTypes = useReference('mailTypes')
  const followUps = useReference('followUps')
  const positions = useReference('positions')

  return useMemo(() => {
    const names = {
      department: labels(departments, 'name'),
      staff: labels(staff, 'fullName'),
      partner: labels(partners, 'name'),
      lookup: new Map([...labels(mailTypes, 'label'), ...labels(followUps, 'label'), ...labels(positions, 'label')]),
    }
    return {
      loading: [departments, staff, partners, mailTypes, followUps, positions].some((r) => r === undefined),
      names,
      staffRows: staff ?? [],
      options: (current: Record<string, string | undefined> = {}) => ({
        departments: options(departments, 'name', [current.departmentId]),
        staff: options(staff, 'fullName', [current.assignedStaffId, current.signedByStaffId]),
        partners: options(partners, 'name', [current.sourcePartnerId, current.recipientPartnerId]),
        mailTypes: options(mailTypes, 'label', [current.mailTypeId]),
        followUps: options(followUps, 'label', [current.followUpId]),
        positions: options(positions, 'label', [current.positionId]),
      }),
    }
  }, [departments, staff, partners, mailTypes, followUps, positions])
}

export type MailLookups = ReturnType<typeof useMailLookups>
