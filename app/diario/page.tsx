'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HubNavBar from '@/components/routehub/HubNavBar'
import { RailButton } from '@/components/routehub/SideRails'
import { getAllActivities, getActivityById, computeGlobalStats, type ActivityMeta } from '@/lib/blobStore'
import { fetchActivityPhotos, type RoutePhoto } from '@/lib/activityPhotos'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  FileDown, Share2, Copy, Link2Off, ExternalLink,
  Loader2, Image as ImageIcon, BarChart2, X, Pencil,
  Lock, LockOpen, Eye, EyeOff, Archive, RotateCcw, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { ROUTE_COLORS } from '@/lib/designTokens'
import { mapOutH } from '@/components/diario/chartUtils'
import { DiarioCover } from '@/components/diario/DiarioCover'
import { DiarioIndice } from '@/components/diario/DiarioIndice'
import { DiarioStubPage } from '@/components/diario/DiarioStubPage'
import { AnniversaryBanner } from '@/components/diario/AnniversaryBanner'
import { DiarioNatura } from '@/components/diario/DiarioNatura'
import { DiarioMappa } from '@/components/diario/DiarioMappa'
import { DiarioStatistiche } from '@/components/diario/DiarioStatistiche'
import { DiarioReportPage } from '@/components/diario/DiarioReportPage'
import type { DiaryReport, ReportExtras, BookPage } from '@/components/diario/types'
import {
  type DiaryConfig, normalizeDiaryConfig, resolveReportExtras,
  DEFAULT_DIARY_CONFIG, LEGACY_LOCALSTORAGE_KEYS,
} from '@/lib/diaryConfig'
import { uploadDiaryCover } from '@/lib/diaryCoverUpload'

// ── Migrazione una tantum da localStorage (vedi lib/diaryConfig.ts) ────────────────────────────
//
// Prima della Fase 3 la personalizzazione del diario viveva in sei chiavi separate di
// localStorage: seguiva il dispositivo, non l'account. Al primo caricamento con la nuova
// configurazione lato server, se questa è ancora ai valori di default (cioè non è mai stata
// salvata da NESSUN dispositivo) e il dispositivo corrente ha valori legacy, li adotta e li
// carica sul server una volta sola. Il flag `dtrek_diary_migrated_v1` evita di ripetere il
// tentativo — e soprattutto di sovrascrivere, ai prossimi caricamenti, una configurazione ormai
// genuinamente personalizzata dal server con dati vecchi di questo dispositivo.
const MIGRATED_FLAG = 'dtrek_diary_migrated_v1'

function isConfigDefault(c: DiaryConfig): boolean {
  return (
    c.title === DEFAULT_DIARY_CONFIG.title &&
    c.subtitle === DEFAULT_DIARY_CONFIG.subtitle &&
    c.author === '' &&
    c.coverUrl === null &&
    JSON.stringify(c.statsToggles) === JSON.stringify(DEFAULT_DIARY_CONFIG.statsToggles) &&
    JSON.stringify(c.reportExtrasDefault) === JSON.stringify(DEFAULT_DIARY_CONFIG.reportExtrasDefault) &&
    Object.keys(c.reportExtrasByActivity).length === 0 &&
    c.excludedActivityIds.length === 0
  )
}

async function migrateLegacyConfigIfNeeded(serverConfig: DiaryConfig): Promise<DiaryConfig> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return serverConfig
    if (!isConfigDefault(serverConfig)) { localStorage.setItem(MIGRATED_FLAG, '1'); return serverConfig }

    const title    = localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS.title)
    const subtitle = localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS.subtitle)
    const author   = localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS.author)
    let stats: unknown = null, reportExtras: unknown = null
    try { stats = JSON.parse(localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS.stats) ?? 'null') } catch { /* ignore */ }
    try { reportExtras = JSON.parse(localStorage.getItem(LEGACY_LOCALSTORAGE_KEYS.reportExtras) ?? 'null') } catch { /* ignore */ }

    if (!title && !subtitle && !author && !stats && !reportExtras) {
      localStorage.setItem(MIGRATED_FLAG, '1')
      return serverConfig
    }

    const merged = normalizeDiaryConfig({
      ...serverConfig,
      title: title ?? serverConfig.title,
      subtitle: subtitle ?? serverConfig.subtitle,
      author: author ?? serverConfig.author,
      statsToggles: stats ?? serverConfig.statsToggles,
      reportExtrasDefault: reportExtras ?? serverConfig.reportExtrasDefault,
    })

    const res = await fetch('/api/diary-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged),
    })
    localStorage.setItem(MIGRATED_FLAG, '1')
    return res.ok ? merged : serverConfig
  } catch {
    return serverConfig
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DiarioPage() {
  const [activities,   setActivities]   = useState<ActivityMeta[]>([])
  const [reports,      setReports]      = useState<DiaryReport[]>([])
  const [bookPages,    setBookPages]    = useState<BookPage[]>([])
  const [photosByAct,  setPhotosByAct]  = useState<Record<string, RoutePhoto[]>>({})
  const [trackPointsByAct, setTrackPointsByAct] = useState<Record<string, TrackPoint[]>>({})
  const [mapImgUrl,    setMapImgUrl]    = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  // Diventa true solo dopo che foto e trackpoint di OGNI resoconto sono arrivati (o falliti) — la
  // pubblicazione resta disabilitata fino ad allora: prima si poteva pubblicare un attimo dopo
  // l'apertura della pagina e ottenere un PDF senza foto né grafici, senza alcun avviso, perché
  // "loading" diventava false non appena arrivavano solo le attività/i resoconti grezzi.
  const [chartsAndPhotosReady, setChartsAndPhotosReady] = useState(false)

  const [diaryPdfUrl,  setDiaryPdfUrl]  = useState<string | null>(null)
  const [diaryToken,   setDiaryToken]   = useState<string | null>(null)
  const [downloading,  setDownloading]  = useState(false)
  const [publishing,   setPublishing]   = useState(false)
  /** Pubblicazione del solo link: una PATCH da poche centinaia di byte, non ha nulla a che vedere
   *  con la generazione del PDF e non deve condividerne né lo stato né gli errori. */
  const [linkPublishing, setLinkPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null)
  const [copyOk,       setCopyOk]       = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverError,   setCoverError]   = useState<string | null>(null)

  const [showStatsMenu,    setShowStatsMenu]    = useState(false)
  const [showTextMenu,     setShowTextMenu]     = useState(false)
  const [showShareMenu,    setShowShareMenu]    = useState(false)
  const [showExcludedMenu, setShowExcludedMenu] = useState(false)
  const [mapsInteractive,  setMapsInteractive]  = useState(false)

  // Configurazione del diario — titolo, sottotitolo, autore, copertina, toggle, escursioni
  // escluse. Caricata da /api/diary-config (Supabase), non più da localStorage: segue l'utente
  // tra dispositivi, e il PDF pubblicato riflette sempre la stessa configurazione ovunque lo si
  // pubblichi da.
  const [config, setConfig] = useState<DiaryConfig>(DEFAULT_DIARY_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const configSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bookOuterRef = useRef<HTMLDivElement>(null)
  const bookInnerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [innerHeight, setInnerHeight] = useState(0)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      getAllActivities(),
      fetch('/api/resoconto?all=true').then(r => r.ok ? r.json() : []),
      fetch('/api/diary-token').then(r => r.ok ? r.json() : {}),
      fetch('/api/diary-config').then(r => r.ok ? r.json() : DEFAULT_DIARY_CONFIG),
      getUserSettingsCached(),
    ]).then(async ([acts, reps, dt, dc, us]) => {
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

      // Configurazione: normalizza, prova la migrazione da localStorage se non è mai stata
      // salvata da nessun dispositivo, poi usa il nome del profilo come autore di default se non
      // è mai stato impostato esplicitamente.
      const usData = us as { display_name?: string; name?: string }
      const profileName = usData.display_name ?? usData.name ?? ''
      let cfg = normalizeDiaryConfig(dc)
      cfg = await migrateLegacyConfigIfNeeded(cfg)
      if (!cfg.author && profileName) cfg = { ...cfg, author: profileName }
      setConfig(cfg)
      setConfigLoaded(true)

      // Core data (activities/reports/pages) is ready — show the book now
      // rather than waiting for every report's photos and full trackpoints to
      // load too. Those are fetched below in the background and populate the
      // charts/photos progressively as they arrive, instead of blocking the
      // initial render (which used to make opening the diary feel very slow
      // once there were many reports).
      setLoading(false)

      // Load photos + full trackpoints per reported activity, together — chartsAndPhotosReady
      // diventa true solo quando ENTRAMBE le liste sono arrivate, ed è quello che sblocca la
      // pubblicazione (vedi guardia su generateAndUploadPdf).
      const photosPromise = Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, RoutePhoto[]]> => {
        try { return [rep.activity_id, await fetchActivityPhotos(rep.activity_id)] }
        catch { return [rep.activity_id, []] }
      })).then(photoEntries => {
        const byAct: Record<string, RoutePhoto[]> = {}
        photoEntries.forEach(([activityId, photos]) => { if (photos.length) byAct[activityId] = photos })
        setPhotosByAct(byAct)
      })

      const trackPointsPromise = Promise.all(sortedReps.map(async (rep: DiaryReport): Promise<readonly [string, TrackPoint[]]> => {
        try {
          const full = await getActivityById(rep.activity_id)
          return [rep.activity_id, full?.trackPoints ?? []]
        } catch { return [rep.activity_id, []] }
      })).then(trackPointEntries => {
        const tpByAct: Record<string, TrackPoint[]> = {}
        trackPointEntries.forEach(([activityId, tps]) => { if (tps.length) tpByAct[activityId] = tps })
        setTrackPointsByAct(tpByAct)
      })

      Promise.all([photosPromise, trackPointsPromise]).then(() => setChartsAndPhotosReady(true))

      // Raster della mappa d'insieme generato in anticipo, usato come cache dall'esportazione PDF
      // (vedi `mapForPdf` in generateAndUploadPdf): averlo già pronto evita di far attendere
      // l'utente al momento della pubblicazione.
      //
      // Il commento precedente diceva che serviva alla stampa nativa del browser (Ctrl+P). Non era
      // così: l'unico consumatore era un <img> in DiarioMappa che, per via di un `display:none` in
      // linea, non è mai comparso — né a schermo né in stampa. Quell'immagine è stata rimossa.
      import('@/utils/pdfExport').then(({ fetchAllRoutesSatMap, mapBoxAspect }) => {
        const allPts = sortedActs.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
        return fetchAllRoutesSatMap(sortedActs, 660, mapOutH(mapBoxAspect(allPts, 0.12)))
      }).then(img => { if (img) setMapImgUrl(img) })
    }).catch(() => { setLoading(false); setConfigLoaded(true) })
  }, [])

  // Salvataggio con debounce: ogni modifica alla configurazione (titolo, toggle, esclusioni…)
  // riscrive l'intero oggetto sul server 800ms dopo l'ultima modifica, invece di un round-trip
  // per ogni tasto premuto o ogni singolo toggle.
  useEffect(() => {
    if (!configLoaded) return
    if (configSaveTimer.current) clearTimeout(configSaveTimer.current)
    configSaveTimer.current = setTimeout(() => {
      fetch('/api/diary-config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      }).catch(() => { /* riprovato al prossimo cambiamento */ })
    }, 800)
    return () => { if (configSaveTimer.current) clearTimeout(configSaveTimer.current) }
  }, [config, configLoaded])

  function toggleStat(key: keyof DiaryConfig['statsToggles']) {
    setConfig(c => ({ ...c, statsToggles: { ...c.statsToggles, [key]: !c.statsToggles[key] } }))
  }

  function toggleReportExtraDefault(key: keyof ReportExtras) {
    setConfig(c => ({ ...c, reportExtrasDefault: { ...c.reportExtrasDefault, [key]: !c.reportExtrasDefault[key] } }))
  }

  function patchReportExtrasForActivity(activityId: string, patch: Partial<ReportExtras>) {
    setConfig(c => ({
      ...c,
      reportExtrasByActivity: {
        ...c.reportExtrasByActivity,
        [activityId]: { ...c.reportExtrasByActivity[activityId], ...patch },
      },
    }))
  }

  function toggleExcludeActivity(activityId: string) {
    setConfig(c => {
      const excluded = new Set(c.excludedActivityIds)
      excluded.has(activityId) ? excluded.delete(activityId) : excluded.add(activityId)
      return { ...c, excludedActivityIds: Array.from(excluded) }
    })
  }

  function setShowStubs(v: boolean) {
    setConfig(c => ({ ...c, showStubs: v }))
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
  }, [loading, bookPages, config, activities, trackPointsByAct])

  const visibleBookPages = useMemo(() => {
    const excluded = new Set(config.excludedActivityIds)
    return bookPages.filter(p => {
      const activityId = p.kind === 'stub' ? p.activity.id : p.report.activity_id
      if (excluded.has(activityId)) return false
      if (p.kind === 'stub' && !config.showStubs) return false
      return true
    })
  }, [bookPages, config.excludedActivityIds, config.showStubs])

  const excludedPages = useMemo(() => {
    const excluded = new Set(config.excludedActivityIds)
    return bookPages
      .filter(p => excluded.has(p.kind === 'stub' ? p.activity.id : p.report.activity_id))
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [bookPages, config.excludedActivityIds])

  const reportNumbers = useMemo(() => {
    const m = new Map<string, number>()
    let n = 0
    visibleBookPages.forEach(p => { if (p.kind === 'report') { n++; m.set(p.report.id, n) } })
    return m
  }, [visibleBookPages])

  async function handleCoverUpload(file: File) {
    setCoverUploading(true); setCoverError(null)
    try {
      const supabase = getBrowserSupabase()
      // getSession() (a differenza di getUser()) rinfresca proattivamente un token vicino alla
      // scadenza. Senza, una scheda tenuta aperta a lungo (il timer di autoRefreshToken viene
      // rallentato/sospeso dal browser quando l'app va in background, comune su mobile) può
      // superare comunque il controllo di getUser() qui sotto con un token ormai scaduto — per
      // poi farsi rifiutare dallo Storage nella chiamata di rete separata subito dopo, con un
      // errore RLS generico invece che di autenticazione (stesso difetto già corretto in
      // lib/activityPhotos.ts, non applicato qui).
      await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non autenticato')
      const url = await uploadDiaryCover(user.id, file)
      setConfig(c => ({ ...c, coverUrl: url }))
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : String(e))
    } finally {
      setCoverUploading(false)
    }
  }

  async function generateAndUploadPdf(download = false) {
    const key = download ? setDownloading : setPublishing
    key(true); setPublishError(null); setPublishProgress(null)
    try {
      const { paginateToPdf, nextLayout } = await import('@/lib/pdfPaginate')
      const { fetchAllRoutesSatMap, fetchSatMap, mapBoxAspect } = await import('@/utils/pdfExport')
      const allPts = activities.filter(a => (a.routePolyline?.length ?? 0) > 1).flatMap(a => a.routePolyline!)
      const mapForPdf = mapImgUrl || await fetchAllRoutesSatMap(activities, 660, mapOutH(mapBoxAspect(allPts, 0.12))) || null

      const actById = new Map(activities.map(a => [a.id, a]))
      // Stessa palette della mappa e della legenda a schermo (lib/designTokens.ts): prima questo
      // elenco era una quarta copia, con colori diversi dalle altre tre — il tracciato di
      // un'escursione poteva risultare di un colore sulla mappa e di un altro nel PDF.
      const PALETTE = ROUTE_COLORS

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
        // Le mappe Leaflet vive vengono sostituite più sotto con un raster generato apposta, a
        // risoluzione controllata.
        //
        // Questa riga è difensiva, non risolutiva: il commento precedente sosteneva che servisse a
        // togliere canvas "sporcati" dalle tile cross-origin, ma Leaflet disegna le tile con <img>
        // e le polilinee in SVG, e le tile passano comunque dal proxy same-origin /api/tile. Oggi
        // nelle pagine del diario non c'è alcun <canvas> (i grafici sono SVG), quindi la riga non
        // rimuove nulla; resta a protezione di eventuali canvas introdotti in futuro.
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
        // I controlli dell'editor (esclusione, personalizzazione per pagina) usano la classe
        // Tailwind `print:hidden`, ma quella regola vive dentro un `@media print` — non si attiva
        // durante la cattura con html2canvas, che non è un contesto di stampa reale. Da qui la
        // classe `diario-editor-control` dedicata, nascosta esplicitamente qui: NON va confusa con
        // `.diario-global-map`/`.diario-report-map`, che portano anch'esse `print:hidden` ma per
        // un motivo diverso (contengono la Leaflet interattiva, sostituita da un raster poco più
        // sotto) — quei due wrapper restano visibili apposta, altrimenti anche il raster appena
        // inserito al loro interno sparirebbe dalla cattura.
        clone.querySelectorAll<HTMLElement>('.diario-editor-control').forEach(el => { el.style.display = 'none' })
        host.appendChild(clone)
        clones.push(clone)
      }

      // Fetch report maps in parallel, capped at 5 concurrent requests so we
      // don't hammer the public OSM tile servers when there are many reports.
      const MAP_CONCURRENCY = 5
      for (let i = 0; i < mapTasks.length; i += MAP_CONCURRENCY) {
        const batch = mapTasks.slice(i, i + MAP_CONCURRENCY)
        // Mappa del singolo resoconto contenuta: a 660 px di larghezza `mapOutH` può restituire
        // fino a 733 px di altezza, e con statistiche e grafici davanti la coda non entrava in una
        // pagina sola — ne serviva una seconda per la sola mappa, lasciando ~380 px bianchi sulla
        // prima e ~380 sulla seconda. A 560x320 la coda di un resoconto sta tutta su una pagina.
        const imgs = await Promise.all(batch.map(t => fetchSatMap(
          t.pts, 560, Math.min(320, mapOutH(mapBoxAspect(t.pts, 0.18), 560)), t.color)))
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

      // Il libro a schermo è già stato clonato dentro `host`: da qui in poi è solo peso morto per
      // la cattura, che clona l'intero documento a ogni blocco di pagine. Marcarlo lo tiene fuori
      // da tutti quei cloni (vedi data-pdf-ignore in lib/pdfPaginate.ts) — su un diario lungo è la
      // differenza fra clonare due libri per pagina e clonarne nessuno.
      const liveBook = document.getElementById('diario-book')
      liveBook?.setAttribute('data-pdf-ignore', '')

      await nextLayout()

      // ── Composizione a colonne ────────────────────────────────────────────────────────────────
      // Le pagine del libro a schermo sono a colonna singola: qui vengono ricomposte in pagine
      // magazine a due colonne, già impaginate. Il libro a schermo resta com'è — è una scelta:
      // comporre anche lì raddoppierebbe il DOM vivo della rotta più pesante dopo /resoconto.
      //
      // Le immagini devono essere decodificate PRIMA di misurare: un'immagine senza dimensioni
      // intrinseche falsa l'altezza dei blocchi e con essa tutta la composizione. `paginateToPdf`
      // le attende già, ma lo fa dopo — troppo tardi per noi.
      const { composeReportPages, composeCardPages, MAG } = await import('@/lib/diaryMagazine')
      const { waitForImages } = await import('@/lib/pdfImages')
      await waitForImages(host)

      const composed: HTMLElement[] = []
      const cards: HTMLElement[] = []
      for (const clone of clones) {
        const card = clone.querySelector<HTMLElement>('[data-mag="card"]')
        if (card) {
          // Escursione senza racconto: al posto della pagina intera va la scheda compatta, che
          // viene impilata con le altre più sotto invece di occupare due pagine da sola.
          card.style.display = ''
          cards.push(card)
          continue
        }
        if (clone.querySelector(MAG.block)) {
          composed.push(...composeReportPages(clone))
          continue
        }
        // Copertina, indice, mappa d'insieme: restano pagine a sé (nessun blocco marcato).
        composed.push(clone)
      }

      if (cards.length > 0) {
        const heading = document.createElement('p')
        heading.style.cssText =
          'font-family:var(--font-barlow),Arial Narrow,sans-serif;font-size:9px;font-weight:900;' +
          'letter-spacing:3px;text-transform:uppercase;color:#a9a18e;margin:0 0 16px;' +
          'padding-bottom:9px;border-bottom:1.5px solid #e08d3c'
        heading.textContent = 'Le altre uscite'
        cards.unshift(heading)
        composed.push(...composeCardPages(cards))
      }

      // Le pagine composte devono stare nel documento per essere catturate. `appendChild` sposta i
      // nodi già esistenti (copertina, indice…) invece di duplicarli, quindi il vecchio host resta
      // con dentro solo i cloni dei resoconti ormai ricomposti.
      const pdfHost = document.createElement('div')
      pdfHost.style.cssText = 'position:absolute;left:-10000px;top:0;width:794px;background:#fff;z-index:-1'
      for (const p of composed) pdfHost.appendChild(p)
      document.body.appendChild(pdfHost)
      host.remove()

      await nextLayout()

      let blob: Blob
      try {
        blob = await paginateToPdf(composed, '.pdf-block', {
          documentTitle: config.title, authorName: config.author,
          onProgress: (done, total) => setPublishProgress({ done, total }),
        })
      } finally {
        pdfHost.remove()
        liveBook?.removeAttribute('data-pdf-ignore')
      }

      if (download) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'diario-dtrek.pdf'
        a.click(); URL.revokeObjectURL(url)
      } else {
        const { getBrowserSupabase } = await import('@/lib/supabaseBrowser')
        const sb = getBrowserSupabase()
        // Vedi il commento gemello in handleCoverUpload sopra.
        await sb.auth.getSession()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) throw new Error('Non autenticato')
        const { uploadDiaryPdf } = await import('@/lib/pdfUpload')
        const pdfUrl = await uploadDiaryPdf(user.id, blob)
        // A questo punto la parte costosa (rendere e caricare il PDF, anche minuti su un diario
        // lungo) è già fatta: perdere tutto per un singolo blip di rete su questa PATCH — piccola
        // e idempotente — su un giro di correzioni segnalato proprio come "Failed to fetch"
        // durante la ripubblicazione, sarebbe uno spreco evitabile. Due tentativi in più prima di
        // arrendersi, non un retry infinito.
        let patchData: { diary_token?: string } = {}
        let lastErr: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const patchRes = await fetch('/api/diary-token', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ diaryPdfUrl: pdfUrl }),
            })
            if (!patchRes.ok) throw new Error(`PATCH /api/diary-token → ${patchRes.status}`)
            patchData = await patchRes.json() as { diary_token?: string }
            lastErr = undefined
            break
          } catch (e) {
            lastErr = e
            if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
          }
        }
        setDiaryPdfUrl(pdfUrl)
        if (patchData.diary_token) setDiaryToken(patchData.diary_token)
        // Il PDF è comunque caricato e raggiungibile dal vecchio token/URL diretto: un fallimento
        // qui non è la stessa cosa di un fallimento della generazione, e viene segnalato come tale
        // invece di far ripartire l'utente da capo.
        if (lastErr) throw new Error('PDF caricato, ma l’aggiornamento del link pubblico non è riuscito. Riprova a ripubblicare.')
      }
    } catch (e) {
      // Prima gli errori del solo download venivano inghiottiti (`if (!download) setPublishError`)
      // — lo spinner si fermava e non succedeva altro, senza un solo log. Ora l'errore è sempre
      // visibile, e per il download si apre il pannello di condivisione (dove il messaggio viene
      // mostrato) perché altrimenti l'unico riscontro sarebbe lo spinner che si ferma.
      console.error('[diario] generazione PDF fallita:', e)
      setPublishError(e instanceof Error ? e.message : String(e))
      if (download) setShowShareMenu(true)
    } finally {
      key(false)
      setPublishProgress(null)
    }
  }

  /**
   * Pubblica il link pubblico, e basta.
   *
   * È l'operazione che prima non esisteva: condividere il Diario obbligava a generare e caricare
   * il PDF (decine di MB da un telefono), e finché quell'upload non riusciva non c'era alcun link.
   * Ora la pagina pubblica legge il contenuto dal database, quindi per condividere basta far
   * esistere il token — una richiesta piccola, immediata e che non può impantanarsi.
   */
  async function publishLink() {
    setLinkPublishing(true); setPublishError(null)
    try {
      const res = await fetch('/api/diary-token', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Corpo vuoto di proposito: assicura il token senza toccare `diary_pdf_url`, così
        // pubblicare il link non cancella un PDF già allegato.
        body: '{}',
      })
      if (!res.ok) throw new Error(`Pubblicazione non riuscita (${res.status})`)
      const data = await res.json() as { diary_token?: string }
      if (data.diary_token) setDiaryToken(data.diary_token)
      else throw new Error('Il server non ha restituito il token del diario')
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e))
    } finally {
      setLinkPublishing(false)
    }
  }

  async function handleRevokeLink() {
    await fetch('/api/diary-token', { method: 'DELETE' })
    setDiaryPdfUrl(null)
    setDiaryToken(null)
  }

  const showStats = Object.values(config.statsToggles).some(Boolean)

  const coverDateRange = useMemo(() => {
    if (!activities.length) return undefined
    const first = format(new Date(activities[0].startTime), 'MMMM yyyy', { locale: it })
    const last  = format(new Date(activities[activities.length - 1].startTime), 'MMMM yyyy', { locale: it })
    return first === last ? first : `${first} – ${last}`
  }, [activities])

  const excludedCount = config.excludedActivityIds.length
  const publishDisabledReason = !chartsAndPhotosReady
    ? 'In attesa di foto e grafici delle escursioni…'
    : undefined

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
          {coverUploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <ImageIcon className="w-5 h-5 text-white" />}
        </RailButton>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleCoverUpload(f); e.target.value = '' } }} />
        {coverError && (
          <div className="absolute left-full ml-3 top-0 w-56 bg-red-50 border border-red-200 rounded-xl p-2.5 text-xs text-red-600">
            {coverError}
          </div>
        )}

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
                value={config.title}
                onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                placeholder="DIARIO di VIAGGIO"
              />
              <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Sottotitolo</label>
              <input
                value={config.subtitle}
                onChange={e => setConfig(c => ({ ...c, subtitle: e.target.value }))}
                className="w-full text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-forest-400"
                placeholder="I miei percorsi"
              />
              <label className="block text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400 mb-0.5">Autore</label>
              <input
                value={config.author}
                onChange={e => setConfig(c => ({ ...c, author: e.target.value }))}
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
              ] as [keyof DiaryConfig['statsToggles'], string][]).map(([k, l]) => (
                <button key={k} onClick={() => toggleStat(k)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${config.statsToggles[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                    {config.statsToggles[k] ? '✓' : ''}
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
                <button key={k} onClick={() => toggleReportExtraDefault(k)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs font-bold ${config.reportExtrasDefault[k] ? 'bg-forest-600 border-forest-600 text-white' : 'border-stone-300'}`}>
                    {config.reportExtrasDefault[k] ? '✓' : ''}
                  </span>
                  {l}
                </button>
              ))}
              <p className="px-3 pt-2 text-[10px] text-stone-400 leading-relaxed">
                Ogni pagina ha anche un pulsante «Personalizza» per uno scostamento valido solo lì.
              </p>
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
          onClick={() => setShowStubs(!config.showStubs)}
          title={config.showStubs ? 'Nascondi i percorsi non ancora narrati' : 'Mostra i percorsi non ancora narrati'}
          variant={config.showStubs ? 'amber' : 'glass'}
          badge={bookPages.filter(p => p.kind === 'stub').length > 0 ? bookPages.filter(p => p.kind === 'stub').length : undefined}
        >
          {config.showStubs ? <Eye className="w-5 h-5 text-white" /> : <EyeOff className="w-5 h-5 text-white" />}
        </RailButton>

        <div className="relative">
          <RailButton
            onClick={() => setShowExcludedMenu(s => !s)}
            title="Escursioni escluse dal diario"
            variant={excludedCount > 0 ? 'terra' : 'glass'}
            badge={excludedCount > 0 ? excludedCount : undefined}
          >
            <Archive className="w-5 h-5 text-white" />
          </RailButton>
          {showExcludedMenu && (
            <div className="absolute right-full mr-3 top-0 w-72 max-h-[70vh] overflow-y-auto bg-white rounded-xl border border-stone-200 shadow-lg z-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-barlow font-bold uppercase tracking-widest text-stone-400">Escluse dal diario</p>
                <button onClick={() => setShowExcludedMenu(false)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {excludedPages.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-2">Nessuna escursione esclusa.</p>
              ) : (
                <div className="space-y-1.5">
                  {excludedPages.map(p => {
                    const activityId = p.kind === 'stub' ? p.activity.id : p.report.activity_id
                    const title = p.kind === 'stub' ? (p.activity.title ?? 'Escursione') : (p.report.title || p.report.activity?.title || 'Escursione')
                    const dateStr = format(new Date(p.startTime), 'd MMM yyyy', { locale: it })
                    return (
                      <div key={activityId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-stone-50">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-stone-700 truncate">{title}</p>
                          <p className="text-[10px] text-stone-400">{dateStr}</p>
                        </div>
                        <button onClick={() => toggleExcludeActivity(activityId)}
                          title="Includi di nuovo nel diario"
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-forest-50 text-forest-700 text-[10px] font-bold uppercase tracking-wide hover:bg-forest-100 transition-colors">
                          <RotateCcw className="w-3 h-3" /> Includi
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <RailButton onClick={() => { if (!downloading && !loading && chartsAndPhotosReady) generateAndUploadPdf(true) }}
          title={publishDisabledReason ?? 'Scarica PDF'}
        >
          {downloading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileDown className="w-5 h-5 text-white" />}
        </RailButton>

        <div className="relative">
          <RailButton onClick={() => setShowShareMenu(s => !s)} title="Condividi / pubblica" variant={diaryToken ? 'terra' : 'amber'}>
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

              {(publishing || downloading) && publishProgress && publishProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full bg-forest-500 transition-all"
                      style={{ width: `${Math.round(100 * publishProgress.done / publishProgress.total)}%` }} />
                  </div>
                  <p className="text-[10px] text-stone-400 text-center">
                    Pagina {publishProgress.done} di {publishProgress.total}
                  </p>
                </div>
              )}

              {publishError && <p className="text-xs text-red-500">{publishError}</p>}

              {/* Il link è ora indipendente dal PDF: la pagina pubblica legge il contenuto dal
                  database, quindi condividere costa una richiesta da poche centinaia di byte
                  invece di un upload da decine di MB che su rete mobile si pianta. */}
              {diaryToken ? (
                <div className="space-y-1.5">
                  <a href={`/leggi/d/${diaryToken}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-barlow font-bold uppercase tracking-wide transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Apri il diario
                  </a>
                  <button onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/leggi/d/${diaryToken}`)
                    setCopyOk(true); setTimeout(() => setCopyOk(false), 2000)
                  }}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                    <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
                  </button>

                  <div className="pt-1.5 border-t border-stone-100 space-y-1.5">
                    <p className="text-[10px] text-stone-400 leading-snug">
                      {diaryPdfUrl
                        ? 'Il PDF è allegato al link. Riaggiornalo se hai cambiato qualcosa.'
                        : 'Facoltativo: allega un PDF scaricabile dalla pagina pubblica.'}
                    </p>
                    <button onClick={() => generateAndUploadPdf(false)} disabled={publishing || !chartsAndPhotosReady}
                      title={publishDisabledReason}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 text-xs font-barlow font-bold uppercase tracking-wide hover:bg-stone-50 disabled:opacity-50 transition-colors">
                      {publishing
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aggiornamento…</>
                        : <><RefreshCw className="w-3.5 h-3.5" /> {diaryPdfUrl ? 'Aggiorna PDF allegato' : 'Allega il PDF'}</>}
                    </button>
                    {publishDisabledReason && (
                      <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {publishDisabledReason}
                      </p>
                    )}
                  </div>

                  <button onClick={handleRevokeLink}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-400 text-xs hover:bg-red-50 transition-colors">
                    <Link2Off className="w-3.5 h-3.5" /> Rimuovi link
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-stone-400 leading-snug">
                    Crea una pagina pubblica del diario, leggibile da telefono senza scaricare nulla.
                  </p>
                  <button onClick={publishLink} disabled={linkPublishing || loading}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 disabled:opacity-50 transition-colors">
                    {linkPublishing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pubblicazione…</> : <><Share2 className="w-3.5 h-3.5" /> Pubblica online</>}
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
                coverUrl={config.coverUrl} diaryTitle={config.title} diarySubtitle={config.subtitle} diaryAuthor={config.author}
                dateRange={coverDateRange} totalActivities={activities.length}
                totalKm={computeGlobalStats(activities).totalDistanceKm}
                totalElevationGain={computeGlobalStats(activities).totalElevationGain}
              />
              <AnniversaryBanner activities={activities} />
              <DiarioNatura activities={activities} />
              {visibleBookPages.length > 0 && <DiarioIndice pages={visibleBookPages} />}
              {activities.length > 0 && <DiarioMappa activities={activities} mapsInteractive={mapsInteractive} />}
              {activities.length > 0 && showStats && (
                <DiarioStatistiche activities={activities} toggles={config.statsToggles} />
              )}
              {visibleBookPages.map((page, i) => {
                const year = new Date(page.startTime).getFullYear()
                const prevYear = i > 0 ? new Date(visibleBookPages[i - 1].startTime).getFullYear() : null
                const showBand = year !== prevYear
                const yearPages = visibleBookPages.filter(p => new Date(p.startTime).getFullYear() === year)
                const yearKm = yearPages.reduce((s, p) =>
                  s + (p.kind === 'stub' ? p.activity.distanceMeters : p.report.activity?.distance_meters ?? 0), 0) / 1000
                const yearBand = showBand ? { year: String(year), count: yearPages.length, totalKm: yearKm } : undefined
                const activityId = page.kind === 'stub' ? page.activity.id : page.report.activity_id
                return (
                  <div key={page.kind === 'report' ? `rep-${page.report.id}` : `stub-${page.activity.id}`}>
                    {page.kind === 'report' ? (
                      <DiarioReportPage
                        report={page.report}
                        photos={photosByAct[page.report.activity_id] ?? []}
                        meta={activities.find(a => a.id === page.report.activity_id)}
                        extras={resolveReportExtras(config, page.report.activity_id)}
                        trackPoints={trackPointsByAct[page.report.activity_id]}
                        mapsInteractive={mapsInteractive}
                        escNumber={reportNumbers.get(page.report.id) ?? 1}
                        yearBand={yearBand}
                        selectedPhotoIds={config.photoIdsByActivity[page.report.activity_id]}
                        onSelectedPhotosChange={ids => setConfig(c => {
                          const next = { ...c.photoIdsByActivity }
                          // Elenco vuoto = torna alla scelta automatica: si toglie la chiave invece
                          // di salvare un array vuoto, così la configurazione non accumula voci
                          // che dicono «niente di particolare».
                          if (ids.length === 0) delete next[page.report.activity_id]
                          else next[page.report.activity_id] = ids
                          return { ...c, photoIdsByActivity: next }
                        })}
                        onExclude={() => toggleExcludeActivity(activityId)}
                        onExtrasChange={patch => patchReportExtrasForActivity(activityId, patch)}
                      />
                    ) : (
                      <DiarioStubPage
                        activity={page.activity}
                        yearBand={yearBand}
                        onExclude={() => toggleExcludeActivity(activityId)}
                      />
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
