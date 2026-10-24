import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { Icon } from './Icon'

type Props = {
  onFiles: (files: File[]) => void
  /** 200 px par défaut, 120 px dans un formulaire. */
  compact?: boolean
  disabled?: boolean
  /** Taille maximale affichée, en Mo (réglage de l'administrateur). */
  maxMb?: number
  label?: string
}

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

/**
 * Zone de dépôt (DESIGN.md §9). Le tri se fait sur la signature des fichiers, pas ici :
 * tout ce qui est déposé est transmis, les refus apparaissent avec leur cause dans la file.
 */
export function Dropzone({ onFiles, compact, disabled, maxMb = 50, label = 'Déposer des documents' }: Props) {
  const [announcement, setAnnouncement] = useState('')
  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    accept: ACCEPT,
    disabled,
    noClick: true,
    noKeyboard: true,
    onDrop: (accepted, rejections) => {
      const files = [...accepted, ...rejections.map((r) => r.file)]
      if (files.length === 0) return
      setAnnouncement(`${files.length} fichier${files.length > 1 ? 's' : ''} ajouté${files.length > 1 ? 's' : ''}.`)
      onFiles(files)
    },
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border-strong bg-surface px-4 text-center transition-colors duration-[120ms]',
        compact ? 'min-h-[120px] py-4' : 'min-h-[200px] py-6',
        isDragActive && 'border-solid border-accent bg-accent-tint',
        isDragReject && 'border-solid border-danger bg-danger-tint',
        disabled && 'opacity-60',
      )}
    >
      <input {...getInputProps()} aria-label={label} />
      <span
        className={cn(
          'grid size-11 place-items-center rounded-control bg-surface-muted text-text transition-colors',
          isDragActive && 'bg-accent text-white',
          isDragReject && 'bg-danger text-white',
        )}
      >
        <Icon icon={FileUp} size={22} className={cn('transition-transform duration-[120ms]', isDragActive && '-translate-y-[3px]')} />
      </span>
      <p className="text-[15px] font-semibold">
        {isDragReject ? 'Ce type de fichier est refusé' : isDragActive ? 'Relâchez pour ajouter les fichiers' : 'Déposez vos documents ici'}
      </p>
      <p className="text-[13px] text-text-muted">
        {isDragReject ? 'Seuls les PDF et les images JPEG, PNG ou WebP sont acceptés.' : `PDF ou images (JPEG, PNG, WebP), ${maxMb} Mo maximum par fichier`}
      </p>
      <Button type="button" size={compact ? 'sm' : 'md'} onClick={open} disabled={disabled}>
        {compact ? 'Parcourir' : 'Parcourir les fichiers'}
      </Button>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
