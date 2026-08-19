/**
 * Web Speech API wrapper for Giulia's spoken callouts during navigation.
 * Zero cost, works fully offline — the MVP audio path. A higher-quality
 * pre-generated TTS track (stored alongside the offline package) is a
 * possible later iteration, not needed for the first release.
 *
 * Fase 6 di docs/navigator-orizzonti-roadmap.md — coda con priorità invece di "cancella
 * sempre": prima ogni nuovo avviso interrompeva quello in corso (commento originale: "don't
 * stack callouts if one is already mid-sentence"), quindi con più eventi ravvicinati (svolte,
 * promemoria) un'istruzione poteva sparire a metà frase. Ora solo un avviso `critical`
 * interrompe; gli altri si accodano.
 */
export type SpeechPriority = 'critical' | 'normal'

export interface SpeakOptions {
  /** 'critical' (off-route, wrong_direction, GPS perso, promemoria di rientro per il buio)
   *  interrompe subito qualunque cosa in corso. 'normal' (default: svolte, POI, promemoria di
   *  passo, batteria) si accoda invece di cancellare. */
  priority?: SpeechPriority
  lang?: string
}

interface QueueItem { text: string; lang: string; queuedAt: number }

// DTREK-AUDIT.md P2 #25 — la coda `normal` (POI/momenti) non aveva limite né scadenza: in un
// tratto denso di POI si accumulavano annunci che l'escursionista sentiva minuti dopo essere già
// passato oltre, sempre più "in ritardo" rispetto alla propria posizione reale. Due correttivi
// indipendenti, entrambi puri e testabili senza il Web Speech API reale:
// - MAX_QUEUE_SIZE: quando un nuovo avviso arriva a coda piena, scarta il più VECCHIO (il meno
//   rilevante alla posizione attuale, non il più nuovo) per fargli posto.
// - MAX_QUEUE_AGE_MS: un avviso rimasto in coda troppo a lungo (l'escursionista si è mosso ben
//   oltre il contesto a cui si riferiva) viene saltato invece di essere pronunciato comunque.
export const MAX_QUEUE_SIZE = 3
export const MAX_QUEUE_AGE_MS = 60_000

/** Pura — scarta gli elementi più vecchi in eccesso rispetto a maxSize, mantenendo i più recenti. */
export function trimQueueOverflow<T>(queue: T[], maxSize: number): T[] {
  return queue.length <= maxSize ? queue : queue.slice(queue.length - maxSize)
}

/** Pura — scarta dalla TESTA della coda ogni elemento più vecchio di maxAgeMs rispetto a `now`. */
export function dropStaleQueueHead(queue: QueueItem[], now: number, maxAgeMs: number): QueueItem[] {
  let i = 0
  while (i < queue.length && now - queue[i].queuedAt > maxAgeMs) i++
  return i === 0 ? queue : queue.slice(i)
}

let queue: QueueItem[] = []
let speaking = false
// Riferimento all'utterance in riproduzione — disarmato (impostato a null) prima di ogni
// cancel() esplicito, altrimenti il suo stesso onerror/onend richiamerebbe playNext() una
// seconda volta (la cancellazione genera comunque un evento sull'utterance interrotta).
let currentUtterance: SpeechSynthesisUtterance | null = null

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function playNext(): void {
  currentUtterance = null
  queue = dropStaleQueueHead(queue, Date.now(), MAX_QUEUE_AGE_MS)
  if (queue.length === 0) { speaking = false; return }
  const item = queue.shift()!
  speaking = true
  const utterance = new SpeechSynthesisUtterance(item.text)
  utterance.lang = item.lang
  utterance.rate = 1.0
  utterance.onend = () => { if (currentUtterance === utterance) playNext() }
  utterance.onerror = () => { if (currentUtterance === utterance) playNext() }
  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!isSpeechSupported()) return
  const { priority = 'normal', lang = 'it-IT' } = options

  if (priority === 'critical') {
    currentUtterance = null
    window.speechSynthesis.cancel()
    queue = [{ text, lang, queuedAt: Date.now() }]
    speaking = false
    playNext()
    return
  }

  // Dedup: lo stesso testo già in coda (o già in corso) non viene riaccodato — evita, ad
  // esempio, tre avvisi identici di svolta ravvicinati che finirebbero tutti in coda.
  if (currentUtterance?.text === text || queue.some((item) => item.text === text)) return
  queue.push({ text, lang, queuedAt: Date.now() })
  queue = trimQueueOverflow(queue, MAX_QUEUE_SIZE)
  if (!speaking) playNext()
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return
  currentUtterance = null
  queue = []
  speaking = false
  window.speechSynthesis.cancel()
}
