'use client'
import { useEffect, useState } from 'react'
import { fetchOnce, invalidate } from '@/lib/sessionCache'

const ENTITLEMENT_CACHE_KEY = 'dtrek-entitlement'

export interface EntitlementState {
  unlocked: boolean | null // null = ancora in caricamento, o utente anonimo (401) — nessun indicatore
  trialActive: boolean
  trialExpired: boolean
  trialDaysLeft: number
  /** null finché ancora in caricamento — vedi DtrekEntitlement.dtrekActivated
   *  (lib/dtrekEntitlement.ts) per cosa significa. */
  dtrekActivated: boolean | null
}

const INITIAL_STATE: EntitlementState = { unlocked: null, trialActive: false, trialExpired: false, trialDaysLeft: 0, dtrekActivated: null }

function fetchEntitlement() {
  return fetchOnce(ENTITLEMENT_CACHE_KEY, () =>
    fetch('/api/dtrek-entitlement').then(r => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    }),
  )
}

/** Same session-cached fetch as useEntitlement(), for plain async callers outside a React render
 *  (lib/navigatorSlot.ts) that just need the current dtrekActivated flag once, not the reactive
 *  hook. Shares the cache key, so it never costs a second network round trip when a component on
 *  the same page also calls useEntitlement(). Defaults to false (not yet activated) on any
 *  failure — same "fail closed" choice as the rest of the Navigator/Dtrek boundary: an unreachable
 *  backend must not accidentally widen Navigator into showing Dtrek content. */
export async function isDtrekActivated(): Promise<boolean> {
  try {
    const d = await fetchEntitlement()
    return !!(d as { dtrekActivated?: boolean }).dtrekActivated
  } catch {
    return false
  }
}

/**
 * Stato Premium/prova dell'utente corrente (docs/navigator-dtrek-boundary.md) — condiviso tra
 * l'indicatore sull'avatar in Navbar e i pannelli d'acquisto, così tutti leggono /api/dtrek-
 * entitlement una sola volta per sessione browser (fetchOnce) invece di duplicare la chiamata.
 */
export function useEntitlement(): EntitlementState {
  const [state, setState] = useState<EntitlementState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false
    fetchEntitlement()
      .then(d => { if (!cancelled) setState({ unlocked: !!d.unlocked, trialActive: !!d.trialActive, trialExpired: !!d.trialExpired, trialDaysLeft: d.trialDaysLeft ?? 0, dtrekActivated: !!d.dtrekActivated }) })
      .catch(() => { /* anonimo o rete assente — resta null, nessun indicatore */ })
    return () => { cancelled = true }
  }, [])

  return state
}

/**
 * "Passa a Dtrek" (components/navigation/NavigatorMenu.tsx) — unica chiamante di
 * POST /api/dtrek-entitlement/activate. Invalida la cache di sessione prima di restituire il
 * risultato, così ogni useEntitlement() montato dopo (incluso nella stessa WebView di Navigator,
 * una volta che inizia a navigare anche nelle pagine Dtrek) rilegge lo stato vero invece del
 * valore "non ancora attivato" ancora in cache da prima del tap.
 */
export async function activateDtrek(): Promise<boolean> {
  const res = await fetch('/api/dtrek-entitlement/activate', { method: 'POST' })
  invalidate(ENTITLEMENT_CACHE_KEY)
  return res.ok
}

export type GemTone = 'unlocked' | 'trial' | 'expired'

/** Stessa mappatura stato→colore usata dal gioiello sull'avatar (components/premium/GemIcon.tsx)
 *  e ovunque compaia lo stesso segnale — un'unica funzione perché il significato dei tre colori
 *  (verde=sbloccato, ambra=prova, rosso=scaduta) deve restare identico in ogni punto dell'app. */
export function entitlementGemTone(e: EntitlementState): GemTone | null {
  if (e.unlocked) return 'unlocked'
  if (e.trialExpired) return 'expired'
  if (e.trialActive) return 'trial'
  return null
}

export function entitlementLabel(e: EntitlementState): string | null {
  if (e.unlocked) return 'Dtrek sbloccato'
  if (e.trialExpired) return 'Prova gratuita terminata'
  if (e.trialActive) return `Prova gratuita — ${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? 'giorno' : 'giorni'} rimasti`
  return null
}
