'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import RouteHub from '@/components/routehub/RouteHub'
import SectionSplit from '@/components/routehub/SectionSplit'
import { RailButton } from '@/components/routehub/SideRails'
import RouteThumb from '@/components/RouteThumb'
import { useCenteredItem } from '@/components/routehub/useCenteredItem'
import { AssessmentPanel } from '@/components/routehub/AssessmentPanel'
import type { RouteHubItem, SectionKind } from '@/components/routehub/types'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import WeatherWidget from '@/components/WeatherWidget'
import WikiCards from '@/components/WikiCards'
import { ScoreRing } from '@/components/ScoreRing'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
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
import { fetchForecastWeather, wmoInfo } from '@/lib/openmeteo'
import {
  Mountain, Route, TrendingUp, Clock, Loader2, BookOpen, Leaf, PawPrint,
  Car, Layers, Compass, Images, Trash2, Pencil, Check,
  Maximize2, Minimize2, X,
} from 'lucide-react'
import { fetchDrivingInfo, getUserStartingPoint, getTrailStartPoint, originMatches } from '@/lib/drivingInfo'
import PdfExportButton from '@/components/PdfExportButton'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const RouteMap3D       = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const FloraGallery     = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery    = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

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
    sortValues: {
      date: new Date(h.createdAt).getTime(),
      km: h.distanceMeters,
      dplus: h.elevationGain,
      cts: h.cachedTrailScore,
    },
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
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null)
  const [altActiveIndex, setAltActiveIndex] = useState<number | null>(null)
  const [showGuideSection, setShowGuideSection] = useState(false)
  const [guideExpanded, setGuideExpanded] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)
  const [weatherIcon, setWeatherIcon] = useState<{ emoji: string; label: string } | null>(null)

  const si = useCL({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const s2 = useSentinel2({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const flora = useFlora(hike?.routePolyline, hike?.altitudeMax)
  const poiCenter = useCenteredItem(pois.length)
  const sicurezzaCenter = useCenteredItem(hike?.difficultyMarkers?.length ?? 0)

  const guideParagraphs = useMemo(() => {
    if (!hike?.cachedGuide) return []
    return hike.cachedGuide
      .split(/\n{2,}/)
      .map(p => p.replace(/^#{1,6}\s+/, '').replace(/\[\/?curiosita\]/g, '').trim())
      .filter(p => p.length > 20)
  }, [hike?.cachedGuide])
  const guideCenter = useCenteredItem(guideParagraphs.length)

  // Approximates where in the track the paragraph currently being read corresponds to — the
  // guide text has no real per-paragraph geo-tags, so paragraphs are assumed evenly spread
  // along the route (paragraph i/N ≈ i/N of the way along the trail).
  const guideActiveTrackIndex = useMemo(() => {
    const points = hike?.trackPoints
    if (!points?.length || guideCenter.centeredIndex == null || guideParagraphs.length < 2) return null
    const frac = guideCenter.centeredIndex / (guideParagraphs.length - 1)
    return Math.round(frac * (points.length - 1))
  }, [hike?.trackPoints, guideCenter.centeredIndex, guideParagraphs.length])

  // A POI mentioned by name in the paragraph currently being read — highlighted on the map.
  const guideActivePoiIndex = useMemo(() => {
    if (guideCenter.centeredIndex == null) return null
    const text = guideParagraphs[guideCenter.centeredIndex]?.toLowerCase() ?? ''
    const idx = pois.findIndex(p => p.name && text.includes(p.name.toLowerCase()))
    return idx >= 0 ? idx : null
  }, [guideCenter.centeredIndex, guideParagraphs, pois])

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

  // Weather icon for the top overlay — matches the forecast for the planned date (or today).
  useEffect(() => {
    if (!hike) { setWeatherIcon(null); return }
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    const mid = gps[Math.floor(gps.length / 2)]
    if (!mid?.lat || !mid?.lon) { setWeatherIcon(null); return }
    let cancelled = false
    fetchForecastWeather(mid.lat, mid.lon, 7).then(days => {
      if (cancelled || !days.length) return
      const target = hike.plannedDate ? (days.find(d => d.date === hike.plannedDate) ?? days[0]) : days[0]
      const info = wmoInfo(target.weathercode)
      setWeatherIcon({ emoji: info.emoji, label: info.label })
    }).catch(() => setWeatherIcon(null))
    return () => { cancelled = true }
  }, [hike?.id, hike?.plannedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Persists to the backend only — nothing in this component reads hike.cachedPois again
    // after the initial load (line ~164 always re-fetches the hike fresh from the store), so
    // mirroring it into the in-memory `hike` state here would just force an extra re-render
    // of the whole card for no visible effect.
    if (!poisFullyLoaded || !hike || (hike.cachedPois?.length ?? 0) > 0 || !pois.length) return
    updatePlannedMeta(hike.id, { cachedPois: pois, cachedPoiWiki: poiWikiEntries }).catch(() => {})
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
    getUserStartingPoint().then(pt => {
      if (cancelled || !pt) return
      if (originMatches(cachedLat, cachedLon, pt.lat, pt.lon) && cachedDist != null && cachedDur != null) {
        setDriving({ distanceMeters: cachedDist, durationSeconds: cachedDur })
        return
      }
      fetchDrivingInfo(pt.lat, pt.lon, trailStart[0], trailStart[1]).then(info => {
        if (cancelled) return
        setDriving(info)
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
      ...(driving ? [{ icon: Car, label: `${(driving.distanceMeters / 1000).toFixed(0)} km in auto` }] : []),
    ]
    const sortValuesFor = (h: PlannedHike) => ({
      date: new Date(h.createdAt).getTime(), km: h.distanceMeters, dplus: h.elevationGain, cts: h.cachedTrailScore,
    })
    const mapped = items.map(it => it.id === hike?.id ? { ...it, statPills: pillsFor(hike), sortValues: sortValuesFor(hike) } : it)
    // Deep link to a hike outside the active list (e.g. archived/expired) — still show it
    // standalone rather than 404, once its full record has loaded.
    if (hike && !mapped.some(it => it.id === hike.id)) {
      return [{ id: hike.id, title: hike.title, polyline: hike.routePolyline, statPills: pillsFor(hike), sortValues: sortValuesFor(hike) }, ...mapped]
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

  const renderStageMap = (item: RouteHubItem, interactive: boolean) => {
    if (!hike || item.id !== hike.id) return (
      <div className="absolute inset-0 bg-gradient-to-br from-[#123448] via-[#0b2333] to-[#071824]">
        {item.polyline && item.polyline.length > 1 && (
          <div className="absolute inset-[10%]"><RouteThumb polyline={item.polyline} color="#38bdf8" strokeWidth={2} /></div>
        )}
      </div>
    )
    if (!hasGps) return <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">Tracciato non disponibile</div>
    return (
      <MapView
        trackPoints={hike.trackPoints ?? []} height="100%" interactive={interactive}
        showGradient={showGradient} showAspect={showAspect} dtmProfile={dtmProfile}
        pois={pois} wikiPages={wikiPages} difficultyMarkers={hike.difficultyMarkers} planned
      />
    )
  }

  // Default section map — real, interactive/navigable, no per-section highlight.
  const sectionMap = () => hasGps && hike
    ? <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive pois={pois} planned />
    : <div className="absolute inset-0 bg-[#0b1a24]" />
  const open3D = (closeSection: () => void) => hasGps ? () => { closeSection(); setShow3D(true) } : undefined

  const renderSection = (section: SectionKind, item: RouteHubItem, onClose: () => void) => {
    if (!hike || item.id !== hike.id) {
      return <SectionSplit title="…" onClose={onClose} mapContent={<div className="absolute inset-0 bg-[#0b1a24]" />}>
        <div className="py-10 text-center text-sm text-stone-400">Caricamento…</div>
      </SectionSplit>
    }

    if (section === 'dati') return (
      <SectionSplit
        title="Dati & punteggi"
        onClose={onClose}
        on3D={open3D(onClose)}
        mapContent={
          <div className="absolute inset-0">
            {hasGps
              ? <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive pois={pois} activeIndex={altActiveIndex} planned />
              : <div className="absolute inset-0 bg-[#0b1a24]" />}
            <div className="absolute bottom-3 inset-x-3 flex flex-wrap gap-1.5 justify-center pointer-events-none">
              {hike.cachedTrailScore != null && (
                <span className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-[11px] font-bold border border-white/15">CTS {Math.round(hike.cachedTrailScore)}</span>
              )}
              {safetyScore && (
                <span className="px-2.5 py-1 rounded-full text-white text-[11px] font-bold border border-white/15" style={{ backgroundColor: safetyScore.color }}>Sicurezza {safetyScore.label}</span>
              )}
              {hike.cachedBeautyScore && (
                <span className="px-2.5 py-1 rounded-full text-white text-[11px] font-bold border border-white/15" style={{ backgroundColor: hike.cachedBeautyScore.color }}>Bellezza {hike.cachedBeautyScore.gradeLabel}</span>
              )}
            </div>
          </div>
        }
      >
        <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
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
              shadeWater={{ data: s2.data, loading: s2.loading }}
            />
          )}

          {hasGps && dtmProfile?.source === 'dtm' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setShowAspect(a => !a)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}>
                <Compass className="w-3 h-3" /> Esposizione
              </button>
            </div>
          )}

          {hasGps && hike.trackPoints?.length ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <h3 className="font-display text-lg font-semibold text-stone-700 mb-3 flex items-center gap-2"><Mountain className="w-4 h-4 text-sky-500" /> Profilo altimetrico</h3>
              <ElevationProfileChart trackPoints={hike.trackPoints} onHover={setAltActiveIndex} />
            </div>
          ) : null}
        </div>
      </SectionSplit>
    )

    if (section === 'meteo') return (
      <SectionSplit title="Meteo" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4">
          {hasGps
            ? <WeatherWidget mode={hike.plannedDate ? 'planned' : 'forecast'} lat={centerPt.lat!} lon={centerPt.lon!} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} />
            : <p className="text-sm text-stone-400 italic text-center py-8">Meteo non disponibile senza un tracciato GPS.</p>}
        </div>
      </SectionSplit>
    )

    if (section === 'natura') return (
      <SectionSplit title="Natura" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
          {hasGps && hike.routePolyline && hike.routePolyline.length >= 2 && (
            <PhenologyPanel data={s2.data} loading={s2.loading} flora={flora.data} floraLoading={flora.loading} />
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowFloraGallery(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
              <Leaf className="w-4 h-4 text-emerald-600" /> Galleria Verde
            </button>
            <button onClick={() => setShowAnimalGallery(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-sm font-medium text-stone-700 transition-colors">
              <PawPrint className="w-4 h-4 text-amber-600" /> Galleria Animali
            </button>
          </div>
        </div>
      </SectionSplit>
    )

    if (section === 'poi') return (
      <SectionSplit
        title="Punti di interesse"
        onClose={onClose}
        on3D={open3D(onClose)}
        mapContent={hasGps
          ? <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive pois={pois} highlightedPoiIndex={poiCenter.centeredIndex} planned />
          : <div className="absolute inset-0 bg-[#0b1a24]" />}
      >
        <div ref={poiCenter.containerRef} className="h-full overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Sul percorso</p>
          {pois.length === 0 && (
            <p className="text-sm text-stone-400 italic text-center py-8">Nessun punto di interesse trovato lungo il tracciato.</p>
          )}
          {pois.map((poi, i) => {
            const meta = POI_META[poi.type]
            const wiki = poiWikiEntries.find(e => e.poi.id === poi.id)?.wiki
            const highlighted = i === poiCenter.centeredIndex
            const cardClass = `rounded-2xl border p-4 flex gap-3 transition-colors ${highlighted ? 'bg-sky-50 border-sky-300' : 'bg-white border-stone-200'} ${wiki ? 'hover:border-sky-300' : ''}`
            const cardContent = (
              <>
                {wiki?.thumbnail
                  ? <img src={wiki.thumbnail} alt={wiki.title} className="w-16 h-16 object-cover rounded-xl shrink-0" />
                  : <span className="w-16 h-16 rounded-xl bg-stone-50 flex items-center justify-center text-2xl shrink-0">{meta.emoji}</span>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1"><span className="text-base leading-none">{meta.emoji}</span><span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{meta.label}</span>
                    <span className="text-[10px] text-stone-300 ml-auto shrink-0">{poi.distFromTrack === 0 ? 'sul tracciato' : `${poi.distFromTrack} m`}</span>
                  </div>
                  <p className="text-sm font-semibold text-stone-800 leading-tight mb-1">{wiki?.title ?? poi.name ?? meta.label}</p>
                  {wiki && <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">{wiki.extract.slice(0, 160)}{wiki.extract.length > 160 ? '…' : ''}</p>}
                </div>
              </>
            )
            return wiki ? (
              <a key={poi.id} ref={poiCenter.setItemRef(i)} href={wiki.url} target="_blank" rel="noopener noreferrer" className={cardClass}>
                {cardContent}
              </a>
            ) : (
              <div key={poi.id} ref={poiCenter.setItemRef(i)} className={cardClass}>
                {cardContent}
              </div>
            )
          })}
          {hasGps && (
            <>
              <p className="text-xs font-bold text-stone-500 uppercase tracking-wider pt-2">Wikipedia nei dintorni</p>
              <WikiCards lat={centerPt.lat!} lon={centerPt.lon!} onLoaded={setWikiPages} />
            </>
          )}
        </div>
      </SectionSplit>
    )

    if (section === 'sicurezza') {
      const markers = hike.difficultyMarkers ?? []
      return (
        <SectionSplit
          title="Sicurezza & segnalazioni"
          onClose={onClose}
          on3D={open3D(onClose)}
          mapContent={hasGps
            ? <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive difficultyMarkers={markers} highlightedDifficultyIndex={sicurezzaCenter.centeredIndex} planned />
            : <div className="absolute inset-0 bg-[#0b1a24]" />}
        >
          <div ref={sicurezzaCenter.containerRef} className="h-full overflow-y-auto px-4 py-4 space-y-5">
            {hike.assessment && <AssessmentPanel a={hike.assessment} />}
            {hasGps && !si.notMatched && (
              <CurrentConditionsNotice osmId={hike.osmId} polyline={hike.routePolyline} plannedId={hike.id} signals={si.result?.signals} />
            )}
            {markers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Segnalazioni dal tracciato</p>
                {markers.map((m, i) => {
                  const highlighted = i === sicurezzaCenter.centeredIndex
                  const colors = m.severity === 'danger' ? 'bg-red-50 border-red-200 text-red-700' : m.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'
                  return (
                    <div key={i} ref={sicurezzaCenter.setItemRef(i)} className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${colors} ${highlighted ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                      {m.text}
                    </div>
                  )
                })}
              </div>
            )}
            {!hike.assessment && markers.length === 0 && (
              <p className="text-sm text-stone-400 italic">Nessuna valutazione disponibile per questo percorso.</p>
            )}
          </div>
        </SectionSplit>
      )
    }

    // strumenti
    return (
      <SectionSplit title="Strumenti" onClose={onClose} mapContent={sectionMap()} on3D={open3D(onClose)}>
        <div className="h-full overflow-y-auto px-4 py-4 space-y-1">
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
      </SectionSplit>
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
        onIndexChange={(item) => {
          setCurrentId(item.id)
          // Plain History API, not router.replace: `/guida` and `/guida/[id]` are different
          // page components, so a Next.js navigation between them unmounts/remounts this whole
          // hub (re-running every data-loading effect) and produces a visible double-render —
          // this is a purely cosmetic address-bar sync, so it doesn't need a real navigation.
          window.history.replaceState(null, '', `/guida/${encodeURIComponent(item.id)}`)
        }}
        renderStageMap={renderStageMap}
        renderSection={renderSection}
        onNavigate={(item) => router.push(`/guida/${encodeURIComponent(item.id)}/naviga`)}
        datiBadge={(routeItem) => hike && routeItem.id === hike.id && hike.cachedTrailScore != null
          ? Math.round(hike.cachedTrailScore) : undefined}
        featuredLabel="Guida Turistica"
        featuredIcon={BookOpen}
        onOpenFeatured={() => setShowGuideSection(true)}
        summaryBanner={(routeItem) => hike && routeItem.id === hike.id ? hike.assessment?.summary : undefined}
        weatherIcon={(routeItem) => hike && routeItem.id === hike.id ? weatherIcon : undefined}
        onOpenMap3D={() => setShow3D(true)}
        importLabel="Importa"
        onImport={() => router.push('/upload?tab=gpx')}
        renderUnlockedControls={(routeItem) => hike && routeItem.id === hike.id && hasGps ? (
          <>
            {hike.trackPoints?.some(p => p.altitudeMeters !== undefined) && (
              <RailButton onClick={() => setShowGradient(g => !g)} title="Pendenza" variant={showGradient ? 'terra' : 'glass'}>
                <Layers className="w-[18px] h-[18px] text-white" />
              </RailButton>
            )}
            <RailButton onClick={() => setShowStreetView(true)} title="Foto zona (street view)">
              <Images className="w-[18px] h-[18px] text-white" />
            </RailButton>
          </>
        ) : undefined}
      />

      {showGuideSection && hike && (
        guideExpanded ? (
          <div className="fixed inset-0 z-40 bg-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 shrink-0">
              <p className="font-display text-lg font-bold text-stone-800 truncate">Guida Turistica</p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setGuideExpanded(false)} title="Comprimi" className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button onClick={() => { setGuideExpanded(false); setShowGuideSection(false) }} title="Chiudi" className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              <div className="max-w-2xl mx-auto space-y-4">
                {guideParagraphs.map((p, i) => (
                  <p key={i} className="font-lora text-stone-700 leading-relaxed">{p}</p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <SectionSplit
            title="Guida Turistica"
            onClose={() => setShowGuideSection(false)}
            on3D={hasGps ? () => { setShowGuideSection(false); setShow3D(true) } : undefined}
            mapContent={hasGps
              ? <MapView trackPoints={hike.trackPoints ?? []} height="100%" interactive pois={pois} activeIndex={guideActiveTrackIndex} highlightedPoiIndex={guideActivePoiIndex} planned />
              : <div className="absolute inset-0 bg-[#0b1a24]" />}
          >
            <div className="h-full flex flex-col">
              {guideParagraphs.length > 0 && (
                <div className="flex items-center justify-end px-4 pt-3 shrink-0">
                  <button onClick={() => setGuideExpanded(true)} className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                    <Maximize2 className="w-3.5 h-3.5" /> Schermo intero
                  </button>
                </div>
              )}
              <div ref={guideCenter.containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {guideParagraphs.length > 0 ? (
                  guideParagraphs.map((p, i) => (
                    <p key={i} ref={guideCenter.setItemRef(i)} className={`font-lora leading-relaxed transition-colors ${i === guideCenter.centeredIndex ? 'text-stone-900' : 'text-stone-500'}`}>
                      {p}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-stone-400 italic">Nessuna guida ancora generata per questo percorso. Giulia può raccontarti storia, natura e curiosità lungo il tracciato.</p>
                )}
                <button onClick={() => router.push(`/guida/${encodeURIComponent(hike.id)}/leggi`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors">
                  <BookOpen className="w-4 h-4" /> {hike.cachedGuide ? 'Genera di nuovo' : 'Genera guida'}
                </button>
              </div>
            </div>
          </SectionSplit>
        )
      )}

      {showFloraGallery && hike && (
        <FloraGallery
          trackPoints={hike.trackPoints ?? []}
          month={hike.plannedDate ? new Date(hike.plannedDate).getMonth() + 1 : new Date().getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowFloraGallery(false)}
        />
      )}
      {showAnimalGallery && hike && (
        <AnimalGallery
          trackPoints={hike.trackPoints ?? []}
          month={hike.plannedDate ? new Date(hike.plannedDate).getMonth() + 1 : new Date().getMonth() + 1}
          loadingTrack={false}
          onClose={() => setShowAnimalGallery(false)}
        />
      )}

      {show3D && hike && hasGps && (
        <RouteMap3D
          trackPoints={hike.trackPoints ?? []} title={hike.title} onClose={() => setShow3D(false)}
          plannedDate={hike.plannedDate} pois={pois} dtmProfile={dtmProfile}
          distanceMeters={hike.distanceMeters} elevationGain={hike.elevationGain}
        />
      )}
      {showStreetView && centerPt?.lat && centerPt?.lon && (
        <StreetViewPanel lat={centerPt.lat} lon={centerPt.lon} title={hike?.title} onClose={() => setShowStreetView(false)} />
      )}
    </>
  )
}
