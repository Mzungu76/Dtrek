'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { isNavigatorAllowedPath } from '@/lib/navigatorAllowedPaths'

/**
 * Legge il parametro `path` di un rilancio via dtreknavigator://open (lib/navigatorHandoff.ts) e
 * porta subito la WebView di Navigator lì, invece di lasciarla sulla sua Home di sempre
 * (/navigatore) — verificato dal vivo: passando da una Guida a "Naviga", l'app nativa si apriva
 * ma non sul percorso per cui era stata aperta, obbligando a ritrovarlo a mano dalla lista.
 *
 * Un path assente, malformato o non tra quelli concessi a Navigator
 * (lib/navigatorAllowedPaths.ts — stesso guardiano di NavigatorRouteGuard.tsx) resta un no-op: un
 * semplice tocco sull'icona dell'app (nessuna query string) deve continuare ad aprire la Home
 * come sempre, mai un errore.
 *
 * Montato in AppChrome.tsx, attivo solo dentro l'app nativa — stesso pattern di
 * NavigatorBackHandler.tsx (App.addListener + cleanup del listener).
 */
export default function NavigatorDeepLinkHandler() {
  const router = useRouter()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let listenerHandle: PluginListenerHandle | undefined
    let cancelled = false

    const handleUrl = (url: string) => {
      let path: string | null
      try {
        path = new URL(url).searchParams.get('path')
      } catch {
        return
      }
      if (path && isNavigatorAllowedPath(path)) router.push(path)
    }

    App.addListener('appUrlOpen', ({ url }) => handleUrl(url)).then((handle) => {
      if (cancelled) handle.remove()
      else listenerHandle = handle
    })

    return () => {
      cancelled = true
      listenerHandle?.remove()
    }
  }, [router])

  return null
}
