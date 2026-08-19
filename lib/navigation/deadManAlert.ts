// DTREK-AUDIT.md P0 #8 — il massimo di "proattivo" onestamente raggiungibile senza nuova
// infrastruttura (nessun push VAPID/service worker, nessuna colonna di contatto in schema — vedi
// il contesto in lib/navigation/liveShareStatus.ts): un segnale davvero difficile da ignorare per
// chi ha GIÀ la pagina aperta (anche in background), non un push che raggiunge un contatto a tab
// chiuso. Condiviso da LiveShareViewer.tsx e GroupShareViewer.tsx.
'use client'

// Nessun asset audio nuovo — un breve beep generato al volo via Web Audio, sufficiente per
// attirare l'attenzione senza dover imballare/servire un file.
function playBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.6)
    oscillator.onended = () => ctx.close()
  } catch {
    // Best-effort — un browser che blocca l'audio senza interazione utente non deve rompere nulla.
  }
}

export function deadManAlertPermissionGranted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/** Va chiamata solo da un gestore di click/tap esplicito — mai auto-richiesta al caricamento
 *  della pagina (i browser la bloccano comunque senza gesture, e un prompt non richiesto è
 *  invadente su una pagina pubblica senza login). */
export async function requestDeadManAlertPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

/**
 * Da chiamare una sola volta all'ingresso in stato 'critical' (edge-triggered dal chiamante, mai
 * a ogni render/poll) — vibrazione + beep sempre tentati (nessun permesso richiesto), notifica di
 * sistema solo se già concessa in precedenza.
 */
export function triggerDeadManAlert(title: string, body: string): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.([200, 100, 200, 100, 200])
  }
  playBeep()
  if (deadManAlertPermissionGranted()) {
    try {
      new Notification(title, { body, tag: 'dtrek-dead-man-switch' })
    } catch {
      // Best-effort.
    }
  }
}
