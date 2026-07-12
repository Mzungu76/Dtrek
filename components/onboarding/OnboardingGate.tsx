'use client'
import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import OnboardingWizard from './OnboardingWizard'
import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js'

/**
 * Monta il wizard di onboarding (components/onboarding/OnboardingWizard.tsx) una sola volta, per
 * gli utenti autenticati che non l'hanno ancora completato né saltato (user_settings.
 * onboarding_completed_at NULL — impostato sia da "Fine" sia da "Salta", vedi il wizard). Montato
 * a livello di app/layout.tsx, stesso posto di OfflineBanner/InstallPWA.
 */
export default function OnboardingGate() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const supabase = getBrowserSupabase()
    let cancelled = false

    async function checkFor(user: SupabaseUser | null) {
      if (!user) { if (!cancelled) setShow(false); return }
      try {
        const settings = await getUserSettingsCached()
        if (!cancelled && !('onboardingCompletedAt' in settings && settings.onboardingCompletedAt)) {
          setShow(true)
        }
      } catch {}
    }

    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => checkFor(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => checkFor(session?.user ?? null)
    )
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  if (!show) return null
  return <OnboardingWizard onDone={() => setShow(false)} />
}
