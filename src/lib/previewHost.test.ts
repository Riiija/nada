import { describe, expect, it } from 'vitest'
import { isPreviewHost } from './previewHost'

describe('isPreviewHost', () => {
  it('ne signale ni localhost ni un domaine propre', () => {
    expect(isPreviewHost('localhost', 'courrier.exemple.mg')).toBe(false)
    expect(isPreviewHost('courrier.exemple.mg', 'courrier.exemple.mg')).toBe(false)
  })
  it('signale une URL vercel.app différente de la production', () => {
    expect(isPreviewHost('ged-git-feature-abc.vercel.app', 'courrier.exemple.mg')).toBe(true)
    expect(isPreviewHost('ged-git-feature-abc.vercel.app')).toBe(true)
  })
  it('ne signale pas la production hébergée sur vercel.app', () => {
    expect(isPreviewHost('ged.vercel.app', ' GED.vercel.app ')).toBe(false)
  })
})
