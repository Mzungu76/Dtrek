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
    fetchOnce('ai-access', () => fetch('/api/guide').then(r => r.json()).then(d => ({
      hasAiAccess: !!d.hasAccess, aiUnavailable: !!d.unavailable,
    })))
      .then(v => { if (!cancelled) setState(v) })
      .catch(() => { if (!cancelled) setState({ hasAiAccess: false, aiUnavailable: true }) })
    return () => { cancelled = true }
  }, [])

  return state
}
