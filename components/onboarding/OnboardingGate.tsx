'use client'
import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import OnboardingWizard from './OnboardingWizard'
import GiftRouteStep from './GiftRouteStep'
import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js'

type Phase = 'hidden' | 'wizard' | 'gift'

/**
 * Monta, in sequenza, il wizard di onboarding (OnboardingWizard.tsx) e poi il passo del percorso
 * omaggio (GiftRouteStep.tsx) — per gli utenti autenticati che non li hanno ancora completati né
 * saltati. I due passi usano flag INDIPENDENTI (onboarding_completed_at, gift_route_offered_at):
 * il wizard imposta il proprio flag prima ancora di offrire il regalo, quindi se il browser si
 * chiudesse a metà tra i due passi, un flag unico avrebbe perso per sempre l'occasione di offrirlo.
 * Montato a livello di app/layout.tsx, stesso posto di OfflineBanner/InstallPWA.
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
        if (!('onboardingCompletedAt' in settings && settings.onboardingCompletedAt)) {
          setPhase('wizard')
        } else if (!('giftRouteOfferedAt' in settings && settings.giftRouteOfferedAt)) {
          setPhase('gift')
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
  if (phase === 'gift')   return <GiftRouteStep onDone={() => setPhase('hidden')} />
  return null
}
