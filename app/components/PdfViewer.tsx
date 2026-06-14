'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'

interface Props {
  pdfUrl: string
  title: string
}

export default function PdfViewer({ pdfUrl, title }: Props) {
  const [pages, setPages] = useState<string[]>([])
  const [loadedCount, setLoadedCount] = useState(0)
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
        setTotalPages(pdf.numPages)
        const imgs: string[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: 1.8 })
          const canvas = document.createElement('canvas')
          canvas.width = vp.width
          canvas.height = vp.height
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
          imgs.push(canvas.toDataURL('image/jpeg', 0.88))
          setLoadedCount(i)
        }
        if (!cancelled) setPages(imgs)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  const navigate = useCallback((target: number) => {
    if (phase !== 'idle' || target < 0 || target >= pages.length || target === pageIdx) return
    setFlipDir(target > pageIdx ? 'fwd' : 'bck')
    setPhase('out')
    setTimeout(() => { setPageIdx(target); setPhase('in') }, 300)
    setTimeout(() => setPhase('idle'), 600)
  }, [phase, pageIdx, pages.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate(pageIdx + 1)
      if (e.key === 'ArrowLeft') navigate(pageIdx - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, pageIdx])

  const isLoading = loadedCount < totalPages || (totalPages === 0 && !error)

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
              ? `Preparazione pagina ${loadedCount} di ${totalPages}…`
              : 'Apertura documento…'}
          </p>
          {totalPages > 0 && (
            <div style={{ width: 200, height: 3, background: '#1e293b', borderRadius: 2 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, #2d6a4f, #40916c)',
                width: `${(loadedCount / totalPages) * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          )}
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
      {!isLoading && !error && pages.length > 0 && (
        <>
          <div style={{
            width: pageW,
            boxShadow: phase !== 'idle'
              ? '0 40px 100px rgba(0,0,0,0.95), 0 10px 30px rgba(0,0,0,0.7)'
              : '0 30px 80px rgba(0,0,0,0.9), 0 8px 24px rgba(0,0,0,0.6)',
            ...animStyle,
          }}>
            <img
              src={pages[pageIdx]}
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
              {pageIdx + 1} di {pages.length}
            </span>

            <button
              onClick={() => navigate(pageIdx + 1)}
              disabled={pageIdx >= pages.length - 1 || phase !== 'idle'}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                cursor: pageIdx >= pages.length - 1 || phase !== 'idle' ? 'not-allowed' : 'pointer',
                background: pageIdx >= pages.length - 1 ? '#1e293b' : '#334155',
                color: pageIdx >= pages.length - 1 ? '#475569' : '#cbd5e1',
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
          {pages.length <= 20 && (
            <div style={{ display: 'flex', gap: 6, marginTop: -4, flexWrap: 'wrap', justifyContent: 'center' }}>
              {pages.map((_, i) => (
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
