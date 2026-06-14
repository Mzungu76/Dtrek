'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Spread = pair of facing pages. Spread 0 → pages[0] alone (cover).
  // Spread 1 → pages[1] + pages[2], etc.
  const [spread, setSpread] = useState(0)
  const [animDir, setAnimDir] = useState<'next' | 'prev' | null>(null)
  const isMobile = useRef(false)

  useEffect(() => {
    isMobile.current = window.innerWidth < 680
  }, [])

  // Render all PDF pages to JPEG data URLs using pdf.js
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

  // Spread layout: cover alone on right (spread 0), then pairs
  // spread 0 → left=blank, right=pages[0]
  // spread 1 → left=pages[1], right=pages[2]
  // spread 2 → left=pages[3], right=pages[4]
  const maxSpread = pages.length < 2 ? 0 : Math.ceil((pages.length - 1) / 2)

  function getPages(s: number) {
    if (s === 0) return { left: null, right: pages[0] ?? null }
    const li = s * 2 - 1
    const ri = s * 2
    return { left: pages[li] ?? null, right: pages[ri] ?? null }
  }

  // On mobile, show one page at a time (0-indexed)
  const mobilePageIndex = spread === 0 ? 0 : spread * 2 - 1

  function pageLabel() {
    if (isMobile.current) {
      const idx = mobilePageIndex
      return `${idx + 1} di ${pages.length}`
    }
    const { left, right } = getPages(spread)
    const lp = spread === 0 ? null : spread * 2
    const rp = spread === 0 ? 1 : spread * 2 + 1
    if (left && right) return `${lp}–${rp} di ${pages.length}`
    if (right) return `1 di ${pages.length}`
    if (left) return `${lp} di ${pages.length}`
    return ''
  }

  const flip = useCallback((dir: 'next' | 'prev') => {
    if (animDir) return
    const next = dir === 'next' ? spread + 1 : spread - 1
    if (next < 0 || next > maxSpread) return
    setAnimDir(dir)
    setTimeout(() => {
      setSpread(next)
      setAnimDir(null)
    }, 280)
  }, [animDir, spread, maxSpread])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') flip('next')
      if (e.key === 'ArrowLeft') flip('prev')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flip])

  const isLoading = loadedCount < totalPages || (totalPages === 0 && !error)
  const { left, right } = getPages(spread)

  // Page display width — min(397px, 43vw) per page on desktop; ~90vw on mobile
  const pageW = 'min(397px, 43vw)'
  const mobileW = 'min(620px, 92vw)'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0b1120 0%, #0f172a 50%, #0b1120 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40,
      gap: 20,
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

      {/* Book — desktop two-page spread */}
      {!isLoading && !error && pages.length > 0 && (
        <>
          {/* Desktop spread */}
          <div className="pdf-book-desktop" style={{
            display: 'flex', alignItems: 'stretch',
            opacity: animDir ? 0 : 1,
            transform: animDir
              ? animDir === 'next'
                ? 'perspective(1200px) rotateY(-8deg) translateX(-20px)'
                : 'perspective(1200px) rotateY(8deg) translateX(20px)'
              : 'none',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
            boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 8px 24px rgba(0,0,0,0.6)',
          }}>
            {/* Left page */}
            <div style={{
              width: pageW, background: left ? 'white' : '#f0ede6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset -6px 0 20px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}>
              {left
                ? <img src={left} alt="" style={{ width: '100%', display: 'block' }} />
                : (
                  /* Blank left page on cover spread */
                  <div style={{ width: '100%', paddingBottom: '141.7%', background: '#f0ede6' }} />
                )
              }
            </div>
            {/* Spine shadow */}
            <div style={{
              width: 8, flexShrink: 0,
              background: 'linear-gradient(to right, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.04) 40%, rgba(0,0,0,0.04) 60%, rgba(0,0,0,0.2) 100%)',
            }} />
            {/* Right page */}
            <div style={{
              width: pageW, background: right ? 'white' : '#f0ede6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 6px 0 20px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}>
              {right
                ? <img src={right} alt="" style={{ width: '100%', display: 'block' }} />
                : <div style={{ width: '100%', paddingBottom: '141.7%', background: '#f0ede6' }} />
              }
            </div>
          </div>

          {/* Mobile single page */}
          <div className="pdf-book-mobile" style={{
            display: 'none',
            opacity: animDir ? 0 : 1,
            transition: 'opacity 0.25s',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            {pages[mobilePageIndex]
              ? <img src={pages[mobilePageIndex]} alt="" style={{ width: mobileW, display: 'block' }} />
              : <div style={{ width: mobileW, paddingBottom: '141.7%', background: 'white' }} />
            }
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => flip('prev')} disabled={spread <= 0}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: spread <= 0 ? 'not-allowed' : 'pointer',
                background: spread <= 0 ? '#1e293b' : '#334155',
                color: spread <= 0 ? '#475569' : '#cbd5e1',
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, fontFamily: 'Georgia, serif', transition: 'background 0.15s',
              }}>
              <ChevronLeft style={{ width: 16, height: 16 }} /> Indietro
            </button>

            <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'Arial, sans-serif', letterSpacing: 1, minWidth: 80, textAlign: 'center' }}>
              {pageLabel()}
            </span>

            <button onClick={() => flip('next')} disabled={spread >= maxSpread}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', cursor: spread >= maxSpread ? 'not-allowed' : 'pointer',
                background: spread >= maxSpread ? '#1e293b' : '#334155',
                color: spread >= maxSpread ? '#475569' : '#cbd5e1',
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
                textDecoration: 'none', letterSpacing: 0.5, transition: 'background 0.15s',
              }}>
              <Download style={{ width: 13, height: 13 }} /> Scarica PDF
            </a>
          </div>

          {/* Page dot indicators (max 12 visible) */}
          {maxSpread <= 12 && (
            <div style={{ display: 'flex', gap: 6, marginTop: -4 }}>
              {Array.from({ length: maxSpread + 1 }, (_, i) => (
                <button key={i} onClick={() => setSpread(i)}
                  style={{
                    width: i === spread ? 20 : 6, height: 6, borderRadius: 3, border: 'none',
                    background: i === spread ? '#40916c' : '#1e293b',
                    cursor: 'pointer', padding: 0, transition: 'width 0.2s, background 0.2s',
                  }} />
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 680px) {
          .pdf-book-desktop { display: none !important; }
          .pdf-book-mobile  { display: block !important; }
        }
      `}</style>
    </div>
  )
}
