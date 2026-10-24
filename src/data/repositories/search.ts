import { onDataChange } from '../changes'
import { db } from '../db'
import { requireUser } from '../session'
import type { DocumentCategory, Mail, MailFlow } from '../types'
import { SEARCH_INDEX_VERSION, SearchEngine, snippet, type SearchDoc } from '@/lib/search/engine'
import { canSeeDocument } from './documents'
import { canSeeMail } from './mails'

const KEY = 'minisearch'
const SAVE_DELAY_MS = 2000
const FLUSH_DELAY_MS = 150
const REBUILD_DELAY_MS = 800

let engine: SearchEngine | null = null
let starting: Promise<void> | null = null
let unsubscribe: (() => void) | null = null
const dirty = { mails: new Set<string>(), documents: new Set<string>(), all: false }
let flushTimer: ReturnType<typeof setTimeout> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined

const statusListeners = new Set<() => void>()
let status: 'idle' | 'building' | 'ready' = 'idle'
function setStatus(next: typeof status) {
  status = next
  statusListeners.forEach((l) => l())
}
export const getSearchStatus = () => status
export function subscribeSearchStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

async function names() {
  const [departments, staff, partners] = await Promise.all([db.departments.toArray(), db.staff.toArray(), db.partners.toArray()])
  return {
    department: new Map(departments.map((d) => [d.id, d.name])),
    staff: new Map(staff.map((s) => [s.id, s.fullName])),
    partner: new Map(partners.map((p) => [p.id, p.name])),
  }
}
type Names = Awaited<ReturnType<typeof names>>

function mailDoc(mail: Mail, n: Names): SearchDoc {
  const parties = [
    n.partner.get(mail.sourcePartnerId ?? ''),
    n.partner.get(mail.recipientPartnerId ?? ''),
    mail.recipientLabel,
    n.staff.get(mail.assignedStaffId ?? ''),
    n.staff.get(mail.signedByStaffId ?? ''),
    n.department.get(mail.departmentId ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
  return { id: `mail:${mail.id}`, kind: 'mail', refId: mail.id, reference: mail.reference, title: mail.subject, fileNumber: mail.fileNumber, parties }
}

async function documentDocs(id: string): Promise<SearchDoc[]> {
  const doc = await db.documents.get(id)
  if (!doc || doc.deletedAt) return []
  const pages = await db.documentPages.where('documentId').equals(id).toArray()
  return [
    { id: `doc:${id}`, kind: 'document', refId: id, title: doc.title },
    ...pages.map<SearchDoc>((p) => ({ id: `page:${id}:${p.pageNumber}`, kind: 'page', refId: id, page: p.pageNumber, title: doc.title, text: p.text })),
  ]
}

async function build(): Promise<SearchEngine> {
  const fresh = new SearchEngine()
  const n = await names()
  const [mails, documents, pages] = await Promise.all([db.mails.toArray(), db.documents.toArray(), db.documentPages.toArray()])
  const live = new Map(documents.filter((d) => !d.deletedAt).map((d) => [d.id, d]))
  await fresh.addAll([
    ...mails.filter((m) => !m.deletedAt).map((m) => mailDoc(m, n)),
    ...[...live.values()].map<SearchDoc>((d) => ({ id: `doc:${d.id}`, kind: 'document', refId: d.id, title: d.title })),
    ...pages
      .filter((p) => live.has(p.documentId))
      .map<SearchDoc>((p) => ({ id: `page:${p.documentId}:${p.pageNumber}`, kind: 'page', refId: p.documentId, page: p.pageNumber, title: live.get(p.documentId)!.title, text: p.text })),
  ])
  return fresh
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (engine) void db.searchIndex.put({ key: KEY, value: { version: SEARCH_INDEX_VERSION, json: engine.toJSON() } })
  }, SAVE_DELAY_MS)
}

async function rebuildAll() {
  setStatus('building')
  engine = await build()
  setStatus('ready')
  scheduleSave()
}

async function flush() {
  if (!engine) return
  if (dirty.all) {
    dirty.all = false
    dirty.mails.clear()
    dirty.documents.clear()
    return rebuildAll()
  }
  const mailIds = [...dirty.mails]
  const documentIds = [...dirty.documents]
  dirty.mails.clear()
  dirty.documents.clear()
  const n = mailIds.length ? await names() : undefined
  for (const id of mailIds) {
    const mail = await db.mails.get(id)
    if (mail && !mail.deletedAt && n) engine.upsert(mailDoc(mail, n))
    else engine.remove(`mail:${id}`)
  }
  for (const id of documentIds) {
    engine.removeDocument(id)
    for (const doc of await documentDocs(id)) engine.upsert(doc)
  }
  scheduleSave()
}

/** Charge l'index enregistré (ou le reconstruit) puis le garde à jour après chaque écriture. */
export function startSearch(): Promise<void> {
  starting ??= (async () => {
    const saved = (await db.searchIndex.get(KEY))?.value as { version: number; json: string } | undefined
    if (saved?.version === SEARCH_INDEX_VERSION) {
      try {
        engine = SearchEngine.fromJSON(saved.json)
        setStatus('ready')
      } catch {
        await rebuildAll()
      }
    } else {
      await rebuildAll()
    }
    unsubscribe = onDataChange((kind, id) => {
      if (kind === 'mail') dirty.mails.add(id)
      else if (kind === 'reference') dirty.all = true
      else dirty.documents.add(id)
      clearTimeout(flushTimer)
      flushTimer = setTimeout(() => void flush(), dirty.all ? REBUILD_DELAY_MS : FLUSH_DELAY_MS)
    })
  })()
  return starting
}

/** Réinitialise le moteur en mémoire (tests, restauration d'une sauvegarde). */
export function resetSearch() {
  unsubscribe?.()
  unsubscribe = null
  clearTimeout(flushTimer)
  clearTimeout(saveTimer)
  engine = null
  starting = null
  dirty.mails.clear()
  dirty.documents.clear()
  dirty.all = false
  setStatus('idle')
}

/** Attend que les écritures récentes soient prises en compte (tests, résultats immédiats). */
export async function flushSearch() {
  clearTimeout(flushTimer)
  await flush()
}

export interface SearchFilters {
  /** Tout par défaut. */
  types?: ('mail' | 'document' | 'page')[]
  from?: string
  to?: string
  category?: DocumentCategory
  departmentId?: string
  processed?: boolean
}

export interface MailResult {
  kind: 'mail'
  id: string
  flow: MailFlow
  reference: string
  subject: string
  date: string
  isProcessed: boolean
}
export interface DocumentResult {
  kind: 'document'
  id: string
  title: string
  category: DocumentCategory
  pageCount: number
  date: string
}
export interface PageResult {
  kind: 'page'
  documentId: string
  title: string
  page: number
  snippet: string
}
export type SearchResult = MailResult | DocumentResult | PageResult

/** Résultats classés, limités à ce que l'utilisateur connecté a le droit de voir. */
export async function searchContent(query: string, filters: SearchFilters = {}, limit = 60): Promise<SearchResult[]> {
  const user = requireUser()
  const q = query.trim()
  if (!q) return []
  await startSearch()
  const want = (kind: SearchResult['kind']) => !filters.types || filters.types.includes(kind)
  const within = (date: string) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)

  // Les numéros se retrouvent aussi par préfixe sur l'index Dexie, en complément de MiniSearch.
  const byReference = /\d/.test(q) && want('mail') ? await db.mails.where('reference').startsWith(q).limit(20).toArray() : []
  const ordered = [
    ...byReference.map((m) => ({ id: `mail:${m.id}`, kind: 'mail' as const, refId: m.id, page: undefined as number | undefined })),
    ...engine!.search(q, 300),
  ]

  const results: SearchResult[] = []
  const seen = new Set<string>()
  for (const hit of ordered) {
    if (results.length >= limit) break
    if (seen.has(hit.id) || !want(hit.kind)) continue
    seen.add(hit.id)

    if (hit.kind === 'mail') {
      const mail = await db.mails.get(hit.refId)
      if (!mail || mail.deletedAt || !canSeeMail(mail, user) || !within(mail.mailDate)) continue
      if (filters.departmentId && mail.departmentId !== filters.departmentId) continue
      if (filters.processed !== undefined && (mail.flow !== 'incoming' || (mail.isProcessed === 1) !== filters.processed)) continue
      results.push({ kind: 'mail', id: mail.id, flow: mail.flow, reference: mail.reference, subject: mail.subject, date: mail.mailDate, isProcessed: mail.isProcessed === 1 })
      continue
    }

    const doc = await db.documents.get(hit.refId)
    if (!doc || doc.deletedAt || !within(doc.archivedAt) || (filters.category && doc.category !== filters.category)) continue
    if (!(await canSeeDocument(doc, user))) continue
    if (hit.kind === 'document') {
      results.push({ kind: 'document', id: doc.id, title: doc.title, category: doc.category, pageCount: doc.pageCount, date: doc.archivedAt })
    } else {
      const page = await db.documentPages.get([doc.id, hit.page ?? 1])
      if (page) results.push({ kind: 'page', documentId: doc.id, title: doc.title, page: page.pageNumber, snippet: snippet(page.text, q) })
    }
  }
  return results
}
