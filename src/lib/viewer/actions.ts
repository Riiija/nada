/** Remet un fichier à l'utilisateur. Appelé après `downloadDocument` / `printDocument`, qui journalisent. */

const REVOKE_DELAY_MS = 60_000

/** Déclenche le téléchargement avec le nom d'origine ; l'URL `blob:` est révoquée ensuite. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Imprime depuis un iframe caché (aucune fenêtre ni fichier écrit sur le disque). */
export function printBlob(blob: Blob, kind: 'pdf' | 'image') {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  const cleanup = () => {
    frame.remove()
    URL.revokeObjectURL(url)
  }
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } finally {
      setTimeout(cleanup, REVOKE_DELAY_MS)
    }
  }
  if (kind === 'image') {
    frame.srcdoc = `<!doctype html><title>Impression</title><style>html,body{margin:0}img{max-width:100%;display:block;margin:0 auto}</style><img src="${url}" alt="">`
  } else {
    frame.src = url
  }
  document.body.appendChild(frame)
}
