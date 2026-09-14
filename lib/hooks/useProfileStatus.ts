'use client'
import { useEffect, useState } from 'react'

// Letto da ogni pannello di pubblicazione (Diario/Reportage/Raccolta) per sapere se il pulsante
// "Pubblica" va abilitato: con un solo link possibile (/u/[slug]), pubblicare un contenuto senza un
// sito attivo non porterebbe da nessuna parte — vedi lib/requireActiveProfile.ts per il gate
// gemello lato server.
export function useProfileStatus(): { enabled: boolean } | null {
  const [status, setStatus] = useState<{ enabled: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/user-settings/profile')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { if (!cancelled) setStatus({ enabled: !!(d.slug && d.enabled) }) })
      .catch(() => { if (!cancelled) setStatus({ enabled: false }) })
    return () => { cancelled = true }
  }, [])
  return status
}
