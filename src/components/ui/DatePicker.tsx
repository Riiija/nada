import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { isValidDate } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

type Props = {
  id?: string
  /** AAAA-MM-JJ, ou chaîne vide. */
  value: string
  onChange: (value: string) => void
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  disabled?: boolean
}

function toIso(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim())
  if (!m) return null
  const iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return isValidDate(iso) ? iso : null
}

function fromIso(iso: string): Date | undefined {
  if (!isValidDate(iso)) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Saisie directe jj/mm/aaaa et calendrier en popover. La valeur est toujours AAAA-MM-JJ. */
export function DatePicker({ id, value, onChange, disabled, ...aria }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value ? formatDate(value) : '')

  function commit(text: string) {
    setDraft(null)
    if (text.trim() === '') return onChange('')
    const iso = toIso(text)
    // Une saisie invalide est transmise telle quelle : la validation du formulaire affiche l'erreur.
    onChange(iso ?? text.trim())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          placeholder="jj/mm/aaaa"
          autoComplete="off"
          disabled={disabled}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft !== null) commit(draft)
          }}
          {...aria}
          className={cn(
            'h-[38px] w-full rounded-control border border-border bg-surface pr-10 pl-3 text-sm placeholder:text-text-subtle hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15',
          )}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Ouvrir le calendrier"
            disabled={disabled}
            className="absolute top-1 right-1 grid size-[30px] place-items-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <Icon icon={CalendarDays} />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="p-2">
        <DayPicker
          mode="single"
          locale={fr}
          weekStartsOn={1}
          selected={fromIso(value)}
          defaultMonth={fromIso(value)}
          onSelect={(date) => {
            if (!date) return
            setDraft(null)
            onChange(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
