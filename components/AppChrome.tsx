'use client'

import { usePathname } from 'next/navigation'
import { isSharedContentPath } from '@/lib/publicPaths'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import InstallPWA from '@/components/InstallPWA'
import OfflineBanner from '@/components/OfflineBanner'
import OfflineSync from '@/components/OfflineSync'
import SyncEngineProvider from '@/components/SyncEngineProvider'
import GlobalBackInterceptor from '@/app/components/GlobalBackInterceptor'
import SplashScreen from '@/components/SplashScreen'
import SessionKeepAlive from '@/components/SessionKeepAlive'
import OnboardingGate from '@/components/onboarding/OnboardingGate'
import SyncDebugPanel from '@/components/SyncDebugPanel'
import GlobalSearchStatusPill from '@/components/GlobalSearchStatusPill'

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
 * `usePathname()` richiede un componente client: RootLayout resta un Server Component, e questo
 * è l'unico punto che varia in base alla rotta.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isSharedContentPath(pathname)) return <>{children}</>

  return (
    <>
      <SplashScreen />
      <SessionKeepAlive />
      <GlobalBackInterceptor />
      {children}
      <OfflineBanner />
      <ServiceWorkerRegister />
      <InstallPWA />
      <OfflineSync />
      <SyncEngineProvider />
      <OnboardingGate />
      <SyncDebugPanel />
      <GlobalSearchStatusPill />
    </>
  )
}
