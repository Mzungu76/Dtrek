'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { ArrowLeft, Loader2, Lock, LockOpen, Mountain, Search, X } from 'lucide-react'

/**
 * "Tutti i Percorsi" — Fase 5 di docs/diario-fulcro-piano.md. Vista trasversale di sola
 * consultazione su tutti i Diari dell'utente insieme, con l'etichetta del Diario di provenienza su
 * ogni card — per ritrovare un Percorso senza dover ricordare in quale Diario l'avevi messo.
 * Lavorarci (Guida, Reportage, pubblicazione) resta dentro il Diario che lo contiene: ogni card
 * rimanda a /diari/[diaryId]/percorsi/[id], la pagina già costruita in Fase 2.
 */
export default function TuttiIPercorsiPage() {
  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.title.toLowerCase().includes(q) || (r.diaryTitle ?? '').toLowerCase().includes(q))
  }, [rows, query])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_BOTTOMBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #4A5A3F, #2E3A26)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(46,58,38,.15), rgba(46,58,38,.85))' }} />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <Link href="/diari" className="inline-flex items-center gap-1.5 text-[#E9DAC3] text-[13px] font-semibold mb-1.5 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> I miei Diari
          </Link>
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            Tutti i Percorsi
          </h1>
          {rows && (
            <p className="text-white/75 text-[13px] mt-1">
              {rows.length} {rows.length === 1 ? 'percorso' : 'percorsi'}, in tutti i tuoi Diari
            </p>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare i percorsi: {error}
          </p>
        )}

        {rows === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-[#E9DAC3] border border-[#D9C9A8] flex items-center justify-center mb-6">
              <Mountain className="w-10 h-10 text-[#C0603D]" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessun percorso ancora</h2>
            <p className="text-stone-400 text-sm max-w-sm px-4">
              I percorsi che pianifichi o le uscite che importi in un Diario compariranno qui.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              {showSearch ? (
                <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 max-w-sm">
                  <Search className="w-4 h-4 text-stone-400 shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Cerca per titolo o Diario…"
                    className="flex-1 min-w-0 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  />
                  <button onClick={() => { setShowSearch(false); setQuery('') }} className="text-stone-400 hover:text-stone-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSearch(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-stone-200 hover:border-stone-300 text-sm text-stone-600 transition-colors"
                >
                  <Search className="w-4 h-4" /> Cerca
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="text-stone-400 text-sm text-center py-12">Nessun percorso corrisponde alla ricerca.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <Link
                    key={p.id}
                    href={p.diaryId ? `/diari/${encodeURIComponent(p.diaryId)}/percorsi/${encodeURIComponent(p.id)}` : '/diari'}
                    className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-stone-200"
                  >
                    <div className="relative h-[140px] bg-gradient-to-b from-[#EBE0C8] to-stone-50">
                      {p.routePolyline && p.routePolyline.length > 1 ? (
                        <div className="absolute inset-3">
                          <RouteThumb polyline={p.routePolyline} color="#2d7a3d" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mountain className="w-10 h-10 text-[#D9C9A8]" />
                        </div>
                      )}
                      <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${p.reportageCount > 0 ? 'bg-[#C0603D] text-white' : 'bg-white/92 text-stone-500'}`}>
                        {p.reportageCount === 0 ? 'In programma' : `${p.reportageCount} ${p.reportageCount === 1 ? 'uscita' : 'uscite'}`}
                      </span>
                    </div>
                    <div className="px-[18px] pt-4 pb-[18px]">
                      {p.diaryTitle && (
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#7C8F6E] mb-1 truncate">{p.diaryTitle}</p>
                      )}
                      <p className="text-[16px] font-bold text-stone-800 mb-2 truncate">{p.title}</p>
                      <div className="flex items-center gap-3 text-[13px] text-stone-500 flex-wrap">
                        <span>{(p.distanceMeters / 1000).toFixed(1)} km</span>
                        <span>{Math.round(p.elevationGain)} m D+</span>
                        {p.pubblicabile ? (
                          <span className="inline-flex items-center gap-1 text-[#7C8F6E] font-medium">
                            <LockOpen className="w-3 h-3" /> Pubblicabile
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-stone-400">
                            <Lock className="w-3 h-3" /> Non pubblicabile
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
