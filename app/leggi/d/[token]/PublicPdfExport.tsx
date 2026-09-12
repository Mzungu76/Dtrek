'use client'

// Esportazione in PDF direttamente dal sito pubblico — Fase 4 del piano di pubblicazione. Prima
// l'unico PDF disponibile era quello, opzionale, caricato dall'autore (`diary.pdfUrl`): chi
// riceveva un link senza quell'allegato non aveva alcun modo di portarsi via il Diario. Questo
// componente genera un PDF nel browser di chi legge, da zero, usando solo i dati già pubblici
// della pagina — nessuna autenticazione, nessun caricamento su Storage, nessuna dipendenza dal
// libro privato (che vive in DOM, dati e componenti tutti suoi, non riusabili qui: legge
// `lib/blobStore.ts`, un modulo lato client con effetti a livello di modulo, e cattura pagine già
// composte a schermo — ne servirebbe una versione intera a sé).
//
// Riusa comunque il MOTORE di impaginazione del libro privato (lib/pdfPaginate.ts) e la stessa
// tecnica di mappa raster (utils/pdfExport: tile OSM cucite su un <canvas>, non Leaflet — una
// mappa viva non si può catturare, il canvas risulta "sporcato" dalle tile cross-origin) — sono
// entrambi puri e non toccano alcun dato privato. Le pagine di questo PDF sono nuovi template più
// semplici (per ora niente statistiche/mappa d'insieme: quelle si leggono già sul sito), pensati
// per il solo contenuto di UNA escursione — copertina + una pagina per escursione.

import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Download, Loader2 } from 'lucide-react'
import { parseSections } from '@/lib/reportStore'
import { parseMarkupBlocks, parseInlineEmphasis } from '@/lib/guideMarkup'
import { formatDuration } from '@/lib/tcxParser'
import { PDF_PAGE_W, PDF_CONTENT_H } from '@/lib/pdfPageGeometry'
import type { PublicDiaryEntry } from '@/lib/sharePublicDiary'

const FONT_BODY = 'Georgia, "Times New Roman", serif'
const FONT_UI = 'Arial, Helvetica, sans-serif'

/** Quanto serve per generare un PDF: sottoinsieme comune a PublicDiary (Diario), a un volume di
 *  una Raccolta (PublicCollectionVolume, con l'autore preso dalla Raccolta) e a un PublicReport
 *  standalone (un solo entry) — così lo stesso pulsante serve a tutti e tre senza tre copie. */
export interface PdfExportSource {
  entries:         PublicDiaryEntry[]
  ownerName:       string
  title:           string
  subtitle:        string
  coverUrl:        string | null
  dateRangeLabel?: string
}

function inlineText(text: string): string {
  // jsPDF/html2canvas catturano testo reso, non markdown: gli asterischi dell'enfasi vanno tolti
  // qui invece che stampati alla lettera — lo stesso motivo di renderInline in DiarioReportPage.tsx.
  return parseInlineEmphasis(text).map(seg => seg.text).join('')
}

function CoverPage({ diary }: { diary: PdfExportSource }) {
  return (
    <div className="pdf-bleed" style={{
      width: PDF_PAGE_W, height: 1123, background: diary.coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)',
      position: 'relative', overflow: 'hidden', color: 'white',
    }}>
      {diary.coverUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diary.coverUrl} alt="" crossOrigin="anonymous"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(8,24,14,0.78) 0%, rgba(8,24,14,0.55) 60%, rgba(8,24,14,0.68) 100%)' }} />
        </>
      )}
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 96 }}>
        {diary.dateRangeLabel && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#e3a25f', margin: '0 0 14px' }}>
            {diary.dateRangeLabel}
          </p>
        )}
        <h1 style={{ fontFamily: FONT_UI, fontSize: 46, fontWeight: 700, lineHeight: 1.1, margin: 0 }}>
          {diary.title}
        </h1>
        {diary.subtitle && (
          <p style={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 18, color: 'rgba(255,255,255,0.75)', margin: '14px 0 0' }}>
            {diary.subtitle}
          </p>
        )}
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '28px 0 0' }}>di {diary.ownerName}</p>
      </div>
    </div>
  )
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px' }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 18, fontWeight: 700, color: '#1c4724' }}>{value}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9ca3af', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function EntryPage({ entry, n, mapDataUrl }: {
  entry: PublicDiaryEntry
  n: number
  mapDataUrl: string | null
}) {
  const sections = parseSections(entry.content).filter(s => s.body.trim())
  const photos = entry.photos.slice(0, 4)

  return (
    <div className="diario-pdf-page" style={{
      width: PDF_PAGE_W, minHeight: PDF_CONTENT_H, background: '#fff', padding: '8px 56px 24px',
    }}>
      <p className="pdf-block" style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#e08d3c', margin: '0 0 6px' }}>
        Escursione #{String(n).padStart(2, '0')}
      </p>
      <h2 className="pdf-block pdf-keep-next" style={{ fontFamily: FONT_UI, fontSize: 26, fontWeight: 700, color: '#193b20', margin: '0 0 4px' }}>
        {entry.title}
      </h2>
      <p className="pdf-block" style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px' }}>
        {new Date(entry.startTime).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <div className="pdf-block" style={{ display: 'flex', borderTop: '1px solid #f0ede7', borderBottom: '1px solid #f0ede7', margin: '0 0 16px' }}>
        <StatCell value={`${(entry.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" />
        <StatCell value={`${Math.round(entry.elevationGain)} m`} label="Dislivello +" />
        {entry.totalTimeSeconds > 0 && <StatCell value={formatDuration(entry.totalTimeSeconds)} label="Durata" />}
        {entry.altitudeMax != null && <StatCell value={`${Math.round(entry.altitudeMax)} m`} label="Quota max" />}
      </div>

      {mapDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mapDataUrl} alt="" className="pdf-block"
          style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 16 }} />
      )}

      {photos.length > 0 && (
        <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
          {photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p.url} alt="" crossOrigin="anonymous"
              style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
          ))}
        </div>
      )}

      {sections.length > 0
        ? sections.map((section, si) => (
          <div key={si}>
            <p className="pdf-block pdf-keep-next" style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#e08d3c', margin: '14px 0 6px' }}>
              {section.title}
            </p>
            {parseMarkupBlocks(section.body).map((block, bi) => (
              <p key={bi} className="pdf-block" style={{ fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 1.7, color: '#4d4740', margin: '0 0 10px' }}>
                {inlineText(block.text)}
              </p>
            ))}
          </div>
        ))
        : (
          <p className="pdf-block" style={{ fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 12.5, color: '#9ca3af', margin: '14px 0 0' }}>
            Nessun racconto scritto per questa escursione.
          </p>
        )}
    </div>
  )
}

export function PublicPdfExport({ diary }: { diary: PdfExportSource }) {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setGenerating(true); setError(null); setProgress(null)
    const host = document.createElement('div')
    host.style.cssText = `position:absolute;left:-10000px;top:0;width:${PDF_PAGE_W}px;background:#fff;z-index:-1`
    document.body.appendChild(host)

    try {
      const { fetchSatMap } = await import('@/utils/pdfExport')
      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
      const { createRoot } = await import('react-dom/client')

      // Mappe raster per le sole escursioni con traccia — stessa tecnica del PDF privato
      // (utils/pdfExport/mapTiles.ts: tile OSM cucite su un canvas), scelta apposta perché una
      // mappa Leaflet viva non si può catturare con html2canvas.
      const ROUTE_COLORS = ['#277134', '#e08d3c', '#0369a1', '#7c3aed']
      const maps = await Promise.all(diary.entries.map((e, i) =>
        e.polyline && e.polyline.length > 1
          ? fetchSatMap(e.polyline, PDF_PAGE_W - 112, 220, ROUTE_COLORS[i % ROUTE_COLORS.length]).catch(() => null)
          : Promise.resolve(null),
      ))

      const root = createRoot(host)
      // flushSync: stesso accorgimento di app/lib/guide/usePDFExport.ts e
      // app/resoconto/[id]/renderReportPdf.ts — senza, il commit di React potrebbe non essere
      // ancora avvenuto quando si passa a leggere il DOM subito sotto.
      flushSync(() => root.render(
        <>
          <CoverPage diary={diary} />
          {diary.entries.map((entry, i) => (
            <EntryPage key={entry.id} entry={entry} n={i + 1} mapDataUrl={maps[i]} />
          ))}
        </>,
      ))
      // Il commit garantisce il DOM, non il layout: nextLayout() (due rAF + un fallback a tempo)
      // lo garantisce a sua volta, esattamente come fa il libro privato prima di misurare.
      await nextLayout()

      const pages = Array.from(host.children) as HTMLElement[]
      const blob = await paginateToPdf(pages, '.pdf-block', {
        documentTitle: diary.title,
        authorName: diary.ownerName,
        onProgress: (done, total) => setProgress({ done, total }),
      })

      root.unmount()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${diary.title || 'diario'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Non è stato possibile generare il PDF. Riprova.')
    } finally {
      host.remove()
      setGenerating(false)
      setProgress(null)
    }
  }

  if (diary.entries.length === 0) return null

  return (
    <div>
      <button type="button" onClick={handleDownload} disabled={generating}
        className="w-full flex items-center justify-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm disabled:opacity-60">
        {generating
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Download className="w-4 h-4" />}
        {generating
          ? (progress ? `Genero il PDF… ${progress.done}/${progress.total}` : 'Preparo il PDF…')
          : 'Genera e scarica il PDF'}
      </button>
      {error && <p className="text-xs text-red-500 text-center mt-2">{error}</p>}
    </div>
  )
}
