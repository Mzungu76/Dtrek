'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { useEntitlement } from '@/lib/useEntitlement'
import { isNavigatorAllowedPath } from '@/lib/navigatorAllowedPaths'

/**
 * Guardiano unico del confine Navigator/Dtrek (docs/navigator-dtrek-boundary.md) — mai attivo sul
 * web (Capacitor.isNativePlatform() è sempre false lì, nessun impatto su Dtrek). Dentro l'app
 * nativa Navigator, prima che l'utente abbia esplicitamente attivato Dtrek, rimanda indietro a
 * `/navigatore` qualunque tentativo di navigazione verso una schermata non in
 * lib/navigatorAllowedPaths.ts — a prescindere da CHI l'ha causato: un bottone dentro un
 * componente profondamente annidato, un redirect automatico dopo un errore, un `<Link>`
 * dimenticato. Un solo punto da controllare invece di doverne trovare e correggere uno alla volta.
 *
 * `replace`, non `push`: un tentativo di navigazione bloccato non deve lasciare una voce
 * "fantasma" nella cronologia che il tasto indietro poi ripropone.
 */
export default function NavigatorRouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const entitlement = useEntitlement()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (entitlement.dtrekActivated) return // null (ancora in caricamento) o false: resta bloccato
    if (isNavigatorAllowedPath(pathname)) return
    router.replace('/navigatore')
  }, [pathname, entitlement.dtrekActivated, router])

  return null
}
