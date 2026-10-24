import { TriangleAlert } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { isPreviewHost } from '@/lib/previewHost'

/** Avertit sur une URL de prévisualisation : les données saisies ici n'existeront pas en production. */
export function PreviewNotice() {
  if (!isPreviewHost(window.location.hostname, import.meta.env.VITE_PRODUCTION_HOST)) return null
  const production = import.meta.env.VITE_PRODUCTION_HOST
  return (
    <div role="alert" className="flex items-start gap-2.5 border-b border-border bg-amber-tint px-4 py-2.5 text-[13px] lg:px-6">
      <Icon icon={TriangleAlert} className="mt-0.5 text-amber" />
      <p>
        Vous êtes sur une adresse de prévisualisation. Les données enregistrées ici resteront sur cette adresse et ne seront pas retrouvées sur le site de production
        {production ? ` (${production})` : ''}. Travaillez toujours sur le site de production.
      </p>
    </div>
  )
}
