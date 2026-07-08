'use client'
import { useEffect, useState } from 'react'

// Whether this account has AI access (own Claude key or premium) — fetched once so the guide
// can decide between auto-generating the Breve guide or showing the "configura accesso AI" state.
export function useHasAiAccess(): boolean | null {
  const [hasAiAccess, setHasAiAccess] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/guide').then(r => r.json()).then(d => setHasAiAccess(!!d.hasAccess)).catch(() => setHasAiAccess(false))
  }, [])

  return hasAiAccess
}
