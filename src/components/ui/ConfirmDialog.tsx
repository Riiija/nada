import * as A from '@radix-ui/react-alert-dialog'
import { Button } from './Button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  danger?: boolean
}

/** Confirmation d'une action : le titre et le bouton disent la conséquence. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger }: Props) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <A.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface p-6 shadow-pop outline-none">
          <A.Title className="text-base font-semibold">{title}</A.Title>
          <A.Description className="mt-1 text-[13px] text-text-muted">{description}</A.Description>
          <div className="mt-6 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button>Annuler</Button>
            </A.Cancel>
            <A.Action asChild>
              <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={() => void onConfirm()}>
                {confirmLabel}
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
