import { toast } from 'sonner'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker : met l'application et le moteur de lecture en cache pour le travail hors ligne.
 * Une nouvelle version n'est jamais appliquée d'office (on pourrait interrompre un import ou une
 * lecture) : l'utilisateur choisit le moment avec « Mettre à jour ». La mise en cache initiale est
 * silencieuse : une notification de plus recouvrirait les actions en bas à droite des tableaux.
 */
export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const update = registerSW({
    onNeedRefresh() {
      toast('Nouvelle version disponible', {
        id: 'pwa-update',
        duration: Infinity,
        description: 'Terminez vos imports en cours, puis mettez à jour.',
        action: { label: 'Mettre à jour', onClick: () => void update(true) },
      })
    },
  })
}
