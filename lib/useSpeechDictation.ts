'use client'
import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

// Same minimal Web Speech API typing as previously inlined in HikeNotesRecorder.tsx — extracted
// here now that a second caller (components/navigation/FieldNoteSheet.tsx) needs the identical
// start/stop/onresult dictation logic.
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  return (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor })
    .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
}

/**
 * Voice-to-text dictation (not audio recording) — transcribes speech live, calling onTranscript
 * with the current transcript on every result.
 *
 * Two backends behind one hook, picked once via Capacitor.isNativePlatform():
 * - Web (desktop browsers, the PWA): the browser's own Web Speech API
 *   (window.SpeechRecognition/webkitSpeechRecognition) — same as before.
 * - Native (the packaged Android app): @capacitor-community/speech-recognition, wrapping the
 *   OS's own SpeechRecognizer. Required because the Web Speech API this hook used to rely on
 *   exclusively simply doesn't exist inside an Android WebView (only in the standalone Chrome
 *   browser app) — every caller of this hook (GiuliaLiveQa.tsx, FieldNoteSheet.tsx) was silently
 *   non-functional on the native app before this, `supported` always false there. See
 *   docs/navigator-orizzonti-roadmap.md Fase 10's own "non ancora fatto: nessun test end-to-end
 *   reale" — this was that gap.
 *
 * Both speech backends still need network to actually transcribe on most devices — this hook
 * itself has no opinion on connectivity, callers that also need the RESULT of the dictation to
 * reach a server (GiuliaLiveQa's AI question) are the ones that must gate on `isOnline`
 * themselves, same as before.
 */
export function useSpeechDictation(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const isNative = Capacitor.isNativePlatform()
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    if (isNative) {
      SpeechRecognition.available().then(({ available }) => setSupported(available)).catch(() => setSupported(false))
    } else {
      setSupported(!!getSpeechRecognitionCtor())
    }
  }, [isNative])

  // Native listeners are process-wide (one native SpeechRecognizer, not one per hook instance)
  // — subscribed for the component's whole lifetime rather than only between start()/stop(), so
  // a 'stopped' event fired by the OS itself (silence timeout, a phone call interrupting) still
  // clears `recording` even outside an explicit toggleRecording() call.
  useEffect(() => {
    if (!isNative) return
    let partialHandle: { remove: () => void } | null = null
    let stateHandle: { remove: () => void } | null = null
    let cancelled = false
    SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
      if (data.matches?.[0]) onTranscriptRef.current(data.matches[0])
    }).then((h) => { if (cancelled) { h.remove(); return } partialHandle = h })
    SpeechRecognition.addListener('listeningState', (data: { status: 'started' | 'stopped' }) => {
      if (data.status === 'stopped') setRecording(false)
    }).then((h) => { if (cancelled) { h.remove(); return } stateHandle = h })
    return () => {
      cancelled = true
      partialHandle?.remove()
      stateHandle?.remove()
    }
  }, [isNative])

  const toggleRecordingNative = async () => {
    if (recording) {
      setRecording(false)
      await SpeechRecognition.stop().catch(() => {})
      return
    }
    const perm = await SpeechRecognition.checkPermissions().catch(() => null)
    const granted = perm?.speechRecognition === 'granted'
      || (await SpeechRecognition.requestPermissions().catch(() => null))?.speechRecognition === 'granted'
    if (!granted) return // permission denied this time — leave `supported` alone, the mic stays offered for a retry after Settings
    try {
      setRecording(true)
      // popup:false — the partialResults event (README: "doesn't work if popup is true") is how
      // the live transcript reaches GiuliaLiveQa/FieldNoteSheet's own UI, not a native dialog.
      await SpeechRecognition.start({ language: 'it-IT', popup: false, partialResults: true })
    } catch {
      setRecording(false)
    }
  }

  const toggleRecordingWeb = () => {
    if (recording) {
      recognitionRef.current?.stop()
      setRecording(false)
      return
    }
    const SR = getSpeechRecognitionCtor()
    if (!SR) { setSupported(false); return }
    const recognition = new SR()
    recognition.lang = 'it-IT'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      onTranscriptRef.current(text)
    }
    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }

  const toggleRecording = () => { if (isNative) void toggleRecordingNative(); else toggleRecordingWeb() }

  return { recording, supported, toggleRecording }
}
