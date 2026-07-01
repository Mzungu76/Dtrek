/** Extracts the `[curiosita]...[/curiosita]` callout blocks from a Giulia-generated guide (same markup produced by /api/guide, parsed in app/guida/[id]/page.tsx). */
export function extractCuriosita(guideText: string, max = 3): string[] {
  const re = /\[curiosita\]([\s\S]*?)\[\/curiosita\]/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(guideText)) !== null && out.length < max) {
    out.push(m[1].trim().replace(/\n/g, ' '))
  }
  return out
}
