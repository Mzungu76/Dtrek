/**
 * Web Speech API wrapper for Giulia's spoken callouts during navigation.
 * Zero cost, works fully offline — the MVP audio path. A higher-quality
 * pre-generated TTS track (stored alongside the offline package) is a
 * possible later iteration, not needed for the first release.
 */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, lang = 'it-IT'): void {
  if (!isSpeechSupported()) return
  window.speechSynthesis.cancel() // don't stack callouts if one is already mid-sentence
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1.0
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
