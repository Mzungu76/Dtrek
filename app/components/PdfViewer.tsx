'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'

interface Props {
  pdfUrl: string
  title: string
}

// Cap how many rendered pages we keep as data URLs at once — on mobile,
// eagerly rendering every page upfront (the old approach) exhausted memory
// on long diaries and silently hung the tab with no error. Pages are now
// rendered on demand (current ± a small window) and evicted once far away.
const KEEP_WINDOW = 2

export default function PdfViewer({ pdfUrl, title }: Props) {
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pages, setPages] = useState<Record<number, string>>({})
  const [rendering, setRendering] = useState<Set<number>>(new Set())
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [flipDir, setFlipDir] = useState<'fwd' | 'bck'>('fwd')

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
      if (pages[i] || rendering.has(i)) return
      setRendering(prev => new Set(prev).add(i))
      try {
        const page = await pdfDoc.getPage(i)
        const vp = page.getViewport({ scale: 1.8 })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        canvas.width = 0; canvas.height = 0 // release backing buffer
        if (!cancelled) setPages(prev => ({ ...prev, [i]: dataUrl }))
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setRendering(prev => { const n = new Set(prev); n.delete(i); return n })
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

  const pageW = 'min(720px, 90vw)'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0b1120 0%, #0f172a 50%, #0b1120 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40, gap: 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <BookOpen style={{ color: '#475569', width: 18, height: 18 }} />
        <span style={{
          color: '#94a3b8', fontSize: 13,
          fontFamily: 'Georgia, "Times New Roman", serif',
          letterSpacing: 1.5, textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '60px 20px' }}>
          <Loader2 style={{ color: '#40916c', width: 36, height: 36, animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: 13, fontFamily: 'Georgia, serif', margin: 0 }}>
            {totalPages > 0
              ? `Preparazione pagina ${pageIdx + 1} di ${totalPages}…`
              : 'Apertura documento…'}
          </p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div style={{ color: '#f87171', fontFamily: 'Georgia, serif', fontSize: 14, padding: 32, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px' }}>Impossibile caricare il PDF.</p>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            style={{ color: '#60a5fa', fontSize: 12, textDecoration: 'underline' }}>
            Apri direttamente il file →
          </a>
        </div>
      )}

      {/* Single page with 3D flip */}
      {!isLoading && !error && currentPageImg && (
        <>
          <div style={{
            width: pageW,
            boxShadow: phase !== 'idle'
              ? '0 40px 100px rgba(0,0,0,0.95), 0 10px 30px rgba(0,0,0,0.7)'
              : '0 30px 80px rgba(0,0,0,0.9), 0 8px 24px rgba(0,0,0,0.6)',
            ...animStyle,
          }}>
            <img
              src={currentPageImg}
              alt={`Pagina ${pageIdx + 1}`}
              style={{ width: '100%', display: 'block' }}
            />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(pageIdx - 1)}
              disabled={pageIdx <= 0 || phase !== 'idle'}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                cursor: pageIdx <= 0 || phase !== 'idle' ? 'not-allowed' : 'pointer',
                background: pageIdx <= 0 ? '#1e293b' : '#334155',
                color: pageIdx <= 0 ? '#475569' : '#cbd5e1',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontFamily: 'Georgia, serif', transition: 'background 0.15s',
              }}>
              <ChevronLeft style={{ width: 16, height: 16 }} /> Indietro
            </button>

            <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'Arial, sans-serif', letterSpacing: 1, minWidth: 80, textAlign: 'center' }}>
              {pageIdx + 1} di {totalPages}
            </span>

            <button
              onClick={() => navigate(pageIdx + 1)}
              disabled={pageIdx >= totalPages - 1 || phase !== 'idle'}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                cursor: pageIdx >= totalPages - 1 || phase !== 'idle' ? 'not-allowed' : 'pointer',
                background: pageIdx >= totalPages - 1 ? '#1e293b' : '#334155',
                color: pageIdx >= totalPages - 1 ? '#475569' : '#cbd5e1',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontFamily: 'Georgia, serif', transition: 'background 0.15s',
              }}>
              Avanti <ChevronRight style={{ width: 16, height: 16 }} />
            </button>

            <a href={pdfUrl} download target="_blank" rel="noopener noreferrer"
              style={{
                padding: '9px 16px', borderRadius: 8,
                background: '#1a3a5c', color: '#7dd3fc',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontFamily: 'Arial, sans-serif',
                textDecoration: 'none', letterSpacing: 0.5,
              }}>
              <Download style={{ width: 13, height: 13 }} /> Scarica PDF
            </a>
          </div>

          {/* Dot indicators (max 20 pages) */}
          {totalPages <= 20 && (
            <div style={{ display: 'flex', gap: 6, marginTop: -4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => navigate(i)}
                  style={{
                    width: i === pageIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none',
                    background: i === pageIdx ? '#40916c' : '#1e293b',
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
