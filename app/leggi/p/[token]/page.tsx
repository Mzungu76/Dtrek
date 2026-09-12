// Pagina pubblica di UN Reportage — Fase 2 del piano di pubblicazione
// (docs/raccolte-pubblicazione-piano.md): stesso stile editoriale del Diario e della Raccolta
// (app/leggi/d/[token], app/leggi/c/[token]) invece del solo visualizzatore PDF che questa rotta
// mostrava finora — un Reportage pubblicato è la stessa identica voce di un Diario pubblicato,
// solo senza il Diario intorno, quindi riusa EntryArticle/EntryCard senza modifiche.
//
// Il PDF non sparisce (decisione dell'utente, "manteniamo anche export PDF"): resta un allegato
// scaricabile in fondo alla pagina se l'utente ne ha generato e allegato uno, esattamente come già
// per il Diario — non è più una condizione per pubblicare.
//
// /leggi/r/[activityId] resta invariata (retrocompatibilità per i link già in circolazione, vedi
// il suo stesso commento) — questa è la sola rotta aggiornata, quella usata dai nuovi link.
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { fetchPublicReport } from '@/lib/sharePublicReport'
import { hasNarrative } from '@/lib/sharePublicDiary'
import { DEFAULT_DIARY_CONFIG } from '@/lib/diaryConfig'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { DtrekCallout, SiteFooter } from '@/app/leggi/d/[token]/SiteChrome'
import { EntryArticle, EntryCard } from '@/app/leggi/d/[token]/EntryArticle'
import { PublicPdfExport } from '@/app/leggi/d/[token]/PublicPdfExport'
import { DTREK_URL } from '@/lib/publicSite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getReport = cache(fetchPublicReport)

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const report = await getReport(params.token)
  if (!report) return { title: 'Reportage non trovato · DTrek' }

  const { entry } = report
  const desc = `${(entry.distanceMeters / 1000).toFixed(1)} km · ${Math.round(entry.elevationGain)} m di dislivello · di ${report.ownerName}`
  return {
    title: `${entry.title} · DTrek`,
    description: desc,
    openGraph: {
      title: entry.title,
      description: desc,
      type: 'article',
      images: entry.photos[0] ? [entry.photos[0].url] : undefined,
    },
    twitter: { card: 'summary_large_image', title: entry.title, description: desc },
  }
}

export default async function ReportPublicPage({ params }: { params: { token: string } }) {
  const report = await getReport(params.token)
  if (!report) notFound()

  const { entry } = report

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Testata minima, senza navigazione: un Reportage pubblicato da solo non ha un "sito"
          attorno con altre pagine da raggiungere, a differenza di un Diario o una Raccolta. */}
      <header className="sticky top-0 z-30 bg-forest-900/95 backdrop-blur text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-5">
          <div className="flex items-center justify-between h-14">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="text-forest-300 text-lg leading-none">▲</span>
              <span className="font-display font-bold text-base truncate">DTrek</span>
            </span>
            <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-terra-500 hover:bg-terra-400 transition rounded-full px-3.5 py-1.5 shrink-0">
              Prova DTrek
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 space-y-5">
        <p className="text-xs text-stone-500">di {report.ownerName}</p>

        {hasNarrative(entry.content)
          ? <EntryArticle entry={entry} n={1} show={DEFAULT_DIARY_CONFIG.publicSections} />
          : <EntryCard entry={entry} n={1} />}

        {report.pdfUrl && (
          <a href={withForcedDownload(report.pdfUrl, 'reportage-dtrek.pdf')} download
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm">
            <Download className="w-4 h-4" /> Scarica il reportage in PDF
          </a>
        )}
        <PublicPdfExport diary={{
          entries: [entry], ownerName: report.ownerName, title: entry.title,
          subtitle: '', coverUrl: entry.photos[0]?.url ?? null,
        }} />

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
