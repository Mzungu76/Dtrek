'use client'
import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import OnboardingWizard from './OnboardingWizard'
import GiftRouteStep from './GiftRouteStep'
import AppBoundaryInfoStep from './AppBoundaryInfoStep'
import { hasSeenDtrekAppBoundaryInfo, markDtrekAppBoundaryInfoSeen } from '@/lib/onboarding/appBoundaryPref'
import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js'

type Phase = 'hidden' | 'wizard' | 'gift' | 'boundary'

/**
 * Monta, in sequenza, il wizard di onboarding (OnboardingWizard.tsx), il passo del percorso
 * omaggio (GiftRouteStep.tsx) e infine la spiegazione Dtrek/Navigator (AppBoundaryInfoStep.tsx,
 * UX-AUDIT.md P-C1) — per gli utenti autenticati che non li hanno ancora completati né saltati.
 * I primi due passi usano flag INDIPENDENTI (onboarding_completed_at, gift_route_offered_at): il
 * wizard imposta il proprio flag prima ancora di offrire il regalo, quindi se il browser si
 * chiudesse a metà tra i due passi, un flag unico avrebbe perso per sempre l'occasione di offrirlo.
 * Il terzo passo usa invece una preferenza locale al dispositivo (lib/onboarding/appBoundaryPref.ts,
 * stesso principio di lib/navigation/navOnboardingPref.ts) — è pura spiegazione, non uno stato di
 * prodotto da sincronizzare tra dispositivi. Montato a livello di app/layout.tsx, stesso posto di
 * OfflineBanner/InstallPWA.
 */
export default function OnboardingGate() {
  const [phase, setPhase] = useState<Phase>('hidden')

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let cancelled = false

    async function checkFor(user: SupabaseUser | null) {
      if (!user) { if (!cancelled) setPhase('hidden'); return }
      try {
        const settings = await getUserSettingsCached()
        if (cancelled) return
        // getUserSettingsCached() ritorna {} (zero chiavi) SOLO quando sia la cache locale sia il
        // fetch di rete sono falliti (lib/sync/userSettingsStore.ts) — una risposta server riuscita
        // valorizza SEMPRE ogni chiave (anche a null per un utente nuovo, vedi
        // app/api/user-settings/route.ts's GET). Trattare quel fallimento come "onboarding non
        // fatto" mostrava il wizard/passo regalo a ogni errore di rete transitorio — tipicamente un
        // cold start della PWA, dove questo primo fetch può correre prima che la sessione Supabase
        // sia del tutto pronta lato server — bug reale osservato in produzione: il wizard tornava a
        // ripresentarsi a ogni apertura dell'app anche per un utente che l'aveva già completato.
        if (Object.keys(settings).length === 0) return
        if (!('onboardingCompletedAt' in settings && settings.onboardingCompletedAt)) {
          setPhase('wizard')
        } else if (!('giftRouteOfferedAt' in settings && settings.giftRouteOfferedAt)) {
          setPhase('gift')
        } else if (!hasSeenDtrekAppBoundaryInfo()) {
          setPhase('boundary')
        } else {
          setPhase('hidden')
        }
      } catch {}
    }

    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => checkFor(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => checkFor(session?.user ?? null)
    )
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  if (phase === 'wizard') return <OnboardingWizard onDone={() => setPhase('gift')} />
  if (phase === 'gift')   return <GiftRouteStep onDone={() => setPhase(hasSeenDtrekAppBoundaryInfo() ? 'hidden' : 'boundary')} />
  if (phase === 'boundary') return <AppBoundaryInfoStep variant="dtrek" onDone={() => { markDtrekAppBoundaryInfoSeen(); setPhase('hidden') }} />
  return null
}
