/**
 * Les données sont liées au domaine : une URL de prévisualisation Vercel (`*.vercel.app`) a sa propre
 * base, vide, qui ne sera pas retrouvée sur l'adresse de production. `production` est le nom d'hôte
 * de production configuré au déploiement (VITE_PRODUCTION_HOST), sans protocole.
 */
export function isPreviewHost(hostname: string, production?: string): boolean {
  const host = hostname.toLowerCase()
  if (!host.endsWith('.vercel.app')) return false
  return !production || host !== production.trim().toLowerCase()
}
