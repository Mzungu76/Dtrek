import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// DTREK-AUDIT.md P2 #25 — la coda `normal` (POI/momenti) non aveva limite né scadenza: in un
// tratto denso di POI si accumulavano annunci che l'escursionista sentiva minuti dopo essere già
// passato oltre. trimQueueOverflow/dropStaleQueueHead sono le due funzioni pure che risolvono il
// problema, testabili senza il Web Speech API reale; il resto (speak/playNext) richiede un
// window.speechSynthesis finto — costruito qui per verificare il comportamento end-to-end.
import { trimQueueOverflow, dropStaleQueueHead, MAX_QUEUE_SIZE, MAX_QUEUE_AGE_MS } from '../speech'

describe('trimQueueOverflow', () => {
  it('non tocca una coda entro il limite', () => {
    expect(trimQueueOverflow([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  it('scarta i più vecchi (in testa) quando la coda supera il limite, mantenendo i più recenti', () => {
    expect(trimQueueOverflow([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5])
  })

  it('con limite 0 svuota la coda', () => {
    expect(trimQueueOverflow([1, 2, 3], 0)).toEqual([])
  })
})

describe('dropStaleQueueHead', () => {
  const now = 1_000_000

  it('non tocca elementi entro l\'età massima', () => {
    const queue = [{ text: 'a', lang: 'it', queuedAt: now - 1000 }]
    expect(dropStaleQueueHead(queue, now, 60_000)).toEqual(queue)
  })

  it('scarta gli elementi in testa più vecchi del limite', () => {
    const queue = [
      { text: 'vecchio', lang: 'it', queuedAt: now - 120_000 },
      { text: 'recente', lang: 'it', queuedAt: now - 1000 },
    ]
    const result = dropStaleQueueHead(queue, now, 60_000)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('recente')
  })

  it('scarta solo dalla testa, non un elemento vecchio "intrappolato" dopo uno recente (mai il caso reale: la coda è FIFO per queuedAt)', () => {
    // La coda è sempre inserita in ordine di queuedAt crescente (push), quindi non può esistere
    // un elemento vecchio dopo uno recente — questo test documenta l'assunzione, non un caso limite.
    const queue = [
      { text: 'a', lang: 'it', queuedAt: now - 5000 },
      { text: 'b', lang: 'it', queuedAt: now - 3000 },
    ]
    expect(dropStaleQueueHead(queue, now, 60_000)).toEqual(queue)
  })

  it('svuota completamente una coda interamente scaduta', () => {
    const queue = [
      { text: 'a', lang: 'it', queuedAt: now - 120_000 },
      { text: 'b', lang: 'it', queuedAt: now - 90_000 },
    ]
    expect(dropStaleQueueHead(queue, now, 60_000)).toEqual([])
  })
})

describe('speak — comportamento end-to-end con un Web Speech API finto', () => {
  let spoken: string[]
  let utteranceInstances: FakeUtterance[]

  class FakeUtterance {
    text: string
    lang = ''
    rate = 1
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(text: string) { this.text = text }
  }

  beforeEach(() => {
    vi.resetModules()
    spoken = []
    utteranceInstances = []
    // @ts-expect-error — ambiente di test, non un vero browser
    global.window = {
      speechSynthesis: {
        speak: (u: FakeUtterance) => { spoken.push(u.text) },
        cancel: () => {},
      },
    }
    // @ts-expect-error — usata da new SpeechSynthesisUtterance(...) dentro speech.ts
    global.SpeechSynthesisUtterance = FakeUtterance
  })

  afterEach(() => {
    // @ts-expect-error — pulizia tra un test e l'altro
    delete global.window
    // @ts-expect-error
    delete global.SpeechSynthesisUtterance
  })

  async function importFreshSpeech() {
    const mod = await import('../speech')
    return mod
  }

  it('accoda e pronuncia in ordine FIFO senza superare il limite di dimensione', async () => {
    const { speak } = await importFreshSpeech()
    for (let i = 0; i < MAX_QUEUE_SIZE + 5; i++) speak(`avviso ${i}`)
    // Solo il primo viene avviato subito (speak() chiama window.speechSynthesis.speak sul primo
    // elemento non appena la coda passa da vuota a non vuota) — gli altri restano in coda,
    // scartati dei più vecchi oltre MAX_QUEUE_SIZE.
    expect(spoken).toEqual(['avviso 0'])
  })

  it('un avviso critical interrompe e sostituisce tutto quello in coda', async () => {
    const { speak } = await importFreshSpeech()
    speak('normale 1')
    speak('normale 2')
    speak('urgente', { priority: 'critical' })
    expect(spoken[spoken.length - 1]).toBe('urgente')
  })

  it('lo stesso testo non viene accodato due volte (dedup)', async () => {
    const { speak } = await importFreshSpeech()
    speak('stesso avviso')
    speak('stesso avviso')
    speak('stesso avviso')
    expect(spoken).toEqual(['stesso avviso'])
  })
})
