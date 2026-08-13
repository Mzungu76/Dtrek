'use client'
import { useEffect, useState } from 'react'
import { fetchOnce } from '@/lib/sessionCache'

export interface EntitlementState {
  unlocked: boolean | null // null = ancora in caricamento, o utente anonimo (401) — nessun indicatore
  trialActive: boolean
  trialExpired: boolean
  trialDaysLeft: number
}

const INITIAL_STATE: EntitlementState = { unlocked: null, trialActive: false, trialExpired: false, trialDaysLeft: 0 }

/**
 * Stato Premium/prova dell'utente corrente (docs/navigator-dtrek-boundary.md) — condiviso tra
 * l'indicatore sull'avatar in Navbar e i pannelli d'acquisto, così tutti leggono /api/dtrek-
 * entitlement una sola volta per sessione browser (fetchOnce) invece di duplicare la chiamata.
 */
export function useEntitlement(): EntitlementState {
  const [state, setState] = useState<EntitlementState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false
    fetchOnce('dtrek-entitlement', () =>
      fetch('/api/dtrek-entitlement').then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      }),
    )
      .then(d => { if (!cancelled) setState({ unlocked: !!d.unlocked, trialActive: !!d.trialActive, trialExpired: !!d.trialExpired, trialDaysLeft: d.trialDaysLeft ?? 0 }) })
      .catch(() => { /* anonimo o rete assente — resta null, nessun indicatore */ })
    return () => { cancelled = true }
  }, [])

  return state
}
