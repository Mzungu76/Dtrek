'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import PhotoMosaic from '@/components/PhotoMosaic'
import { getActivityById, type StoredActivity } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  parseSections, markdownToSections, sectionsToMarkdown, SCAFFOLD_SECTIONS,
  type ReportSection, type ReportAuthoredBy,
} from '@/lib/reportStore'
import ManualEditor from '@/app/components/ManualEditor'
import {
  FileDown, Pencil, Check, Loader2,
  Images, BookOpen, Share2, Copy, Link2Off, ExternalLink,
} from 'lucide-react'
import { HeroSection } from './HeroSection'
import { ReportSections } from './ReportSections'
import { PhotoGallery } from './PhotoGallery'
import { PrintPhotoGrid } from './PrintPhotoGrid'
import { HiddenPdfRoot } from './HiddenPdfRoot'
import { PhotoLightbox } from './PhotoLightbox'

const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

interface HikeReport {
  id: string
  activity_id: string
  title: string
  content: string
  photos: { caption: string; lat?: number; lon?: number; progress: number }[]
  sections?: ReportSection[] | null
  authored_by?: ReportAuthoredBy
  created_at: string
  updated_at: string
}

type ResocontoLength = 'breve' | 'media' | 'lunga'

// ── Main page ──────────────────────────────────────────────────────────────────

export default function RacconContent({ activityId }: { activityId: string }) {
  const router = useRouter()
  const id = activityId

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
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [coverPhotoId,  setCoverPhotoId]  = useState<string | null>(null)
  const [sharePdfUrl,   setSharePdfUrl]   = useState<string | null>(null)
  const [showShare,     setShowShare]     = useState(false)
  const [copyOk,        setCopyOk]        = useState(false)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)
  const [questionnaireStatus, setQuestionnaireStatus] = useState<'none' | 'in_progress' | 'completed' | 'skipped'>('none')
  const [editorMode,       setEditorMode]       = useState<'view' | 'manual'>('view')
  const [showAiPanel,      setShowAiPanel]      = useState(true)
  const [reportSections,   setReportSections]   = useState<ReportSection[]>([])
  const [reportAuthoredBy, setReportAuthoredBy] = useState<ReportAuthoredBy>('ai')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load activity + report + photos
  useEffect(() => {
    Promise.all([
      getActivityById(id),
      fetch(`/api/resoconto?activityId=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null),
      fetch(`/api/questionnaire?activityId=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null),
    ]).then(([act, rep, questionnaire]) => {
      if (!act) { router.push('/resoconto'); return }
      setActivity(act)
      if (rep) {
        setReport(rep)
        setContent(rep.content ?? '')
        if (Array.isArray(rep.sections) && rep.sections.length > 0) setReportSections(rep.sections)
        setReportAuthoredBy(rep.authored_by ?? 'ai')
        if (rep.content) setShowAiPanel(false)
      }
      setQuestionnaireStatus(questionnaire?.status ?? 'none')
    }).finally(() => setLoading(false))

    // Load photos (server, sorted start→end by progress; migra automaticamente da localStorage)
    fetchActivityPhotos(id)
      .then(setPhotos)
      .catch(() => setPhotosError('Impossibile caricare le foto di questa escursione.'))

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

  const saveSections = useCallback(async (sections: ReportSection[], authoredBy: ReportAuthoredBy) => {
    const newContent = sectionsToMarkdown(sections)
    const res = await fetch('/api/resoconto', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ activityId: id, content: newContent, sections, authoredBy }),
    })
    if (!res.ok) { console.error('Salvataggio sezioni fallito', await res.text().catch(() => '')); return }
    setReportSections(sections)
    setReportAuthoredBy(authoredBy)
    setContent(newContent)
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
    <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
      <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento resoconto…</span>
    </div>
  )
  if (!activity) return null

  const sections  = parseSections(content)
  const heroPhoto = photos.find(p => p.id === coverPhotoId) ?? photos[0] ?? null
  const dateStr   = activity.startTime
    ? format(new Date(activity.startTime), "d MMMM yyyy", { locale: it })
    : ''

  return (
    <div>

      {/* ── Nav ── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200 print:hidden">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-forest-600 shrink-0" />
            <span className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm truncate">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-display font-bold uppercase tracking-wide transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                </a>
                <button
                  onClick={async () => {
                    const viewerUrl = `${window.location.origin}/leggi/r/${encodeURIComponent(id)}`
                    await navigator.clipboard.writeText(viewerUrl)
                    setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                </button>
                <a href={sharePdfUrl} target="_blank" rel="noopener noreferrer" download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-display font-bold uppercase tracking-wide hover:bg-stone-50 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" /> PDF diretto
                </a>
                <button
                  onClick={async () => {
                    await fetch(`/api/share-report?activityId=${encodeURIComponent(id)}`, { method: 'DELETE' })
                    setSharePdfUrl(null)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-display font-bold uppercase tracking-wide hover:bg-red-50 transition-colors">
                  <Link2Off className="w-3.5 h-3.5" /> Disattiva
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-500 font-body italic">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-display font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
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

      <HeroSection activity={activity} heroPhoto={heroPhoto} dateStr={dateStr} />

      {photosError && (
        <div className="max-w-5xl mx-auto px-4 pt-4 print:hidden">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{photosError}</p>
        </div>
      )}

      {/* ── Photo mosaic ── */}
      {photos.length >= 2 && (
        <PhotoMosaic
          photos={photos.slice(1, 5).map(ph => ({ id: ph.id, url: ph.url, alt: ph.caption }))}
          onPhotoClick={photoId => {
            const ph = photos.find(p => p.id === photoId)
            if (ph) setLightbox(ph)
          }}
        />
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 print:max-w-full print:px-0">

        {/* ── Controls ── */}
        {editorMode === 'view' && content && (
          <button onClick={() => setShowAiPanel(s => !s)}
            className="flex items-center gap-1.5 mb-3 text-xs font-display font-bold uppercase tracking-wide text-stone-500 hover:text-stone-700 transition-colors print:hidden">
            Genera / rigenera con AI {showAiPanel ? '▲' : '▼'}
          </button>
        )}
        {editorMode === 'view' && content && showAiPanel && (
        <div className="mb-6 print:hidden">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm mb-1">
                  {content ? 'Genera nuovo resoconto' : 'Genera il tuo resoconto'}
                </p>
                <p className="text-xs text-stone-400 font-body italic">
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
                      className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors
                        ${length === l
                          ? 'bg-forest-600 text-white'
                          : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* 3D map button */}
                <button onClick={() => setShow3D(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                  <Images className="w-3.5 h-3.5" /> Mappa 3D
                </button>

                {/* Guided questionnaire entry point */}
                <button onClick={() => router.push(`/resoconto/${encodeURIComponent(id)}/racconta`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                  {questionnaireStatus === 'in_progress' ? 'Riprendi il racconto guidato' : 'Racconta il tuo percorso'}
                </button>

                {/* Generate button */}
                <button onClick={generateReport} disabled={generating}
                  className="flex items-center gap-2 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
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
                <p className="font-display text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">
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
                      <img src={ph.url} alt={ph.caption} className="w-16 h-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Empty state ── */}
        {!content && !generating && editorMode === 'view' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-8 print:hidden">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col items-start">
              <Pencil className="w-10 h-10 text-stone-400 mb-3" />
              <p className="font-display font-bold uppercase tracking-wide text-stone-700 mb-2">Scrivi tu</p>
              <p className="text-sm text-stone-500 font-body italic mb-4">
                Costruisci il resoconto sezione per sezione, con le tue parole. Puoi richiedere aiuto
                all&apos;AI su singoli paragrafi e associare le tue foto.
              </p>
              <button
                onClick={() => {
                  setReportSections(SCAFFOLD_SECTIONS)
                  setReportAuthoredBy('manual')
                  setEditorMode('manual')
                }}
                className="mt-auto flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
                Inizia a scrivere
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex flex-col items-start">
              <BookOpen className="w-10 h-10 text-forest-400 mb-3" />
              <p className="font-display font-bold uppercase tracking-wide text-stone-700 mb-2">Genera con AI</p>
              <p className="text-sm text-stone-500 font-body italic mb-4">
                L&apos;AI scrive un reportage giornalistico completo basato sui tuoi dati GPS,
                biometrici e foto.
              </p>
              <div className="flex items-center gap-2 mt-auto flex-wrap">
                <div className="flex rounded-xl overflow-hidden border border-stone-200">
                  {(['breve', 'media', 'lunga'] as const).map(l => (
                    <button key={l} onClick={() => setLength(l)}
                      className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-colors
                        ${length === l ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <button onClick={generateReport} disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white rounded-xl text-sm font-display font-bold uppercase tracking-wide transition-colors">
                  {generating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generazione…</>
                    : <><BookOpen className="w-4 h-4" /> Genera</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Manual editor ── */}
        {editorMode === 'manual' && (
          <ManualEditor
            activityId={id}
            activity={activity}
            photos={photos}
            onPhotosChange={setPhotos}
            initialSections={reportSections}
            initialAuthoredBy={reportAuthoredBy}
            onSave={saveSections}
            onCancel={() => setEditorMode('view')}
            saving={saving}
          />
        )}

        {/* ── Streaming indicator ── */}
        {editorMode === 'view' && generating && !sections.length && (
          <div className="flex items-center gap-3 py-8 text-stone-500 print:hidden">
            <Loader2 className="w-5 h-5 animate-spin text-forest-500" />
            <span className="font-body italic text-sm">Giulia sta scrivendo il tuo resoconto…</span>
          </div>
        )}

        {/* ── Edit / view toggle ── */}
        {editorMode === 'view' && content && (
          <div className="flex items-center justify-between mb-5 print:hidden">
            <div className="flex items-center gap-2">
              {report?.updated_at && (
                <span className="font-body text-xs italic text-stone-400">
                  Salvato {format(new Date(report.updated_at), "d MMM · HH:mm", { locale: it })}
                </span>
              )}
              {saving && (
                <span className="flex items-center gap-1 font-body text-xs italic text-stone-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
                </span>
              )}
              {saveOk && (
                <span className="flex items-center gap-1 font-body text-xs text-forest-600">
                  <Check className="w-3 h-3" /> Salvato
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (reportSections.length > 0) {
                    setEditorMode('manual')
                  } else {
                    setReportSections(markdownToSections(content))
                    setReportAuthoredBy(reportAuthoredBy === 'ai' ? 'mixed' : reportAuthoredBy)
                    setEditorMode('manual')
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-200 text-xs font-display font-bold uppercase tracking-wide text-forest-700 hover:bg-forest-50 transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Editor strutturato
              </button>
              <button
                onClick={() => {
                  if (isEditing) { saveContent(content); setIsEditing(false) }
                  else setIsEditing(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-display font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                {isEditing
                  ? <><Check className="w-3.5 h-3.5" /> Fatto</>
                  : <><Pencil className="w-3.5 h-3.5" /> Modifica</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Edit textarea ── */}
        {editorMode === 'view' && isEditing && (
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
        {editorMode === 'view' && !isEditing && (
          <ReportSections activity={activity} photos={photos} sections={sections} />
        )}

        {/* ── Raw streaming text (before first section parsed) ── */}
        {editorMode === 'view' && generating && !sections.length && content && (
          <div className="bg-white rounded-2xl shadow-sm p-6 print:hidden">
            <p className="font-body text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
        )}

        {/* ── Photo gallery (screen only) ── */}
        {editorMode === 'view' && photos.length > 0 && content && (
          <PhotoGallery photos={photos} onPhotoClick={setLightbox} />
        )}

        {/* ── Print-only photo grid ── */}
        {editorMode === 'view' && photos.length > 0 && content && (
          <PrintPhotoGrid photos={photos} />
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
        <HiddenPdfRoot activity={activity} heroPhoto={heroPhoto} dateStr={dateStr} sections={sections} photos={photos} />
      )}

      {/* ── Lightbox ── */}
      {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}

    </div>
  )
}
