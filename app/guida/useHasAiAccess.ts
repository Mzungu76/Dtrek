'use client'
import { useEffect, useState } from 'react'
import { fetchOnce } from '@/lib/sessionCache'

interface AiAccessState {
  hasAiAccess: boolean | null
  /** true quando /api/guide non è riuscito a verificare la chiave (es. Supabase irraggiungibile)
   *  — va distinto da "hasAiAccess: false", che invece significa che l'account non ha una chiave
   *  salvata: i due stati richiedono un messaggio diverso a schermo (vedi GuideReader.tsx). */
  aiUnavailable: boolean
}

// Whether this account has AI access (own Claude key or premium) — fetched once per session
// (fetchOnce, lib/sessionCache.ts) rather than on every GuidaHub mount, since it's account-level
// and can't change from one hike-open to the next within the same session.
export function useHasAiAccess(): AiAccessState {
  const [state, setState] = useState<AiAccessState>({ hasAiAccess: null, aiUnavailable: false })

  useEffect(() => {
    let cancelled = false
    // AbortSignal.timeout: senza un tetto massimo, una richiesta rimasta appesa lascerebbe questo
    // stato bloccato su null per sempre — niente "aggiungi la chiave", niente "riprova più tardi",
    // solo silenzio (guida mai generata, Chiedi a Giulia/fonti mai comparse, nessun avviso).
    fetchOnce('ai-access', () => fetch('/api/guide', { signal: AbortSignal.timeout(10000) }).then(r => r.json().then(d => ({
      hasAiAccess: !!d.hasAccess, aiUnavailable: !!d.unavailable || (!r.ok && r.status !== 401),
    }))))
      .then(v => { if (!cancelled) setState(v) })
      .catch(() => { if (!cancelled) setState({ hasAiAccess: false, aiUnavailable: true }) })
    return () => { cancelled = true }
  }, [])

  return state
}
