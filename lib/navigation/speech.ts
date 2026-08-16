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

interface QueueItem { text: string; lang: string }

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
    queue = [{ text, lang }]
    speaking = false
    playNext()
    return
  }

  // Dedup: lo stesso testo già in coda (o già in corso) non viene riaccodato — evita, ad
  // esempio, tre avvisi identici di svolta ravvicinati che finirebbero tutti in coda.
  if (currentUtterance?.text === text || queue.some((item) => item.text === text)) return
  queue.push({ text, lang })
  if (!speaking) playNext()
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return
  currentUtterance = null
  queue = []
  speaking = false
  window.speechSynthesis.cancel()
}
