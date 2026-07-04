'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import RouteHub from '@/components/routehub/RouteHub'
import { AssessmentPanel } from '@/components/routehub/AssessmentPanel'
import type { RouteHubItem, PopupKind } from '@/components/routehub/types'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import { ScoreRing } from '@/components/ScoreRing'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
import { ShadeWaterTile } from '@/components/ShadeWaterTile'
import OfflinePackageDownloader from '@/components/navigation/OfflinePackageDownloader'
import { PhenologyPanel } from '@/components/PhenologyPanel'
import { useCL, useSentinel2 } from '@/lib/cl/useCL'
import { useFlora } from '@/lib/useFlora'
import {
  getAllPlanned, getPlannedById, updatePlannedMeta, deletePlanned,
  type PlannedHike, type PlannedHikeMeta,
} from '@/lib/plannedStore'
import { computeSafetyScore, type SafetyScore, type WildlifeRisk } from '@/lib/safetyScore'
import { fetchWildlifeRiskFromGbif } from '@/lib/wildlifeRiskFromGbif'
import { type PoiItem, POI_META } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTrailScore, type TrailScoreResult, type CtsConfidence } from '@/lib/trailScore'
import { type BeautyScore } from '@/lib/beautyScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from '@/lib/tei'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { formatDuration } from '@/lib/tcxParser'
import {
  Mountain, Route, TrendingUp, Clock, Loader2, BookOpen, Leaf, PawPrint,
  Car, Navigation, MapPin, Layers, Compass, Images, Trash2, Pencil, Check,
} from 'lucide-react'
import { fetchDrivingInfo, formatDrivingDuration, getUserStartingPoint, getTrailStartPoint, googleMapsDirectionsUrl, originMatches } from '@/lib/drivingInfo'
import PdfExportButton from '@/components/PdfExportButton'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })

function metaToItem(h: PlannedHikeMeta): RouteHubItem {
  return {
    id: h.id,
    title: h.title,
    polyline: h.routePolyline,
    statPills: [
      { icon: Route,       label: `${(h.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp,  label: `+${Math.round(h.elevationGain)} m` },
      { icon: Mountain,    label: `${Math.round(h.altitudeMax)} m` },
      { icon: Clock,       label: formatDuration(h.estimatedTimeSeconds) },
    ],
  }
}

export default function GuidaHub({ id }: { id?: string }) {
  const router = useRouter()

  const [items,   setItems]   = useState<RouteHubItem[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(id ?? null)
  const [hike,    setHike]    = useState<PlannedHike | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [notesVal, setNotesVal] = useState('')
  const [editNotes, setEditNotes] = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect,   setShowAspect]   = useState(false)
  const [dtmProfile,     setDtmProfile]     = useState<TrailDtmProfile | undefined>(undefined)
  const [terrainProfile, setTerrainProfile] = useState<TrailTerrainProfile | undefined>(undefined)
  const [inProtectedArea, setInProtectedArea] = useState<boolean | undefined>(undefined)
  const [showStreetView, setShowStreetView] = useState(false)
  const [pois,           setPois]          = useState<PoiItem[]>([])
  const [wikiPages,      setWikiPages]     = useState<WikiPage[]>([])
  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult,      setCtsResult]     = useState<TrailScoreResult | null>(null)
  const [ctsComputing,   setCtsComputing]  = useState(false)
  const [prefsLoaded,    setPrefsLoaded]   = useState(false)
  const [prefSforzo,     setPrefSforzo]    = useState(50)
  const [prefDurata,     setPrefDurata]    = useState(270)
  const [safetyScore,    setSafetyScore]   = useState<SafetyScore | null>(null)
  const [origin,  setOrigin]  = useState<{ lat: number; lon: number } | null>(null)
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null)
  const [drivingLoading, setDrivingLoading] = useState(false)

  const si = useCL({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const s2 = useSentinel2({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const flora = useFlora(hike?.routePolyline, hike?.altitudeMax)

  // Lightweight list of every active (non-archived) planned hike, sorted by import
  // order (most recent first) — backs the carousel/gallery. Resolves the bare
  // /guida entry point to the latest one once loaded.
  useEffect(() => {
    getAllPlanned().then(list => {
      const active = list.filter(h => !h.archivedAt)
      const sorted = active.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setItems(sorted.map(metaToItem))
    }).catch(() => setItems([])).finally(() => setListLoaded(true))
  }, [])

  useEffect(() => {
    if (currentId || items.length === 0) return
    setCurrentId(items[0].id)
  }, [items, currentId])

  useEffect(() => {
    if (!currentId) return
    getPlannedById(currentId).then(h => {
      if (!h) { router.push('/guida'); return }
      setHike(h)
      setNotesVal(h.userNotes ?? '')
      const gps = (h.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
      setPois([]); setPoiWikiEntries([]); setPoisFullyLoaded(false)
      if (gps.length > 0) {
        if (h.cachedPois?.length) {
          setPois(h.cachedPois as PoiItem[])
          if (h.cachedPoiWiki?.length) setPoiWikiEntries(h.cachedPoiWiki as { poi: PoiItem; wiki: WikiPage }[])
          setPoisFullyLoaded(true)
        } else {
          const bbox = computeBbox(gps)
          fetch(`/api/pois?bbox=${bbox}`)
            .then(r => r.json())
            .then((all: PoiItem[]) => {
              const nearby = all
                .filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
                .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
              setPois(nearby)
              fetchWikiForNamedPois(nearby)
                .then(entries => { setPoiWikiEntries(entries); setPoisFullyLoaded(true) })
                .catch(() => setPoisFullyLoaded(true))
            })
            .catch(() => setPoisFullyLoaded(true))
        }
      }
    })
  }, [currentId, router])

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json()).then((p: TrailDtmProfile) => setDtmProfile(p)).catch(() => {})
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`)
      .then(r => r.json()).then((p: TrailTerrainProfile) => setTerrainProfile(p)).catch(() => {})
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    checkProtectedArea(gps).then(r => setInProtectedArea(r.inProtectedArea)).catch(() => {})
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!poisFullyLoaded || !hike || (hike.cachedPois?.length ?? 0) > 0 || !pois.length) return
    updatePlannedMeta(hike.id, { cachedPois: pois, cachedPoiWiki: poiWikiEntries }).catch(() => {})
    setHike(prev => prev ? { ...prev, cachedPois: pois, cachedPoiWiki: poiWikiEntries } : prev)
  }, [poisFullyLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/user-settings').then(r => r.json()).then(d => {
      if (d.prefSforzo != null) setPrefSforzo(d.prefSforzo)
      if (d.prefDurata != null) setPrefDurata(d.prefDurata)
    }).catch(() => {}).finally(() => setPrefsLoaded(true))
  }, [])

  useEffect(() => {
    if (!hike) return
    const trailStart = getTrailStartPoint(hike)
    if (!trailStart) return
    const cachedLat  = hike.cachedDrivingOriginLat
    const cachedLon  = hike.cachedDrivingOriginLon
    const cachedDist = hike.cachedDrivingDistanceMeters
    const cachedDur  = hike.cachedDrivingDurationSeconds
    let cancelled = false
    setDrivingLoading(true)
    getUserStartingPoint().then(pt => {
      if (cancelled) return
      if (!pt) { setDrivingLoading(false); return }
      setOrigin(pt)
      if (originMatches(cachedLat, cachedLon, pt.lat, pt.lon) && cachedDist != null && cachedDur != null) {
        setDriving({ distanceMeters: cachedDist, durationSeconds: cachedDur })
        setDrivingLoading(false)
        return
      }
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (cancelled) return
        setDriving(info)
        setDrivingLoading(false)
        if (info) {
          updatePlannedMeta(hike.id, {
            cachedDrivingDistanceMeters: info.distanceMeters,
            cachedDrivingDurationSeconds: info.durationSeconds,
            cachedDrivingOriginLat: pt.lat,
            cachedDrivingOriginLon: pt.lon,
          }).catch(() => {})
        }
      })
    })
    return () => { cancelled = true }
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bs = hike?.cachedBeautyScore
    if (!bs?.categories?.length || !prefsLoaded || !hike) return
    const computed = computeTrailScore(bs, {
      distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain,
      elevationLoss: hike.elevationLoss, altitudeMax: hike.altitudeMax,
      prefSforzo, prefDurata,
    })
    setCtsResult({ ...computed, ts: hike.cachedTrailScore ?? computed.ts })
  }, [hike?.id, hike?.cachedBeautyScore, hike?.cachedTrailScore, prefsLoaded, prefSforzo, prefDurata]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hike) return
    if (hike.cachedSafetyScore) { setSafetyScore(hike.cachedSafetyScore); return }
    let cancelled = false
    async function run() {
      const poly = hike!.routePolyline
      let gbifWildlifeRisks: WildlifeRisk[] = []
      let guardianDogRisk: { present: boolean } | undefined
      if (poly && poly.length >= 2) {
        const bbox = computeBbox(poly, 0.005)
        const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
        const animalsBbox = `${minLat},${maxLat},${minLon},${maxLon}`
        const month = hike!.plannedDate ? new Date(hike!.plannedDate).getMonth() + 1 : new Date().getMonth() + 1
        const [gbifResult, guardianResult] = await Promise.allSettled([
          fetchWildlifeRiskFromGbif(animalsBbox, month),
          fetch(`/api/trails/guardian-dogs?bbox=${encodeURIComponent(bbox)}`, { signal: AbortSignal.timeout(20000) })
            .then(r => r.json()) as Promise<{ present: boolean }>,
        ])
        if (gbifResult.status === 'fulfilled') gbifWildlifeRisks = gbifResult.value
        if (guardianResult.status === 'fulfilled') guardianDogRisk = guardianResult.value
      }
      if (cancelled) return
      const safety = computeSafetyScore({
        distanceMeters: hike!.distanceMeters, elevationGain: hike!.elevationGain,
        elevationLoss: hike!.elevationLoss, altitudeMax: hike!.altitudeMax, altitudeMin: hike!.altitudeMin,
        estimatedTimeSeconds: hike!.estimatedTimeSeconds, routePolyline: hike!.routePolyline,
        plannedDate: hike!.plannedDate, gbifWildlifeRisks, guardianDogRisk,
      })
      setSafetyScore(safety)
      updatePlannedMeta(hike!.id, { cachedSafetyScore: safety }).catch(() => {})
    }
    run()
    return () => { cancelled = true }
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayItems = useMemo(() => {
    const pillsFor = (h: PlannedHike) => [
      { icon: Route,      label: `${(h.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp, label: `+${Math.round(h.elevationGain)} m` },
      { icon: Mountain,   label: `${Math.round(h.altitudeMax)} m` },
      { icon: Clock,      label: formatDuration(h.estimatedTimeSeconds) },
      ...(driving ? [{ icon: Car, label: `${(driving.distanceMeters / 1000).toFixed(0)} km auto` }] : []),
    ]
    const mapped = items.map(it => it.id === hike?.id ? { ...it, statPills: pillsFor(hike) } : it)
    // Deep link to a hike outside the active list (e.g. archived/expired) — still show it
    // standalone rather than 404, once its full record has loaded.
    if (hike && !mapped.some(it => it.id === hike.id)) {
      return [{ id: hike.id, title: hike.title, polyline: hike.routePolyline, statPills: pillsFor(hike) }, ...mapped]
    }
    return mapped
  }, [items, hike, driving])

  if (!listLoaded) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-stone-300 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
      </div>
    )
  }
  if (!currentId) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-stone-300 text-sm">Nessun percorso in attesa.</p>
        <button onClick={() => router.push('/upload?tab=gpx')} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Importa un percorso
        </button>
      </div>
    )
  }
  if (displayItems.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-stone-300 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
      </div>
    )
  }

  const patch = async (data: Parameters<typeof updatePlannedMeta>[1]) => {
    if (!hike) return
    setSaving(true)
    try { await updatePlannedMeta(hike.id, data); setHike(prev => prev ? { ...prev, ...data } : prev) }
    finally { setSaving(false) }
  }
  const saveNotes = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }

  const handleDelete = async () => {
    if (!hike || !confirm('Eliminare questa escursione pianificata?')) return
    setSaving(true)
    try { await deletePlanned(hike.id); router.push('/guida') }
    finally { setSaving(false) }
  }
  const handleExtendPending = async () => {
    if (!hike) return
    const days = await fetch('/api/user-settings').then(r => r.json()).then(d => d.guidePendingDays ?? 30).catch(() => 30)
    await patch({ pendingExpiresAt: new Date(Date.now() + days * 86400000).toISOString(), archivedAt: undefined })
  }
  const handleArchive = async () => { await patch({ archivedAt: new Date().toISOString() }); router.push('/guida') }

  const handleComputeCts = async () => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number])
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      const deadline = new Promise<null>(r => setTimeout(() => r(null), 25000))
      const bbox = computeBbox(gps)
      const [allPoisRes, osmData] = await Promise.all([
        Promise.race([fetch(`/api/pois?bbox=${bbox}`).then(r => r.json()) as Promise<PoiItem[]>, deadline]).then(r => r ?? []),
        Promise.race([fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>, deadline]).then(r => r ?? undefined).catch(() => undefined),
      ])
      const allPois = allPoisRes as PoiItem[]
      const poisNear = allPois.filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
        .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))
      const elevProfile = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => p.altitudeMeters ?? 0)
      const tei = computeTEI({
        track: gps, elevGain: hike.elevationGain, distanceMeters: hike.distanceMeters, altitudeMax: hike.altitudeMax,
        elevProfile, pois: poisNear, osmData, dtmProfile, terrainProfile, inProtectedArea,
      })
      const bs = teiToBeautyScore(tei)
      const confidence: CtsConfidence = tei.confidence
      const prefs = await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
      let { ts } = computeTrailScore(bs, {
        distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain, elevationLoss: hike.elevationLoss,
        altitudeMax: hike.altitudeMax, prefSforzo: prefs.prefSforzo, prefDurata: prefs.prefDurata,
        hrRest: prefs.hrRest, hrMax: prefs.hrMax ?? undefined, avgSlopeDeg: dtmProfile?.avgSlopeDeg ?? undefined,
      })
      if (confidence === 'estimated') ts = Math.round(ts * 0.9)
      await updatePlannedMeta(hike.id, { cachedBeautyScore: bs, cachedTrailScore: ts, cachedTrailScoreConfidence: confidence })
      setHike(prev => prev ? { ...prev, cachedBeautyScore: bs, cachedTrailScore: ts, cachedTrailScoreConfidence: confidence } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }

  const gpsPoints = hike?.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0

  const renderStageMap = (item: RouteHubItem) => {
    if (!hike || item.id !== hike.id) return <div className="absolute inset-0 bg-gradient-to-br from-[#123448] to-[#071824]" />
    if (!hasGps) return <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">Tracciato non disponibile</div>
    return (
      <MapView
        trackPoints={hike.trackPoints ?? []} height="100%" interactive
        showGradient={showGradient} showAspect={showAspect} dtmProfile={dtmProfile}
        pois={pois} wikiPages={wikiPages} difficultyMarkers={hike.difficultyMarkers} planned
      />
    )
  }

  const renderAltimetryMap = (item: RouteHubItem, activeIndex: number | null) => {
    if (!hike || item.id !== hike.id || !hasGps) return <div className="absolute inset-0 bg-[#0b1a24]" />
    return <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive={false} activeIndex={activeIndex} planned />
  }

  const renderAltimetryChart = (item: RouteHubItem, onHover: (i: number | null) => void, onActivePoint: (d: { alt: number; kmNum: number } | null) => void) => {
    if (!hike || item.id !== hike.id || !hike.trackPoints?.length) {
      return <div className="h-full flex items-center justify-center text-stone-400 text-sm">Dati altimetrici non disponibili</div>
    }
    return <ElevationProfileChart trackPoints={hike.trackPoints} onHover={onHover} onActivePoint={onActivePoint} />
  }

  const renderPopup = (popup: PopupKind, item: RouteHubItem) => {
    if (!hike || item.id !== hike.id) return <div className="py-10 text-center text-sm text-stone-400">Caricamento…</div>

    if (popup === 'dati') return (
      <div className="space-y-5">
        {hike.pendingExpiresAt && !hike.archivedAt && (() => {
          const expired = new Date(hike.pendingExpiresAt!).getTime() < Date.now()
          const daysLeft = Math.ceil((new Date(hike.pendingExpiresAt!).getTime() - Date.now()) / 86400000)
          return (
            <div className={`rounded-2xl border p-4 flex items-center justify-between gap-3 flex-wrap ${expired ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200'}`}>
              <p className={`text-sm font-medium ${expired ? 'text-amber-700' : 'text-sky-700'}`}>
                {expired ? 'Questa guida è scaduta: la proroghi o la archivi?' : `In attesa — scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}`}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={handleExtendPending} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors">Proroga</button>
                {expired && <button onClick={handleArchive} className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:border-amber-400 text-amber-700 text-xs font-semibold transition-colors">Archivia</button>}
              </div>
            </div>
          )
        })()}

        {hasGps && (
          <ScoreRing
            cl={{ si: si.result?.si, label: si.result?.label, signals: si.result?.signals, partial: si.result?.partial, loading: si.loading, notMatched: si.notMatched, onRefresh: si.refresh, refreshing: si.refreshing, refreshError: si.refreshError }}
            safety={safetyScore}
            cts={{ result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts }}
          />
        )}

        {hasGps && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {hike.trackPoints?.some(p => p.altitudeMeters !== undefined) && (
              <button onClick={() => { setShowGradient(g => !g); setShowAspect(false) }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}>
                <Layers className="w-3 h-3" /> Pendenza
              </button>
            )}
            {dtmProfile?.source === 'dtm' && (
              <button onClick={() => { setShowAspect(a => !a); setShowGradient(false) }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}>
                <Compass className="w-3 h-3" /> Esposizione
              </button>
            )}
          </div>
        )}

        {hasGps && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="font-display text-lg font-semibold text-stone-700 mb-3 flex items-center gap-2"><Car className="w-4 h-4 text-sky-500" /> Come arrivare</h3>
            {drivingLoading ? (
              <div className="flex items-center gap-2 text-stone-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Calcolo distanza…</div>
            ) : driving && origin ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-6">
                  <div><p className="text-xs text-stone-400 font-medium">Distanza</p><p className="text-lg font-bold text-stone-800">{(driving.distanceMeters / 1000).toFixed(0)} km</p></div>
                  <div><p className="text-xs text-stone-400 font-medium">Tempo in auto</p><p className="text-lg font-bold text-stone-800">{formatDrivingDuration(driving.durationSeconds)}</p></div>
                </div>
                <a href={googleMapsDirectionsUrl(origin.lat, origin.lon, gpsPoints[0].lat!, gpsPoints[0].lon!)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors">
                  <Navigation className="w-4 h-4" /> Naviga con Google Maps
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-stone-400">
                <MapPin className="w-4 h-4 shrink-0" /> Imposta il tuo <a href="/profilo" className="text-sky-600 hover:text-sky-700 font-medium underline">indirizzo di partenza</a> nel profilo.
              </div>
            )}
          </div>
        )}

        {hasGps && <WeatherWidget mode={hike.plannedDate ? 'planned' : 'forecast'} lat={centerPt.lat!} lon={centerPt.lon!} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} />}
      </div>
    )

    if (popup === 'natura') return (
      <div className="space-y-5">
        {hasGps && hike.routePolyline && hike.routePolyline.length >= 2 && (
          <PhenologyPanel data={s2.data} loading={s2.loading} flora={flora.data} floraLoading={flora.loading} />
        )}
        {hasGps && !si.notMatched && (
          <CurrentConditionsNotice osmId={hike.osmId} polyline={hike.routePolyline} plannedId={hike.id} signals={si.result?.signals} />
        )}
        {hasGps && <ShadeWaterTile data={s2.data} loading={s2.loading} />}
        <div className="flex gap-2">
          <button onClick={() => router.push(`/guida/${encodeURIComponent(hike.id)}/flora`)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
            <Leaf className="w-4 h-4 text-emerald-600" /> Galleria Verde
          </button>
          <button onClick={() => router.push(`/guida/${encodeURIComponent(hike.id)}/animali`)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
            <PawPrint className="w-4 h-4 text-amber-600" /> Galleria Animali
          </button>
        </div>
        {hike.difficultyMarkers && hike.difficultyMarkers.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <p className="text-sm font-semibold text-stone-700 mb-3">Segnalazioni dal tracciato</p>
            <ul className="space-y-2">
              {hike.difficultyMarkers.map((m, i) => <li key={i} className="text-sm text-stone-600">{m.text}</li>)}
            </ul>
          </div>
        )}
      </div>
    )

    if (popup === 'poi') return (
      <div className="space-y-5">
        {poiWikiEntries.length > 0 && (
          <div className="space-y-3">
            {poiWikiEntries.map(({ poi, wiki }) => {
              const meta = POI_META[poi.type]
              return (
                <div key={poi.id} className="bg-white rounded-2xl border border-stone-200 p-4 flex gap-3">
                  {wiki.thumbnail && <img src={wiki.thumbnail} alt={wiki.title} className="w-16 h-16 object-cover rounded-xl shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1"><span className="text-base leading-none">{meta.emoji}</span><span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{meta.label}</span></div>
                    <p className="text-sm font-semibold text-stone-800 leading-tight mb-1">{wiki.title}</p>
                    <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">{wiki.extract.slice(0, 160)}{wiki.extract.length > 160 ? '…' : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {hasGps && <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />}
        {hasGps && (
          <button onClick={() => setShowStreetView(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
            <Images className="w-4 h-4" /> Foto zona (street view)
          </button>
        )}
      </div>
    )

    if (popup === 'sicurezza') return (
      <div className="space-y-5">
        {hike.assessment && <AssessmentPanel a={hike.assessment} />}
        {!hike.assessment && !safetyScore && <p className="text-sm text-stone-400 italic">Nessuna valutazione disponibile per questo percorso.</p>}
      </div>
    )

    // strumenti
    return (
      <div className="space-y-1">
        {hasGps && <div className="px-2 py-2"><OfflinePackageDownloader hikeId={hike.id} routePolyline={hike.routePolyline ?? []} /></div>}
        <button onClick={() => router.push(`/guida/${encodeURIComponent(hike.id)}/leggi`)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
          <BookOpen className="w-4 h-4 text-amber-500" /> <span className="text-sm font-medium text-stone-700">{hike.cachedGuide ? 'Leggi guida completa' : 'Genera guida'}</span>
        </button>
        <PdfExportButton variant="planned" data={hike} label="Esporta PDF" className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left text-sm font-medium text-stone-700" />
        <div>
          {editNotes ? (
            <div className="px-2 py-2 space-y-2">
              <textarea autoFocus value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4} placeholder="Aggiungi note, equipaggiamento, punti di interesse…"
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 resize-none outline-none focus:border-sky-400 focus:bg-white" />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
                <button onClick={() => { setNotesVal(hike.userNotes ?? ''); setEditNotes(false) }} className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditNotes(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-50 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400" /> <span className="text-sm font-medium text-stone-700">Note personali{hike.userNotes ? '' : ' (vuote)'}</span>
            </button>
          )}
        </div>
        <div className="pt-1 mt-1 border-t border-stone-100">
          <button onClick={handleDelete} disabled={saving} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-red-50 transition-colors text-left text-red-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="text-sm font-medium">Elimina guida</span>
          </button>
        </div>
      </div>
    )
  }

  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      <RouteHub
        mode="guida"
        items={displayItems}
        initialIndex={initialIndex}
        onIndexChange={(item) => { setCurrentId(item.id); router.replace(`/guida/${encodeURIComponent(item.id)}`, { scroll: false }) }}
        renderPopup={renderPopup}
        renderAltimetryMap={renderAltimetryMap}
        renderAltimetryChart={renderAltimetryChart}
        renderStageMap={renderStageMap}
        onNavigate={(item) => router.push(`/guida/${encodeURIComponent(item.id)}/naviga`)}
        onOpenList={() => router.push('/guida/elenco')}
      />
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={hike?.title} onClose={() => setShowStreetView(false)} />
      )}
    </>
  )
}
