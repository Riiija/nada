import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

export interface ComboOption {
  value: string
  label: string
}

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  placeholder?: string
  /** Libellé de l'option qui efface le choix (champ facultatif). */
  clearLabel?: string
  /** Propose « Créer « … » » quand la saisie ne correspond à rien. Retourne la valeur créée. */
  onCreate?: (label: string) => Promise<string>
  /** Propose « Saisir « … » sans l'ajouter » : valeur libre, non enregistrée dans le référentiel. */
  onFreeText?: (label: string) => void
  freeTextLabel?: (text: string) => string
  /** Texte affiché quand la valeur n'est pas dans les options (valeur libre). */
  displayValue?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  disabled?: boolean
}

/** Sélecteur de référentiel avec recherche (cmdk). Même apparence qu'un champ de saisie. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Choisir…',
  clearLabel,
  onCreate,
  onFreeText,
  freeTextLabel,
  displayValue,
  disabled,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const selected = options.find((o) => o.value === value)
  const text = selected?.label ?? displayValue
  const trimmed = query.trim()
  const exact = options.some((o) => o.label.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'))

  async function create() {
    if (!onCreate || !trimmed) return
    setCreating(true)
    try {
      onChange(await onCreate(trimmed))
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          {...aria}
          className={cn(
            'flex h-[38px] w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-left text-sm hover:border-border-strong focus:border-accent focus:ring-[3px] focus:ring-accent/20 focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15',
            !text && 'text-text-subtle',
          )}
        >
          <span className="truncate">{text || placeholder}</span>
          <Icon icon={ChevronsUpDown} className="text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0">
        <Command>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Rechercher"
            className="h-10 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-text-subtle"
          />
          <Command.List className="max-h-[260px] overflow-y-auto p-1">
            <Command.Empty className="px-3 py-2 text-[13px] text-text-muted">Aucun résultat.</Command.Empty>
            {clearLabel && value ? (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="flex h-9 cursor-pointer items-center rounded-control px-3 text-sm text-text-muted data-[selected=true]:bg-surface-muted"
              >
                {clearLabel}
              </Command.Item>
            ) : null}
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={o.label}
                keywords={[o.label]}
                onSelect={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className="flex h-9 cursor-pointer items-center justify-between gap-2 rounded-control px-3 text-sm data-[selected=true]:bg-surface-muted"
              >
                <span className="truncate">{o.label}</span>
                {o.value === value ? <Icon icon={Check} className="text-accent" /> : null}
              </Command.Item>
            ))}
            {trimmed && !exact && onCreate ? (
              <Command.Item
                value={`__create__${trimmed}`}
                forceMount
                disabled={creating}
                onSelect={() => void create()}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-control px-3 text-sm text-accent-ink data-[selected=true]:bg-surface-muted"
              >
                <Icon icon={Plus} />
                <span className="truncate">Créer « {trimmed} »</span>
              </Command.Item>
            ) : null}
            {trimmed && !exact && onFreeText ? (
              <Command.Item
                value={`__free__${trimmed}`}
                forceMount
                onSelect={() => {
                  onFreeText(trimmed)
                  setOpen(false)
                }}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-control px-3 text-sm data-[selected=true]:bg-surface-muted"
              >
                <span className="truncate">{freeTextLabel ? freeTextLabel(trimmed) : `Saisir « ${trimmed} »`}</span>
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
