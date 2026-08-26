'use client'
import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import GuidaHub from '@/app/guida/GuidaHub'
import TrialStatusBanner from '@/components/dtrek/TrialStatusBanner'
import GuideGenerationPanel from '@/components/libro/GuideGenerationPanel'
import { useGuidaBookData } from './useGuidaBookData'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { formatDuration } from '@/lib/tcxParser'
import type { ReportageRow } from '@/app/api/percorsi/[id]/reportage/route'
import { ArrowLeft, BookOpen, ChevronRight, Loader2, PenLine } from 'lucide-react'

/**
 * Pagina del Percorso — Fase 3/4 di docs/diario-a-libro-piano.md. Dietro il flag
 * `diarioLibroEnabled` (Fase 4, default spento, vedi components/profilo/SectionAvanzate.tsx):
 * la nuova pagina di riepilogo del libro (copertina, statistiche, CTA "Apri la Guida", link
 * "Apri in modalità classica", elenco Reportage) quando acceso, l'embed diretto di GuidaHub
 * (comportamento invariato) quando spento o non ancora risolto — mai uno stato intermedio
 * silenzioso: finché il flag non è noto si mostra solo uno spinner, non una delle due UI a caso.
 */
function ReportageSection({ diarioId, percorsoId, linkTo }: { diarioId: string; percorsoId: string; linkTo: (activityId: string) => string }) {
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
              href={linkTo(r.id)}
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

/** Comportamento invariato, pre-Fase 3 — stessa schermata scura immersiva di /guida/[id]. */
function PercorsoPageClassico({ diarioId, percorsoId }: { diarioId: string; percorsoId: string }) {
  return (
    <>
      <TrialStatusBanner />
      <GuidaHub id={percorsoId} />
      <ReportageSection diarioId={diarioId} percorsoId={percorsoId} linkTo={id => `/resoconto/${encodeURIComponent(id)}`} />
    </>
  )
}

/** Pagina di riepilogo del libro — vedi Fase 3 per il dettaglio. */
function PercorsoPageLibro({ diarioId, percorsoId, basePath }: { diarioId: string; percorsoId: string; basePath: string }) {
  const bd = useGuidaBookData(percorsoId)

  return (
    <>
      <TrialStatusBanner />
      {bd.loading ? (
        <div className="flex items-center justify-center py-24 text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : bd.notFound || !bd.hike ? (
        <div className="max-w-[900px] mx-auto px-4 py-16 text-center text-stone-500 text-sm">
          Percorso non trovato.
        </div>
      ) : (
        <>
          <div className="max-w-[900px] mx-auto px-4 pt-6 pb-2">
            <div className="rounded-3xl bg-gradient-to-br from-forest-800 to-forest-900 text-white px-6 py-8 mb-6">
              <p className="uppercase text-[11px] tracking-[0.2em] text-terra-300 font-bold mb-2">Percorso</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-4">{bd.hike.title}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
                <span>{(bd.hike.distanceMeters / 1000).toFixed(1)} km</span>
                <span>{Math.round(bd.hike.elevationGain)} m dislivello</span>
                {bd.hike.estimatedTimeSeconds != null && <span>{formatDuration(bd.hike.estimatedTimeSeconds)}</span>}
                {bd.hike.plannedDate && <span>{format(new Date(bd.hike.plannedDate), 'd MMMM yyyy', { locale: it })}</span>}
              </div>
            </div>

            {/* Non più il CTA principale — dall'indice del Diario si arriva già dritti in Guida
                (feedback dell'utente): questi restano solo due link secondari, per chi capita su
                questa pagina dal pallino "Reportage" di una pagina di Guida e vuole tornarci. */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-[13px]">
              <Link href={`${basePath}/guida/il_percorso`} className="inline-flex items-center gap-1.5 text-stone-500 underline underline-offset-2 hover:text-stone-700">
                <BookOpen className="w-3.5 h-3.5" /> Apri la Guida
              </Link>
              <Link href={`/guida/${encodeURIComponent(percorsoId)}`} className="text-stone-500 underline underline-offset-2 hover:text-stone-700">
                Apri in modalità classica
              </Link>
            </div>

            <GuideGenerationPanel
              hike={bd.hike}
              percorsoId={percorsoId}
              hasAiAccess={bd.hasAiAccess}
              aiUnavailable={bd.aiUnavailable}
              trialExpired={bd.trialExpired}
              onHikeUpdate={bd.onHikeUpdate}
            />
          </div>

          <div className="max-w-[900px] mx-auto px-4 pb-2" />
          <ReportageSection
            diarioId={diarioId}
            percorsoId={percorsoId}
            linkTo={id => `${basePath}/reportage/${encodeURIComponent(id)}`}
          />
        </>
      )}
    </>
  )
}

function PercorsoPageInner() {
  const params = useParams<{ id: string; percorsoId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const basePath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`

  const [libroEnabled, setLibroEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    getUserSettingsCached()
      .then(d => setLibroEnabled(d.diarioLibroEnabled === true))
      .catch(() => setLibroEnabled(false))
  }, [])

  if (libroEnabled === null) {
    return (
      <div className="flex items-center justify-center py-24 text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return libroEnabled
    ? <PercorsoPageLibro diarioId={diarioId} percorsoId={percorsoId} basePath={basePath} />
    : <PercorsoPageClassico diarioId={diarioId} percorsoId={percorsoId} />
}

export default function PercorsoPage() {
  return (
    <Suspense>
      <PercorsoPageInner />
    </Suspense>
  )
}
