'use client'
// Drawer degli strumenti del Reportage — stesso principio di PercorsoToolsDrawer.tsx (Fase 15),
// qui per UN Reportage invece che per l'intero Percorso. Ristrutturazione Diario/Mete, richiesta
// esplicita dell'utente: allinea la lettura del Reportage allo stesso stile "a libro" già usato
// per la Guida (BookPage.tsx/ReportBookPage.tsx + questo drawer "Strumenti", raggiungibile da
// ogni pagina del libro tramite `onToolsClick`), non più una pagina di riepilogo a sé.
//
// Ogni strumento è un riuso diretto, non una reimplementazione:
// - Genera/rigenera: lo stesso <ReportGenerationPanel> già montato inline in ReportBookPage.tsx
//   quando il Reportage non ha ancora contenuto — qui sempre disponibile, anche a Reportage già
//   scritto (rigenerazione), stesso ruolo del pannello "in blocco" di GuideGenerationPanel dentro
//   PercorsoToolsDrawer.tsx.
// - Scrivi tu / Modifica: apre l'editor testuale assistito (ManualEditor, già esistente) — il
//   montaggio vero e proprio vive in ReportBookPage.tsx (sostituisce l'intero libro mentre è
//   aperto, non ci sta in un drawer), questo bottone si limita ad aprirlo, stesso principio del
//   Video 3D per Guida ("il montaggio vero e proprio vive in GuideBookPage.tsx").
// - Racconta a domande: link al wizard esistente (app/resoconto/[id]/racconta), invariato.
// - Vista estesa: link a /resoconto/[id] (ResocontoHub → ReportReader.tsx) — pubblica, PDF,
//   confronto con altre uscite: stesso ruolo di "Apri vista estesa (mappa, 3D)" per la Guida.
import Link from 'next/link'
import { BookOpen, ChevronRight, MessageCircleQuestion, Pencil, X } from 'lucide-react'
import type { RoutePhoto } from '@/lib/activityPhotos'
import ReportGenerationPanel from './ReportGenerationPanel'
import { FONT } from '@/lib/designTokens'

const PAPER_BG = '#fbf6e8'
const PAPER_HAIRLINE = '#e4d9bd'
const INK_MUTED = '#a9915f'
const INK_TEXT = '#3f3a22'
const PILL_BG = '#f1e9d2'

interface Props {
  open: boolean
  onClose: () => void
  activityId: string
  activityTitle: string
  hasContent: boolean
  photos: RoutePhoto[]
  onGenerated: (content: string) => void
  onOpenEditor: () => void
}

function ToolButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
      style={{ background: PILL_BG, color: INK_TEXT, fontSize: 13.5, fontWeight: 600 }}
    >
      {icon}
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-2 mt-5 first:mt-0"
      style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, color: '#8a7f52' }}
    >
      {children}
    </p>
  )
}

export default function ReportageToolsDrawer({
  open, onClose, activityId, activityTitle, hasContent, photos, onGenerated, onOpenEditor,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[300px] sm:w-[340px] flex flex-col shadow-2xl overflow-y-auto"
        style={{ background: PAPER_BG, fontFamily: FONT.body }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ borderColor: PAPER_HAIRLINE, background: PAPER_BG }}>
          <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: INK_MUTED }}>
            Strumenti del Reportage
          </p>
          <button onClick={onClose} aria-label="Chiudi" style={{ color: INK_MUTED }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          <SectionLabel>{hasContent ? 'Rigenera con AI' : 'Genera con AI'}</SectionLabel>
          <ReportGenerationPanel
            activityId={activityId}
            activityTitle={activityTitle}
            hasContent={hasContent}
            photos={photos}
            onGenerated={content => { onGenerated(content); onClose() }}
          />

          <SectionLabel>Scrivi tu</SectionLabel>
          <ToolButton
            icon={<Pencil className="w-4 h-4 shrink-0" />}
            label={hasContent ? 'Modifica il resoconto' : 'Scrivi tu il resoconto'}
            onClick={() => { onClose(); onOpenEditor() }}
          />

          {!hasContent && (
            <>
              <SectionLabel>Racconta a domande</SectionLabel>
              <Link
                href={`/resoconto/${encodeURIComponent(activityId)}/racconta`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{ background: PILL_BG, color: INK_TEXT, fontSize: 13.5, fontWeight: 600 }}
              >
                <MessageCircleQuestion className="w-4 h-4 shrink-0" /> Racconta il percorso a domande
              </Link>
            </>
          )}

          <SectionLabel>Altro</SectionLabel>
          <Link
            href={`/resoconto/${encodeURIComponent(activityId)}`}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg"
            style={{ background: PILL_BG, color: INK_TEXT, fontSize: 13.5, fontWeight: 600 }}
          >
            <span className="inline-flex items-center gap-2"><BookOpen className="w-4 h-4" /> Apri vista estesa (pubblica, PDF)</span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: INK_MUTED }} />
          </Link>
        </div>
      </div>
    </div>
  )
}
