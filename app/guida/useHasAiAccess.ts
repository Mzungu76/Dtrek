'use client'
import { useEffect, useState } from 'react'
import { fetchOnce } from '@/lib/sessionCache'

// Whether this account has AI access (own Claude key or premium) — fetched once per session
// (fetchOnce, lib/sessionCache.ts) rather than on every GuidaHub mount, since it's account-level
// and can't change from one hike-open to the next within the same session.
export function useHasAiAccess(): boolean | null {
  const [hasAiAccess, setHasAiAccess] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOnce('ai-access', () => fetch('/api/guide').then(r => r.json()).then(d => !!d.hasAccess))
      .then(v => { if (!cancelled) setHasAiAccess(v) })
      .catch(() => { if (!cancelled) setHasAiAccess(false) })
    return () => { cancelled = true }
  }, [])

  return hasAiAccess
}
