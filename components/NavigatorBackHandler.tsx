'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'

// Stessa finestra usata dal pattern "premi ancora per uscire" di qualunque app Android — abbastanza
// breve da non chiudere per sbaglio con due tocchi involontari distanti, abbastanza lunga da non
// richiedere un doppio tocco frenetico.
const EXIT_WINDOW_MS = 2000
// Pagina di ingresso di Navigator (capacitor.config.ts punta la WebView qui) — vedi il commento
// sotto sul perché il controllo è sul pathname e non su canGoBack.
const NAVIGATOR_HOME_PATH = '/navigatore'

/**
 * Gestisce il tasto/gesto "indietro" hardware di Android per tutto Navigator. Registrare un
 * listener su `backButton` toglie ad Android il suo comportamento di default (torna indietro
 * nella cronologia se possibile, altrimenti riduce a icona l'app) — da qui in poi tocca a
 * questo componente riprodurlo per intero.
 *
 * La verifica "siamo alla prima pagina?" è sul PATHNAME corrente (== /navigatore), non su
 * `canGoBack` come in un primo tentativo: GlobalBackInterceptor.tsx pusha una entry di guardia
 * nella cronologia a ogni cambio di pathname, anche quando si resta sulla stessa pagina — la
 * cronologia della WebView può quindi restare "profonda" (canGoBack true) anche quando l'utente è
 * di fatto già sulla home. Un tasto indietro dalla home deve sempre offrire di uscire, a
 * prescindere da quante voci fantasma ci siano sotto.
 *
 * - Non siamo sulla home: delega a `window.history.back()`, lo stesso identico evento
 *   'popstate' che oggi già guidano GlobalBackInterceptor.tsx (schermate Dtrek condivise) e il
 *   proprio guard di ActiveNavigationView.tsx (mostra "Terminare la navigazione?" invece di
 *   uscire a metà escursione) — nessuna delle due logiche esistenti va toccata.
 * - Siamo sulla home: mostra "Clicca un'altra volta per chiudere l'app" invece di ridurre a
 *   icona in silenzio; un secondo tocco entro EXIT_WINDOW_MS chiude davvero l'app
 *   (`App.exitApp()`, la stessa chiamata già usata dal pulsante manuale "Chiudi Navigator" di
 *   NavigatorMenu.tsx).
 *
 * Montato in AppChrome.tsx e attivo solo dentro l'app nativa (Capacitor.isNativePlatform()) —
 * sul web Dtrek non fa nulla, il tasto indietro del browser resta quello di sempre.
 */
export default function NavigatorBackHandler() {
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  const [showExitHint, setShowExitHint] = useState(false)
  const lastPressAtRef = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let listenerHandle: PluginListenerHandle | undefined
    let cancelled = false

    App.addListener('backButton', () => {
      if (pathnameRef.current !== NAVIGATOR_HOME_PATH) {
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
