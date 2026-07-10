'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HubNavBar from '@/components/routehub/HubNavBar'
import { RailButton } from '@/components/routehub/SideRails'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  FileDown, Share2, Copy, Link2Off, ExternalLink,
  Loader2, Image as ImageIcon, BarChart2, X, Pencil,
  Lock, LockOpen, Eye, EyeOff,
} from 'lucide-react'
import { mapOutH } from '@/components/diario/chartUtils'
import { DiarioCover } from '@/components/diario/DiarioCover'
import { DiarioIndice } from '@/components/diario/DiarioIndice'
import { DiarioStubPage } from '@/components/diario/DiarioStubPage'
import { DiarioYearDivider } from '@/components/diario/DiarioYearDivider'
import { AnniversaryBanner } from '@/components/diario/AnniversaryBanner'
import { DiarioNatura } from '@/components/diario/DiarioNatura'
import { DiarioMappa } from '@/components/diario/DiarioMappa'
import { DiarioStatistiche } from '@/components/diario/DiarioStatistiche'
import { DiarioReportPage } from '@/components/diario/DiarioReportPage'
import type { DiaryReport, StatsToggles, ReportExtras, BookPage } from '@/components/diario/types'

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DiarioPage() {
  const [activities,   setActivities]   = useState<ActivityMeta[]>([])
  const [reports,      setReports]      = useState<DiaryReport[]>([])
  const [bookPages,    setBookPages]    = useState<BookPage[]>([])
  const [photosByAct,  setPhotosByAct]  = useState<Record<string, RoutePhoto[]>>({})
  const [trackPointsByAct, setTrackPointsByAct] = useState<Record<string, TrackPoint[]>>({})
  const [coverUrl,     setCoverUrl]     = useState<string | null>(null)
  const [mapImgUrl,    setMapImgUrl]    = useState<string | null>(null)
  const [ownerName,    setOwnerName]    = useState('')
  const [loading,      setLoading]      = useState(true)
  const [diaryPdfUrl,  setDiaryPdfUrl]  = useState<string | null>(null)
  const [diaryToken,   setDiaryToken]   = useState<string | null>(null)
  const [downloading,  setDownloading]  = useState(false)
  const [publishing,   setPublishing]   = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [copyOk,       setCopyOk]       = useState(false)
  const [showStatsMenu, setShowStatsMenu] = useState(false)
  const [showTextMenu,  setShowTextMenu]  = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [mapsInteractive, setMapsInteractive] = useState(false)
  const [showStubs, setShowStubs] = useState(true)
  const [statsToggles, setStatsToggles] = useState<StatsToggles>(() => {
    try { return JSON.parse(localStorage.getItem('dtrek_diary_stats') ?? '') }
    catch { return { totali: true, record: true, medie: true, andamento: true } }
  })
  const [reportExtras, setReportExtras] = useState<ReportExtras>(() => {
    const defaults: ReportExtras = { mappa: true, statistiche: true, grafico: true, cuore: true, velocita: true }
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('dtrek_diary_report_extras') ?? '') } }
    catch { return defaults }
  })
  const bookOuterRef = useRef<HTMLDivElement>(null)
  const bookInnerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [innerHeight, setInnerHeight] = useState(0)
  const [diaryTitle,    setDiaryTitle]    = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_title')    ?? 'DIARIO di VIAGGIO' } catch { return 'DIARIO di VIAGGIO' }
  })
  const [diarySubtitle, setDiarySubtitle] = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_subtitle') ?? 'I miei percorsi'   } catch { return 'I miei percorsi'   }
  })
  const [diaryAuthor,   setDiaryAuthor]   = useState<string>(() => {
    try { return localStorage.getItem('dtrek_diary_author')   ?? ''                  } catch { return ''                  }
  })
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/resoconto?all=true').then(r => r.ok ? r.json() : []),
      fetch('/api/diary-token').then(r => r.ok ? r.json() : {}),
      getUserSettingsCached(),
    ]).then(async ([acts, reps, dt, us]) => {
      const sortedActs = (acts as ActivityMeta[]).sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setActivities(sortedActs)

      const sortedReps = Array.isArray(reps) ? [...reps].sort((a: DiaryReport, b: DiaryReport) =>
        new Date(a.activity?.start_time ?? a.created_at).getTime() -
        new Date(b.activity?.start_time ?? b.created_at).getTime()
      ) : []
      setReports(sortedReps)

      const reportedIds = new Set(sortedReps.map((r: DiaryReport) => r.activity_id))
      const unreportedActivities = sortedActs.filter(a => !reportedIds.has(a.id))
      const pages: BookPage[] = [
        ...sortedReps.map((rep: DiaryReport): BookPage => ({
          kind: 'report', startTime: rep.activity?.start_time ?? rep.created_at, report: rep,
        })),
        ...unreportedActivities.map((a): BookPage => ({
          kind: 'stub', startTime: a.startTime, activity: a,
        })),
      ].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setBookPages(pages)

      // Load diary PDF url and viewer token
      const dtData = dt as { diary_pdf_url?: string | null; diary_token?: string | null }
      if (dtData.diary_pdf_url) setDiaryPdfUrl(dtData.diary_pdf_url)
      if (dtData.diary_token)   setDiaryToken(dtData.diary_token)

      // Owner name
      const usData = us as { display_name?: string; name?: string }
      const name = usData.display_name ?? usData.name ?? ''
      setOwnerName(name)

      // Default author from profile if user hasn't set one
      try {
        if (!localStorage.getItem('dtrek_diary_author') && name) setDiaryAuthor(name)
      } catch { /* ignore */ }

      // Load cover photo from localStorage
      const cover = localStorage.getItem('dtrek_diary_cover')
      if (cover) setCoverUrl(cover)

      // Core data (activities/reports/pages) is ready — show the book now
      // rather than waiting for every report's photos and full trackpoints to
      // load too. Those are fetched below in the background and populate the
      // charts/photos progressively as they arrive, instead of blocking the
      // initial render (which used to make opening the diary feel very slow
      // once there were many reports).
      setLoading(false)

      // Load photos for each activity from the server (migra automaticamente da localStorage se serve)
      Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, RoutePhoto[]]> => {
        try {
          return [rep.activity_id, await fetchActivityPhotos(rep.activity_id)]
        } catch {
          return [rep.activity_id, []]
        }
      })).then(photoEntries => {
        const byAct: Record<string, RoutePhoto[]> = {}
        photoEntries.forEach(([activityId, photos]) => { if (photos.length) byAct[activityId] = photos })
        setPhotosByAct(byAct)
      })

      // Load full trackPoints per reported activity for the elevation/HR/speed charts
      Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, TrackPoint[]]> => {
        try {
          const full = await getActivityById(rep.activity_id)
          return [rep.activity_id, full?.trackPoints ?? []]
        } catch {
          return [rep.activity_id, []]
        }
      })).then(trackPointEntries => {
        const tpByAct: Record<string, TrackPoint[]> = {}
        trackPointEntries.forEach(([activityId, tps]) => { if (tps.length) tpByAct[activityId] = tps })
        setTrackPointsByAct(tpByAct)
      })

      // Pre-generate a tiled raster map for native browser printing (Ctrl+P) —
      // our own PDF export path fetches a fresh one instead, ignoring this.
      import('@/utils/pdfExport').then(({ fetchAllRoutesSatMap, mapBoxAspect }) => {
        const allPts = sortedActs.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
        return fetchAllRoutesSatMap(sortedActs, 660, mapOutH(mapBoxAspect(allPts, 0.12)))
      }).then(img => { if (img) setMapImgUrl(img) })
    }).catch(() => setLoading(false))
  }, [])

  function toggleStat(key: keyof StatsToggles) {
    setStatsToggles(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('dtrek_diary_stats', JSON.stringify(next))
      return next
    })
  }

  function toggleReportExtra(key: keyof ReportExtras) {
    setReportExtras(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('dtrek_diary_report_extras', JSON.stringify(next))
      return next
    })
  }

  // Scale the fixed-794px book to fit the viewport, like a responsive PDF viewer —
  // recalculated on resize and whenever content height changes (photos load async).
  useLayoutEffect(() => {
    if (loading) return
    const outer = bookOuterRef.current
    const inner = bookInnerRef.current
    if (!outer || !inner) return

    function recalc() {
      const outerWidth = outer!.clientWidth
      setScale(Math.min(1, outerWidth / 794))
      setInnerHeight(inner!.scrollHeight)
    }
    recalc()

    const ro = new ResizeObserver(recalc)
    ro.observe(outer)
    ro.observe(inner)
    window.addEventListener('resize', recalc)
    return () => { ro.disconnect(); window.removeEventListener('resize', recalc) }
  }, [loading, bookPages, showStubs, activities, statsToggles, reportExtras, trackPointsByAct])

  const visibleBookPages = useMemo(
    () => showStubs ? bookPages : bookPages.filter(p => p.kind !== 'stub'),
    [bookPages, showStubs]
  )

  const reportNumbers = useMemo(() => {
    const m = new Map<string, number>()
    let n = 0
    visibleBookPages.forEach(p => { if (p.kind === 'report') { n++; m.set(p.report.id, n) } })
    return m
  }, [visibleBookPages])

  function handleCoverUpload(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const url = e.target?.result as string
      setCoverUrl(url)
      localStorage.setItem('dtrek_diary_cover', url)
    }
    reader.readAsDataURL(file)
  }

  async function generateAndUploadPdf(download = false) {
    const key = download ? setDownloading : setPublishing
    key(true); setPublishError(null)
    try {
      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
      const { fetchAllRoutesSatMap, fetchSatMap, mapBoxAspect } = await import('@/utils/pdfExport')
      const allPts = activities.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
      const mapForPdf = mapImgUrl || await fetchAllRoutesSatMap(activities, 660, mapOutH(mapBoxAspect(allPts, 0.12))) || null

      const actById = new Map(activities.map(a => [a.id, a]))
      const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']

      const host = document.createElement('div')
      host.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'

      const clones: HTMLElement[] = []
      const reportPages = Array.from(
        document.querySelectorAll<HTMLElement>('#diario-book .diario-page')
      ).filter(p => !p.classList.contains('diario-stub-page'))

      // Clone all pages first (cheap, synchronous) and collect the per-report
      // map fetches needed, without awaiting them yet — they're fired off
      // together below with limited concurrency instead of one-at-a-time,
      // which is what made publishing scale linearly (and badly) with the
      // number of reports.
      const mapTasks: { el: HTMLElement; pts: [number, number][]; color: string }[] = []

      for (const p of reportPages) {
        const clone = p.cloneNode(true) as HTMLElement
        clone.style.margin = '0'
        clone.style.boxShadow = 'none'
        // Remove OSM tile canvases (cross-origin tainted by live Leaflet tiles);
        // both the global and per-report maps get replaced with fresh rasterized
        // tile images fetched directly (no canvas, no CORS taint).
        clone.querySelectorAll('canvas').forEach(c => c.remove())
        const globalMapWrapper = clone.querySelector<HTMLElement>('.diario-global-map')
        if (globalMapWrapper) {
          globalMapWrapper.innerHTML = ''
          globalMapWrapper.style.height = 'auto'
          if (mapForPdf) {
            const img = document.createElement('img')
            img.src = mapForPdf
            img.style.cssText = 'width:100%;border-radius:12px;display:block'
            globalMapWrapper.appendChild(img)
          }
        }
        const reportMapEls = clone.querySelectorAll<HTMLElement>('.diario-report-map')
        for (const el of Array.from(reportMapEls)) {
          const actId = el.dataset.activityId
          const act = actId ? actById.get(actId) : undefined
          el.innerHTML = ''
          el.style.height = 'auto'
          if (act?.routePolyline && act.routePolyline.length > 1) {
            const idx = activities.indexOf(act)
            mapTasks.push({ el, pts: act.routePolyline, color: PALETTE[idx % PALETTE.length] })
          }
        }
        clone.querySelectorAll<HTMLElement>('img[alt="Mappa percorsi"]').forEach(i => {
          i.style.display = 'none'
        })
        host.appendChild(clone)
        clones.push(clone)
      }

      // Fetch report maps in parallel, capped at 5 concurrent requests so we
      // don't hammer the public OSM tile servers when there are many reports.
      const MAP_CONCURRENCY = 5
      for (let i = 0; i < mapTasks.length; i += MAP_CONCURRENCY) {
        const batch = mapTasks.slice(i, i + MAP_CONCURRENCY)
        const imgs = await Promise.all(batch.map(t => fetchSatMap(t.pts, 660, mapOutH(mapBoxAspect(t.pts, 0.18)), t.color)))
        batch.forEach((t, j) => {
          const mapImg = imgs[j]
          if (mapImg) {
            const img = document.createElement('img')
            img.src = mapImg
            img.style.cssText = 'width:100%;border-radius:10px;display:block'
            t.el.appendChild(img)
          }
        })
      }

      document.body.appendChild(host)
      await nextLayout()

      let blob: Blob
      try {
        blob = await paginateToPdf(clones, '.pdf-block', { diaryTitle, authorName: diaryAuthor })
      } finally {
        document.body.removeChild(host)
      }

      if (download) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'diario-dtrek.pdf'
        a.click(); URL.revokeObjectURL(url)
      } else {
        const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
        const sb = getBrowserSupabase()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) throw new Error('Non autenticato')
        const { uploadDiaryPdf } = await import('@/lib/pdfUpload')
        const pdfUrl = await uploadDiaryPdf(user.id, blob)
        const patchRes = await fetch('/api/diary-token', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diaryPdfUrl: pdfUrl }),
        })
        const patchData = await patchRes.json() as { diary_token?: string }
        setDiaryPdfUrl(pdfUrl)
        if (patchData.diary_token) setDiaryToken(patchData.diary_token)
      }
    } catch (e) {
      if (!download) setPublishError(String(e))
    } finally {
      key(false)
    }
  }

  const showStats = Object.values(statsToggles).some(Boolean)

  const coverDateRange = useMemo(() => {
    if (!activities.length) return undefined
    const first = format(new Date(activities[0].startTime), 'MMMM yyyy', { locale: it })
    const last  = format(new Date(activities[activities.length - 1].startTime), 'MMMM yyyy', { locale: it })
    return first === last ? first : `${first} – ${last}`
  }, [activities])

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Top nav — same pill + profile avatar as Guida/Resoconto, always at the top (no bottom
          mobile tab bar here), sticky over the book like the rest of the app's hub sections. */}
      <div className="sticky top-0 z-40 px-3 py-2 print:hidden">
        <div className="max-w-sm mx-auto">
          <HubNavBar />
        </div>
      </div>

      {/* Left icon rail — cover customization */}
      <div className="fixed left-3 md:left-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 print:hidden">
        <RailButton onClick={() => coverInputRef.current?.click()} title="Foto copertina">
          <ImageIcon className="w-5 h-5 text-white" />
        </RailButton>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleCoverUpload(f); e.target.value = '' } }} />

        <div className="relative">
          <RailButton onClick={() => setShowTextMenu(s => !s)} title="Testi copertina">
            <Pencil className="w-5 h-5 text-white" />
          </RailButton>
          {showTextMenu && (
            <div className="absolute left-full ml-3 top-0 w-72 bg-white rounded-xl border border-stone-200 shadow-lg z-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Testi copertina</p>
                <button onClick={() => setShowTextMenu(false)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Titolo</label>
              <input
                value={diaryTitle}
                onChange={e => { setDiaryTitle(e.target.value); try { localStorage.setItem('dtrek_diary_title', e.target.value) } catch {} }}
                className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                placeholder="DIARIO di VIAGGIO"
              />
              <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Sottotitolo</label>
              <input
                value={diarySubtitle}
                onChange={e => { setDiarySubtitle(e.target.value); try { localStorage.setItem('dtrek_diary_subtitle', e.target.value) } catch {} }}
                className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                placeholder="I miei percorsi"
              />
              <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Autore</label>
              <input
                value={diaryAuthor}
                onChange={e => { setDiaryAuthor(e.target.value); try { localStorage.setItem('dtrek_diary_author', e.target.value) } catch {} }}
                className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-forest-400"
                placeholder="Nome Cognome"
              />
            </div>
          )}
        </div>

        <div className="relative">
          <RailButton onClick={() => setShowStatsMenu(s => !s)} title="Statistiche">
            <BarChart2 className="w-5 h-5 text-amber-300" />
          </RailButton>
          {showStatsMenu && (
            <div className="absolute left-full ml-3 top-0 w-48 max-h-[70vh] overflow-y-auto bg-white rounded-xl border border-stone-200 shadow-lg z-50 py-1">
              <button className="absolute top-2 right-2 text-stone-400 hover:text-stone-600" onClick={() => setShowStatsMenu(false)}>
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="px-3 pt-2 pb-1 text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Sezioni</p>
              {([
                ['totali', 'Totali'],
                ['record', 'Record personali'],
                ['medie', 'Medie'],
                ['andamento', 'Andamento'],
              ] as [keyof StatsToggles, string][]).map(([k, l]) => (
                <button key={k} onClick={() => toggleStat(k)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${statsToggles[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                    {statsToggles[k] ? '✓' : ''}
                  </span>
                  {l}
                </button>
              ))}
              <p className="px-3 pt-2 pb-1 text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 border-t border-stone-100 mt-1">Per ogni percorso</p>
              {([
                ['mappa', 'Mappa percorso'],
                ['statistiche', 'Statistiche dettagliate'],
                ['grafico', 'Grafico altimetria'],
                ['cuore', 'Frequenza cardiaca'],
                ['velocita', 'Velocità'],
              ] as [keyof ReportExtras, string][]).map(([k, l]) => (
                <button key={k} onClick={() => toggleReportExtra(k)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${reportExtras[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                    {reportExtras[k] ? '✓' : ''}
                  </span>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right icon rail — view options + export/share */}
      <div className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 print:hidden">
        <RailButton
          onClick={() => setMapsInteractive(v => !v)}
          title={mapsInteractive ? 'Blocca le mappe (evita spostamenti involontari)' : 'Sblocca le mappe per navigarle'}
          variant={mapsInteractive ? 'terra' : 'glass'}
        >
          {mapsInteractive ? <LockOpen className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
        </RailButton>

        <RailButton
          onClick={() => setShowStubs(v => !v)}
          title={showStubs ? 'Nascondi i percorsi non ancora narrati' : 'Mostra i percorsi non ancora narrati'}
          variant={showStubs ? 'amber' : 'glass'}
          badge={bookPages.filter(p => p.kind === 'stub').length > 0 ? bookPages.filter(p => p.kind === 'stub').length : undefined}
        >
          {showStubs ? <Eye className="w-5 h-5 text-white" /> : <EyeOff className="w-5 h-5 text-white" />}
        </RailButton>

        <RailButton onClick={() => { if (!downloading && !loading) generateAndUploadPdf(true) }} title="Scarica PDF">
          {downloading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileDown className="w-5 h-5 text-white" />}
        </RailButton>

        <div className="relative">
          <RailButton onClick={() => setShowShareMenu(s => !s)} title="Condividi / pubblica" variant={diaryPdfUrl ? 'terra' : 'amber'}>
            <Share2 className="w-5 h-5 text-white" />
          </RailButton>
          {showShareMenu && (
            <div className="absolute right-full mr-3 top-0 w-64 bg-white rounded-xl border border-stone-200 shadow-lg z-50 p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Condividi diario</p>
                <button onClick={() => setShowShareMenu(false)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {diaryPdfUrl ? (
                <div className="space-y-1.5">
                  {diaryToken && (
                    <a href={`/leggi/d/${diaryToken}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> Apri lettore
                    </a>
                  )}
                  <button onClick={async () => {
                    const url = diaryToken
                      ? `${window.location.origin}/leggi/d/${diaryToken}`
                      : diaryPdfUrl
                    await navigator.clipboard.writeText(url)
                    setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                  }}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                    <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                  </button>
                  <button onClick={async () => { await fetch('/api/diary-token', { method: 'DELETE' }); setDiaryPdfUrl(null); setDiaryToken(null) }}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-400 text-xs hover:bg-red-50 transition-colors">
                    <Link2Off className="w-3.5 h-3.5" /> Rimuovi link
                  </button>
                </div>
              ) : (
                <>
                  {publishError && <p className="text-xs text-red-500">{publishError}</p>}
                  <button onClick={() => generateAndUploadPdf(false)} disabled={publishing || loading}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                    {publishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pubblicazione…</> : <><Share2 className="w-3.5 h-3.5" /> Pubblica online</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="font-lora italic">Caricamento diario…</span>
        </div>
      )}

      {/* Book — scaled to fit the viewport width, like a responsive PDF viewer */}
      {!loading && (
        <div ref={bookOuterRef} className="bg-stone-200 min-h-screen overflow-hidden">
          <div style={{ height: innerHeight ? innerHeight * scale + 48 : undefined, position: 'relative' }}>
            <div
              ref={bookInnerRef}
              id="diario-book"
              className="py-6"
              style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top center', position: 'absolute', top: 0, left: '50%', marginLeft: -397 }}
            >
              <DiarioCover
                coverUrl={coverUrl} diaryTitle={diaryTitle} diarySubtitle={diarySubtitle} diaryAuthor={diaryAuthor}
                dateRange={coverDateRange} totalActivities={activities.length}
                totalKm={computeGlobalStats(activities).totalDistanceKm}
                totalElevationGain={computeGlobalStats(activities).totalElevationGain}
              />
              <AnniversaryBanner activities={activities} />
              <DiarioNatura activities={activities} />
              {visibleBookPages.length > 0 && <DiarioIndice pages={visibleBookPages} />}
              {activities.length > 0 && <DiarioMappa activities={activities} mapImgUrl={mapImgUrl} mapsInteractive={mapsInteractive} />}
              {activities.length > 0 && showStats && (
                <DiarioStatistiche activities={activities} toggles={statsToggles} />
              )}
              {visibleBookPages.map((page, i) => {
                const year = new Date(page.startTime).getFullYear()
                const prevYear = i > 0 ? new Date(visibleBookPages[i - 1].startTime).getFullYear() : null
                const showDivider = year !== prevYear
                const yearPages = visibleBookPages.filter(p => new Date(p.startTime).getFullYear() === year)
                const yearKm = yearPages.reduce((s, p) =>
                  s + (p.kind === 'stub' ? p.activity.distanceMeters : p.report.activity?.distance_meters ?? 0), 0) / 1000
                return (
                  <div key={page.kind === 'report' ? `rep-${page.report.id}` : `stub-${page.activity.id}`}>
                    {showDivider && (
                      <DiarioYearDivider year={String(year)} count={yearPages.length} totalKm={yearKm} />
                    )}
                    {page.kind === 'report' ? (
                      <DiarioReportPage
                        report={page.report}
                        photos={photosByAct[page.report.activity_id] ?? []}
                        meta={activities.find(a => a.id === page.report.activity_id)}
                        extras={reportExtras}
                        trackPoints={trackPointsByAct[page.report.activity_id]}
                        mapsInteractive={mapsInteractive}
                        escNumber={reportNumbers.get(page.report.id) ?? 1}
                      />
                    ) : (
                      <DiarioStubPage activity={page.activity} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
