/** Page d'un courrier « scanné », dessinée dans le navigateur (canvas). */
export interface ImageSpec {
  width: number
  height: number
  format: 'png' | 'jpeg'
  lines: { text: string; size: number; bold?: boolean; align?: 'left' | 'center' | 'right'; gap?: number }[]
  /** Légère rotation en degrés, comme un vrai scan. */
  tilt?: number
}

export interface PreparedDemoFile {
  pageCount: number
  width?: number
  height?: number
  thumbnail?: Blob
}

/**
 * Ce que seul le navigateur sait faire : dessiner une page et produire une miniature.
 * Sans ces outils (tests), le jeu de démonstration se limite aux PDF à couche texte.
 */
export interface DemoDeps {
  renderImage?: (spec: ImageSpec) => Promise<Blob>
  prepare?: (blob: Blob, kind: 'pdf' | 'image') => Promise<PreparedDemoFile>
}
