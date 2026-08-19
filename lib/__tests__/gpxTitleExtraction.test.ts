import { describe, it, expect } from 'vitest'
import { extractGpxTitle } from '@/lib/gpxParser'
import { extractServerGpxTitle } from '@/lib/serverGpxParser'

// DTREK-AUDIT.md P2 #27 — alcuni GPX (es. le esportazioni "togpx" del Sentiero Italia CAI) usano
// <name> con un figlio per lingua invece di un testo diretto —
// <name><it>SI Z17</it><en>SI Z17</en>...</name>. Il fix (extractGpxTitle in lib/gpxParser.ts)
// era applicato solo lì, non in lib/gpxActivityParser.ts (ora corretto, riusa la stessa funzione)
// né in lib/serverGpxParser.ts (ora corretto con l'equivalente via regex, extractServerGpxTitle —
// questo modulo gira lato server, senza DOMParser).

// extractGpxTitle prende un Element DOM — nessun DOMParser disponibile in questo ambiente di test
// (Node puro, vedi vitest.config.ts), quindi si costruisce un oggetto minimo che soddisfa
// esattamente la superficie che la funzione usa davvero (children/querySelector/textContent),
// senza bisogno di jsdom per un solo modulo.
function fakeElement(opts: { textContent?: string; children?: { tag: string; textContent: string }[] }): Element {
  const children = (opts.children ?? []).map((c) => ({
    tagName: c.tag,
    textContent: c.textContent,
  }))
  return {
    textContent: opts.textContent ?? null,
    children: children as unknown as HTMLCollection & { length: number },
    querySelector: (sel: string) => children.find((c) => c.tagName === sel) as unknown as Element | null,
  } as unknown as Element
}

describe('extractGpxTitle (lib/gpxParser.ts, usata anche da gpxActivityParser.ts)', () => {
  it('testo diretto quando <name> non ha figli', () => {
    expect(extractGpxTitle(fakeElement({ textContent: '  Sentiero del Bosco  ' }))).toBe('Sentiero del Bosco')
  })

  it('con figli per lingua, prende il testo del figlio <it>', () => {
    const el = fakeElement({ children: [
      { tag: 'it', textContent: 'SI Z17' },
      { tag: 'en', textContent: 'SI Z17 EN' },
    ] })
    expect(extractGpxTitle(el)).toBe('SI Z17')
  })

  it('senza figlio <it>, prende il primo figlio disponibile invece di concatenare tutte le lingue', () => {
    const el = fakeElement({ children: [
      { tag: 'en', textContent: 'Trail Name EN' },
      { tag: 'de', textContent: 'Trail Name DE' },
    ] })
    expect(extractGpxTitle(el)).toBe('Trail Name EN')
  })

  it('torna stringa vuota per un elemento nullo, mai un errore', () => {
    expect(extractGpxTitle(null)).toBe('')
  })
})

describe('extractServerGpxTitle (lib/serverGpxParser.ts)', () => {
  it('testo diretto quando <name> non ha figli', () => {
    const xml = '<gpx><trk><name>Sentiero del Bosco</name></trk></gpx>'
    expect(extractServerGpxTitle(xml)).toBe('Sentiero del Bosco')
  })

  it('con figli per lingua, prende il testo del figlio <it> invece di tornare vuoto', () => {
    const xml = '<gpx><trk><name><it>SI Z17</it><en>SI Z17 EN</en></name></trk></gpx>'
    expect(extractServerGpxTitle(xml)).toBe('SI Z17')
  })

  it('senza figlio <it>, prende il primo figlio disponibile', () => {
    const xml = '<gpx><trk><name><en>Trail Name EN</en><de>Trail Name DE</de></name></trk></gpx>'
    expect(extractServerGpxTitle(xml)).toBe('Trail Name EN')
  })

  it('torna stringa vuota quando <name> è assente, mai un errore', () => {
    expect(extractServerGpxTitle('<gpx><trk></trk></gpx>')).toBe('')
  })
})
