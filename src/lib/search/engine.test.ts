// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { processTerm, SearchEngine, snippet, tokenize, type SearchDoc } from './engine'

const mail = (id: string, over: Partial<SearchDoc> = {}): SearchDoc => ({ id: `mail:${id}`, kind: 'mail', refId: id, title: 'Objet', ...over })
const page = (doc: string, n: number, text: string, title = 'Rapport'): SearchDoc => ({ id: `page:${doc}:${n}`, kind: 'page', refId: doc, page: n, title, text })

describe('découpage et normalisation', () => {
  it('garde les références entières et ajoute leurs morceaux', () => {
    expect(tokenize('Courrier 12/26 dossier D14523696-23')).toEqual(['Courrier', '12/26', '12', '26', 'dossier', 'D14523696-23', 'D14523696', '23'])
  })

  it('replie accents et casse, et ignore les mots vides', () => {
    expect(processTerm('Recouvrément')).toBe('recouvrement')
    expect(processTerm('Éléphant')).toBe('elephant')
    for (const word of ['le', 'De', 'des', 'à', 'et']) expect(processTerm(word)).toBeNull()
  })
})

describe('recherche', () => {
  async function engine() {
    const e = new SearchEngine()
    await e.addAll([
      mail('1', { reference: '12/26', title: 'Visite du musée', fileNumber: 'D14523696-23', parties: 'Ministère de la Justice Cabinet' }),
      mail('2', { reference: '112/26', title: 'Recouvrement des prêts', parties: 'Banque centrale' }),
      page('d1', 1, 'Le recouvrement des prêts bancaires a progressé de 12 % au trimestre.'),
      page('d1', 2, 'Annexe : tableau des remboursements.'),
      { id: 'doc:d1', kind: 'document', refId: 'd1', title: 'Rapport trimestriel' },
    ])
    return e
  }
  const ids = (hits: { id: string }[]) => hits.map((h) => h.id)

  it('trouve sans tenir compte des accents ni de la casse, par préfixe', async () => {
    const e = await engine()
    expect(ids(e.search('RECOUVREMENT'))).toEqual(expect.arrayContaining(['mail:2', 'page:d1:1']))
    expect(ids(e.search('prets'))).toContain('mail:2')
    expect(ids(e.search('recouvr'))).toContain('page:d1:1')
    expect(ids(e.search('musee'))).toEqual(['mail:1'])
  })

  it('tolère les fautes au-delà de 4 lettres seulement', async () => {
    const e = await engine()
    expect(ids(e.search('recouvremant'))).toContain('mail:2')
    expect(ids(e.search('musse'))).toEqual(['mail:1'])
    expect(ids(e.search('pret'))).toContain('mail:2')
    expect(e.search('xyz')).toEqual([])
  })

  it('retrouve les références, entières ou par préfixe, et le numéro de dossier', async () => {
    const e = await engine()
    expect(ids(e.search('12/26'))[0]).toBe('mail:1')
    expect(ids(e.search('12/2'))).toContain('mail:1')
    expect(ids(e.search('D14523696-23'))).toEqual(['mail:1'])
    expect(ids(e.search('d14523696'))).toEqual(['mail:1'])
  })

  it('exige tous les mots, puis élargit s’il n’y a rien', async () => {
    const e = await engine()
    expect(ids(e.search('recouvrement banque'))).toEqual(['mail:2'])
    expect(ids(e.search('musée banque'))).toEqual(expect.arrayContaining(['mail:1', 'mail:2']))
  })

  it('classe la référence et l’objet avant le texte des pages', async () => {
    const e = await engine()
    const hits = e.search('recouvrement')
    expect(hits[0]?.id).toBe('mail:2')
    expect(hits.find((h) => h.id === 'page:d1:1')?.page).toBe(1)
  })

  it('met à jour et retire des entrées, document entier compris', async () => {
    const e = await engine()
    e.upsert(mail('2', { reference: '112/26', title: 'Subvention exceptionnelle' }))
    expect(ids(e.search('subvention'))).toEqual(['mail:2'])
    expect(ids(e.search('recouvrement'))).not.toContain('mail:2')
    e.removeDocument('d1')
    expect(e.search('annexe')).toEqual([])
    expect(e.search('trimestriel')).toEqual([])
  })

  it('survit à la sérialisation, pages suivies comprises', async () => {
    const e = await engine()
    const copy = SearchEngine.fromJSON(e.toJSON())
    expect(copy.size).toBe(e.size)
    expect(ids(copy.search('recouvrement'))).toEqual(ids(e.search('recouvrement')))
    copy.removeDocument('d1')
    expect(copy.search('annexe')).toEqual([])
  })
})

describe('extraits', () => {
  it('entoure le premier terme trouvé de ±80 caractères', () => {
    const text = `${'a'.repeat(200)} Recouvrément des prêts ${'b'.repeat(200)}`
    const out = snippet(text, 'recouvrement')
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toContain('Recouvrément')
    expect(out.length).toBeLessThanOrEqual(164)
  })

  it('revient au début du texte quand le terme n’apparaît pas', () => {
    expect(snippet('Texte court', 'absent')).toBe('Texte court')
  })
})
