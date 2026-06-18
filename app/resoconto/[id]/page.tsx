'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar from '@/components/Navbar'
import PhotoMosaic from '@/components/PhotoMosaic'
import RouteTimeline from '@/app/components/RouteTimeline'
import { getActivityById, type StoredActivity } from '@/lib/blobStore'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, FileDown, Pencil, Check, Loader2, Mountain, Clock, Route, Flame,
  Images, X, BookOpen, Share2, Copy, Link2Off, ExternalLink,
} from 'lucide-react'

const RouteMap3D    = dynamic(() => import('@/components/RouteMap3D'),    { ssr: false })
const RoutePhotoMap = dynamic(() => import('@/app/components/RoutePhotoMap'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface RoutePhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

interface HikeReport {
  id: string
  activity_id: string
  title: string
  content: string
  photos: { caption: string; lat?: number; lon?: number; progress: number }[]
  created_at: string
  updated_at: string
}

type ResocontoLength = 'breve' | 'media' | 'lunga'

// ── Markdown section parser ────────────────────────────────────────────────────

interface Section {
  title: string
  body: string
}

function parseSections(md: string): Section[] {
  const parts = md.split(/\n(?=## )/)
  return parts
    .map(part => {
      const nl = part.indexOf('\n')
      if (!part.startsWith('## ') || nl === -1) return null
      return {
        title: part.slice(3, nl).trim(),
        body:  part.slice(nl + 1).trim(),
      }
    })
    .filter((s): s is Section => s !== null)
}

// Photo slot is keyed by section title (not array position) so that omitting
// "Cronaca" (no questionnaire answered) doesn't shift the photos bound to the
// sections that follow it.
const SECTION_PHOTO_SLOT: Record<string, number> = {
  'Il percorso':     0,
  'Cronaca':         1,
  'Natura e storia': 2,
  'In sintesi':      3,
}

function slotFor(title: string, fallbackIndex: number): number {
  return SECTION_PHOTO_SLOT[title] ?? fallbackIndex
}

// ── Render body text — paragraphs + [curiosita] blocks ─────────────────────────

function RenderBody({ text }: { text: string }) {
  const parts = text.split(/(\[curiosita\][\s\S]*?\[\/curiosita\])/g)
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const m = part.match(/^\[curiosita\]([\s\S]*?)\[\/curiosita\]$/)
        if (m) {
          return (
            <blockquote key={i}
              className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r-xl font-lora text-sm italic text-stone-700 leading-relaxed">
              {m[1].trim()}
            </blockquote>
          )
        }
        return part.trim()
          ? <div key={i} className="space-y-2.5">
              {part.trim().split(/\n\n+/).map((p, j) => (
                <p key={j} className="font-lora text-[15px] leading-[1.8] text-stone-700">{p.trim()}</p>
              ))}
            </div>
          : null
      })}
    </div>
  )
}

// ── Section card ───────────────────────────────────────────────────────────────

const SECTION_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc']

function SectionCard({
  section,
  index,
  photo,
  photoIndex,
  floatNode,
}: {
  section: Section
  index: number
  photo?: RoutePhoto
  photoIndex?: number
  floatNode?: ReactNode
}) {
  const color = SECTION_COLORS[index % SECTION_COLORS.length]
  return (
    <article className="bg-white rounded-2xl shadow-sm overflow-hidden mb-5 print:rounded-none print:shadow-none print:mb-0 print:border-b print:border-stone-200">
      <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: color }}>
        <span className="font-barlow text-[11px] font-bold tracking-[2px] uppercase text-white/70">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="font-barlow text-lg font-bold tracking-wide uppercase text-white leading-tight">
          {section.title}
        </h2>
      </div>

      <div className="p-6 print-columns-2">
        {floatNode}
        {photo && (
          <div className="float-right ml-5 mb-3 w-44 print:w-40 print:ml-4 shrink-0 hidden md:block print:block">
            <div className="relative">
              {photoIndex !== undefined && (
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-barlow z-10">
                  {photoIndex}
                </span>
              )}
              <img src={photo.dataUrl} alt={photo.caption}
                className="w-full aspect-[4/3] object-cover rounded-xl shadow-md print:rounded-lg" />
            </div>
            {photo.caption && (
              <p className="font-lora text-[10px] italic text-stone-400 mt-1 text-center leading-snug">
                {photoIndex !== undefined ? `${photoIndex}. ` : ''}{photo.caption}
              </p>
            )}
          </div>
        )}
        <RenderBody text={section.body} />
      </div>
    </article>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ResocontoPage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)

  const [activity,    setActivity]    = useState<StoredActivity | null>(null)
  const [report,      setReport]      = useState<HikeReport | null>(null)
  const [photos,      setPhotos]      = useState<RoutePhoto[]>([])
  const [content,     setContent]     = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [isEditing,   setIsEditing]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)
  const [length,      setLength]      = useState<ResocontoLength>('media')
  const [show3D,      setShow3D]      = useState(false)
  const [lightbox,    setLightbox]    = useState<RoutePhoto | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [coverPhotoId,  setCoverPhotoId]  = useState<string | null>(null)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  const [showShare,     setShowShare]     = useState(false)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'none' | 'in_progress' | 'completed' | 'skipped'>('none')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load activity + report + photos
  useEffect(() => {
    Promise.all([
      getActivityById(id),
      fetch(`/api/resoconto?activityId=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null),
      fetch(`/api/questionnaire?activityId=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null),
    ]).then(([act, rep, questionnaire]) => {
      if (!act) { router.push('/'); return }
      setActivity(act)
      if (rep) {
        setReport(rep)
        setContent(rep.content ?? '')
      }
      setQuestionnaireStatus(questionnaire?.status ?? 'none')
    }).finally(() => setLoading(false))

    // Load photos from localStorage, sorted start→end by progress
    try {
      const raw = localStorage.getItem(`dtrek_vp_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as RoutePhoto[]
        setPhotos([...parsed].sort((a, b) => a.progress - b.progress))
      }
    } catch { /* ignore */ }

    // Load cover photo preference
    const savedCover = localStorage.getItem(`dtrek_cover_${id}`)
    if (savedCover) setCoverPhotoId(savedCover)

    // Load existing PDF URL
    fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (d.share_pdf_url) setSharePdfUrl(d.share_pdf_url) })
      .catch(() => null)
  }, [id, router])

  // Auto-save debounce when editing
  useEffect(() => {
    if (!isEditing || !content || generating) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveContent(content)
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content, isEditing, generating]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveContent = useCallback(async (text: string) => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await fetch('/api/resoconto', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: id, content: text }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } finally {
      setSaving(false)
    }
  }, [id])

  const generateReport = useCallback(async () => {
    if (!activity) return
    setGenerating(true)
    setContent('')
    setApiError(null)
    const photoMeta = photos.map(p => ({
      caption:    p.caption,
      lat:        p.lat,
      lon:        p.lon,
      progress:   p.progress,
      hasExifGps: p.hasExifGps,
    }))

    try {
      const res = await fetch('/api/resoconto', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activityId: id, length, photos: photoMeta }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 402) {
          setApiError('Aggiungi la tua chiave API Claude nelle impostazioni per usare questa funzione.')
        } else {
          setApiError(err.message ?? 'Errore durante la generazione.')
        }
        return
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setContent(full)
      }
    } catch {
      setApiError('Errore di rete. Riprova.')
    } finally {
      setGenerating(false)
    }
  }, [activity, id, length, photos])

  if (loading) return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento resoconto…</span>
      </div>
    </div>
  )
  if (!activity) return null

  const sections  = parseSections(content)
  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null
  const dateStr   = activity.startTime
    ? format(new Date(activity.startTime), "d MMMM yyyy", { locale: it })
    : ''

  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── Nav ── */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200 print:hidden">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <button onClick={() => router.push(`/escursione/${encodeURIComponent(id)}`)}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Escursione</span>
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-forest-600 shrink-0" />
            <span className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm truncate">
              Resoconto
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowShare(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showShare ? 'bg-forest-100 text-forest-700' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'}`}>
              <Share2 className="w-4 h-4" /> Pubblica PDF
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm font-medium transition-colors">
              <FileDown className="w-4 h-4" /> Stampa PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Share panel ── */}
      {showShare && (
        <div className="bg-white border-b border-stone-100 print:hidden">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
            {sharePdfUrl ? (
              <>
                <a href={`/leggi/r/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                </a>
                <button
                  onClick={async () => {
                    const viewerUrl = `${window.location.origin}/leggi/r/${encodeURIComponent(id)}`
                    await navigator.clipboard.writeText(viewerUrl)
                    setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                </button>
                <a href={sharePdfUrl} target="_blank" rel="noopener noreferrer" download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-barlow font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> PDF diretto
                </a>
                <button
                  onClick={async () => {
                    await fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`, { method: 'DELETE' })
                    setSharePdfUrl(null)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-barlow font-bold uppercase tracking-wide hover:bg-red-50 transition-colors">
                  <Link2Off className="w-3.5 h-3.5" /> Disattiva
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-500 font-lora italic">
                  Genera un PDF con le foto e pubblicalo online.
                </p>
                {publishError && (
                  <p className="text-xs text-red-500">{publishError}</p>
                )}
                <button
                  disabled={publishing || !content}
                  onClick={async () => {
                    if (!activity) return
                    setPublishing(true); setPublishError(null)
                    try {
                      const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
                      const sb = getBrowserSupabase()
                      const { data: { user } } = await sb.auth.getUser()
                      if (!user) throw new Error('Non autenticato')

                      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
                      const printRoot = document.getElementById('resoconto-print-root')
                      if (!printRoot) throw new Error('Layout non trovato')

                      // Clone into an off-screen white host so the paginator can
                      // measure layout and break at safe section boundaries.
                      const host = document.createElement('div')
                      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'
                      const clone = printRoot.cloneNode(true) as HTMLElement
                      clone.style.cssText = 'width:794px;background:#fff;font-family:Georgia,serif'
                      host.appendChild(clone)
                      document.body.appendChild(host)
                      await nextLayout()

                      let blob: Blob
                      try {
                        blob = await paginateToPdf([clone])
                      } finally {
                        document.body.removeChild(host)
                      }

                      const { uploadReportPdf } = await import('@/lib/pdfUpload')
                      const url = await uploadReportPdf(user.id, id, blob)

                      await fetch('/api/share-report', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ activityId: id, sharePdfUrl: url }),
                      })
                      setSharePdfUrl(url)
                    } catch (e) {
                      setPublishError(String(e))
                    } finally {
                      setPublishing(false)
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                  {publishing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generazione PDF…</>
                    : <><Share2 className="w-3.5 h-3.5" /> Genera e pubblica</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="relative w-full overflow-hidden print:h-[220px]"
        style={{ height: 'clamp(220px, 38vw, 420px)' }}>
        {heroPhoto
          ? <img src={heroPhoto.dataUrl} alt=""
              className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 max-w-5xl mx-auto">
          <h1 className="font-barlow text-3xl sm:text-5xl font-black text-white leading-tight uppercase tracking-tight drop-shadow-lg mb-2">
            {activity.title ?? activity.notes ?? 'Escursione'}
          </h1>
          {dateStr && (
            <p className="font-lora text-sm italic text-white/80">{dateStr}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { icon: <Route className="w-3 h-3" />, v: `${(activity.distanceMeters / 1000).toFixed(1)} km` },
              { icon: <Mountain className="w-3 h-3" />, v: `${activity.elevationGain.toFixed(0)} m D+` },
              { icon: <Clock className="w-3 h-3" />, v: formatDuration(activity.totalTimeSeconds) },
              ...(activity.calories > 0 ? [{ icon: <Flame className="w-3 h-3" />, v: `${activity.calories} kcal` }] : []),
            ].map(({ icon, v }) => (
              <span key={v} className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-white font-barlow tracking-wide">
                {icon} {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Photo mosaic ── */}
      {photos.length >= 2 && (
        <PhotoMosaic
          photos={photos.slice(1, 5).map(ph => ({ id: ph.id, url: ph.dataUrl, alt: ph.caption }))}
          onPhotoClick={photoId => {
            const ph = photos.find(p => p.id === photoId)
            if (ph) setLightbox(ph)
          }}
        />
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 print:max-w-full print:px-0">

        {/* ── Controls ── */}
        <div className="mb-6 print:hidden">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm mb-1">
                  {content ? 'Genera nuovo resoconto' : 'Genera il tuo resoconto'}
                </p>
                <p className="text-xs text-stone-400 font-lora italic">
                  {photos.length > 0
                    ? `${photos.length} foto disponibili · L'AI userà le tue immagini`
                    : 'Aggiungi foto dalla mappa 3D per un resoconto più ricco'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Length selector */}
                <div className="flex rounded-xl overflow-hidden border border-stone-200">
                  {(['breve', 'media', 'lunga'] as const).map(l => (
                    <button key={l} onClick={() => setLength(l)}
                      className={`px-3 py-1.5 text-xs font-barlow font-bold uppercase tracking-wide transition-colors
                        ${length === l
                          ? 'bg-forest-600 text-white'
                          : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* 3D map button */}
                <button onClick={() => setShow3D(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                  <Images className="w-3.5 h-3.5" /> Mappa 3D
                </button>

                {/* Guided questionnaire entry point */}
                <button onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}/racconta`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-forest-200 text-xs font-barlow font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                  {questionnaireStatus === 'in_progress' ? 'Riprendi il racconto guidato' : 'Racconta il tuo percorso'}
                </button>

                {/* Generate button */}
                <button onClick={generateReport} disabled={generating}
                  className="flex items-center gap-2 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-barlow font-bold uppercase tracking-wide transition-colors">
                  {generating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</>
                    : <><BookOpen className="w-4 h-4" /> Genera</>
                  }
                </button>
              </div>
            </div>

            {apiError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {apiError}
              </div>
            )}

            {/* Cover photo picker */}
            {photos.length > 0 && (
              <div className="border-t border-stone-100 pt-4 mt-4">
                <p className="font-barlow text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
                  Immagine di copertina
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map(ph => (
                    <button key={ph.id}
                      onClick={() => {
                        setCoverPhotoId(ph.id)
                        localStorage.setItem(`dtrek_cover_${id}`, ph.id)
                      }}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                        (coverPhotoId ?? photos[0]?.id) === ph.id
                          ? 'border-amber-400 shadow-md'
                          : 'border-transparent hover:border-stone-300'
                      }`}>
                      <img src={ph.dataUrl} alt={ph.caption} className="w-16 h-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Empty state ── */}
        {!content && !generating && (
          <div className="flex flex-col items-center py-20 text-stone-400 print:hidden">
            <BookOpen className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-barlow uppercase tracking-wide text-sm">Nessun resoconto ancora</p>
            <p className="font-lora text-sm italic mt-1">Clicca "Genera" per creare il tuo racconto</p>
          </div>
        )}

        {/* ── Streaming indicator ── */}
        {generating && !sections.length && (
          <div className="flex items-center gap-3 py-8 text-stone-500 print:hidden">
            <Loader2 className="w-5 h-5 animate-spin text-forest-500" />
            <span className="font-lora italic text-sm">Giulia sta scrivendo il tuo resoconto…</span>
          </div>
        )}

        {/* ── Edit / view toggle ── */}
        {content && (
          <div className="flex items-center justify-between mb-5 print:hidden">
            <div className="flex items-center gap-2">
              {report?.updated_at && (
                <span className="font-lora text-xs italic text-stone-400">
                  Salvato {format(new Date(report.updated_at), "d MMM · HH:mm", { locale: it })}
                </span>
              )}
              {saving && (
                <span className="flex items-center gap-1 font-lora text-xs italic text-stone-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
                </span>
              )}
              {saveOk && (
                <span className="flex items-center gap-1 font-lora text-xs text-forest-600">
                  <Check className="w-3 h-3" /> Salvato
                </span>
              )}
            </div>
            <button
              onClick={() => {
                if (isEditing) { saveContent(content); setIsEditing(false) }
                else setIsEditing(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
              {isEditing
                ? <><Check className="w-3.5 h-3.5" /> Fatto</>
                : <><Pencil className="w-3.5 h-3.5" /> Modifica</>
              }
            </button>
          </div>
        )}

        {/* ── Edit textarea ── */}
        {isEditing && (
          <div className="mb-6 print:hidden">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={30}
              className="w-full bg-white border border-stone-200 rounded-2xl p-5 font-mono text-sm text-stone-700 leading-relaxed outline-none focus:border-forest-400 resize-y shadow-sm"
              placeholder="Scrivi il resoconto in Markdown…"
            />
          </div>
        )}

        {/* ── Rendered sections ── */}
        {!isEditing && (() => {
          const miniMapNode = activity.trackPoints.length > 4 ? (
            <div className="float-right ml-5 mb-4 w-52 shrink-0 hidden md:block print:block">
              <div className="bg-stone-50 rounded-xl border border-stone-200 overflow-hidden shadow-sm">
                <RoutePhotoMap
                  trackPoints={activity.trackPoints}
                  photos={photos}
                  height="170px"
                />
                {photos.length > 0 && (
                  <div className="px-2 pt-1 pb-2 space-y-0.5">
                    {photos.slice(0, 7).map((ph, i) => (
                      <div key={ph.id} className="flex items-center gap-1.5">
                        <span className="w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shrink-0 font-barlow">
                          {i + 1}
                        </span>
                        <span className="font-lora text-[9px] text-stone-500 truncate">{ph.caption}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : undefined

          return (
            <>
              {sections.map((section, i) => {
                const slot = slotFor(section.title, i)
                return (
                  <SectionCard
                    key={i}
                    section={section}
                    index={i}
                    photo={slot === 0 ? undefined : photos[slot]}
                    photoIndex={slot === 0 ? undefined : slot + 1}
                    floatNode={slot === 0 ? miniMapNode : undefined}
                  />
                )
              })}

              {/* ── Elevation profile with photo markers — end of report ── */}
              {sections.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-5 print:rounded-none print:shadow-none print:border-0 print:border-t print:border-stone-200">
                  <h3 className="font-barlow font-bold uppercase tracking-[2px] text-xs text-stone-400 mb-3">
                    Profilo altimetrico
                  </h3>
                  <RouteTimeline trackPoints={activity.trackPoints} photos={photos} />
                </div>
              )}
            </>
          )
        })()}

        {/* ── Raw streaming text (before first section parsed) ── */}
        {generating && !sections.length && content && (
          <div className="bg-white rounded-2xl shadow-sm p-6 print:hidden">
            <p className="font-lora text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
        )}

        {/* ── Photo gallery (screen only) ── */}
        {photos.length > 0 && content && (
          <section className="mt-8 print:hidden">
            <h3 className="font-barlow font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">
              Le tue foto
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {photos.map((ph, i) => (
                <button key={ph.id} onClick={() => setLightbox(ph)}
                  className="shrink-0 w-36 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                  <div className="relative">
                    <img src={ph.dataUrl} alt={ph.caption}
                      className="w-36 h-28 object-cover group-hover:scale-105 transition-transform duration-300" />
                    <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-barlow">
                      {i + 1}
                    </span>
                  </div>
                  {ph.caption && (
                    <p className="px-2 py-1.5 font-lora text-[10px] italic text-stone-500 leading-snug bg-white">
                      {i + 1}. {ph.caption}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Print-only photo grid ── */}
        {photos.length > 0 && content && (
          <section className="hidden print:block mt-6 pt-4 border-t border-stone-200">
            <h3 className="font-barlow font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">
              Documentazione fotografica
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {photos.map((ph, i) => (
                <div key={ph.id} style={{ breakInside: 'avoid' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={ph.dataUrl} alt={ph.caption}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
                    <span style={{
                      position: 'absolute', top: 6, left: 6,
                      width: 18, height: 18, background: '#f59e0b', color: 'white',
                      borderRadius: '50%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 8, fontWeight: 'bold',
                      border: '2px solid white',
                    }}>
                      {i + 1}
                    </span>
                  </div>
                  {ph.caption && (
                    <p style={{ fontSize: 9, color: '#78716c', fontStyle: 'italic',
                      marginTop: 4, textAlign: 'center', lineHeight: 1.4 }}>
                      {i + 1}. {ph.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* ── 3D Map overlay ── */}
      {show3D && (
        <RouteMap3D
          trackPoints={activity.trackPoints}
          title={activity.title ?? activity.notes}
          onClose={() => setShow3D(false)}
          activityId={activity.id}
          distanceMeters={activity.distanceMeters}
          elevationGain={activity.elevationGain}
        />
      )}

      {/* ── Hidden PDF root (for html2pdf capture) ── */}
      {content && (
        <div id="resoconto-print-root"
          style={{ position: 'fixed', left: '-9999px', top: 0, width: 794, background: 'white', fontFamily: 'Georgia, serif' }}>
          {/* Hero */}
          <div className="pdf-block" style={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden', marginBottom: 0 }}>
            {heroPhoto
              ? <img src={heroPhoto.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1b4332,#40916c)' }} />
            }
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 32px' }}>
              <h1 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 28, fontWeight: 900, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
                {activity.title ?? activity.notes ?? 'Escursione'}
              </h1>
              {dateStr && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', fontStyle: 'italic' }}>{dateStr}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {[
                  `${(activity.distanceMeters / 1000).toFixed(1)} km`,
                  `${activity.elevationGain.toFixed(0)} m D+`,
                  formatDuration(activity.totalTimeSeconds),
                ].map(v => (
                  <span key={v} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontFamily: 'Arial, sans-serif' }}>{v}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Sections */}
          <div style={{ padding: '32px 32px 0' }}>
            {sections.map((section, i) => {
              const slot = slotFor(section.title, i)
              const sectionPhoto = photos[slot]
              return (
                <div key={i} className="pdf-block" style={{ marginBottom: 24 }}>
                  <div style={{ background: ['#2d6a4f','#40916c','#74c69d','#b7e4c7','#d8f3dc'][i % 5], padding: '6px 16px', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i+1).padStart(2,'0')}</span>
                    <span style={{ fontSize: 14, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 1 }}>{section.title}</span>
                  </div>
                  <div style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                    {sectionPhoto && slot > 0 && (
                      <div style={{ float: 'right', marginLeft: 12, marginBottom: 8, width: 120 }}>
                        <div style={{ position: 'relative' }}>
                          <img src={sectionPhoto.dataUrl} alt={sectionPhoto.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                          <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#f59e0b', color: 'white', borderRadius: '50%', fontSize: 8, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box' }}>{slot+1}</span>
                        </div>
                        <p style={{ fontSize: 8, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{sectionPhoto.caption}</p>
                      </div>
                    )}
                    {section.body.split(/\n\n+/).map((p, j) => (
                      <p key={j} style={{ fontSize: 11, lineHeight: 1.7, color: '#374151', margin: '0 0 8px' }}>{p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()}</p>
                    ))}
                  </div>
                </div>
              )
            })}
            {/* Photo grid */}
            {photos.length > 0 && (
              <div className="pdf-block" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
                <h3 style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }}>Documentazione fotografica</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {photos.map((ph, i) => (
                    <div key={ph.id} className="pdf-block">
                      <div style={{ position: 'relative' }}>
                        <img src={ph.dataUrl} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                        <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#f59e0b', color: 'white', borderRadius: '50%', fontSize: 7, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                      </div>
                      {ph.caption && <p style={{ fontSize: 8, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{i+1}. {ph.caption}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 print:hidden"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.caption}
              className="w-full rounded-2xl shadow-2xl" />
            {lightbox.caption && (
              <p className="font-lora text-sm italic text-white/70 text-center mt-3">
                {lightbox.caption}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
