import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('fusionne les classes Tailwind en conflit', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
