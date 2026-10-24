/** Mots de passe : PBKDF2-SHA-256, 210 000 itérations, sel aléatoire (DOMAIN.md §3). */

const ITERATIONS = 210_000
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export interface PasswordHash {
  hash: string
  salt: string
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await derive(password, salt, ITERATIONS)
  return { hash: `pbkdf2-sha256$${ITERATIONS}$${toBase64(bits)}`, salt: toBase64(salt) }
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const [scheme, iterations, expected] = stored.hash.split('$')
  if (scheme !== 'pbkdf2-sha256' || !iterations || !expected) return false
  const actual = toBase64(await derive(password, fromBase64(stored.salt), Number(iterations)))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

/** Clé de récupération : 25 caractères sans ambiguïté, par groupes de 5 (≈ 120 bits). */
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(25))
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length])
  return Array.from({ length: 5 }, (_, i) => chars.slice(i * 5, i * 5 + 5).join('')).join('-')
}

export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
