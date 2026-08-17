'use client'

import { usePathname } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { isSharedContentPath } from '@/lib/publicPaths'
import { useEntitlement } from '@/lib/useEntitlement'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import InstallPWA from '@/components/InstallPWA'
import OfflineBanner from '@/components/OfflineBanner'
import OfflineSync from '@/components/OfflineSync'
import SyncEngineProvider from '@/components/SyncEngineProvider'
import GlobalBackInterceptor from '@/app/components/GlobalBackInterceptor'
import SplashScreen from '@/components/SplashScreen'
import NativeStatusBar from '@/components/NativeStatusBar'
import NavigatorBackHandler from '@/components/NavigatorBackHandler'
import SessionKeepAlive from '@/components/SessionKeepAlive'
import OnboardingGate from '@/components/onboarding/OnboardingGate'
import SyncDebugPanel from '@/components/SyncDebugPanel'
import GlobalSearchStatusPill from '@/components/GlobalSearchStatusPill'
import NavigatorRouteGuard from '@/components/navigation/NavigatorRouteGuard'

/**
 * Monta l'infrastruttura dell'app (splash screen, service worker, motore di sincronizzazione,
 * gate di onboarding…) SOLO fuori dalle pagine di contenuto condiviso (`/s/…`, `/leggi/…`).
 *
 * Prima queste componenti erano montate in app/layout.tsx senza distinzione, quindi un
 * visitatore anonimo che apriva un link condiviso — mai entrato nell'app, magari nemmeno un
 * utente DTrek — si ritrovava comunque a: vedere lo splash screen scuro col logo, far
 * registrare un service worker dal proprio browser per un dominio con cui non avrà altra
 * interazione, far girare inutilmente il motore di sincronizzazione, e rischiare che
 * `OnboardingGate` copra il contenuto con un wizard a schermo intero se per caso aveva una
 * sessione DTrek propria non ancora completata (es. il proprietario che apre il proprio link
 * di anteprima).
 *
 * Stesso principio applicato dentro l'app nativa Navigator, per un motivo diverso e più severo
 * (docs/navigator-dtrek-boundary.md, modello "un'icona sola"): finché l'account non ha
 * esplicitamente attivato Dtrek ("Passa a Dtrek", components/navigation/NavigatorMenu.tsx),
 * Navigator non deve MAI mostrare nulla che porti a una schermata Dtrek senza che l'utente lo
 * abbia chiesto. `OnboardingGate` (wizard + percorso omaggio, che finiva dritto su `/guida/{id}`)
 * e `InstallPWA` (inviterebbe a installare una seconda icona che il modello a icona unica vuole
 * evitare) sono montati SOLO se non siamo nell'app nativa, o se lo siamo ma l'utente è già
 * passato a Dtrek — mai in mezzo, mai "solo per questa volta". `NavigatorRouteGuard` copre lo
 * stesso confine ma dal lato navigazione: qualunque `router.push`/`<Link>` verso una rotta non
 * elencata in lib/navigatorAllowedPaths.ts (non solo il wizard, qualunque componente) viene
 * rimandato indietro a `/navigatore` — un solo guardiano invece di dover trovare e correggere
 * ogni singolo punto che potrebbe provarci.
 *
 * `usePathname()` richiede un componente client: RootLayout resta un Server Component, e questo
 * è l'unico punto che varia in base alla rotta.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const entitlement = useEntitlement()

  if (isSharedContentPath(pathname)) return <>{children}</>

  // Vale solo dentro l'app nativa: sul web Capacitor.isNativePlatform() è sempre false, quindi
  // questo non cambia nulla per un utente Dtrek normale, nemmeno mentre l'entitlement sta ancora
  // caricando (dtrekActivated parte null, ma il controllo native resta falso a prescindere).
  const suppressDtrekOnboarding = Capacitor.isNativePlatform() && !entitlement.dtrekActivated

  return (
    <>
      <NativeStatusBar />
      <NavigatorBackHandler />
      <SplashScreen />
      <SessionKeepAlive />
      <GlobalBackInterceptor />
      <NavigatorRouteGuard />
      {children}
      <OfflineBanner />
      <ServiceWorkerRegister />
      {!suppressDtrekOnboarding && <InstallPWA />}
      <OfflineSync />
      <SyncEngineProvider />
      {!suppressDtrekOnboarding && <OnboardingGate />}
      <SyncDebugPanel />
      <GlobalSearchStatusPill />
    </>
  )
}
