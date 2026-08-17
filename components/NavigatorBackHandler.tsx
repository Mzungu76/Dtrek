'use client'
import { useEffect, useRef, useState } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'

// Stessa finestra usata dal pattern "premi ancora per uscire" di qualunque app Android — abbastanza
// breve da non chiudere per sbaglio con due tocchi involontari distanti, abbastanza lunga da non
// richiedere un doppio tocco frenetico.
const EXIT_WINDOW_MS = 2000

/**
 * Gestisce il tasto/gesto "indietro" hardware di Android per tutto Navigator. Registrare un
 * listener su `backButton` toglie ad Android il suo comportamento di default (torna indietro
 * nella cronologia se possibile, altrimenti riduce a icona l'app) — da qui in poi tocca a
 * questo componente riprodurlo per intero:
 *
 * - `canGoBack: true` (c'è una schermata precedente in Navigator): delega a
 *   `window.history.back()`, lo stesso identico evento 'popstate' che oggi già guida
 *   GlobalBackInterceptor.tsx (schermate Dtrek condivise) e il proprio guard di
 *   ActiveNavigationView.tsx (mostra "Terminare la navigazione?" invece di uscire a metà
 *   escursione) — nessuna delle due logiche esistenti va toccata, restano l'unico punto che
 *   decide cosa succede schermata per schermata.
 * - `canGoBack: false` (prima pagina, /navigatore appena aperta o già tornati fin lì a forza di
 *   indietro): mostra "Clicca un'altra volta per chiudere l'app" invece di ridurre a icona in
 *   silenzio; un secondo tocco entro EXIT_WINDOW_MS chiude davvero l'app (`App.exitApp()`, la
 *   stessa chiamata già usata dal pulsante manuale "Chiudi Navigator" di NavigatorMenu.tsx).
 *
 * Montato in AppChrome.tsx e attivo solo dentro l'app nativa (Capacitor.isNativePlatform()) —
 * sul web Dtrek non fa nulla, il tasto indietro del browser resta quello di sempre.
 */
export default function NavigatorBackHandler() {
  const [showExitHint, setShowExitHint] = useState(false)
  const lastPressAtRef = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let listenerHandle: PluginListenerHandle | undefined
    let cancelled = false

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        setShowExitHint(false)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        window.history.back()
        return
      }

      const now = Date.now()
      if (now - lastPressAtRef.current < EXIT_WINDOW_MS) {
        App.exitApp()
        return
      }
      lastPressAtRef.current = now
      setShowExitHint(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setShowExitHint(false), EXIT_WINDOW_MS)
    }).then((handle) => {
      if (cancelled) handle.remove()
      else listenerHandle = handle
    })

    return () => {
      cancelled = true
      listenerHandle?.remove()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!showExitHint) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+24px)] z-[9999] flex justify-center pointer-events-none">
      <p className="px-4 py-2.5 rounded-full bg-stone-900/90 text-white text-sm font-semibold shadow-lg">
        Clicca un&apos;altra volta per chiudere l&apos;app
      </p>
    </div>
  )
}
