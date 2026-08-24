'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import type { DiarioDetail } from '@/app/api/diaries/[id]/route'
import { ArrowLeft, CheckCircle2, Loader2, Lock, LockOpen, Mountain, Route, Share2 } from 'lucide-react'

/**
 * "Dentro un Diario" — Fase 1-2 di docs/diario-fulcro-piano.md (sola lettura) + Fase 3 (composer).
 * Elenco dei Percorsi di questo Diario, con stato (in programma / N Reportage) e idoneità alla
 * pubblicazione. Ogni riga rimanda a /diari/[id]/percorsi/[percorsoId] (Fase 2): la Guida
 * oggettiva (GuidaHub, invariata) più l'elenco dei Reportage collegati.
 *
 * Il composer a due corsie ("Già fatta" / "Da pianificare") non riscrive gli import esistenti —
 * porta dentro /upload (già ActivityUploader/GpxUploader/ManualImportChoice/FromActivityUploader,
 * invariati) con `diaryId` in query, così il Percorso creato entra in questo Diario invece che in
 * quello di default. Vedi app/upload/page.tsx.
 */
function Composer({ diaryId }: { diaryId: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <Link
        href={`/upload?tab=activity&diaryId=${encodeURIComponent(diaryId)}`}
        className="flex items-center gap-3 bg-white rounded-2xl px-4 py-4 border border-forest-200 hover:border-forest-400 hover:shadow-sm transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-stone-800">Già fatta</p>
          <p className="text-[12px] text-stone-500">Importa un&apos;escursione conclusa — GPS, orologio o traccia libera</p>
        </div>
      </Link>
      <Link
        href={`/upload?tab=gpx&diaryId=${encodeURIComponent(diaryId)}`}
        className="flex items-center gap-3 bg-white rounded-2xl px-4 py-4 border border-sky-200 hover:border-sky-400 hover:shadow-sm transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <Route className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-stone-800">Da pianificare</p>
          <p className="text-[12px] text-stone-500">Trova o costruisci un percorso, importa un file o un link</p>
        </div>
      </Link>
    </div>
  )
}

export default function DiarioDetailPage() {
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<DiarioDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/diaries/${encodeURIComponent(params.id)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDetail)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [params.id])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href="/diari" className="inline-flex items-center gap-1.5 text-forest-300 text-[13px] font-semibold mb-1.5 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> I miei Diari
            </Link>
            <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
              {detail?.title ?? ' '}
            </h1>
            {detail && (
              <p className="text-forest-200 text-[13px] mt-1">
                {detail.percorsi.length} {detail.percorsi.length === 1 ? 'percorso' : 'percorsi'}
              </p>
            )}
          </div>
          {detail && (
            <Link
              href={`/diari/${encodeURIComponent(params.id)}/pubblica`}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[12px] font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Pubblica
            </Link>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare questo Diario: {error}
          </p>
        )}

        {detail === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : detail && detail.percorsi.length === 0 ? (
          <>
            <Composer diaryId={params.id} />
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
                <Mountain className="w-10 h-10 text-forest-400" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessun percorso ancora</h2>
              <p className="text-stone-400 text-sm max-w-sm px-4">
                I percorsi che pianifichi o le uscite che importi in questo Diario compariranno qui.
              </p>
            </div>
          </>
        ) : detail && (
          <>
          <Composer diaryId={params.id} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {detail.percorsi.map(p => (
              <Link
                key={p.id}
                href={`/diari/${encodeURIComponent(params.id)}/percorsi/${encodeURIComponent(p.id)}`}
                className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-stone-200"
              >
                <div className="relative h-[140px] bg-gradient-to-b from-forest-50 to-stone-50">
                  {p.routePolyline && p.routePolyline.length > 1 ? (
                    <div className="absolute inset-3">
                      <RouteThumb polyline={p.routePolyline} color="#2d7a3d" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mountain className="w-10 h-10 text-forest-200" />
                    </div>
                  )}
                  <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${p.reportageCount > 0 ? 'bg-forest-600 text-white' : 'bg-white/92 text-stone-500'}`}>
                    {p.reportageCount === 0 ? 'In programma' : `${p.reportageCount} ${p.reportageCount === 1 ? 'uscita' : 'uscite'}`}
                  </span>
                </div>
                <div className="px-[18px] pt-4 pb-[18px]">
                  <p className="text-[16px] font-bold text-stone-800 mb-2 truncate">{p.title}</p>
                  <div className="flex items-center gap-3 text-[13px] text-stone-500 flex-wrap">
                    <span>{(p.distanceMeters / 1000).toFixed(1)} km</span>
                    <span>{Math.round(p.elevationGain)} m D+</span>
                    {p.pubblicabile ? (
                      <span className="inline-flex items-center gap-1 text-forest-700 font-medium">
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
          </>
        )}
      </main>
    </div>
  )
}
