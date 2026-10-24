import MiniSearch, { type SearchResult } from 'minisearch'

/** Changer ce numéro force la reconstruction de l'index au prochain démarrage. */
export const SEARCH_INDEX_VERSION = 1

export interface SearchDoc {
  /** `mail:<id>`, `doc:<id>` ou `page:<documentId>:<n>` */
  id: string
  kind: 'mail' | 'document' | 'page'
  refId: string
  page?: number
  reference?: string
  title: string
  fileNumber?: string
  /** Provenance, destinataire, parapheur, direction. */
  parties?: string
  text?: string
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'au', 'aux', 'et', 'ou', 'en', 'a', 'sur', 'par',
  'pour', 'dans', 'ce', 'ces', 'se', 'sa', 'son', 'ses', 'il', 'elle', 'on', 'ne', 'pas', 'que', 'qui', 'est',
])

/** Minuscules et sans accents (« Recouvrément » devient « recouvrement »). */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Découpe en mots en gardant intactes les références (`12/26`, `D14523696-23`), et ajoute
 * leurs morceaux (`12`, `26`) pour qu'on les trouve aussi séparément.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:[/\-.][\p{L}\p{N}]+)*/gu)) {
    const token = match[0]
    tokens.push(token)
    if (/[/\-.]/.test(token)) tokens.push(...token.split(/[/\-.]/))
  }
  return tokens
}

/** Mots vides ignorés ; le reste est replié en minuscules sans accents. */
export function processTerm(term: string): string | null {
  const folded = fold(term)
  return STOP_WORDS.has(folded) ? null : folded
}

const options = {
  idField: 'id',
  fields: ['reference', 'title', 'fileNumber', 'parties', 'text'],
  storeFields: ['kind', 'refId', 'page'],
  tokenize,
  processTerm,
} as const

const searchOptions = {
  boost: { reference: 3, title: 2, fileNumber: 2, parties: 1.5 },
  prefix: true,
  // Tolérance aux fautes au-delà de 4 lettres.
  fuzzy: (term: string) => (term.length > 4 ? 0.2 : false),
} as const

export interface Hit {
  id: string
  kind: SearchDoc['kind']
  refId: string
  page?: number
  score: number
  terms: string[]
}

export class SearchEngine {
  private index: MiniSearch<SearchDoc>
  /** Pages indexées par document : permet de retirer un document sans parcourir l'index. */
  private pages = new Map<string, Set<number>>()

  constructor(index?: MiniSearch<SearchDoc>, pages?: Record<string, number[]>) {
    this.index = index ?? new MiniSearch<SearchDoc>({ ...options, fields: [...options.fields], storeFields: [...options.storeFields] })
    for (const [documentId, numbers] of Object.entries(pages ?? {})) this.pages.set(documentId, new Set(numbers))
  }

  static fromJSON(json: string): SearchEngine {
    const saved = JSON.parse(json) as { index: unknown; pages: Record<string, number[]> }
    const index = MiniSearch.loadJS<SearchDoc>(saved.index as never, { ...options, fields: [...options.fields], storeFields: [...options.storeFields] })
    return new SearchEngine(index, saved.pages)
  }

  get size() {
    return this.index.documentCount
  }

  has(id: string) {
    return this.index.has(id)
  }

  /** Ajoute ou remplace une entrée. */
  upsert(doc: SearchDoc) {
    if (this.index.has(doc.id)) this.index.replace(doc)
    else this.index.add(doc)
    if (doc.kind === 'page' && doc.page !== undefined) {
      const set = this.pages.get(doc.refId) ?? new Set<number>()
      set.add(doc.page)
      this.pages.set(doc.refId, set)
    }
  }

  remove(id: string) {
    if (this.index.has(id)) this.index.discard(id)
  }

  /** Retire toutes les entrées d'un document (titre et pages). */
  removeDocument(documentId: string) {
    this.remove(`doc:${documentId}`)
    for (const n of this.pages.get(documentId) ?? []) this.remove(`page:${documentId}:${n}`)
    this.pages.delete(documentId)
  }

  async addAll(docs: SearchDoc[]) {
    await this.index.addAllAsync(docs, { chunkSize: 500 })
    for (const doc of docs) {
      if (doc.kind !== 'page' || doc.page === undefined) continue
      const set = this.pages.get(doc.refId) ?? new Set<number>()
      set.add(doc.page)
      this.pages.set(doc.refId, set)
    }
  }

  search(query: string, limit = 100): Hit[] {
    if (!query.trim()) return []
    let results: SearchResult[] = this.index.search(query, { ...searchOptions, combineWith: 'AND' })
    // Aucun résultat avec tous les mots : on élargit à « l'un ou l'autre ».
    if (results.length === 0) results = this.index.search(query, { ...searchOptions, combineWith: 'OR' })
    return results.slice(0, limit).map((r) => ({
      id: r.id as string,
      kind: r.kind as SearchDoc['kind'],
      refId: r.refId as string,
      page: r.page as number | undefined,
      score: r.score,
      terms: r.queryTerms,
    }))
  }

  toJSON(): string {
    return JSON.stringify({ index: this.index.toJSON(), pages: Object.fromEntries([...this.pages].map(([k, v]) => [k, [...v]])) })
  }
}

/** Extrait de ±80 caractères autour du premier terme trouvé, sans tenir compte des accents ni de la casse. */
export function snippet(text: string, query: string, radius = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const needles = tokenize(query).map(fold).filter((t) => t.length > 0 && !STOP_WORDS.has(t))
  const lower = fold(flat)
  let at = -1
  for (const needle of needles) {
    const i = lower.indexOf(needle)
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '')
  const start = Math.max(0, at - radius)
  const end = Math.min(flat.length, at + radius)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}
