'use client'
// Home dell'app — Fase 11 di docs/diario-a-libro-piano.md. Richiesta esplicita dell'utente:
// aprire direttamente sul Sommario dell'ultimo Diario visualizzato, invece che sullo scaffale
// "I miei Diari" (comunque sempre raggiungibile: tab Diario della barra globale, o dal logo su
// desktop). Redesign menù globale (fase 1) — questo comportamento era dietro il flag beta
// `diarioLibroEnabled` (default spento, redirect diretto allo scaffale); flag rimosso, ora è
// l'unico comportamento.
//
// Non più un redirect lato server: la scelta dipende da user_settings (lastDiaryId), letto con lo
// stesso pattern client-first già usato da ogni altra pagina di questo piano
// (getUserSettingsCached) — nessuna lettura server-side esiste altrove nel progetto per questi dati.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import type { DiarySummary } from '@/app/api/diaries/route'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      const settings = await getUserSettingsCached()

      try {
        const res = await fetch('/api/diaries')
        const diaries: DiarySummary[] = res.ok ? await res.json() : []
        if (cancelled) return
        // Il Diario ricordato potrebbe non esistere più (eliminato) — verificato contro l'elenco
        // vero invece di fidarsi ciecamente del valore salvato, altrimenti l'home aprirebbe su un
        // Sommario 404. Il Diario di default è la ricaduta naturale (esiste sempre per ogni utente).
        const target = diaries.find(d => d.id === settings.lastDiaryId) ?? diaries.find(d => d.isDefault) ?? diaries[0]
        router.replace(target ? `/diari/${encodeURIComponent(target.id)}` : '/diari')
      } catch {
        if (!cancelled) router.replace('/diari')
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center text-stone-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )
}
