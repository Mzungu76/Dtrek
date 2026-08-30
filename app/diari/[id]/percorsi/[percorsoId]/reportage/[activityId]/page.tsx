'use client'
// Pagina di riepilogo del Reportage — Fase 3 di docs/diario-a-libro-piano.md, poi ristrutturazione
// Diario/Mete (richiesta esplicita dell'utente, punto 5): "come per le Mete, ripristina l'uso
// dell'AI per generare i contenuti del Reportage — un editor testuale assistito o una generazione
// automatica con domande all'utente". Prima di questo l'editor manuale (ManualEditor.tsx) e il
// racconto guidato a domande (QuestionnaireWizard.tsx, app/resoconto/[id]/racconta) esistevano già
// ma erano raggiungibili solo dalla vista estesa standalone (/resoconto/[id], ReportReader.tsx),
// non da qui: questa pagina li ricollega direttamente nel pannello "a libro", stesso principio di
// scelta (genera rapido / scrivi tu / racconta a domande) di ReportReader, non una loro riscrittura.
import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ArrowLeft, BookOpen, Loader2, MessageCircleQuestion, Pencil } from 'lucide-react'
import { useReportageBookData } from './useReportageBookData'
import ReportGenerationPanel from '@/components/libro/ReportGenerationPanel'
import NextStepBanner from '@/components/resoconto/NextStepBanner'
import { formatDuration } from '@/lib/tcxParser'
import ManualEditor from '@/app/components/ManualEditor'
import { getReport, saveReportContent } from '@/lib/sync/hikeReportStore'
import { SCAFFOLD_SECTIONS, markdownToSections, sectionsToMarkdown, type ReportSection, type ReportAuthoredBy } from '@/lib/reportStore'

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

  // Struttura a sezioni dell'editor manuale (hike_reports.sections) — non fa parte di
  // useReportageBookData (che espone solo `content`, il markdown già appiattito): stesso fetch
  // separato che fa ReportReader.tsx, qui duplicato deliberatamente invece di allargare l'hook a
  // un caso d'uso (l'editor) che riguarda solo questa pagina.
  const [reportSections, setReportSections] = useState<ReportSection[]>([])
  const [reportAuthoredBy, setReportAuthoredBy] = useState<ReportAuthoredBy>('ai')
  const [editorMode, setEditorMode] = useState<'view' | 'manual'>('view')

  useEffect(() => {
    getReport(activityId).then(rep => {
      if (rep?.sections?.length) setReportSections(rep.sections)
      if (rep?.authored_by) setReportAuthoredBy(rep.authored_by)
    }).catch(() => {})
  }, [activityId])

  async function saveSections(sections: ReportSection[], authoredBy: ReportAuthoredBy) {
    const newContent = sectionsToMarkdown(sections)
    await saveReportContent(activityId, newContent, sections, authoredBy)
    setReportSections(sections)
    setReportAuthoredBy(authoredBy)
    setOverrideContent(newContent)
  }

  function startManualEditor() {
    if (reportSections.length === 0) {
      setReportSections(hasContent ? markdownToSections(content) : SCAFFOLD_SECTIONS)
      if (!hasContent) setReportAuthoredBy('manual')
      else if (reportAuthoredBy === 'ai') setReportAuthoredBy('mixed')
    }
    setEditorMode('manual')
  }

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
        <Link href={`${percorsoPath}/guida/prima_di_partire`} className="text-[13px] text-[#C0603D] font-medium hover:text-[#a84e30] inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Torna alla Guida
        </Link>
      </div>

      {editorMode === 'manual' ? (
        <ManualEditor
          activityId={activityId}
          activity={activity}
          photos={bd.photos}
          onPhotosChange={bd.onPhotosChange}
          initialSections={reportSections.length > 0 ? reportSections : SCAFFOLD_SECTIONS}
          initialAuthoredBy={reportAuthoredBy}
          onSave={saveSections}
          onCancel={() => setEditorMode('view')}
        />
      ) : (
        <>
          <div className="rounded-3xl text-white px-6 py-8 mb-6" style={{ background: 'linear-gradient(to bottom right, #4A5A3F, #2E3A26)' }}>
            <p className="uppercase text-[11px] tracking-[0.2em] text-[#E9DAC3] font-bold mb-2">Reportage</p>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C0603D] text-white text-sm font-semibold hover:bg-[#a84e30] transition-colors"
            >
              <BookOpen className="w-4 h-4" /> Apri il Reportage
            </Link>
            <Link href={`/resoconto/${encodeURIComponent(activityId)}`} className="text-[13px] text-stone-500 underline underline-offset-2 hover:text-stone-700">
              Apri vista estesa (pubblica, PDF, editor)
            </Link>
          </div>

          {/* Tre modi per riempire il Reportage di contenuti — stessa scelta di ReportReader.tsx
              (Scrivi tu / Genera con AI / Racconta il tuo percorso a domande), qui riportata nel
              pannello "a libro" invece che solo nella vista estesa standalone. */}
          <div className="mb-6">
            <ReportGenerationPanel
              activityId={activityId}
              activityTitle={activity.title ?? 'Escursione'}
              hasContent={hasContent}
              photos={bd.photos}
              onGenerated={setOverrideContent}
            />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={startManualEditor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-stone-200 bg-white text-stone-600 text-[13px] font-semibold hover:border-stone-300 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> {hasContent ? 'Modifica il resoconto' : 'Scrivi tu il resoconto'}
              </button>
              {!hasContent && (
                <Link
                  href={`/resoconto/${encodeURIComponent(activityId)}/racconta`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-stone-200 bg-white text-stone-600 text-[13px] font-semibold hover:border-stone-300 transition-colors"
                >
                  <MessageCircleQuestion className="w-3.5 h-3.5" /> Racconta il percorso a domande
                </Link>
              )}
            </div>
          </div>

          <NextStepBanner />
        </>
      )}
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
