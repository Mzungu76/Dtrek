'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Download, Home, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { withForcedDownload } from '@/lib/storageDownloadUrl'

interface Props {
  pdfUrl: string
  title: string
}

// Cap how many rendered pages we keep as data URLs at once — on mobile,
// eagerly rendering every page upfront (the old approach) exhausted memory
// on long diaries and silently hung the tab with no error. Pages are now
// rendered on demand (current ± a small window) and evicted once far away.
const KEEP_WINDOW = 2

// Scala di rendering pdfjs: più alta di prima (era 1.8) per compensare la modalità "dimensione
// reale" introdotta più sotto, dove il testo si legge esattamente a questa risoluzione.
const RENDER_SCALE = 2.2

export default function PdfViewer({ pdfUrl, title }: Props) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pages, setPages] = useState<Record<number, string>>({})
  const [pageNativeWidth, setPageNativeWidth] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [flipDir, setFlipDir] = useState<'fwd' | 'bck'>('fwd')
  // Su schermi stretti l'intera pagina A4 rimpicciolita rende il testo fisicamente troppo
  // piccolo per essere letto, e non c'era alcun modo di ingrandire — solo sfogliare pagine già
  // minuscole. In questa modalità la pagina si mostra alla sua risoluzione di rendering reale
  // dentro un riquadro che scorre in entrambe le direzioni, invece di essere sempre compressa
  // per intero nello schermo.
  const [actualSize, setActualSize] = useState(false)

  // `rendering` deve essere letto e scritto in modo sincrono all'interno dello stesso effetto,
  // non tramite useState: due esecuzioni ravvicinate dell'effetto (pageIdx che cambia in rapida
  // successione) leggerebbero entrambe lo stesso valore di stato non ancora aggiornato dalla
  // prima chiamata a setRendering, e partirebbero entrambe a renderizzare la stessa pagina. Un
  // ref è mutato immediatamente, quindi la seconda esecuzione vede sempre l'effetto della prima.
  const renderingRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise
        if (cancelled) return
        setTotalPages(pdf.numPages)
        setPdfDoc(pdf)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Render the current page (and neighbors) on demand; evict pages outside
  // the keep window so memory stays bounded regardless of diary length.
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return
    let cancelled = false

    const want = new Set<number>()
    for (let i = Math.max(1, pageIdx + 1 - KEEP_WINDOW); i <= Math.min(totalPages, pageIdx + 1 + KEEP_WINDOW); i++) {
      want.add(i)
    }

    setPages(prev => {
      const next: Record<number, string> = {}
      want.forEach(i => { if (prev[i]) next[i] = prev[i] })
      return next
    })

    want.forEach(async (i) => {
      // `pages` è letto dalla closure di questa esecuzione dell'effetto (non è tra le
      // dipendenze, di proposito: vedi il commento sopra `[pdfDoc, totalPages, pageIdx]` più
      // sotto), `renderingRef` è mutato subito, in modo sincrono, prima di qualunque `await` —
      // così una seconda esecuzione dell'effetto innescata da un `pageIdx` che cambia rapidissimo
      // vede già la pagina come "in corso" e non parte una seconda volta.
      if (pages[i] || renderingRef.current.has(i)) return
      renderingRef.current.add(i)
      try {
        const page = await pdfDoc.getPage(i)
        const vp = page.getViewport({ scale: RENDER_SCALE })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        canvas.width = 0; canvas.height = 0 // release backing buffer
        if (!cancelled) {
          setPages(prev => ({ ...prev, [i]: dataUrl }))
          if (i === pageIdx + 1) setPageNativeWidth(vp.width)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        renderingRef.current.delete(i)
      }
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, totalPages, pageIdx])

  const navigate = useCallback((target: number) => {
    if (phase !== 'idle' || target < 0 || target >= totalPages || target === pageIdx) return
    setFlipDir(target > pageIdx ? 'fwd' : 'bck')
    setPhase('out')
    setTimeout(() => { setPageIdx(target); setPhase('in') }, 300)
    setTimeout(() => setPhase('idle'), 600)
  }, [phase, pageIdx, totalPages])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate(pageIdx + 1)
      if (e.key === 'ArrowLeft') navigate(pageIdx - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, pageIdx])

  const currentPageImg = pages[pageIdx + 1]
  const isLoading = !currentPageImg && !error

  const animStyle: React.CSSProperties = phase === 'out'
    ? { animation: flipDir === 'fwd' ? 'flipOutFwd 0.3s ease-in forwards' : 'flipOutBck 0.3s ease-in forwards' }
    : phase === 'in'
    ? { animation: flipDir === 'fwd' ? 'flipInFwd 0.3s ease-out forwards' : 'flipInBck 0.3s ease-out forwards' }
    : {}

  const fitWidth = 'min(720px, 92vw)'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #193b20 0%, #1c2620 55%, #12190f 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40, gap: 20,
    }}>

      {/* Chi apre questo lettore da un link pubblico (condiviso via WhatsApp, PWA in modalità
          standalone, o come pagina isolata senza cronologia del browser) non aveva alcun modo di
          tornare all'app: solo Indietro/Avanti fra le pagine del PDF, ingrandisci e download. Un
          link fisso, non un pulsante "indietro" del browser (che potrebbe non esserci), riporta
          sempre alla home dell'app. */}
      <a href="/" title="Torna a DTrek"
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999,
          background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(4px)',
          color: 'rgba(255,255,255,0.85)', textDecoration: 'none',
          fontSize: 12, fontFamily: FONT.body, fontWeight: 600, letterSpacing: 0.3,
        }}>
        <Home style={{ width: 14, height: 14 }} /> DTrek
      </a>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <BookOpen style={{ color: 'rgba(255,255,255,0.55)', width: 18, height: 18 }} />
        <span style={{
          color: 'rgba(255,255,255,0.6)', fontSize: 13,
          fontFamily: FONT.lora,
          letterSpacing: 1.5, textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 20px' }}>
          <Loader2 style={{ color: '#58aa63', width: 36, height: 36, animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: FONT.lora, margin: 0 }}>
            {totalPages > 0
              ? `Preparazione pagina ${pageIdx + 1} di ${totalPages}…`
              : 'Apertura documento…'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div style={{ color: '#fca5a5', fontFamily: FONT.lora, fontSize: 14, padding: 32, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px' }}>Impossibile caricare il PDF.</p>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: '#8cc894', fontSize: 12, textDecoration: 'underline' }}>
            Apri direttamente il file →
          </a>
        </div>
      )}

      {/* Single page with 3D flip */}
      {!isLoading && !error && currentPageImg && (
        <>
          <div style={{
            width: fitWidth,
            maxWidth: '96vw',
            maxHeight: actualSize ? '72vh' : undefined,
            overflow: actualSize ? 'auto' : 'visible',
            borderRadius: actualSize ? 8 : 0,
            boxShadow: phase !== 'idle'
              ? '0 40px 100px rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.5)'
              : '0 30px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={actualSize ? { width: pageNativeWidth ?? undefined, ...animStyle } : animStyle}>
              <img
                src={currentPageImg}
                alt={`Pagina ${pageIdx + 1}`}
                style={{ width: '100%', display: 'block' }}
              />
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(pageIdx - 1)}
              disabled={pageIdx <= 0 || phase !== 'idle'}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                cursor: pageIdx <= 0 || phase !== 'idle' ? 'not-allowed' : 'pointer',
                background: pageIdx <= 0 ? '#2a3327' : '#3a4a37',
                color: pageIdx <= 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontFamily: FONT.body, transition: 'background 0.15s',
              }}>
              <ChevronLeft style={{ width: 16, height: 16 }} /> Indietro
            </button>

            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: FONT.body, letterSpacing: 1, minWidth: 80, textAlign: 'center' }}>
              {pageIdx + 1} di {totalPages}
            </span>

            <button
              onClick={() => navigate(pageIdx + 1)}
              disabled={pageIdx >= totalPages - 1 || phase !== 'idle'}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                cursor: pageIdx >= totalPages - 1 || phase !== 'idle' ? 'not-allowed' : 'pointer',
                background: pageIdx >= totalPages - 1 ? '#2a3327' : '#3a4a37',
                color: pageIdx >= totalPages - 1 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontFamily: FONT.body, transition: 'background 0.15s',
              }}>
              Avanti <ChevronRight style={{ width: 16, height: 16 }} />
            </button>

            <button
              onClick={() => setActualSize(v => !v)}
              title={actualSize ? 'Adatta la pagina allo schermo' : 'Dimensione reale (scorri per leggere)'}
              style={{
                padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: actualSize ? '#e08d3c' : '#3a4a37',
                color: actualSize ? '#1c1204' : 'rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontFamily: FONT.body, letterSpacing: 0.3,
              }}>
              {actualSize ? <ZoomOut style={{ width: 14, height: 14 }} /> : <ZoomIn style={{ width: 14, height: 14 }} />}
              {actualSize ? 'Adatta' : 'Ingrandisci'}
            </button>

            {/* `download` da solo non basta su un URL cross-origin (*.supabase.co): i browser
                recenti lo ignorano e il link si limitava ad aprire il PDF in una nuova scheda
                invece di scaricarlo. `withForcedDownload` aggiunge il parametro che fa impostare
                a Supabase Storage `Content-Disposition: attachment` lato server. */}
            <a href={withForcedDownload(pdfUrl)} download target="_blank" rel="noopener noreferrer"
              style={{
                padding: '9px 16px', borderRadius: 8,
                background: '#c05a17', color: 'white',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontFamily: FONT.body,
                textDecoration: 'none', letterSpacing: 0.5,
              }}>
              <Download style={{ width: 13, height: 13 }} /> Scarica PDF
            </a>
          </div>

          {actualSize && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: FONT.lora, fontStyle: 'italic', margin: 0 }}>
              Scorri la pagina per leggerla tutta
            </p>
          )}

          {/* Dot indicators (max 20 pages) */}
          {totalPages <= 20 && (
            <div style={{ display: 'flex', gap: 6, marginTop: -4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => navigate(i)}
                  style={{
                    width: i === pageIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none',
                    background: i === pageIdx ? '#58aa63' : '#2a3327',
                    cursor: 'pointer', padding: 0, transition: 'width 0.2s, background 0.2s',
                  }} />
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes flipOutFwd { 0% { transform: perspective(1000px) rotateY(0deg) scale(1); } 100% { transform: perspective(1000px) rotateY(-90deg) scale(0.95); } }
        @keyframes flipInFwd  { 0% { transform: perspective(1000px) rotateY(90deg) scale(0.95); } 100% { transform: perspective(1000px) rotateY(0deg) scale(1); } }
        @keyframes flipOutBck { 0% { transform: perspective(1000px) rotateY(0deg) scale(1); } 100% { transform: perspective(1000px) rotateY(90deg) scale(0.95); } }
        @keyframes flipInBck  { 0% { transform: perspective(1000px) rotateY(-90deg) scale(0.95); } 100% { transform: perspective(1000px) rotateY(0deg) scale(1); } }
      `}</style>
    </div>
  )
}
