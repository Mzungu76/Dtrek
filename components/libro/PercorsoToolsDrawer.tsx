'use client'
// Drawer degli strumenti del Percorso — Fase 15 di docs/diario-a-libro-piano.md. Sostituisce il
// pallino "Reportage" (che portava alla pagina di riepilogo, eliminata su richiesta dell'utente):
// tutto ciò che prima viveva su quella pagina o nella console "strumenti" di GuidaHub.tsx, ma mai
// raggiungibile dal libro, ora sta qui — un solo posto, raggiungibile da ogni pagina di Guida.
// Slide dal lato destro — azioni sul Percorso corrente, non navigazione tra Diari (quella vive
// ora nello scaffale vero e proprio, /diari, non più in un drawer, Fase 18).
//
// Ogni strumento è un riuso diretto, non una reimplementazione:
// - Elenco Reportage: stessa /api/percorsi/[id]/reportage di ReportageSection (rimasta invariata
//   per il lettore classico), righe proprie qui solo per il tono pergamena invece del bianco/stone.
//   Ogni riga rimanda alla lettura "a libro" del Reportage (.../reportage/[id]/sezione/1) — stesso
//   trattamento "a pagine" già usato per la Guida, richiesta esplicita dell'utente: generazione AI
//   ed editor vivono lì (ReportBookPage.tsx + ReportageToolsDrawer.tsx), non più in una pagina di
//   riepilogo a sé (eliminata) né nella vista estesa /resoconto/[id] (resta un link secondario).
// - Generazione in blocco: lo stesso <GuideGenerationPanel> bulk già esistente (prima viveva solo
//   sulla pagina "Il percorso" da Fase 14 — spostato qui, raggiungibile da qualunque sezione, non
//   solo da quella).
// - Esporta PDF/GPX: stesse funzioni di app/guida/GuidaHub.tsx (exportGuidePdf, exportPlannedHikeToGpx),
//   mai passate dal libro prima d'ora.
// - Video 3D: stesso <RouteMap3D> di GuidaHub.tsx — il libro non lo montava affatto (onOpenMap3D
//   restava sempre undefined nei widget); il montaggio vero e proprio vive in GuideBookPage.tsx
//   (un overlay a schermo intero, non dentro il drawer), questo bottone si limita ad aprirlo.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { BookOpen, Camera, ChevronRight, Download, FileDown, Loader2, MapPin, PenLine, View, X } from 'lucide-react'
import type { PlannedHike, HikeNote } from '@/lib/plannedStore'
import type { ReportageRow } from '@/app/api/percorsi/[id]/reportage/route'
import { exportPlannedHikeToGpx } from '@/utils/exportGpx'
import GuideGenerationPanel from './GuideGenerationPanel'
import { FONT } from '@/lib/designTokens'

const PAPER_BG = '#fbf6e8'
const PAPER_HAIRLINE = '#e4d9bd'
const INK_MUTED = '#a9915f'
const INK_TEXT = '#3f3a22'
const PILL_BG = '#f1e9d2'

interface Props {
  open: boolean
  onClose: () => void
  basePath: string
  percorsoId: string
  hike: PlannedHike
  hasAiAccess: boolean | null
  aiUnavailable: boolean
  trialExpired: boolean
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  hasGps: boolean
  onOpen3D: () => void
}

function ToolButton({ icon, label, onClick, disabled, busy }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors disabled:opacity-40"
      style={{ background: PILL_BG, color: INK_TEXT, fontSize: 14, fontWeight: 600 }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon}
      {label}
    </button>
  )
}

/** Presentazionale — le righe arrivano dal genitore (fetch unico condiviso con AppuntiSection,
 *  che legge dagli stessi Reportage: nessun secondo giro su /api/percorsi/[id]/reportage). */
function ReportageList({ rows, error, basePath }: { rows: ReportageRow[] | null; error: string | null; basePath: string }) {
  if (error) return <p className="text-xs" style={{ color: '#b3413a' }}>Impossibile caricare i Reportage: {error}</p>
  if (rows === null) {
    return (
      <div className="flex items-center gap-2 py-2" style={{ color: INK_MUTED }}>
        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Caricamento…</span>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-xs leading-relaxed" style={{ color: INK_MUTED }}>
        Nessun Reportage ancora — quando cammini questo percorso, comparirà qui.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(r => (
        <Link
          key={r.id}
          href={`${basePath}/reportage/${encodeURIComponent(r.id)}/sezione/1`}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors"
          style={{ background: PILL_BG }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#e9dcb8' }}>
            <PenLine className="w-3.5 h-3.5" style={{ color: '#8a7f52' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: INK_TEXT }}>
              {format(new Date(r.startTime), 'd MMMM yyyy', { locale: it })}
            </p>
            <p style={{ fontSize: 12, color: INK_MUTED }}>
              {(r.distanceMeters / 1000).toFixed(1)} km
              {!r.hasWrittenReport && <span style={{ color: '#c05a17', fontWeight: 600 }}> · Da raccontare</span>}
            </p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: INK_MUTED }} />
        </Link>
      ))}
    </div>
  )
}

/**
 * Appunti di campo — Fase 6 di docs/libreria-atlante-piano.md. In sola lettura: si prendono solo
 * in cammino, in Navigator (FieldNoteSheet.tsx), mai da qui. Due fonti, unite:
 * - `hike.hikeNotes` — presi mentre si segue il Percorso ma la sessione non è (ancora) diventata
 *   un Reportage (ActiveNavigationView.tsx scrive lì durante la navigazione).
 * - `hikeNotes` di ogni Reportage — travasati dalla Meta al salvataggio (lib/activitySave.ts).
 * Deduplicati per id (una nota appena salvata può comparire per un istante su entrambe le fonti)
 * e ordinati dal più recente.
 */
function AppuntiSection({ hike, rows }: { hike: PlannedHike; rows: ReportageRow[] | null }) {
  if (rows === null) {
    return (
      <div className="flex items-center gap-2 py-2" style={{ color: INK_MUTED }}>
        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Caricamento…</span>
      </div>
    )
  }

  const byId = new Map<string, HikeNote>()
  for (const n of hike.hikeNotes ?? []) byId.set(n.id, n)
  for (const r of rows) for (const n of r.hikeNotes) byId.set(n.id, n)
  const note = Array.from(byId.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  if (note.length === 0) {
    return (
      <p className="text-xs leading-relaxed" style={{ color: INK_MUTED }}>
        Nessun appunto ancora — si prendono in cammino, dal Navigator.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {note.map(n => (
        <div key={n.id} className="flex gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: PILL_BG }}>
          {n.photoUrl ? (
            <img src={n.photoUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#e9dcb8' }}>
              {n.lat != null ? <MapPin className="w-3.5 h-3.5" style={{ color: '#8a7f52' }} /> : <Camera className="w-3.5 h-3.5" style={{ color: '#8a7f52' }} />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 12, color: INK_MUTED }}>
              {format(new Date(n.timestamp), 'd MMM · HH:mm', { locale: it })}
            </p>
            {n.text && <p style={{ fontSize: 14, color: INK_TEXT, lineHeight: 1.4 }}>{n.text}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-2 mt-5 first:mt-0"
      style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#8a7f52' }}
    >
      {children}
    </p>
  )
}

export default function PercorsoToolsDrawer({
  open, onClose, basePath, percorsoId, hike, hasAiAccess, aiUnavailable, trialExpired, onHikeUpdate, hasGps, onOpen3D,
}: Props) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [reportageRows, setReportageRows] = useState<ReportageRow[] | null>(null)
  const [reportageError, setReportageError] = useState<string | null>(null)

  // Un solo fetch, condiviso da ReportageList e AppuntiSection sotto (gli appunti di un
  // Reportage arrivano dalla stessa riga). Solo quando il drawer è aperto — le stesse "Strumenti"
  // di prima non facevano nulla finché l'utente non lo apriva.
  useEffect(() => {
    if (!open) return
    fetch(`/api/percorsi/${encodeURIComponent(percorsoId)}/reportage`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setReportageRows)
      .catch(e => setReportageError(e instanceof Error ? e.message : String(e)))
  }, [open, percorsoId])

  async function handleExportPdf() {
    if (exportingPdf) return
    setExportingPdf(true)
    setPdfError(null)
    try {
      const { exportGuidePdf } = await import('@/utils/pdfExport')
      await exportGuidePdf(hike, hike.cachedGuide ?? '')
    } catch (e) {
      console.error('Export PDF guida fallito:', e)
      setPdfError('Generazione del PDF non riuscita. Riprova.')
    } finally {
      setExportingPdf(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[300px] sm:w-[340px] flex flex-col shadow-2xl overflow-y-auto"
        style={{ background: PAPER_BG, fontFamily: FONT.body }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ borderColor: PAPER_HAIRLINE, background: PAPER_BG }}>
          <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 12, color: INK_MUTED }}>
            Strumenti del Percorso
          </p>
          <button onClick={onClose} aria-label="Chiudi" style={{ color: INK_MUTED }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          <SectionLabel>Reportage</SectionLabel>
          <ReportageList rows={reportageRows} error={reportageError} basePath={basePath} />

          <SectionLabel>Appunti di campo</SectionLabel>
          <AppuntiSection hike={hike} rows={reportageRows} />

          <SectionLabel>Genera tutta la guida</SectionLabel>
          <GuideGenerationPanel
            hike={hike}
            percorsoId={percorsoId}
            hasAiAccess={hasAiAccess}
            aiUnavailable={aiUnavailable}
            trialExpired={trialExpired}
            onHikeUpdate={onHikeUpdate}
          />

          <SectionLabel>Esporta</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <ToolButton icon={<FileDown className="w-4 h-4 shrink-0" />} label="Esporta PDF" onClick={handleExportPdf} busy={exportingPdf} />
            {pdfError && <p className="text-xs" style={{ color: '#b3413a' }}>{pdfError}</p>}
            <ToolButton
              icon={<Download className="w-4 h-4 shrink-0" />}
              label="Esporta GPX"
              onClick={() => exportPlannedHikeToGpx(hike)}
              disabled={!hike.trackPoints?.length && !hike.routePolyline?.length}
            />
          </div>

          {hasGps && (
            <>
              <SectionLabel>Visualizza</SectionLabel>
              <ToolButton icon={<View className="w-4 h-4 shrink-0" />} label="Video 3D del percorso" onClick={onOpen3D} />
            </>
          )}

          <SectionLabel>Altro</SectionLabel>
          <Link
            href={`/guida/${encodeURIComponent(percorsoId)}`}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg"
            style={{ background: PILL_BG, color: INK_TEXT, fontSize: 14, fontWeight: 600 }}
          >
            <span className="inline-flex items-center gap-2"><BookOpen className="w-4 h-4" /> Apri vista estesa (mappa, 3D)</span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: INK_MUTED }} />
          </Link>
        </div>
      </div>
    </div>
  )
}
