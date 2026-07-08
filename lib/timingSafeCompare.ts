import { timingSafeEqual } from 'crypto'

// Plain !== leaks the secret's length/prefix through response-time differences.
// timingSafeEqual itself requires equal-length buffers, so a length mismatch is
// checked (and rejected) before it — that only reveals length, not content.
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
