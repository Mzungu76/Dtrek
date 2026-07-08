'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import RouteHub from '@/components/routehub/RouteHub'
import RouteThumb from '@/components/RouteThumb'
import GuideReader from '@/components/guida/GuideReader'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'
import type { RouteHubItem, SectionKind, TabDef, PrimaryAction } from '@/components/routehub/types'
import WeatherWidget from '@/components/WeatherWidget'
import { computeTrailScoreTotal, MiniScoreRing, TRAIL_SCORE_MAX } from '@/components/ScoreRing'
import { useCL, useSentinel2 } from '@/lib/cl/useCL'
import { useFlora } from '@/lib/useFlora'
import {
  getAllPlanned, getPlannedById, updatePlannedMeta, deletePlanned,
  type PlannedHike, type PlannedHikeMeta,
} from '@/lib/plannedStore'
import { type SafetyScore } from '@/lib/safetyScore'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { type PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { type BeautyScore } from '@/lib/beautyScore'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { TrailTerrainProfile } from '@/lib/terrain/trailTerrainProfile'
import { checkProtectedArea } from '@/lib/natura2000/checkProtectedArea'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { formatDuration } from '@/lib/tcxParser'
import { fetchForecastWeather, wmoInfo } from '@/lib/openmeteo'
import type { GuideSectionKey } from '@/lib/guideSections'
import {
  Mountain, Route, TrendingUp, Clock, Loader2, BookOpen,
  Car, Trash2, Pencil, Check, Images,
  MapPin, Wrench, Navigation,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { fetchDrivingInfo, getUserStartingPoint, getTrailStartPoint, originMatches } from '@/lib/drivingInfo'
import PdfExportButton from '@/components/PdfExportButton'

const MapView         = dynamic(() => import('@/components/MapView'),         { ssr: false })
const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const RouteMap3D       = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const FloraGallery     = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery    = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

/** cachedTsTotal is the full aggregate (CL + Sicurezza + Comfort TrailScore + Ombra e acqua)
 *  persisted to Supabase once it's been computed live for this hike (see the sync effect in
 *  GuidaHub) — reading it back is instant and, unlike the fallback below, includes CL/ombra-acqua
 *  too. For a hike that's never been opened yet, fall back to a best-effort total from only
 *  what's already cached in the lightweight list metadata (no per-item live fetch). */
function previewScoreValue(h: PlannedHikeMeta): number {
  if (h.cachedTsTotal != null) return h.cachedTsTotal
  return computeTrailScoreTotal(
    { notMatched: true },
    h.cachedSafetyScore ?? null,
    { result: null, cached: h.cachedTrailScore, beautyScore: h.cachedBeautyScore },
    { data: null },
  )
}

function metaToItem(h: PlannedHikeMeta): RouteHubItem {
  const previewTotal = previewScoreValue(h)
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
      // The "TS" sort must rank by the same aggregate the ring badge shows — using the raw
      // cachedTrailScore here would silently sort by the old single-dimension CTS while the
      // badge displays the 5-segment total, so a route's rank and its own badge would disagree.
      cts: previewTotal,
    },
    scorePreview: previewTotal > 0 ? { value: previewTotal, max: TRAIL_SCORE_MAX } : undefined,
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
  const [hrRest,         setHrRest]        = useState<number | undefined>(undefined)
  const [hrMax,          setHrMax]         = useState<number | undefined>(undefined)
  const [safetyScore,    setSafetyScore]   = useState<SafetyScore | null>(null)
  const [driving, setDriving] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null)
  const [altActiveIndex, setAltActiveIndex] = useState<number | null>(null)
  const [openSection, setOpenSection] = useState<SectionKind | null>(null)
  const [showPoiLayer, setShowPoiLayer] = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)
  const [weatherIcon, setWeatherIcon] = useState<{ emoji: string; label: string } | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [ctsSettled, setCtsSettled] = useState(false)
  const [enrichmentTimedOut, setEnrichmentTimedOut] = useState(false)
  const [hasAiAccess, setHasAiAccess] = useState<boolean | null>(null)
  const [pendingScrollSection, setPendingScrollSection] = useState<GuideSectionKey | null>(null)
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)

  const si = useCL({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const s2 = useSentinel2({ osmId: hike?.osmId, polyline: hike?.routePolyline, plannedId: hike?.id })
  const flora = useFlora(hike?.routePolyline, hike?.altitudeMax)

  // Whether this account has AI access (own Claude key or premium) — fetched once so the guide
  // can decide between auto-generating the Breve guide or showing the "configura accesso AI" state.
  useEffect(() => {
    fetch('/api/guide').then(r => r.json()).then(d => setHasAiAccess(!!d.hasAccess)).catch(() => setHasAiAccess(false))
  }, [])

  // Safety-net so the guide never waits forever for enrichment that failed silently somewhere
  // (Overpass/satellite APIs down, etc.) — after 90s it's generated anyway with whatever landed.
  useEffect(() => {
    setEnrichmentTimedOut(false)
    if (!hike?.id) return
    const t = setTimeout(() => setEnrichmentTimedOut(true), 90_000)
    return () => clearTimeout(t)
  }, [hike?.id])

  // All the data the auto-generated Breve guide should be able to draw on: POIs/Wikipedia,
  // CL/Sentinel2, flora, Safety and CTS scores. True once every source has settled (resolved or
  // deliberately skipped, e.g. no GPS) — or once the 90s watchdog above fires regardless.
  const enrichmentReady = enrichmentTimedOut ||
    (poisFullyLoaded && !si.loading && !s2.loading && !flora.loading && safetyScore != null && ctsSettled)

  // Lightweight list of every active (non-archived) planned hike, sorted by import
  // order (most recent first) — backs the carousel/gallery. Resolves the bare
  // /guida entry point to the latest one once loaded.
  useEffect(() => {
    // getAllPlanned() is stale-while-revalidate: it resolves instantly with whatever was cached
    // locally from the *previous* visit, then fetches the real list in the background. Without
    // onRefresh, that fresh fetch (with up-to-date cachedTrailScore/cachedBeautyScore/
    // cachedSafetyScore) is written to the local cache for next time but never reaches this
    // session's `items` — so the gallery's TS ring stays pinned to whatever it was a visit ago.
    const applyList = (list: PlannedHikeMeta[]) => {
      const active = list.filter(h => !h.archivedAt)
      const sorted = active.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setItems(sorted.map(metaToItem))
    }
    getAllPlanned(applyList).then(applyList).catch(() => setItems([])).finally(() => setListLoaded(true))
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
      if (d.hrRest != null) setHrRest(d.hrRest)
      if (d.hrMax != null) setHrMax(d.hrMax)
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

  // Safety: shows the cached value immediately if there is one (even a stale one, to avoid a
  // flash of "no data"), then refreshes in the background if it's missing or older than
  // SCORE_STALE_DAYS — normally that background refresh already happened at import time
  // (app/upload/page.tsx), so this is the "reopen it later" half of the same policy.
  useEffect(() => {
    if (!hike) return
    if (hike.cachedSafetyScore) setSafetyScore(hike.cachedSafetyScore)
    if (hike.cachedSafetyScore && isScoreFresh(hike.cachedSafetyComputedAt)) return
    let cancelled = false
    computeSafetyForHike(hike).then(safety => {
      if (cancelled) return
      setSafetyScore(safety)
      setHike(prev => prev ? { ...prev, cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() } : prev)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [hike?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // CTS+Beauty: same policy as Safety above — computed once at import, and re-verified here
  // only if missing (an older hike, imported before this policy existed) or stale. Reuses the
  // "Calcola CTS" button's own loading flag so the UI treats an automatic and a manual
  // (re)compute identically.
  //
  // Waits for the POI/DTM/terrain/protected-area/prefs effects above to land before running, so
  // it can hand their results to computeCtsForHike as `prefetched` instead of having it repeat
  // the exact same /api/pois, /api/tei-dtm, /api/tei-terrain and /api/natura2000 calls this
  // component is already making for its own map/UI state.
  useEffect(() => { setCtsSettled(false) }, [hike?.id])

  useEffect(() => {
    if (!hike) return
    const fresh = hike.cachedTrailScore != null && isScoreFresh(hike.cachedScoresComputedAt)
    if (fresh) { setCtsSettled(true); return }
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (gps.length < 2) { setCtsSettled(true); return }
    if (!poisFullyLoaded || dtmProfile === undefined || terrainProfile === undefined || inProtectedArea === undefined || !prefsLoaded) return
    let cancelled = false
    setCtsComputing(true)
    computeCtsForHike(hike, { pois, dtmProfile, terrainProfile, inProtectedArea, prefs: { prefSforzo, prefDurata, hrRest, hrMax } })
      .then(result => { if (!cancelled && result) setHike(prev => prev ? { ...prev, ...result } : prev) })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setCtsComputing(false); setCtsSettled(true) } })
    return () => { cancelled = true }
  }, [hike?.id, poisFullyLoaded, dtmProfile, terrainProfile, inProtectedArea, prefsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once every live input has settled (no per-item fetch needed — this only runs for the hike
  // that's actually open), persists the *full* aggregate — including CL and ombra/acqua, which
  // the cached-only fallback above can never see — to Supabase. From then on every gallery
  // render (this session, next session, other devices) reads that number back instantly via
  // previewScoreValue() instead of recomputing a partial one from scratch.
  useEffect(() => {
    if (!hike || si.loading || s2.loading) return
    const total = computeTrailScoreTotal(
      { si: si.result?.si, label: si.result?.label, loading: si.loading, notMatched: si.notMatched },
      safetyScore,
      { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore },
      { data: s2.data, loading: s2.loading },
    )
    if (total <= 0 || total === hike.cachedTsTotal) return
    updatePlannedMeta(hike.id, { cachedTsTotal: total }).catch(() => {})
    setHike(prev => prev ? { ...prev, cachedTsTotal: total } : prev)
  }, [hike, safetyScore, ctsResult, si.loading, si.result, si.notMatched, s2.loading, s2.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the gallery thumbnail's TS ring — and the "TS" sort key that ranks by it — in sync with
  // whatever just got cached (Calcola CTS, the auto-cached safety score, or the full aggregate
  // above). Same formula as metaToItem() for every other item in the list, so a hike's rank and
  // its own badge never disagree, whether or not it's the one currently open.
  const scorePreviewFor = (h: PlannedHike) => {
    const total = previewScoreValue(h)
    return total > 0 ? { value: total, max: TRAIL_SCORE_MAX } : undefined
  }

  // Persists the refreshed preview into `items` itself (not just this render's displayItems) —
  // otherwise the moment the hike stops being the active one, its gallery entry reverts to
  // whatever metaToItem() saw when the list first loaded.
  useEffect(() => {
    if (!hike) return
    const preview = scorePreviewFor(hike)
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === hike.id)
      if (idx === -1 || prev[idx].scorePreview?.value === preview?.value) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], scorePreview: preview, sortValues: { ...next[idx].sortValues!, cts: preview?.value ?? 0 } }
      return next
    })
  }, [hike?.id, hike?.cachedBeautyScore, hike?.cachedTrailScore, hike?.cachedSafetyScore, hike?.cachedTsTotal]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayItems = useMemo(() => {
    const pillsFor = (h: PlannedHike) => [
      { icon: Route,      label: `${(h.distanceMeters / 1000).toFixed(1)} km` },
      { icon: TrendingUp, label: `+${Math.round(h.elevationGain)} m` },
      { icon: Mountain,   label: `${Math.round(h.altitudeMax)} m` },
      { icon: Clock,      label: formatDuration(h.estimatedTimeSeconds) },
      ...(driving ? [{ icon: Car, label: `${(driving.distanceMeters / 1000).toFixed(0)} km in auto` }] : []),
    ]
    const sortValuesFor = (h: PlannedHike, previewValue: number) => ({
      date: new Date(h.createdAt).getTime(), km: h.distanceMeters, dplus: h.elevationGain, cts: previewValue,
    })
    const mapped = items.map(it => {
      if (it.id !== hike?.id) return it
      const preview = scorePreviewFor(hike)
      return { ...it, statPills: pillsFor(hike), sortValues: sortValuesFor(hike, preview?.value ?? 0), scorePreview: preview }
    })
    // Deep link to a hike outside the active list (e.g. archived/expired) — still show it
    // standalone rather than 404, once its full record has loaded.
    if (hike && !mapped.some(it => it.id === hike.id)) {
      const preview = scorePreviewFor(hike)
      return [{ id: hike.id, title: hike.title, polyline: hike.routePolyline, statPills: pillsFor(hike), sortValues: sortValuesFor(hike, preview?.value ?? 0), scorePreview: preview }, ...mapped]
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
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    if (gps.length < 2) return
    setCtsComputing(true)
    try {
      // Shares the same pipeline (and the same prefetched-data shortcut) as the automatic
      // background recompute above — hands it whatever this hub has already fetched for its own
      // POI/DTM/terrain/protected-area/prefs UI instead of asking it to fetch that all again.
      const result = await computeCtsForHike(hike, {
        pois: poisFullyLoaded ? pois : undefined,
        dtmProfile, terrainProfile, inProtectedArea,
        prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
      })
      if (result) setHike(prev => prev ? { ...prev, ...result } : prev)
    } catch (e) {
      console.error('CTS computation error:', e)
    } finally {
      setCtsComputing(false)
    }
  }

  const gpsPoints = hike?.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0

  const renderStageMap = (item: RouteHubItem, interactive: boolean, obscuredBottomPx: number) => {
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
        highlightedPoiIndex={highlightedPoiId != null ? pois.findIndex(p => p.id === highlightedPoiId) : null}
        onPoiTap={(poi) => setHighlightedPoiId(poi.id)}
        highlightedDifficultyIndex={null}
        activeIndex={openSection === 'featured' ? altActiveIndex : null}
        showPoiLayer={showPoiLayer}
        showTourControls={interactive}
        obscuredBottomPx={obscuredBottomPx}
      />
    )
  }

  const poiToggleChip = (
    <button
      onClick={() => setShowPoiLayer(v => !v)}
      title="Punti di interesse"
      className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${showPoiLayer ? 'bg-fuchsia-500/80 border-fuchsia-300/40 text-white' : 'bg-black/50 border-white/15 text-white/80'} backdrop-blur-md`}
    >
      <MapPin className="w-4 h-4" />
    </button>
  )

  // Lets the user set/change the planned outing date directly over the map, without a separate
  // page — only relevant for a hike not yet done (Guida), so this stays out of Resoconto.
  const dateChip = (
    <div className="relative">
      <button
        onClick={() => setShowDatePicker(v => !v)}
        title="Programma data di uscita"
        className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${showDatePicker ? 'bg-sky-500/80 border-sky-300/40 text-white' : 'bg-black/50 border-white/15 text-white/80'} backdrop-blur-md`}
      >
        <CalendarIcon className="w-4 h-4" />
      </button>
      {showDatePicker && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDatePicker(false)} />
          <div className="absolute right-0 top-11 z-20 p-3 rounded-xl bg-white shadow-2xl border border-stone-200">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1.5">Data di uscita</label>
            <input
              type="date"
              defaultValue={hike?.plannedDate ?? ''}
              onChange={e => { patch({ plannedDate: e.target.value || undefined }); setShowDatePicker(false) }}
              className="text-sm text-stone-800 outline-none border border-stone-200 rounded-lg px-2 py-1.5"
            />
          </div>
        </>
      )}
    </div>
  )

  const scoreBadges = (routeItem: RouteHubItem, onTap: () => void) => {
    if (!hike || routeItem.id !== hike.id) return null
    // Mirrors previewScoreValue(): if the aggregate is already cached in Supabase, show it
    // instantly like the gallery thumbnail does — don't make the pin wait on CL/Sentinel2
    // network fetches that only exist to keep the cache itself fresh in the background. Those
    // fetches still run (see the sync effect above) and will silently update the pin once they
    // land, but only a hike that's never had a total computed needs the live loading state.
    const cached = hike.cachedTsTotal
    const scoreLoading = cached == null && (si.loading || s2.loading)
    const trailScoreTotal = cached ?? computeTrailScoreTotal(
      { si: si.result?.si, label: si.result?.label, loading: si.loading, notMatched: si.notMatched },
      safetyScore,
      { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore },
      { data: s2.data, loading: s2.loading },
    )
    if (!scoreLoading && trailScoreTotal <= 0) return null
    return (
      <button onClick={() => { setPendingScrollSection('dati_sicurezza'); onTap() }} title="Trail Score" className="pointer-events-auto shrink-0">
        <MiniScoreRing value={trailScoreTotal} loading={scoreLoading} />
      </button>
    )
  }

  const renderSection = (section: SectionKind, item: RouteHubItem, onClose: () => void) => {
    if (!hike || item.id !== hike.id) {
      return <div className={`py-10 text-center text-sm ${textMuted}`}>Caricamento…</div>
    }

    if (section === 'meteo') return (
      <div className="px-4 py-4">
        {hasGps
          ? <WeatherWidget mode={hike.plannedDate ? 'planned' : 'forecast'} lat={centerPt.lat!} lon={centerPt.lon!} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} />
          : <p className={`text-sm italic text-center py-8 ${textMuted}`}>Meteo non disponibile senza un tracciato GPS.</p>}
      </div>
    )

    // Same reader previously at the standalone /guida/[id]/leggi page — now also hosts (as
    // widgets embedded in the article) everything that used to live in the dati/profilo/natura/
    // poi/sicurezza tabs, folded into one scrollable magazine guide reachable by dragging the
    // sheet open like any other tab instead of navigating to a separate page.
    if (section === 'featured') {
      const markers = hike.difficultyMarkers ?? []
      const pendingBanner = hike.pendingExpiresAt && !hike.archivedAt ? (() => {
        const expired = new Date(hike.pendingExpiresAt!).getTime() < Date.now()
        const daysLeft = Math.ceil((new Date(hike.pendingExpiresAt!).getTime() - Date.now()) / 86400000)
        return (
          <div className={`rounded-2xl border p-4 flex items-center justify-between gap-3 flex-wrap ${expired ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200'}`}>
            <p className={`text-sm font-medium ${expired ? 'text-amber-800' : 'text-sky-800'}`}>
              {expired ? 'Questa guida è scaduta: la proroghi o la archivi?' : `In attesa — scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={handleExtendPending} className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-colors">Proroga</button>
              {expired && <button onClick={handleArchive} className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:border-amber-400 text-amber-800 text-xs font-semibold transition-colors">Archivia</button>}
            </div>
          </div>
        )
      })() : null

      return (
        <GuideReader
          hike={hike}
          onHikeUpdate={patch => setHike(prev => prev ? { ...prev, ...patch } : prev)}
          topBanner={pendingBanner}
          enrichmentReady={enrichmentReady}
          hasAiAccess={hasAiAccess}
          scrollToSectionKey={pendingScrollSection}
          onScrollToSectionConsumed={() => setPendingScrollSection(null)}
          highlightedPoiId={highlightedPoiId}
          onPoiTap={setHighlightedPoiId}
          weather={hasGps ? { lat: centerPt.lat!, lon: centerPt.lon!, mode: hike.plannedDate ? 'planned' as const : 'forecast' as const } : undefined}
          elevation={{ trackPoints: hike.trackPoints, onHover: setAltActiveIndex }}
          scores={{
            cl: { si: si.result?.si, label: si.result?.label, signals: si.result?.signals, partial: si.result?.partial, loading: si.loading, notMatched: si.notMatched, onRefresh: si.refresh, refreshing: si.refreshing, refreshError: si.refreshError },
            safety: safetyScore,
            cts: { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts },
            shadeWater: { data: s2.data, loading: s2.loading },
            showAspectToggle: hasGps && dtmProfile?.source === 'dtm',
            showGradientToggle: hasGps && dtmProfile?.source === 'dtm' && !!hike.trackPoints?.some(p => p.altitudeMeters !== undefined),
            showAspect, showGradient,
            onToggleAspect: () => setShowAspect(a => !a),
            onToggleGradient: () => setShowGradient(g => !g),
          }}
          safetyDetails={{ assessment: hike.assessment, hasGps, notMatched: si.notMatched, osmId: hike.osmId, polyline: hike.routePolyline, plannedId: hike.id, signals: si.result?.signals, markers, highlightedMarkerIndex: null }}
          poiList={{ pois, poiWikiEntries, hasGps, centerLat: centerPt?.lat, centerLon: centerPt?.lon, onWikiLoaded: setWikiPages }}
          natura={{ hasGps: hasGps && !!hike.routePolyline && hike.routePolyline.length >= 2, data: s2.data, loading: s2.loading, flora: flora.data, floraLoading: flora.loading, onOpenFloraGallery: () => setShowFloraGallery(true), onOpenAnimalGallery: () => setShowAnimalGallery(true) }}
        />
      )
    }

    // strumenti
    return (
      <div className="px-4 py-4 space-y-1">
        <PdfExportButton variant="planned" data={hike} label="Esporta PDF" className={`w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left text-sm font-medium ${textPrimary}`} />
        <button onClick={() => setShowStreetView(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <Images className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Foto zona (street view)</span>
        </button>
        <div>
          {editNotes ? (
            <div className="px-2 py-2 space-y-2">
              <textarea autoFocus value={notesVal} onChange={e => setNotesVal(e.target.value)} rows={4} placeholder="Aggiungi note, equipaggiamento, punti di interesse…"
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white resize-none outline-none focus:border-sky-500 placeholder:text-stone-400" />
              <div className="flex gap-2">
                <button onClick={saveNotes} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-400 transition-colors">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
                <button onClick={() => { setNotesVal(hike.userNotes ?? ''); setEditNotes(false) }} className={`px-3 py-1.5 text-sm transition-colors ${textMuted}`}>Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditNotes(true)} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Note personali{hike.userNotes ? '' : ' (vuote)'}</span>
            </button>
          )}
        </div>
        <div className="pt-1 mt-1 border-t border-stone-200">
          <button onClick={handleDelete} disabled={saving} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-red-50 transition-colors text-left text-red-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="text-sm font-medium">Elimina guida</span>
          </button>
        </div>
      </div>
    )
  }

  const tabs: TabDef[] = [
    { key: 'featured', label: 'Guida Turistica', icon: BookOpen },
    { key: 'strumenti', label: 'Strumenti', icon: Wrench },
  ]

  const primaryAction = (routeItem: RouteHubItem): PrimaryAction => ({
    label: 'Naviga',
    icon: Navigation,
    onClick: () => router.push(`/guida/${encodeURIComponent(routeItem.id)}/naviga`),
    variant: 'terra',
  })

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
        tabs={tabs}
        renderSection={renderSection}
        primaryAction={primaryAction}
        onSectionChange={setOpenSection}
        scoreBadges={scoreBadges}
        scoreBadgesTargetSection="featured"
        summaryBanner={(routeItem) => hike && routeItem.id === hike.id ? hike.assessment?.summary : undefined}
        weatherIcon={(routeItem) => hike && routeItem.id === hike.id ? weatherIcon : undefined}
        onOpenMap3D={hasGps ? () => setShow3D(true) : undefined}
        mapHeaderActions={<>{dateChip}{poiToggleChip}</>}
        importLabel="Importa"
        onImport={() => router.push('/upload?tab=gpx')}
      />

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
