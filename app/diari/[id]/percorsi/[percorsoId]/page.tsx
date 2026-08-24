'use client'
import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import GuidaHub from '@/app/guida/GuidaHub'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'
import type { ReportageRow } from '@/app/api/percorsi/[id]/reportage/route'
import { ArrowLeft, ChevronRight, Loader2, PenLine } from 'lucide-react'

/**
 * "Percorso aperto" — Fase 2 di docs/diario-fulcro-piano.md. La Guida oggettiva (narrativa,
 * punteggio, mappa, POI, natura, personalizzazione) è GuidaHub invariato — stesso motore di
 * /guida/[id], nessuna riscrittura: è già la pagina che il piano descrive come "zona Guida".
 * Sotto, la sezione Reportage elenca le uscite collegate a questo Percorso: 0 (in programma),
 * 1 o più (un Percorso è un sentiero ripetibile). Ogni riga rimanda per ora a /resoconto/[id],
 * la pagina esistente — già "il Reportage" per contenuto (narrativa personale, foto, video),
 * non serve ricostruirla da zero.
 */
function ReportageSection({ diarioId, percorsoId }: { diarioId: string; percorsoId: string }) {
  const [rows, setRows] = useState<ReportageRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/percorsi/${encodeURIComponent(percorsoId)}/reportage`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [percorsoId])

  return (
    <div className="max-w-[900px] mx-auto px-4 pb-12">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold text-stone-800">
          {rows ? `Le tue uscite (${rows.length})` : 'Le tue uscite'}
        </h2>
        <Link href={`/diari/${encodeURIComponent(diarioId)}`} className="text-[13px] text-forest-600 font-medium hover:text-forest-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Torna al Diario
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Impossibile caricare le uscite: {error}
        </p>
      )}

      {rows === null && !error ? (
        <div className="flex items-center gap-3 text-stone-400 py-6">
          <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento…</span>
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="bg-stone-100 rounded-2xl px-5 py-6 text-center text-stone-500 text-sm">
          Nessuna uscita ancora. Quando cammini questo percorso, il Reportage comparirà qui — e il
          Percorso diventerà pubblicabile.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows?.map(r => (
            <Link
              key={r.id}
              href={`/resoconto/${encodeURIComponent(r.id)}`}
              className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-stone-200 hover:border-forest-300 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
                <PenLine className="w-4 h-4 text-forest-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-stone-800 truncate">
                  {format(new Date(r.startTime), 'd MMMM yyyy', { locale: it })}
                </p>
                <p className="text-[12px] text-stone-500">
                  {(r.distanceMeters / 1000).toFixed(1)} km
                  {!r.hasWrittenReport && <span className="text-amber-600 font-medium"> · Da raccontare</span>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function PercorsoPageInner() {
  const params = useParams<{ id: string; percorsoId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  return (
    <>
      <TrialStatusBanner />
      <GuidaHub id={percorsoId} />
      <ReportageSection diarioId={diarioId} percorsoId={percorsoId} />
    </>
  )
}

export default function PercorsoPage() {
  return (
    <Suspense>
      <PercorsoPageInner />
    </Suspense>
  )
}
