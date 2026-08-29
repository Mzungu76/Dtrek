'use client'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

// Stesso colore della PWA Dtrek (tema chiaro) — app/layout.tsx: viewport.themeColor e
// public/manifest.json usano già #5F7355 (salvia scura, direzione "Taccuino Botanico" —
// docs/taccuino-botanico-piano.md, botanico.bar di tailwind.config.ts). Dtrek "vede" quel
// colore gratis perché Android tinge la barra di stato col theme-color quando la PWA è
// installata/aperta nel browser; Navigator invece gira dentro una WebView Capacitor nativa, che
// il browser non gestisce affatto — senza questo componente la barra resta trasparente sul
// colore di qualunque schermata ci sia sotto in quel momento (nero sulle mappe, bianco sulle
// schermate chiare), non un colore coerente in tutta l'app.
const STATUS_BAR_COLOR = '#5F7355'

/**
 * Verde Dtrek sulla barra di stato di TUTTO Navigator — montato in AppChrome.tsx, quindi attivo
 * su ogni schermata che la WebView di Navigator possa mostrare (app/navigatore/**, ma anche
 * /guida/[id]/naviga condivisa con Dtrek), non solo quella di navigazione. Inerte sul web:
 * Capacitor.isNativePlatform() è sempre false lì (Dtrek non ha un guscio nativo proprio, vedi
 * capacitor.config.ts), quindi questo componente non renderizza né chiama nulla per un utente
 * Dtrek normale.
 *
 * L'app è già costruita per una WebView "overlay" (la barra di stato resta trasparente e il
 * contenuto vi si estende sotto — da qui il calc(env(safe-area-inset-top, 0px) + ...) già usato
 * ovunque, InstructionBanner.tsx incluso) — cambiare quella modalità toccherebbe ogni schermata.
 * Più semplice e meno rischioso: una striscia fissa, alta esattamente quanto la barra di stato
 * (env(safe-area-inset-top)), sempre sopra a tutto, colorata di verde — stesso effetto visivo di
 * una barra nativa opaca, ottenuto in CSS invece che riconfigurando l'overlay nativo. setStyle()
 * forza comunque le icone di sistema (orario, batteria…) a restare chiare, leggibili sul verde
 * anche sopra le schermate chiare (Percorsi, Importa…), non solo su quelle scure della mappa.
 */
export default function NativeStatusBar() {
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    setIsNative(true)
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
    // Innocuo se l'overlay resta attivo (il caso di oggi) — pronto comunque nel caso cambiasse in futuro.
    StatusBar.setBackgroundColor({ color: STATUS_BAR_COLOR }).catch(() => {})
  }, [])

  if (!isNative) return null

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 inset-x-0 z-[9999] pointer-events-none"
      style={{ height: 'env(safe-area-inset-top, 0px)', backgroundColor: STATUS_BAR_COLOR }}
    />
  )
}
