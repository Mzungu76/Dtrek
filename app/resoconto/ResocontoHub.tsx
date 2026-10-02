'use client'
import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FallbackImage, { ImageSpinner, ImagePlaceholder } from '@/components/ui/FallbackImage'
import RouteHub from '@/components/routehub/RouteHub'
import HubSkeleton from '@/components/routehub/HubSkeleton'
import ReportReader from '@/components/resoconto/ReportReader'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'
import type { RouteHubItem, SectionKind, PrimaryAction } from '@/components/routehub/types'
import { wmoInfo } from '@/lib/weather'
import { RatingGaugeBadge, ratingColor } from '@/components/resoconto/RatingGaugeBadge'
import {
  getActivityById, updateActivityMeta, deleteActivity, getAllActivities,
  type StoredActivity, type ActivityMeta,
} from '@/lib/blobStore'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { metaHasHikingMetrics, SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import { reportNoun } from '@/lib/reportFacts'
import { useSiteContext } from '@/lib/useSiteContext'
import { exportActivityToGpx } from '@/utils/exportGpx'
import { type PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { findSimilarActivities } from '@/lib/stats'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { getUserStartingPoint, googleMapsDirectionsUrl } from '@/lib/drivingInfo'
import { computeCtsForActivity } from '@/lib/computeCtsForActivity'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import {
  FileSpreadsheet, FileText, Map as MapIcon,
  Route, TrendingUp, Clock, Flame, MapPin,
  Pencil, Trash2, Loader2, Share2, Box, Images, Film, Camera, X,
  Star, Car, Settings, BookMarked, ChevronDown, Check,
  Mountain,
} from 'lucide-react'
import ShareModal from '@/components/ShareModal'
import HikeNotesRecorder from '@/app/components/HikeNotesRecorder'
import { fetchActivityPhotos, pickBestCoverPhoto, type RoutePhoto } from '@/lib/activityPhotos'
import { useFlora } from '@/lib/useFlora'
import { useDtmProfile } from './useDtmProfile'
import { useTerrainProfile } from './useTerrainProfile'
import { useProtectedAreaCheck } from './useProtectedAreaCheck'
import { useDrivingDistance } from './useDrivingDistance'
import { useUserPrefs } from '@/lib/useUserPrefs'
import { useCtsRecompute } from '@/lib/useCtsRecompute'
import type { DiarySummary } from '@/app/api/diaries/route'
import SafeImg from '@/components/ui/SafeImg'

const RouteMap3D      = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const FloraGallery    = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery   = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

const COVER_FETCH_CAP = 40
const CAMMINO_PREFIX = 'cammino:'

// Le pillole di una scheda dipendono dalla tipologia (lib/reportFacts.ts): km/D+/durata solo per un
// Sentiero; per un Borgo/Città la durata, per un Sito il tipo — mai "0.0 km · +0 m" su una visita.
function statPillsFor(a: Pick<ActivityMeta, 'metaType' | 'siteType' | 'distanceMeters' | 'elevationGain' | 'totalTimeSeconds'>) {
  if (metaHasHikingMetrics(a.metaType)) {
    return [
      { icon: Route,      label: `${(a.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp, label: `+${Math.round(a.elevationGain)} m` },
      { icon: Clock,      label: formatDuration(a.totalTimeSeconds) },
    ]
  }
  return [
    ...(a.metaType === 'sito' && a.siteType ? [{ icon: MapPin, label: SITE_TYPE_CONFIG[a.siteType].label }] : []),
    ...(a.totalTimeSeconds > 0 ? [{ icon: Clock, label: formatDuration(a.totalTimeSeconds) }] : []),
  ]
}

function metaToItem(a: ActivityMeta): RouteHubItem {
  return {
    id: a.id,
    title: a.title ?? reportNoun(a.metaType),
    polyline: a.routePolyline,
    statPills: statPillsFor(a),
    sortValues: {
      date: new Date(a.startTime).getTime(),
      km: a.distanceMeters,
      dplus: a.elevationGain,
      cts: a.trailScore,
      rating: a.userRating,
    },
    // Manual rating stands in for a computed score here — a completed hike's own vote is more
    // meaningful than an estimate, and it's already known for every item with no extra fetch.
    scorePreview: a.userRating != null ? { value: a.userRating, max: 10, color: ratingColor(a.userRating) } : undefined,
    favorite: a.favorite,
  }
}

/** `parentCammino`: l'hub mostra solo i reportage delle tappe di quel cammino (galleria compresa) e resta sotto il suo reportage. */
export default function ResocontoHub({ id, parentCammino }: { id?: string; parentCammino?: string }) {
  const router = useRouter()

  const [rawActivities, setRawActivities] = useState<ActivityMeta[]>([])
  const [items,      setItems]      = useState<RouteHubItem[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [covers,     setCovers]     = useState<Record<string, string>>({})
  const [currentId,  setCurrentId]  = useState<string | null>(id ?? null)
  const [activity,   setActivity]   = useState<StoredActivity | null>(null)
  // Copertina del Sito quando il suo Reportage non ha foto proprie (lib/useSiteContext.ts).
  const siteCtx = useSiteContext(activity)
  const [saving,     setSaving]     = useState(false)
  const [notesVal,   setNotesVal]   = useState('')
  const [editNotes,  setEditNotes]  = useState(false)
  const [titleVal,   setTitleVal]   = useState('')
  const [editTitle,  setEditTitle]  = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect,   setShowAspect]   = useState(false)
  const [pois,            setPois]           = useState<PoiItem[]>([])
  const [poisLoaded,      setPoisLoaded]     = useState(false)
  // Abbinamento POI↔Wikipedia (immagine + estratto) per la modalità video "Illustrativo".
  // Le escursioni nate da un percorso pianificato se lo portano dietro dal piano (activity.poiWiki,
  // vedi lib/activitySave.ts); per tutte le altre — GPX importati, o attività salvate prima di
  // quella colonna — si risolve qui dal vivo, come già fa app/guida/GuidaHub.tsx.
  const [poiWiki,         setPoiWiki]        = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [ratingVal,       setRatingVal]      = useState(0)
  const [ratingNote,      setRatingNote]     = useState('')
  const [savingRating,    setSavingRating]   = useState(false)
  const [showRatingPanel, setShowRatingPanel] = useState(false)
  const [show3D,          setShow3D]          = useState(false)
  const [openVideoWizard, setOpenVideoWizard] = useState(false)
  const [showStreetView,  setShowStreetView]  = useState(false)
  const [photos,          setPhotos]          = useState<RoutePhoto[]>([])
  const [photosError,     setPhotosError]     = useState(false)
  const [coverPhotoId,    setCoverPhotoId]    = useState<string | null>(null)
  const [showShare,       setShowShare]       = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [ctsResult,       setCtsResult]       = useState<TrailScoreResult | null>(null)
  const [ctsComputing,    setCtsComputing]    = useState(false)
  const [favoritesFilter, setFavoritesFilter] = useState(false)
  const [pendingScrollSection, setPendingScrollSection] = useState<'dati_punteggi' | null>(null)

  // A quale Diario appartiene ogni Meta (planned_hikes.diary_id) — indiretto: activities non ha
  // una colonna propria, l'appartenenza passa dal suo Percorso collegato. Caricato una volta sola
  // da getAllPlanned() (cache-first, senza trackPoints — leggero) invece di una fetch dedicata per
  // ogni resoconto aperto: quella richiedeva un giro di rete in più a ogni swipe, con l'etichetta
  // del Diario visibilmente in ritardo rispetto al resto della copertina.
  const [diaries,         setDiaries]         = useState<DiarySummary[]>([])
  const [plannedDiaryById, setPlannedDiaryById] = useState<Map<string, string | null>>(new Map())
  // Cammini: le attività delle tappe non sono voci della galleria, ma ne alimentano UNA per cammino (il
  // reportage contenitore). Servono il loro elenco e il nome/piano di ogni cammino.
  const [tappaActs, setTappaActs] = useState<ActivityMeta[]>([])
  const [camminoNames, setCamminoNames] = useState<Map<string, string>>(new Map())
  // Pannello "Gestisci questo Reportage" (icona a ingranaggio sul titolo, uniformata con quella di
  // /diario — prima erano due frecce che aprivano solo lo spostamento) — titolo e Diario di
  // appartenenza modificabili nello stesso posto, invece di due azioni separate.
  const [manageOpen,      setManageOpen]      = useState(false)
  const [manageTitleVal,  setManageTitleVal]  = useState('')
  const [manageTitleSaving, setManageTitleSaving] = useState(false)
  const [moveBusy,        setMoveBusy]        = useState(false)
  const [moveError,       setMoveError]       = useState<string | null>(null)

  // Filtro per Diario — a differenza del mover sopra (sposta il singolo resoconto aperto), questo
  // filtra l'intera lista (carosello + galleria) a un solo Diario, o la lascia intera ("Tutti i
  // Diari", null). Vive nell'etichetta che prima mostrava soltanto il Diario del resoconto aperto:
  // ora quell'etichetta è il controllo del filtro stesso, sempre visibile indipendentemente da
  // quale resoconto è in copertina.
  const [diaryFilter,     setDiaryFilter]     = useState<string | null>(null)
  const [diaryFilterOpen, setDiaryFilterOpen] = useState(false)

  const dtmProfile      = useDtmProfile(activity)
  const terrainProfile  = useTerrainProfile(activity)
  const inProtectedArea = useProtectedAreaCheck(activity)
  const driving         = useDrivingDistance(activity)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)
  // Indirizzo/punto di partenza salvato nelle impostazioni — usato per la distanza in auto
  // mostrata nell'hero e come filtro di ordinamento della galleria.
  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])

  const drivingWithMaps = useMemo(() => {
    if (!driving) return driving
    const trailStart = activity?.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])?.[0]
    const mapsUrl = userOrigin && trailStart
      ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
      : undefined
    return { ...driving, mapsUrl }
  }, [driving, userOrigin, activity?.trackPoints])

  const heroPolyline = useMemo((): [number, number][] => {
    const pts = (activity?.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
    if (!pts.length) return []
    const step = Math.max(1, Math.ceil(pts.length / 100))
    return pts.filter((_, i) => i % step === 0).map(p => [p.lat!, p.lon!])
  }, [activity])

  const flora = useFlora(heroPolyline, activity?.altitudeMax)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)

  // Lightweight list of all completed hikes, most recent first — backs the carousel/gallery.
  // getAllActivities() is stale-while-revalidate: it resolves instantly with last visit's
  // locally cached list, then fetches the real one in the background. Without onRefresh, that
  // fresh fetch (with up-to-date trailScore/userRating) is saved to the local cache for next
  // time but never reaches this session's `items` — so the gallery stays a visit behind.
  const applyList = useCallback((list: ActivityMeta[]) => {
    // Le tappe di un cammino sono capitoli del reportage del cammino, non voci della galleria: resta
    // solo quella aperta (si arriva da "Foto e dettagli della tappa").
    setTappaActs(list.filter(a => a.tappaIndex != null))
    // Sotto un reportage-cammino: solo le sue tappe, nell'ordine del cammino.
    const sorted = parentCammino
      ? list.filter(a => a.linkedPlannedId === parentCammino && a.tappaIndex != null).sort((a, b) => (a.tappaIndex ?? 0) - (b.tappaIndex ?? 0))
      : list.filter(a => a.tappaIndex == null || a.id === id).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    setRawActivities(sorted)
    setItems(sorted.map(metaToItem))
  }, [id, parentCammino])

  useEffect(() => {
    getAllActivities(applyList).then(applyList).catch(() => setItems([])).finally(() => setListLoaded(true))
  }, [applyList])

  // A background pull (another device added/edited/deleted an activity, or this device just
  // caught up after being offline) lands in the local cache without any user action on this page —
  // without this, the gallery would stay frozen on the pre-pull list until a manual reload.
  useCtsUpdated(() => { getAllActivities().then(applyList).catch(() => {}) })

  // Background best-effort cover-photo fetch for the gallery/carousel thumbnails (capped —
  // this is a nice-to-have visual enhancement, not core functionality). Stessa selezione di
  // `cover()` più sotto (salvata dall'utente, altrimenti pickBestCoverPhoto) invece della prima
  // foto qualunque — altrimenti questa copertina "veloce" mostrata appena si atterra su
  // un'escursione differiva quasi sempre da quella "vera" calcolata poco dopo (quando `photos`/
  // `activity` si aggiornano per quell'id), con un fastidioso cambio foto visibile a schermo.
  useEffect(() => {
    if (rawActivities.length === 0) return
    let cancelled = false
    rawActivities.slice(0, COVER_FETCH_CAP).forEach(a => {
      fetchActivityPhotos(a.id).then(ph => {
        if (cancelled || ph.length === 0) return
        const savedId = localStorage.getItem(`dtrek_cover_${a.id}`)
        const chosen = (savedId && ph.find(p => p.id === savedId)) || pickBestCoverPhoto(ph)
        if (!chosen) return
        setCovers(prev => prev[a.id] ? prev : { ...prev, [a.id]: chosen.url })
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [rawActivities])


  useEffect(() => {
    if (!currentId) return
    // Il reportage contenitore di un cammino non è un'attività: niente da caricare qui (si apre dalla galleria).
    if (currentId.startsWith(CAMMINO_PREFIX)) { setActivity(null); return }
    const loadPoisFor = (a: StoredActivity) => {
      // Un Borgo/Città con i veri stop dell'itinerario curato (lib/activitySave.ts's
      // visitedBorgoStops) mostra quelli in ReportReader's BorgoStopsWidget — mai la query Overpass
      // generica qui sotto, che finirebbe solo per essere scaricata e mai mostrata.
      if (a.metaType === 'borgo_citta' && a.borgoStops?.length) { setPoisLoaded(true); return }
      const gps = a.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined).map(p => [p.lat!, p.lon!] as [number, number])
      if (gps.length === 0) { setPoisLoaded(true); return }
      const bbox = computeBbox(gps)
      fetch(`/api/pois?bbox=${bbox}`)
        .then(r => r.json())
        .then((all: PoiItem[]) => {
          const nearby = all.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
            .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
          setPois(nearby)
          if (!a.poiWiki?.length) {
            fetchWikiForNamedPois(nearby).then(setPoiWiki).catch(() => {})
          }
        })
        .catch(() => {})
        .finally(() => setPoisLoaded(true))
    }
    setPois([]); setPoisLoaded(false); setPoiWiki([]); setPhotos([]); setPhotosError(false); setCoverPhotoId(null)
    // No onRefresh callback here: getActivityById already persists the background-revalidated
    // copy to the local cache for next time. Wiring it into setActivity too would re-apply the
    // full activity (new object/array references) a second time once the network round-trip
    // completes — a visible re-render "blink" ~1s after the card already opened correctly.
    getActivityById(currentId).then(a => {
      if (!a) { router.push(parentCammino ? `/resoconto/cammino/${encodeURIComponent(parentCammino)}` : '/resoconto'); return }
      setActivity(a)
      setNotesVal(a.userNotes ?? '')
      setRatingVal(a.userRating ?? 0)
      setRatingNote(a.userRatingNote ?? '')
      loadPoisFor(a)
    })
    fetchActivityPhotos(currentId).then(setPhotos).catch(() => setPhotosError(true))
    const savedCover = localStorage.getItem(`dtrek_cover_${currentId}`)
    if (savedCover) setCoverPhotoId(savedCover)
  }, [currentId, router, parentCammino])

  useEffect(() => {
    fetch('/api/diaries').then(r => r.ok ? r.json() : []).then(setDiaries).catch(() => {})
  }, [])

  // Elenco leggero di tutte le Mete (senza trackPoints), da cui si ricava il Diario di ogni
  // resoconto per id — una sola volta (più un refresh in background se la cache locale era
  // stale), non una fetch per ogni resoconto aperto.
  const applyPlannedDiaryMap = useCallback((list: PlannedHikeMeta[]) => {
    setPlannedDiaryById(new Map(list.map(h => [h.id, h.diaryId ?? null])))
    setCamminoNames(new Map(list.filter(h => h.metaType === 'cammino' && h.camminoPlan).map(h => [h.id, h.camminoPlan!.camminoName])))
  }, [])
  useEffect(() => {
    getAllPlanned(applyPlannedDiaryMap).then(applyPlannedDiaryMap).catch(() => {})
  }, [applyPlannedDiaryMap])
  // Un Diario spostato altrove (da qui, da /diario, o da un'altra scheda/dispositivo) aggiorna la
  // cache locale delle Mete e spedisce lo stesso evento delle activities sopra — senza
  // sottoscriverlo, l'etichetta del Diario resterebbe quella con cui questa pagina si è aperta.
  useCtsUpdated(() => { getAllPlanned().then(applyPlannedDiaryMap).catch(() => {}) })

  // Chiude il pannello "Gestisci questo Reportage" se cambia il resoconto in copertina (swipe) —
  // evita di modificare per sbaglio quello sbagliato se restasse aperto.
  useEffect(() => { setManageOpen(false); setMoveError(null) }, [currentId])

  // Il Diario del resoconto aperto passa dalla sua Meta (activities.linked_planned_id →
  // planned_hikes.diary_id) — non c'è una colonna diretta, quindi un lookup nella mappa sopra
  // invece di una colonna propria dell'attività.
  const currentDiaryId = activity?.linkedPlannedId != null
    ? plannedDiaryById.get(activity.linkedPlannedId) ?? null
    : null

  // Sposta il resoconto aperto in un altro Diario — l'appartenenza passa dalla sua Meta, non da una
  // colonna propria dell'attività (stesso meccanismo di components/diario/DiarioSommarioContent.tsx).
  async function moveToDiary(targetDiaryId: string) {
    const plannedId = activity?.linkedPlannedId
    if (!plannedId) { setMoveError('Questo reportage è antecedente ai Diari e non ha una Meta da spostare.'); return }
    setMoveBusy(true); setMoveError(null)
    try {
      const res = await fetch('/api/planned', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plannedId, diaryId: targetDiaryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
      setPlannedDiaryById(prev => new Map(prev).set(plannedId, targetDiaryId))
      setManageOpen(false)
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e))
    } finally {
      setMoveBusy(false)
    }
  }

  // CTS+Beauty: computed once at import (lib/activitySave.ts) and re-verified here only if
  // missing (an older activity, saved before that policy existed) or older than
  // SCORE_STALE_DAYS — same policy as the planned-hike side in GuidaHub.
  useCtsRecompute({
    entity: activity,
    entityId: activity?.id,
    isFresh: (a) => a.trailScore != null && isScoreFresh(a.trailScoreComputedAt),
    hasEnoughGps: (a) => a.trackPoints.filter(p => p.lat && p.lon).length >= 2,
    poisReady: poisLoaded,
    dtmProfile, terrainProfile, inProtectedArea, prefsLoaded,
    pois,
    prefs: { prefSforzo, prefDurata, hrRest, hrMax },
    compute: computeCtsForActivity,
    onResult: (result) => setActivity(prev => prev ? { ...prev, ...result } : prev),
    setComputing: setCtsComputing,
  })

  useEffect(() => {
    const bs = activity?.linkedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded || !activity) return
    const computed = computeTrailScore(bs, {
      distanceMeters: activity.distanceMeters, elevationGain: activity.elevationGain,
      elevationLoss: activity.elevationLoss ?? 0, altitudeMax: activity.altitudeMax,
      avgHeartRate: activity.avgHeartRate, prefSforzo, prefDurata,
    })
    setCtsResult({ ...computed, ts: activity.trailScore ?? computed.ts })
  }, [activity?.id, prefsLoaded, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps

  const similarActivities = useMemo(() => {
    if (!activity) return []
    const startPt = activity.trackPoints.find(p => p.lat !== undefined && p.lon !== undefined)
    if (!startPt) return []
    return findSimilarActivities(
      { id: activity.id, distanceMeters: activity.distanceMeters, startLat: startPt.lat!, startLon: startPt.lon! },
      rawActivities,
    )
  }, [activity, rawActivities])

  const weatherIcon = useMemo(() => {
    if (!activity?.weatherAtHike) return null
    const info = wmoInfo(activity.weatherAtHike.weathercode)
    return { emoji: info.emoji, label: info.label }
  }, [activity])

  // Un'unica voce per cammino, sintetizzata dalle sue tappe percorse: cifre sommate, tracciato unito, data
  // dell'ultima tappa. Si apre sul reportage del cammino (/resoconto/cammino/[id]).
  const containerMetas = useMemo(() => {
    if (parentCammino) return []
    const byHike = new Map<string, ActivityMeta[]>()
    for (const a of tappaActs) {
      if (!a.linkedPlannedId) continue
      byHike.set(a.linkedPlannedId, [...(byHike.get(a.linkedPlannedId) ?? []), a])
    }
    const out: ActivityMeta[] = []
    byHike.forEach((acts, hikeId) => {
      const sorted = acts.slice().sort((x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime())
      const latest = sorted[sorted.length - 1]
      out.push({
        ...latest,
        id: `${CAMMINO_PREFIX}${hikeId}`,
        title: camminoNames.get(hikeId) ?? 'Cammino',
        distanceMeters: sorted.reduce((s, a) => s + a.distanceMeters, 0),
        totalTimeSeconds: sorted.reduce((s, a) => s + a.totalTimeSeconds, 0),
        elevationGain: sorted.reduce((s, a) => s + (a.elevationGain ?? 0), 0),
        elevationLoss: sorted.reduce((s, a) => s + (a.elevationLoss ?? 0), 0),
        routePolyline: sorted.flatMap(a => a.routePolyline ?? []),
        tappaIndex: undefined, userRating: undefined, favorite: false, trailScore: undefined,
        linkedPlannedId: hikeId, metaType: 'cammino',
      })
    })
    return out
  }, [tappaActs, camminoNames, parentCammino])
  const itemsAll = useMemo(
    () => [...items, ...containerMetas.map(metaToItem)].sort((a, b) => (b.sortValues?.date ?? 0) - (a.sortValues?.date ?? 0)),
    [items, containerMetas],
  )
  const rawActivityById = useMemo(() => new Map([...rawActivities, ...containerMetas].map(a => [a.id, a])), [rawActivities, containerMetas])

  useEffect(() => {
    if (currentId || itemsAll.length === 0) return
    setCurrentId((itemsAll.find(i => !i.id.startsWith(CAMMINO_PREFIX)) ?? itemsAll[0]).id)
  }, [itemsAll, currentId])

  const displayItems = useMemo(() => {
    // Distanza in auto REALE (OSRM, via useDrivingDistance) — non in linea d'aria. A differenza
    // di planned_hikes, un'activity completata non ha una colonna cache per questo valore (vedi
    // app/resoconto/useDrivingDistance.ts), quindi qui è disponibile solo per quella aperta ora;
    // le altre schede semplicemente non mostrano la pillola finché non vengono aperte a loro volta.
    const distancePillFor = (polyline: [number, number][] | undefined, isActive: boolean) => {
      if (!isActive || !driving) return null
      const trailStart = polyline?.[0]
      const href = userOrigin && trailStart
        ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
        : undefined
      return { icon: Car, label: `${Math.round(driving.distanceMeters / 1000)} km in auto`, href }
    }
    const pillsFor = (a: StoredActivity) => {
      const polyline = a.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      const distPill = distancePillFor(polyline, true)
      return [
        ...statPillsFor(a),
        ...(metaHasHikingMetrics(a.metaType) && (a.calories ?? 0) > 0 ? [{ icon: Flame, label: `${a.calories} kcal` }] : []),
        ...(distPill ? [distPill] : []),
      ]
    }
    const sortValuesFor = (a: StoredActivity) => ({
      date: new Date(a.startTime).getTime(), km: a.distanceMeters, dplus: a.elevationGain, cts: a.trailScore, rating: a.userRating,
      distance: driving?.distanceMeters,
    })
    // Per il percorso aperto la copertina scelta a mano (o quella "intelligente" di riserva) deve
    // vincere sempre sulla cache generica `covers` (un solo scatto per galleria, presa in
    // background per le altre schede) — altrimenti la scelta fatta in Strumenti veniva ignorata
    // sulla copertina a percorso chiuso non appena quella cache si popolava. Nessuna foto ⇒
    // undefined, così RouteHub ricade sulla mappa (CoverMap), come per Guida.
    const cover = (id_: string) => id_ === activity?.id
      ? photos.find(p => p.id === coverPhotoId)?.url
        ?? (metaHasHikingMetrics(activity?.metaType) ? pickBestCoverPhoto(photos)?.url : photos[0]?.url)
        ?? siteCtx?.imageUrl ?? covers[id_]
      : covers[id_]
    const scorePreviewFor = (a: StoredActivity) => a.userRating != null ? { value: a.userRating, max: 10, color: ratingColor(a.userRating) } : undefined
    const mapped = itemsAll.map(it => {
      if (it.id === activity?.id) {
        // Il percorso aperto ha già il tracciato completo (activity.trackPoints): ricalcolare la
        // polyline da qui invece di tenere quella (a volte assente/obsoleta) della lista leggera
        // evita che la copertina/miniatura restino senza mappa di riserva quando non c'è una foto.
        const polyline = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        return { ...it, polyline, statPills: pillsFor(activity), coverPhotoUrl: cover(it.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity), favorite: activity.favorite }
      }
      const coverUrl = cover(it.id)
      return coverUrl ? { ...it, coverPhotoUrl: coverUrl } : it
    })
    const withOpen = activity && !mapped.some(it => it.id === activity.id)
      ? [{ id: activity.id, title: activity.title ?? reportNoun(activity.metaType), polyline: activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]), statPills: pillsFor(activity), coverPhotoUrl: cover(activity.id), sortValues: sortValuesFor(activity), scorePreview: scorePreviewFor(activity), favorite: activity.favorite }, ...mapped]
      : mapped
    if (diaryFilter == null) return withOpen
    // Il Diario di ogni resoconto passa dalla sua Meta (activity.linkedPlannedId →
    // planned_hikes.diary_id), non da una colonna propria — stesso lookup di currentDiaryId sopra,
    // ripetuto qui per ogni elemento della lista invece che solo per quello aperto.
    return withOpen.filter(it => {
      const linkedPlannedId = it.id === activity?.id ? activity.linkedPlannedId : rawActivityById.get(it.id)?.linkedPlannedId
      if (!linkedPlannedId) return false
      return (plannedDiaryById.get(linkedPlannedId) ?? null) === diaryFilter
    })
  }, [itemsAll, covers, activity, photos, coverPhotoId, siteCtx?.imageUrl, driving, userOrigin, diaryFilter, rawActivityById, plannedDiaryById])

  if (!listLoaded) {
    return <HubSkeleton />
  }
  if (!currentId) {
    if (itemsAll.length > 0) return <HubSkeleton />
    return (
      <div className="fixed inset-0 bg-forest-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-stone-300 text-sm">Nessuna escursione conclusa.</p>
        <button onClick={() => router.push('/upload?tab=activity')} className="px-5 py-2.5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Importa o Naviga
        </button>
      </div>
    )
  }
  if (displayItems.length === 0) {
    return <HubSkeleton />
  }

  const patch = async (data: Parameters<typeof updateActivityMeta>[1]) => {
    if (!activity) return
    setSaving(true)
    try { await updateActivityMeta(activity.id, data); setActivity(prev => prev ? { ...prev, ...data } : prev) }
    finally { setSaving(false) }
  }
  const saveNotes  = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  const saveTitle = async () => {
    const trimmed = titleVal.trim()
    if (!trimmed) return
    await patch({ title: trimmed })
    setItems(prev => prev.map(it => it.id === activity?.id ? { ...it, title: trimmed } : it))
    setEditTitle(false)
  }
  // Titolo dal pannello "Gestisci questo Reportage" (icona a ingranaggio) — stesso patch di
  // saveTitle sopra, stato separato: i due editor (questo e quello nella scheda Strumenti) non si
  // influenzano a vicenda se aperti in momenti diversi.
  const saveManageTitle = async () => {
    const trimmed = manageTitleVal.trim()
    if (!trimmed || trimmed === activity?.title) { setManageTitleVal(activity?.title ?? ''); return }
    setManageTitleSaving(true)
    try {
      await patch({ title: trimmed })
      setItems(prev => prev.map(it => it.id === activity?.id ? { ...it, title: trimmed } : it))
    } finally {
      setManageTitleSaving(false)
    }
  }
  const saveRating = async () => {
    if (!activity || !ratingVal) return
    setSavingRating(true)
    try {
      await updateActivityMeta(activity.id, { userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined })
      setActivity(prev => prev ? { ...prev, userRating: ratingVal, userRatingNote: ratingNote.trim() || undefined } : prev)
      setShowRatingPanel(false)
    } finally { setSavingRating(false) }
  }
  const setCover = (photoId: string | null) => {
    if (!activity) return
    setCoverPhotoId(photoId)
    if (photoId) localStorage.setItem(`dtrek_cover_${activity.id}`, photoId)
    else localStorage.removeItem(`dtrek_cover_${activity.id}`)
    setShowCoverPicker(false)
  }
  const handleDelete = async () => {
    if (!activity || !confirm('Eliminare questa escursione dal diario?')) return
    setSaving(true)
    await deleteActivity(activity.id)
    router.push('/resoconto')
  }

  const handleComputeCts = async () => {
    if (!activity) return
    const gps = activity.trackPoints.filter(p => p.lat && p.lon)
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      const result = await computeCtsForActivity(activity, {
        pois: poisLoaded ? pois : undefined,
        dtmProfile, terrainProfile, inProtectedArea,
        prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
      })
      if (result) setActivity(prev => prev ? { ...prev, ...result } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }

  // Non legata a `activity` (a differenza di patch sopra) — la stella va toccabile su qualunque
  // scheda della galleria, anche quella non ancora "aperta" — stesso meccanismo di GuidaHub.
  const handleToggleFavorite = (routeItem: RouteHubItem) => {
    const next = !routeItem.favorite
    setItems(prev => prev.map(it => it.id === routeItem.id ? { ...it, favorite: next } : it))
    setActivity(prev => prev && prev.id === routeItem.id ? { ...prev, favorite: next } : prev)
    updateActivityMeta(routeItem.id, { favorite: next })
  }

  const gpsPoints = activity?.trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0
  const rated     = (activity?.userRating ?? 0) > 0

  // Anello del voto, mostrato sotto il sottotitolo (stessa posizione del badge a doppio anello di
  // Guida) invece che nella fila di chip sopra il titolo — stesso principio, un dato diverso (il
  // voto manuale non è un punteggio calcolato, quindi resta un anello singolo, non a doppio anello).
  const scoreGaugeBadge = (routeItem: RouteHubItem, onTap: () => void) => {
    if (!activity || routeItem.id !== activity.id || !rated) return null
    return (
      <button onClick={() => { setPendingScrollSection('dati_punteggi'); onTap() }} title="Voto" className="pointer-events-auto shrink-0">
        <RatingGaugeBadge value={activity.userRating!} size={72} note={activity.userRatingNote} />
      </button>
    )
  }

  // Filtro per Diario, sopra il titolo (stessa posizione della Raccolta in app/diario/page.tsx) —
  // mostra sempre il filtro attivo ("Tutti i Diari", o il Diario scelto), non più il Diario del
  // singolo resoconto aperto: è un controllo di pagina, non un'informazione sulla scheda in
  // copertina. Stessa icona della voce "Diari" nella barra del menù (BookMarked), non più BookOpen
  // (quella di "Resoconti" — usarla qui confondeva le due sezioni).
  const contextBadge = () => {
    const filterDiary = diaryFilter ? diaries.find(d => d.id === diaryFilter) : null
    return (
      <button
        onClick={() => setDiaryFilterOpen(true)}
        className="pointer-events-auto inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full"
      >
        <BookMarked className="w-3.5 h-3.5" />
        {filterDiary ? filterDiary.title : 'Tutti i Diari'}
        <ChevronDown className="w-3 h-3" />
      </button>
    )
  }

  // Icona a ingranaggio "Gestisci questo Reportage" — uniformata con quella di /diario (prima
  // erano due frecce, come l'icona di spostamento vera e propria sulla pagina Diari, che generava
  // confusione: qui apre un pannello che modifica titolo e Diario di appartenenza insieme, non solo
  // lo spostamento). Sempre visibile anche quando il Diario non è ancora noto.
  const titleAction = (routeItem: RouteHubItem) => {
    if (!activity || routeItem.id !== activity.id) return null
    return (
      <button
        onClick={() => { setManageTitleVal(activity.title ?? ''); setManageOpen(true) }}
        title="Gestisci questo Reportage"
        className="pointer-events-auto p-1"
      >
        <Settings className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
      </button>
    )
  }

  const retryPhotos = () => {
    if (!currentId) return
    setPhotosError(false)
    fetchActivityPhotos(currentId).then(setPhotos).catch(() => setPhotosError(true))
  }

  const ratingBadge = (item: RouteHubItem) => {
    if (!activity || item.id !== activity.id || !rated) return null
    return (
      <span className="flex flex-col items-center justify-center text-white leading-none">
        <span className="text-[15px] font-bold">{activity.userRating}</span>
        <span className="text-[7px] font-medium opacity-70">/10</span>
      </span>
    )
  }

  const renderSection = (section: SectionKind, item: RouteHubItem, onClose: () => void) => {
    if (!activity || item.id !== activity.id) {
      return <div className={`py-10 text-center text-sm ${textMuted}`}>Caricamento…</div>
    }

    if (section === 'featured') {
      return (
        // ReportReader usa useSearchParams() (per rilevare il ritorno dal racconto guidato con
        // ?generate=1) — Next.js richiede un confine Suspense attorno a chi lo chiama, altrimenti
        // il build fallisce ("should be wrapped in a suspense boundary").
        <>
        {activity.tappaIndex != null && activity.linkedPlannedId && (
          <a href={`/resoconto/cammino/${encodeURIComponent(activity.linkedPlannedId)}`}
            className="mx-4 mb-3 mt-2 flex items-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3.5 py-2.5 text-sm font-semibold text-forest-800">
            <Mountain className="w-4 h-4 shrink-0" /> Capitolo del reportage del cammino · torna al reportage
          </a>
        )}
        <Suspense fallback={null}>
        <ReportReader
          activity={activity}
          photos={photos}
          photosError={photosError}
          onRetryPhotos={retryPhotos}
          onPhotosChange={setPhotos}
          coverPhotoId={coverPhotoId}
          onOpenCoverPicker={() => setShowCoverPicker(true)}
          pois={pois}
          poisLoaded={poisLoaded}
          driving={drivingWithMaps}
          weatherIcon={weatherIcon}
          data={{
            ctsResult, ctsComputing, onComputeCts: handleComputeCts,
            dtmProfile, showGradient, showAspect,
            onToggleGradient: () => setShowGradient(g => !g),
            onToggleAspect: () => setShowAspect(a => !a),
            similarActivities, onOpenSimilar: (activityId) => router.push(`/resoconto/${activityId}`),
          }}
          natura={{
            hasGps: hasGps && heroPolyline.length > 1, flora: flora.data, floraLoading: flora.loading,
            onOpenFloraGallery: () => setShowFloraGallery(true), onOpenAnimalGallery: () => setShowAnimalGallery(true),
          }}
          onOpenMap3D={() => setShow3D(true)}
          onOpenVideoWizard={() => { setOpenVideoWizard(true); setShow3D(true) }}
          scrollToSectionKey={pendingScrollSection}
          onScrollToSectionConsumed={() => setPendingScrollSection(null)}
        />
        </Suspense>
        </>
      )
    }

    // strumenti
    return (
      <div className="px-4 py-4 space-y-1">
        <button onClick={() => { onClose(); setShowStreetView(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <Images className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Foto zona (street view)</span>
        </button>
        <div className="pt-1 mt-1 border-t border-stone-200 space-y-1">
          {photos.length > 0 && (
            <button onClick={() => { onClose(); setShowCoverPicker(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Camera className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Cambia copertina</span>
            </button>
          )}
          <button onClick={() => { onClose(); setShowShare(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Share2 className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Condividi</span>
          </button>
          <button onClick={() => { onClose(); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Box className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Vista 3D</span>
          </button>
          <button onClick={() => { onClose(); setOpenVideoWizard(true); setShow3D(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <Film className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Crea video</span>
          </button>
          <button onClick={() => import('@/utils/exportExcel').then(m => m.exportActivityToExcel(activity))} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <FileSpreadsheet className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta Excel</span>
          </button>
          <button onClick={() => import('@/utils/exportDoc').then(m => m.exportActivityToDoc(activity))} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <FileText className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta Word</span>
          </button>
          <button onClick={() => exportActivityToGpx(activity)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
            <MapIcon className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta GPX</span>
          </button>
          {/* "Esporta PDF" (jsPDF, utils/pdfExport/activity.ts) ritirato in Fase 4: duplicava, con
              uno stile diverso, il PDF già ottenibile da "Pubblica"/"Scarica PDF" dentro il
              resoconto (ReportReader.tsx) — ora l'unico motore, vedi renderReportPdf.ts. */}
        </div>

        <div className="pt-1 mt-1 border-t border-stone-200">
          {editTitle ? (
            <div className="px-2 py-2 space-y-2">
              <input autoFocus value={titleVal} onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleVal(activity.title ?? ''); setEditTitle(false) } }}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white outline-none focus:border-forest-500" />
              <div className="flex gap-2">
                <button onClick={saveTitle} disabled={saving || !titleVal.trim()} className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-500 text-white rounded-lg text-sm hover:bg-forest-400 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                </button>
                <button onClick={() => { setTitleVal(activity.title ?? ''); setEditTitle(false) }} className={`px-4 py-1.5 text-sm transition-colors ${textMuted}`}>Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setTitleVal(activity.title ?? ''); setEditTitle(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Rinomina reportage</span>
            </button>
          )}
        </div>

        <div className="pt-1 mt-1 border-t border-stone-200">
          {editNotes ? (
            <div className="px-2 py-2 space-y-2">
              <textarea autoFocus value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4}
                placeholder="Descrivi l'escursione, i luoghi visitati, le sensazioni…"
                className="w-full border border-stone-300 rounded-xl p-3 text-sm text-stone-800 bg-white outline-none focus:border-forest-500 resize-none placeholder:text-stone-400" />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-forest-500 text-white rounded-lg text-sm hover:bg-forest-400 transition-colors disabled:opacity-60">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salva
                </button>
                <button onClick={() => { setNotesVal(activity.userNotes ?? ''); setEditNotes(false) }} className={`px-4 py-1.5 text-sm transition-colors ${textMuted}`}>Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditNotes(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Note personali{activity.userNotes ? '' : ' (vuote)'}</span>
            </button>
          )}
        </div>

        <div className="px-2 pt-2">
          <HikeNotesRecorder notes={activity.hikeNotes ?? []} onChange={hikeNotes => patch({ hikeNotes })} />
        </div>

        <div className="pt-1 mt-1 border-t border-stone-200">
          <button onClick={handleDelete} disabled={saving} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-red-50 transition-colors text-left text-red-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="text-sm font-medium">Elimina escursione</span>
          </button>
        </div>
      </div>
    )
  }

  const primaryAction = (routeItem: RouteHubItem): PrimaryAction => ({
    label: rated ? `Voto ${activity?.userRating}/10` : 'Vota bellezza',
    icon: Star,
    onClick: () => setShowRatingPanel(true),
    variant: rated ? 'glass' : 'terra',
    badge: ratingBadge(routeItem),
  })

  const openCammino = (hikeId: string) => router.push(`/resoconto/cammino/${encodeURIComponent(hikeId)}`)
  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      <RouteHub
        mode="resoconto"
        items={displayItems}
        initialIndex={initialIndex}
        favoritesFilter={favoritesFilter}
        onToggleFavoritesFilter={() => setFavoritesFilter(v => !v)}
        onToggleFavorite={handleToggleFavorite}
        onIndexChange={(item) => {
          // Il reportage del cammino si apre direttamente: nessuna pagina intermedia.
          if (item.id.startsWith(CAMMINO_PREFIX)) { openCammino(item.id.slice(CAMMINO_PREFIX.length)); return }
          setCurrentId(item.id)
          // Plain History API, not router.replace: `/resoconto` and `/resoconto/[id]` are
          // different page components, so a Next.js navigation between them unmounts/remounts
          // this whole hub (re-running every data-loading effect) and produces a visible
          // double-render — this is a purely cosmetic address-bar sync, not a real navigation.
          window.history.replaceState(null, '', parentCammino ? `/resoconto/cammino/${encodeURIComponent(parentCammino)}/tappa/${encodeURIComponent(item.id)}` : `/resoconto/${encodeURIComponent(item.id)}`)
        }}
        bodyMode="continuous"
        renderSection={renderSection}
        primaryAction={primaryAction}
        scoreGaugeBadge={scoreGaugeBadge}
        scoreBadgesTargetSection="featured"
        weatherIcon={(routeItem) => activity && routeItem.id === activity.id ? weatherIcon : undefined}
        onCompare={(routeItem) => router.push(`/statistiche?tab=confronta&pre=${encodeURIComponent(`c:${routeItem.id}`)}`)}
        topOverlayVariant="magazine"
        importLabel="Carica"
        onImport={() => router.push('/upload?tab=activity')}
        contextBadge={contextBadge}
        titleAction={titleAction}
      />

      {manageOpen && activity && (
        <ManageReportageOverlay
          titleVal={manageTitleVal}
          onTitleChange={setManageTitleVal}
          onTitleBlur={saveManageTitle}
          titleSaving={manageTitleSaving}
          diaries={diaries.filter(d => !d.archivedAt)}
          currentDiaryId={currentDiaryId}
          moveBusy={moveBusy}
          moveError={moveError}
          onSelectDiary={moveToDiary}
          onClose={() => setManageOpen(false)}
        />
      )}

      {diaryFilterOpen && (
        <DiaryFilterOverlay
          diaries={diaries.filter(d => !d.archivedAt)}
          currentId={diaryFilter}
          onSelect={id => { setDiaryFilter(id); setDiaryFilterOpen(false) }}
          onClose={() => setDiaryFilterOpen(false)}
        />
      )}

      {showRatingPanel && activity && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowRatingPanel(false)}>
          <div className="bg-forest-900 text-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-forest-200">{rated ? `Voto attuale: ${activity.userRating}/10` : 'Dai il tuo voto di bellezza'}</p>
              <button onClick={() => setShowRatingPanel(false)} className="text-forest-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2 mb-4">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const sel = n === ratingVal
                return (
                  <button key={n} onClick={() => setRatingVal(n)} style={sel ? { backgroundColor: ratingColor(n) } : {}}
                    className={`flex-1 aspect-square rounded-xl text-sm font-bold transition-all ${sel ? 'text-white scale-110 shadow-lg' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}>
                    {n}
                  </button>
                )
              })}
            </div>
            <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)} placeholder="Nota (opzionale)…" rows={2}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-white/40 mb-3" />
            <div className="flex gap-2">
              <button onClick={saveRating} disabled={savingRating || ratingVal === 0}
                className="flex items-center gap-2 px-5 py-2 bg-forest-500 hover:bg-forest-400 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">
                {savingRating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {rated ? 'Aggiorna' : 'Salva voto'}
              </button>
              <button onClick={() => setShowRatingPanel(false)} className="px-4 py-2 text-sm text-forest-400 hover:text-white">Annulla</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showCoverPicker && activity && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCoverPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-stone-700 uppercase tracking-wide text-sm">Scegli la copertina</h3>
              <button onClick={() => setShowCoverPicker(false)} className="text-stone-400 hover:text-stone-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
              <button onClick={() => setCover(null)}
                className={`aspect-square rounded-lg border-2 flex items-center justify-center text-xs text-stone-400 font-medium transition-colors ${!coverPhotoId ? 'border-forest-500 bg-forest-50' : 'border-stone-200 hover:border-forest-300'}`}>
                Predefinita
              </button>
              {photos.map(ph => (
                <button key={ph.id} onClick={() => setCover(ph.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${coverPhotoId === ph.id ? 'border-forest-500' : 'border-stone-200 hover:border-forest-300'}`}>
                  {/* DTREK-AUDIT.md P3 #35 */}
                  <FallbackImage loadingIndicator={<ImageSpinner />} fallback={<ImagePlaceholder />} src={ph.thumbUrl ?? ph.url} alt={ph.caption ?? ''} fill sizes="120px" className="object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showShare && activity && (() => {
        // Traccia PIENA, non ridotta a 250 punti: la mappa di condivisione ora è MapLibre
        // (vettoriale), non più tile raster campionate — a differenza di quelle, non ha nulla da
        // guadagnare da un tracciato più povero, e i tornanti restano fedeli.
        const polyline = activity.trackPoints.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
        const altPts = activity.trackPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
        const aStep = Math.max(1, Math.ceil(altPts.length / 140))
        const elevationProfile = altPts.length > 4 ? altPts.filter((_, i) => i % aStep === 0) : undefined
        const actMeta: ActivityMeta = {
          id: activity.id, title: activity.title ?? activity.notes ?? reportNoun(activity.metaType),
          startTime: activity.startTime, distanceMeters: activity.distanceMeters,
          totalTimeSeconds: activity.totalTimeSeconds, calories: activity.calories,
          avgHeartRate: activity.avgHeartRate, maxHeartRate: activity.maxHeartRate,
          elevationGain: activity.elevationGain, elevationLoss: activity.elevationLoss,
          altitudeMax: activity.altitudeMax, avgSpeedMs: activity.avgSpeedMs,
          maxSpeedMs: activity.maxSpeedMs, tags: activity.tags,
          userNotes: activity.userNotes, fileName: activity.fileName,
          routePolyline: polyline,
          elevationProfile,
        }
        return <ShareModal kind="activity" activity={actMeta} photos={photos} onClose={() => setShowShare(false)} />
      })()}

      {show3D && activity && (
        <RouteMap3D trackPoints={activity.trackPoints} title={activity.title ?? activity.notes}
          onClose={() => { setShow3D(false); setOpenVideoWizard(false) }} plannedTrackPoints={activity.linkedPlannedTrackPoints}
          activityId={activity.id} initialVideoState={openVideoWizard ? 'presets' : 'idle'}
          distanceMeters={activity.distanceMeters} elevationGain={activity.elevationGain} pois={pois} dtmProfile={dtmProfile}
          beautyScore={activity.linkedBeautyScore}
          poiWiki={activity.poiWiki?.length ? activity.poiWiki : poiWiki}
          guide={activity.guideText ? { text: activity.guideText, notices: activity.guideNotices, generatedAt: activity.guideGeneratedAt } : undefined} />
      )}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={activity?.title ?? undefined} onClose={() => setShowStreetView(false)} />
      )}

      {showFloraGallery && activity && (
        <FloraGallery
          trackPoints={activity.trackPoints}
          month={new Date(activity.startTime).getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowFloraGallery(false)}
        />
      )}
      {showAnimalGallery && activity && (
        <AnimalGallery
          trackPoints={activity.trackPoints}
          month={new Date(activity.startTime).getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowAnimalGallery(false)}
        />
      )}
    </>
  )
}

// Pannello "Gestisci questo Reportage" — icona a ingranaggio sul titolo (uniformata con quella di
// /diario, che apre l'analogo "Gestisci questo Diario"): titolo e Diario di appartenenza in un
// unico posto invece di due azioni separate (prima solo lo spostamento, dietro un'icona a doppia
// freccia). Stessa identità visiva scura delle altre liste a schermo intero di questa pagina.
function ManageReportageOverlay({
  titleVal, onTitleChange, onTitleBlur, titleSaving,
  diaries, currentDiaryId, moveBusy, moveError, onSelectDiary, onClose,
}: {
  titleVal: string
  onTitleChange: (v: string) => void
  onTitleBlur: () => void
  titleSaving: boolean
  diaries: DiarySummary[]
  currentDiaryId: string | null
  moveBusy: boolean
  moveError: string | null
  onSelectDiary: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0b1a24] flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3 border-b border-white/10">
        <h2 className="font-display text-base font-bold text-white">Gestisci questo Reportage</h2>
        <button onClick={onClose} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        <div className="py-4 border-b border-white/10">
          <label className="block font-barlow text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Titolo</label>
          <div className="relative">
            <input
              value={titleVal}
              onChange={e => onTitleChange(e.target.value)}
              onBlur={onTitleBlur}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="Titolo del Reportage"
              className="w-full bg-transparent outline-none border-b border-white/15 focus:border-white/40 font-display text-lg font-bold text-white pb-1.5 pr-7 transition-colors"
            />
            {titleSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 absolute right-0 bottom-2.5" />}
          </div>
        </div>

        <div className="pt-4">
          <label className="block font-barlow text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Diario</label>
          {moveError && <p className="text-xs text-red-400 mb-2">{moveError}</p>}
          {diaries.length === 0 ? (
            <p className="text-center text-white/50 text-sm mt-6">Nessun Diario disponibile.</p>
          ) : diaries.map(d => (
            <button
              key={d.id}
              onClick={() => onSelectDiary(d.id)}
              disabled={moveBusy || d.id === currentDiaryId}
              className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left disabled:opacity-50"
            >
              <div className={`w-14 h-14 rounded-xl shrink-0 overflow-hidden relative flex items-center justify-center bg-white/5 ${d.id === currentDiaryId ? 'ring-2 ring-sky-400' : ''}`}>
                {d.coverUrl ? (
                  <SafeImg src={d.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" fallback={<BookMarked className="w-5 h-5 text-white/30" />} />
                ) : (
                  <BookMarked className="w-5 h-5 text-white/30" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-[15px] text-white truncate">{d.title}</p>
                <p className="text-[11px] text-white/50 mt-1">
                  {d.id === currentDiaryId ? 'Diario attuale' : `${d.reportageCount} reportage`}
                </p>
              </div>
              {d.id === currentDiaryId && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
              {moveBusy && d.id !== currentDiaryId && <Loader2 className="w-4 h-4 animate-spin text-white/50 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Elenco verticale a schermo intero per il filtro per Diario della pagina (etichetta sopra il
// titolo) — stessa identità visiva (sfondo #0b1a24, righe con thumbnail 64×64, separatore bianco
// 10%) delle liste "Tutti i ___" (ExpandedGalleryList.tsx) e della galleria Raccolte di
// app/diario/page.tsx: sola selezione, niente crea/modifica/elimina. "Tutti i Diari" in cima
// rimuove il filtro. Lo spostamento del singolo resoconto aperto vive in ManageReportageOverlay
// sopra, insieme al titolo — non più qui.
function DiaryFilterOverlay({ diaries, currentId, onSelect, onClose }: {
  diaries: DiarySummary[]
  currentId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0b1a24] flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3 border-b border-white/10">
        <h2 className="font-display text-base font-bold text-white">Filtra per Diario</h2>
        <button onClick={onClose} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        <button
          onClick={() => onSelect(null)}
          disabled={currentId === null}
          className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left disabled:opacity-50"
        >
          <div className={`w-16 h-16 rounded-xl shrink-0 flex items-center justify-center bg-white/5 ${currentId === null ? 'ring-2 ring-sky-400' : ''}`}>
            <BookMarked className="w-6 h-6 text-white/30" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-[15px] text-white truncate">Tutti i Diari</p>
            <p className="text-[11px] text-white/50 mt-1.5">
              {currentId === null ? 'Filtro attuale' : `${diaries.length} Diari`}
            </p>
          </div>
        </button>
        {diaries.length === 0 ? (
          <p className="text-center text-white/50 text-sm mt-10">Nessun Diario disponibile.</p>
        ) : diaries.map(d => (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            disabled={d.id === currentId}
            className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left disabled:opacity-50"
          >
            <div className={`w-16 h-16 rounded-xl shrink-0 overflow-hidden relative flex items-center justify-center bg-white/5 ${d.id === currentId ? 'ring-2 ring-sky-400' : ''}`}>
              {d.coverUrl ? (
                <SafeImg src={d.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" fallback={<BookMarked className="w-6 h-6 text-white/30" />} />
              ) : (
                <BookMarked className="w-6 h-6 text-white/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-[15px] text-white truncate">{d.title}</p>
              <p className="text-[11px] text-white/50 mt-1.5">
                {d.id === currentId ? 'Filtro attuale' : `${d.reportageCount} reportage`}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
