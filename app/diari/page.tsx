'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import type { DiarySummary } from '@/app/api/diaries/route'
import { BookMarked, Loader2, Lock, LockOpen } from 'lucide-react'

/**
 * "I miei Diari" — Fase 1 di docs/diario-fulcro-piano.md (sola lettura). Home del Diario: ogni
 * Diario è una raccolta di Percorsi, pubblicabile solo se almeno uno di essi ha almeno un
 * Reportage (vedi app/api/diaries/route.ts). "Il mio Diario" (di default) è sempre il primo e
 * non elencato/eliminabile da qui — quella gestione arriva in una fase successiva.
 */
export default function DiariPage() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Diario</p>
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            I miei Diari
          </h1>
        </div>
      </div>

      <main className="max-w-[900px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare i tuoi Diari: {error}
          </p>
        )}

        {diaries === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {diaries?.map(d => (
              <Link
                key={d.id}
                href={`/diari/${encodeURIComponent(d.id)}`}
                className={`flex items-center gap-4 bg-white rounded-2xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow border ${d.isDefault ? 'border-forest-300' : 'border-stone-200'}`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${d.coverUrl ? '' : 'bg-forest-50'}`}>
                  {d.coverUrl
                    ? <img src={d.coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    : <BookMarked className="w-6 h-6 text-forest-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  {d.isDefault && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full mb-1">
                      Diario di default
                    </span>
                  )}
                  <p className="font-display text-[16px] font-bold text-stone-800 truncate">{d.title}</p>
                  <div className="flex items-center gap-2 text-[13px] text-stone-500 mt-0.5">
                    <span>{d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}</span>
                    <span className="text-stone-300">·</span>
                    {d.pubblicabile ? (
                      <span className="inline-flex items-center gap-1 text-forest-700 font-medium">
                        <LockOpen className="w-3 h-3" /> Pubblicabile
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone-400">
                        <Lock className="w-3 h-3" /> Non ancora pubblicabile
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
