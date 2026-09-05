'use client'
// Le due preferenze di privacy della pubblicazione (docs/raccolte-pubblicazione-piano.md, Fase
// 3f) — globali per l'utente, quindi un componente a sé usato dentro sia la schermata di
// pubblicazione del Diario sia quella della Raccolta, invece di duplicare fetch/stato in entrambe.
//
// `hideHomeStarts` è true di default e RETROATTIVO (si applica anche ai link già pubblicati, letto
// live a ogni apertura della pagina pubblica — vedi lib/sharePublicDiary.ts): qui l'utente può
// spegnerlo, non deve fare nulla per averlo attivo.
import { useEffect, useState } from 'react'

interface Prefs {
  hideHomeStarts: boolean
  hideExactDates: boolean
}

export function PublishPrivacyToggles({ className = '' }: { className?: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState<keyof Prefs | null>(null)

  useEffect(() => {
    fetch('/api/user-settings/privacy')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(setPrefs)
      .catch(() => { /* i toggle restano nascosti finché non si carica un valore vero */ })
  }, [])

  async function toggle(field: keyof Prefs) {
    if (!prefs) return
    const next = !prefs[field]
    setPrefs({ ...prefs, [field]: next }) // ottimistico
    setSaving(field)
    try {
      const res = await fetch('/api/user-settings/privacy', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setPrefs(p => p ? { ...p, [field]: !next } : p) // il server non ha una verità diversa, solo il rollback
    } finally {
      setSaving(null)
    }
  }

  if (!prefs) return null

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="flex items-center gap-2 py-0.5 text-xs text-stone-600 cursor-pointer">
        <input
          type="checkbox" checked={prefs.hideHomeStarts} disabled={saving === 'hideHomeStarts'}
          onChange={() => toggle('hideHomeStarts')}
        />
        Nascondi le partenze da casa
      </label>
      <label className="flex items-center gap-2 py-0.5 text-xs text-stone-600 cursor-pointer">
        <input
          type="checkbox" checked={prefs.hideExactDates} disabled={saving === 'hideExactDates'}
          onChange={() => toggle('hideExactDates')}
        />
        Mostra solo mese e anno, non il giorno esatto
      </label>
    </div>
  )
}
