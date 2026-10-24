/** Générateur pseudo-aléatoire reproductible : deux chargements donnent les mêmes données. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = () => number

export const picker = (rand: Rand) => <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!
