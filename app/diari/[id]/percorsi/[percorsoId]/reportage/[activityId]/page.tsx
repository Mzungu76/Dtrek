'use client'
// Pagina di riepilogo del Reportage — Fase 3 di docs/diario-a-libro-piano.md. Non esisteva prima:
// oggi un Reportage nel Diario rimanda direttamente a /resoconto/[id] (vista estesa standalone). Qui
// vive il chrome che nel lettore continuo (ReportReader.tsx) compare una sola volta per lettura,
// non per sezione: pannello di generazione/rigenerazione, CTA verso il libro e
// NextStepBanner. Pubblica/scarica PDF ed editor manuale restano — per ora — raggiungibili solo
// da "Apri vista estesa": ricollocarli qui è lavoro a sé, rimandato oltre questa fase.
import { Suspense, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react'
import { useReportageBookData } from './useReportageBookData'
import ReportGenerationPanel from '@/components/libro/ReportGenerationPanel'
import NextStepBanner from '@/components/resoconto/NextStepBanner'
import { formatDuration } from '@/lib/tcxParser'

function ReportageSummaryInner() {
  const params = useParams<{ id: string; percorsoId: string; activityId: string }>()
  const diarioId = decodeURIComponent(params.id)
  const percorsoId = decodeURIComponent(params.percorsoId)
  const activityId = decodeURIComponent(params.activityId)
  const percorsoPath = `/diari/${encodeURIComponent(diarioId)}/percorsi/${encodeURIComponent(percorsoId)}`
  const basePath = `${percorsoPath}/reportage/${encodeURIComponent(activityId)}`

  const bd = useReportageBookData(activityId)
  const [overrideContent, setOverrideContent] = useState<string | null>(null)
  const content = overrideContent ?? bd.content
  const hasContent = !!content.trim()

  if (bd.loading) {
    return (
      <div className="flex items-center justify-center py-24 text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }
  if (bd.notFound || !bd.activity) {
    return <div className="max-w-[900px] mx-auto px-4 py-16 text-center text-stone-500 text-sm">Reportage non trovato.</div>
  }

  const activity = bd.activity

  return (
    <div className="max-w-[900px] mx-auto px-4 pt-6 pb-12">
      <div className="flex items-center justify-between mb-3">
        {/* Non più `percorsoPath` (bare) — quella pagina di riepilogo non esiste più (Fase 15),
            eliminata su richiesta dell'utente: l'elenco Reportage e gli altri strumenti del
            Percorso vivono ora nel drawer "Strumenti" raggiungibile da ogni pagina di Guida. */}
        <Link href={`${percorsoPath}/guida/il_percorso`} className="text-[13px] text-forest-600 font-medium hover:text-forest-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Torna alla Guida
        </Link>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-forest-800 to-forest-900 text-white px-6 py-8 mb-6">
        <p className="uppercase text-[11px] tracking-[0.2em] text-terra-300 font-bold mb-2">Reportage</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-4">{activity.title ?? 'Escursione'}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
          <span>{format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })}</span>
          <span>{(activity.distanceMeters / 1000).toFixed(1)} km</span>
          <span>{Math.round(activity.elevationGain)} m dislivello</span>
          <span>{formatDuration(activity.totalTimeSeconds)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Link
          href={`${basePath}/sezione/1`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-forest-700 text-white text-sm font-semibold hover:bg-forest-800 transition-colors"
        >
          <BookOpen className="w-4 h-4" /> Apri il Reportage
        </Link>
        <Link href={`/resoconto/${encodeURIComponent(activityId)}`} className="text-[13px] text-stone-500 underline underline-offset-2 hover:text-stone-700">
          Apri vista estesa (pubblica, PDF, editor)
        </Link>
      </div>

      <div className="mb-6">
        <ReportGenerationPanel
          activityId={activityId}
          activityTitle={activity.title ?? 'Escursione'}
          hasContent={hasContent}
          photos={bd.photos}
          onGenerated={setOverrideContent}
        />
      </div>

      <NextStepBanner />
    </div>
  )
}

export default function ReportageSummaryPage() {
  return (
    <Suspense>
      <ReportageSummaryInner />
    </Suspense>
  )
}
