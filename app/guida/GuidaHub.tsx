'use client'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import RouteHub from '@/components/routehub/RouteHub'
import HubSkeleton from '@/components/routehub/HubSkeleton'
import GuideReader from '@/components/guida/GuideReader'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'
import type { RouteHubItem, SectionKind, PrimaryAction, StatPill } from '@/components/routehub/types'
import { computeTrailScoreTotal, computeTrailScoreBreakdown, isTrailScoreVetoed, TRAIL_SCORE_MAX } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { normalizeGuideNotices } from '@/lib/guideNotices'
import CoverNoticesChip from '@/components/guida/CoverNoticesChip'
import { useFlora } from '@/lib/useFlora'
import {
  getAllPlanned, getPlannedById, updatePlannedMeta, deletePlanned,
  type PlannedHike, type PlannedHikeMeta,
} from '@/lib/plannedStore'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import type { RouteMode } from '@/lib/routeMode'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { type PoiItem } from '@/lib/overpass'
import { fetchWikiForNamedPois, type WikiPage } from '@/lib/wikipedia'
import { computeTrailScore, type TrailScoreResult } from '@/lib/trailScore'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { getPersonalRecords, difficultyIndex } from '@/lib/stats'
import { refineSafetyWithTerrainSignals } from '@/lib/safetyScore'
import { computePersonalSafety, verdictPhrase, type PersonalFitProfile, type PersonalFitHistory, type PersonalFitRoute } from '@/lib/personalSafetyFit'
import { isHikerExperienceLevel, sanitizeHikerConcerns, type HikerExperienceLevel, type HikerConcernKey } from '@/lib/hikerProfile'
import { type BeautyScore } from '@/lib/beautyScore'
import { computeBbox, minDistToTrack, haversineM } from '@/lib/geoUtils'
import { getUserStartingPoint, googleMapsDirectionsUrl, fetchDrivingInfo, originMatches, getTrailStartPoint } from '@/lib/drivingInfo'
import { useCtsUpdated } from '@/lib/sync/useCtsUpdated'
import { formatDuration } from '@/lib/tcxParser'
import type { GuideSectionKey } from '@/lib/guideSections'
import { metaHasHikingMetrics, SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import { metaRowLocationStats } from '@/lib/metaCard'
import { metaEligibleForHikingScores } from '@/lib/guideCardVariant'
import {
  Mountain, Route, TrendingUp, Clock, Loader2,
  Car, Trash2, Pencil, Check, Images,
  Navigation, Download, MapPin,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { exportPlannedHikeToGpx } from '@/utils/exportGpx'
import { useUserPrefs } from '@/lib/useUserPrefs'
import { useHasAiAccess } from './useHasAiAccess'
import { useEnrichmentTimeout } from './useEnrichmentTimeout'
import { useDtmProfile } from './useDtmProfile'
import { useTerrainProfile } from './useTerrainProfile'
import { useProtectedAreaCheck } from './useProtectedAreaCheck'
import { useDrivingDistance } from './useDrivingDistance'
import { useSafetyScore } from './useSafetyScore'
import { useCtsRecompute } from '@/lib/useCtsRecompute'
import { tryOpenNavigatorApp } from '@/lib/navigatorHandoff'

const StreetViewPanel = dynamic(() => import('@/components/StreetViewPanel'), { ssr: false })
const RouteMap3D       = dynamic(() => import('@/components/RouteMap3D'),      { ssr: false })
const FloraGallery     = dynamic(() => import('@/components/FloraGallery'),    { ssr: false })
const AnimalGallery    = dynamic(() => import('@/components/AnimalGallery'),   { ssr: false })

/** cachedTsTotal is the Trail Score v2 (0-100, see lib/trailScoreV2.ts) persisted to Supabase once
 *  computed live for this hike (see the sync effect in GuidaHub) — reading it back is instant.
 *  Trail Score v2 needs Sicurezza/Comfort TrailScore BOTH present to mean anything (it's a gate,
 *  not a sum — see computeTrailScoreV2's own doc comment), so a hike that's never been opened yet
 *  (no cachedTsTotal) falls back to just its raw Comfort TrailScore instead of fabricating a full
 *  v2 number out of incomplete data. */
function previewScoreValue(h: PlannedHikeMeta): number {
  // Confine esplicito di tipologia (piano guide-eccellenza — verifica post-Fase 4): un badge CTS
  // non ha senso per un Sito/Borgo cammino_urbano — mai mostrarne uno anche se un valore stale è
  // rimasto cachato da prima di questo confine (es. Meta creata prima di questa verifica).
  if (!metaEligibleForHikingScores(h)) return 0
  if (h.cachedTsTotal != null) return h.cachedTsTotal
  return h.cachedTrailScore ?? 0
}

/** Pillole per una Meta senza metriche escursionistiche (Borgo/Città, Sito) — mai km/D+/quota/
 *  durata (piano guide-eccellenza §Fase 0: "se manca il dato, la riga sparisce, non uno zero").
 *  municipality/region non esistono ancora su PlannedHikeMeta (solo su dtrek_places via placeId,
 *  non denormalizzati qui), quindi restano null: metaRowLocationStats è già tollerante alla loro
 *  assenza e produce solo la categoria (per un Sito) o nessuna pillola (per un Borgo/Città). */
function nonHikingStatPills(h: Pick<PlannedHikeMeta, 'metaType' | 'siteType'>): StatPill[] {
  return metaRowLocationStats({
    metaType: h.metaType ?? 'sentiero',
    siteType: h.siteType ?? null,
    municipality: null,
    region: null,
  }).map(stat => ({
    icon: stat.key === 'category' && h.siteType ? SITE_TYPE_CONFIG[h.siteType].icon : MapPin,
    label: stat.value,
  }))
}

/** Dati asincroni riempiti in background dopo il primo mount (fetch POI/orario per placeId, vedi
 *  gli effect dedicati più sotto) — mai disponibili alla costruzione iniziale della card, quindi
 *  sempre un parametro a parte invece che un campo di PlannedHikeMeta. */
interface MetaExtraStats {
  poiCount?: number
  openingHoursLabel?: string
}

function statPillsForMeta(h: PlannedHikeMeta, distPill?: StatPill | null, extra?: MetaExtraStats): StatPill[] {
  const basePills = metaHasHikingMetrics(h.metaType)
    ? [
        { icon: Route,      label: `${(h.distanceMeters / 1000).toFixed(1)} km` },
        { icon: TrendingUp, label: `+${Math.round(h.elevationGain)} m` },
        { icon: Mountain,   label: `${Math.round(h.altitudeMax)} m` },
        { icon: Clock,      label: formatDuration(h.estimatedTimeSeconds) },
      ]
    : nonHikingStatPills(h)
  const extraPills: StatPill[] = []
  if (extra?.poiCount) extraPills.push({ icon: MapPin, label: `${extra.poiCount} punti d'interesse` })
  if (extra?.openingHoursLabel) extraPills.push({ icon: Clock, label: extra.openingHoursLabel })
  return [...basePills, ...extraPills, ...(distPill ? [distPill] : [])]
}

function metaToItem(h: PlannedHikeMeta): RouteHubItem {
  const previewTotal = previewScoreValue(h)
  return {
    id: h.id,
    title: h.title,
    polyline: h.routePolyline,
    metaType: h.metaType,
    siteType: h.siteType,
    latitude: h.latitude,
    longitude: h.longitude,
    statPills: statPillsForMeta(h),
    sortValues: {
      date: new Date(h.createdAt).getTime(),
      km: h.distanceMeters,
      dplus: h.elevationGain,
      // The "TS" sort must rank by the same aggregate the ring badge shows — using the raw
      // cachedTrailScore here would silently sort by the old single-dimension CTS while the
      // badge displays the 5-segment total, so a route's rank and its own badge would disagree.
      cts: previewTotal,
      // Filled in by displayItems from the driving-distance cache (see the background sync
      // effect below), which also checks the cached value hasn't gone stale (saved address
      // changed since) — not baked in here to avoid two places disagreeing on freshness.
    },
    scorePreview: previewTotal > 0 ? { value: previewTotal, max: TRAIL_SCORE_MAX } : undefined,
    // Cachata (non da una fetch per scheda) così l'anello esterno del badge a doppio anello
    // (components/TrailScoreGaugeBadge.tsx) ha subito una Sicurezza da mostrare nella galleria/
    // carosello per ogni percorso, anche prima che arrivi il valore live — vedi scoreGaugeBadge
    // sotto, che per il percorso davvero aperto preferisce comunque quello.
    // Stesso confine esplicito di previewScoreValue sopra — mai una Sicurezza stale per un Sito/
    // Borgo cammino_urbano, anche se cachata da prima di questa verifica.
    safetyPreview: h.cachedSafetyScore && metaEligibleForHikingScores(h)
      ? { overall: h.cachedSafetyScore.overall, color: h.cachedSafetyScore.color, label: h.cachedSafetyScore.label }
      : undefined,
    favorite: h.favorite,
    plannedDate: h.plannedDate,
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
  const [titleVal, setTitleVal] = useState('')
  const [editTitle, setEditTitle] = useState(false)
  const [showGradient, setShowGradient] = useState(false)
  const [showAspect,   setShowAspect]   = useState(false)
  const [showStreetView, setShowStreetView] = useState(false)
  const [pois,           setPois]          = useState<PoiItem[]>([])
  const [, setWikiPages] = useState<WikiPage[]>([])
  const [poiWikiEntries, setPoiWikiEntries] = useState<{ poi: PoiItem; wiki: WikiPage }[]>([])
  const [poisFullyLoaded, setPoisFullyLoaded] = useState(false)
  const [ctsResult,      setCtsResult]     = useState<TrailScoreResult | null>(null)
  const [ctsComputing,   setCtsComputing]  = useState(false)
  const [show3D, setShow3D] = useState(false)
  const [showFloraGallery, setShowFloraGallery] = useState(false)
  const [showAnimalGallery, setShowAnimalGallery] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [exportingGuidePdf, setExportingGuidePdf] = useState(false)
  const [guidePdfError, setGuidePdfError] = useState<string | null>(null)
  const [showPendingActions, setShowPendingActions] = useState(false)
  const [favoritesFilter, setFavoritesFilter] = useState(false)
  // "Prossima uscita": sottosezione dei preferiti, non un filtro a sé — vedi RouteHub.tsx per il
  // criterio (preferiti con data programmata da oggi in poi, in ordine di calendario). Spegnere i
  // preferiti la spegne con sé: da sola non avrebbe più un insieme di partenza da restringere.
  const [nextOutingFilter, setNextOutingFilter] = useState(false)
  // Conferma "Percorso eliminato" — la cancellazione locale (deletePlanned) è già istantanea, ma
  // handleDelete naviga subito dopo verso '/guida', che rimonta questo componente da zero e mostra
  // il prossimo percorso (o lo scheletro di caricamento): senza un segnale esplicito, l'utente non
  // ha modo di distinguere "sto ancora eliminando" da "ho già eliminato, ora sto solo caricando
  // dell'altro". sessionStorage (non un querystring) sopravvive al remount senza richiedere
  // useSearchParams, che su questa pagina interamente client-side andrebbe comunque avvolto in un
  // Suspense boundary.
  const [showDeletedToast, setShowDeletedToast] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('dtrek:justDeletedHike') !== '1') return
    sessionStorage.removeItem('dtrek:justDeletedHike')
    setShowDeletedToast(true)
    const t = setTimeout(() => setShowDeletedToast(false), 3000)
    return () => clearTimeout(t)
  }, [])
  const [ctsSettled, setCtsSettled] = useState(false)
  const [pendingScrollSection, setPendingScrollSection] = useState<GuideSectionKey | null>(null)
  const [highlightedPoiId, setHighlightedPoiId] = useState<number | null>(null)
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lon: number } | null>(null)
  // Distanza/durata in auto (OSRM) + l'origine con cui sono state calcolate, per ogni percorso
  // della lista — inizializzato dalla cache già persistita (planned_hikes.cached_driving_*),
  // poi tenuto aggiornato dall'effetto di sync qui sotto quando manca o l'indirizzo è cambiato.
  const [driveCache, setDriveCache] = useState<Map<string, { distanceMeters: number; durationSeconds: number; originLat: number; originLon: number }>>(new Map())
  const attemptedDriveRef = useRef<Set<string>>(new Set())
  // Copia leggera dell'ultima lista applicata (metaType/placeId per ogni percorso) — items (sopra)
  // è già mappato a RouteHubItem e non porta più questi campi, ma il riempimento della copertina
  // sotto ne ha bisogno per sapere quali schede interrogare e con quale placeId.
  const [metaList, setMetaList] = useState<PlannedHikeMeta[]>([])
  const attemptedPlaceDetailRef = useRef<Set<string>>(new Set())
  const attemptedPoiCountRef = useRef<Set<string>>(new Set())

  // Indirizzo/punto di partenza salvato nelle impostazioni utente — usato per la distanza in
  // auto mostrata tra i dati principali di ogni scheda e come filtro di ordinamento.
  useEffect(() => { getUserStartingPoint().then(setUserOrigin).catch(() => {}) }, [])

  const flora = useFlora(
    hike?.routePolyline, hike?.altitudeMax,
    hike ? { plannedId: hike.id, data: hike.floraResult, trackHash: hike.floraTrackHash } : undefined,
  )

  const { hasAiAccess, aiUnavailable, trialExpired } = useHasAiAccess()
  const enrichmentTimedOut = useEnrichmentTimeout(hike?.id)
  const dtmProfile = useDtmProfile(hike)
  const terrainProfile = useTerrainProfile(hike)
  const inProtectedArea = useProtectedAreaCheck(hike)
  const driving = useDrivingDistance(hike)
  const drivingWithMaps = useMemo(() => {
    if (!driving) return driving
    const trailStart = hike?.routePolyline?.[0]
    const mapsUrl = userOrigin && trailStart
      ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
      : undefined
    return { ...driving, mapsUrl }
  }, [driving, userOrigin, hike?.routePolyline])
  const { safetyScore, setSafetyScore } = useSafetyScore(hike, setHike)
  const { prefsLoaded, prefSforzo, prefDurata, hrRest, hrMax } = useUserPrefs()

  // Sicurezza "per te" (Oggettiva + Idoneità per Te, vedi lib/personalSafetyFit.ts) — la Sicurezza
  // Oggettiva cachata (safetyScore) viene prima corretta con la pendenza DTM già disponibile qui
  // (refineSafetyWithTerrainSignals, vedi il commento sul perché in lib/safetyScore.ts), poi
  // combinata col profilo escursionista e lo storico personale. Da questo fix in poi il calcolo
  // persistito (computeSafetyForHike/recalcAllSafety) applica già la stessa correzione — questa
  // chiamata resta un "top-up" solo presentazionale per punteggi cachati prima di questo fix o
  // quando il DTM diventa disponibile dopo l'ultimo calcolo persistito; non tocca la cache.
  const [activities, setActivities] = useState<ActivityMeta[]>([])
  useEffect(() => { getAllActivities().then(setActivities).catch(() => {}) }, [])

  const [hikerFitProfile, setHikerFitProfile] = useState<{ experienceLevel: HikerExperienceLevel | null; concerns: HikerConcernKey[]; userAge?: number }>({ experienceLevel: null, concerns: [] })
  useEffect(() => {
    getUserSettingsCached().then(d => {
      setHikerFitProfile({
        experienceLevel: isHikerExperienceLevel(d.hikerExperienceLevel) ? d.hikerExperienceLevel : null,
        concerns: sanitizeHikerConcerns(d.hikerConcerns),
        userAge: d.userAge || undefined,
      })
    }).catch(() => {})
  }, [])

  const personalRecords = useMemo(() => getPersonalRecords(activities), [activities])
  const fitHistory = useMemo<PersonalFitHistory>(() => ({
    maxAltitudeM: personalRecords.highestAlt?.altitudeMax,
    maxDifficultyIndex: personalRecords.highestDifficulty
      ? difficultyIndex(personalRecords.highestDifficulty.elevationGain, personalRecords.highestDifficulty.distanceMeters)
      : undefined,
  }), [personalRecords])

  const refinedSafety = useMemo(
    () => safetyScore ? refineSafetyWithTerrainSignals(safetyScore, { maxSlopeDeg: dtmProfile?.maxSlopeDeg ?? undefined }) : null,
    [safetyScore, dtmProfile?.avgSlopeDeg],
  )

  const personalSafety = useMemo(() => {
    if (!refinedSafety || !hike) return null
    const route: PersonalFitRoute = { altitudeMax: hike.altitudeMax, difficultyIndex: difficultyIndex(hike.elevationGain, hike.distanceMeters) }
    const profile: PersonalFitProfile = hikerFitProfile
    return computePersonalSafety(refinedSafety, profile, fitHistory, route)
  }, [refinedSafety, hike, hikerFitProfile, fitHistory])

  // All the data the auto-generated Breve guide should be able to draw on: POIs/Wikipedia,
  // flora, Safety and CTS scores. True once every source has settled (resolved or deliberately
  // skipped, e.g. no GPS) — or once the 90s watchdog above fires regardless.
  //
  // Un Borgo/Città o Sito non ha nessuno di questi segnali da attendere (niente traccia GPS ⇒
  // niente POI/flora/Safety/CTS da calcolare) — pronto subito. Senza questo controllo esplicito,
  // `poisFullyLoaded` non viene MAI impostato a true per una Meta senza traccia (vedi l'effetto
  // sopra: il ramo che lo fa vive dentro `if (gps.length > 0)`), quindi la Guida di un Borgo/Sito
  // restava bloccata sul messaggio "Sto raccogliendo i dati del percorso…" fino al watchdog di 90s
  // — visto dal vivo su una preview Vercel, piano "Guida Borgo/Città e Sito".
  const enrichmentReady = hike && hike.metaType !== 'sentiero'
    ? true
    : enrichmentTimedOut || (poisFullyLoaded && !flora.loading && safetyScore != null && ctsSettled)

  // Lightweight list of every active (non-archived) planned hike, sorted by import
  // order (most recent first) — backs the carousel/gallery. Resolves the bare
  // /guida entry point to the latest one once loaded.
  // getAllPlanned() is stale-while-revalidate: it resolves instantly with whatever was cached
  // locally from the *previous* visit, then fetches the real list in the background. Without
  // onRefresh, that fresh fetch (with up-to-date cachedTrailScore/cachedBeautyScore/
  // cachedSafetyScore) is written to the local cache for next time but never reaches this
  // session's `items` — so the gallery's TS ring stays pinned to whatever it was a visit ago.
  const applyList = useCallback((list: PlannedHikeMeta[]) => {
    const active = list.filter(h => !h.archivedAt)
    const sorted = active.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setItems(prev => {
      const prevById = new Map(prev.map(it => [it.id, it]))
      return sorted.map(h => {
        const fresh = metaToItem(h)
        // La polyline di un percorso salvato non cambia mai dopo la creazione — riusare il
        // riferimento precedente invece di uno nuovo (ma identico) evita di far ripartire da
        // zero CoverMap (il suo effect dipende da [polyline], vedi components/routehub/
        // CoverMap.tsx): senza questo, ogni volta che questa rivalidazione in background
        // (cache-first poi rete, o un pull di useCtsUpdated) applica dati più freschi — punteggi,
        // pillole — TUTTE le card ricevevano anche un nuovo array polyline pur identico,
        // facendo sfarfallare la mappa di copertina di qualunque scheda si stesse guardando in
        // quel momento, tipicamente proprio quella su cui si era appena atterrati sfogliando.
        const existing = prevById.get(h.id)
        const merged = existing?.polyline?.length ? { ...fresh, polyline: existing.polyline } : fresh
        // Stesso motivo del polyline sopra: metaToItem() non valorizza mai coverPhotoUrl (arriva
        // solo dal fill effect qui sotto, dopo il primo mount) — senza questo, ogni rivalidazione
        // in background la azzererebbe di nuovo, e attemptedPlaceDetailRef ne impedirebbe un
        // secondo tentativo, lasciando la copertina nera per il resto della sessione.
        const withCover = existing?.coverPhotoUrl ? { ...merged, coverPhotoUrl: existing.coverPhotoUrl } : merged
        // Stesso motivo, per poiCount/openingHoursLabel (riempiti dai due fill effect POI/orario
        // più sotto): fresh.statPills non li conosce ancora, quindi vanno ricostruiti qui invece
        // di andare persi a ogni rivalidazione in background.
        if (existing?.poiCount == null && existing?.openingHoursLabel == null) return withCover
        return {
          ...withCover,
          poiCount: existing.poiCount,
          openingHoursLabel: existing.openingHoursLabel,
          statPills: statPillsForMeta(h, undefined, { poiCount: existing.poiCount, openingHoursLabel: existing.openingHoursLabel }),
        }
      })
    })
    setMetaList(sorted)
    setDriveCache(prev => {
      const next = new Map(prev)
      for (const h of sorted) {
        if (h.cachedDrivingDistanceMeters == null || h.cachedDrivingOriginLat == null || h.cachedDrivingOriginLon == null) continue
        next.set(h.id, {
          distanceMeters: h.cachedDrivingDistanceMeters,
          durationSeconds: h.cachedDrivingDurationSeconds ?? 0,
          originLat: h.cachedDrivingOriginLat,
          originLon: h.cachedDrivingOriginLon,
        })
      }
      return next
    })
  }, [])

  useEffect(() => {
    getAllPlanned(applyList).then(applyList).catch(() => setItems([])).finally(() => setListLoaded(true))
  }, [applyList])

  // A background pull (another device added/edited/deleted a planned hike, or this device just
  // caught up after being offline) lands in the local cache without any user action on this page —
  // without this, the gallery would stay frozen on the pre-pull list until a manual reload.
  useCtsUpdated(() => { getAllPlanned().then(applyList).catch(() => {}) })

  // Riempie in background la distanza in auto per ogni percorso della galleria che ne è ancora
  // privo (o il cui valore cachato risale a un indirizzo diverso da quello attuale) — così il dato
  // compare senza dover aprire ciascun percorso, ma senza nemmeno richiamare il routing due volte
  // per lo stesso indirizzo. Il percorso aperto è già gestito, live, da useDrivingDistance.
  //
  // I risultati si accumulano e vengono applicati con un UNICO setDriveCache a fine giro, non uno
  // per percorso: con l'ordinamento "Distanza" attivo ogni aggiornamento di driveCache può far
  // risistemare la galleria, e applicarne uno per ciascuna scheda (magari una decina, una ogni
  // ~300ms) produceva un vistoso sfarfallio — la scheda aperta veniva ridisposta ripetutamente
  // mentre i valori arrivavano uno alla volta. Un solo aggiornamento finale risolve tutto in un
  // unico riassestamento.
  //
  // Parte solo a `enrichmentReady`, non al mount: è lavoro puramente accessorio (le altre schede
  // della galleria, non quella aperta) e prima le fetch critiche del percorso attivo (POI/wiki,
  // punteggi, sicurezza…) affollavano la stessa finestra di rete con questa — competendo per le
  // ~6 connessioni concorrenti del browser e allungando il tempo prima che il percorso aperto
  // fosse effettivamente pronto, cioè esattamente l'"apertura lenta" percepita dall'utente.
  useEffect(() => {
    if (!userOrigin || items.length === 0 || !enrichmentReady) return
    let cancelled = false
    ;(async () => {
      const resolved = new Map<string, { distanceMeters: number; durationSeconds: number; originLat: number; originLon: number }>()
      for (const it of items) {
        if (cancelled) return
        if (it.id === hike?.id) continue
        const trailStart = getTrailStartPoint({ routePolyline: it.polyline, latitude: it.latitude, longitude: it.longitude })
        if (!trailStart) continue
        const cached = driveCache.get(it.id)
        if (cached && originMatches(cached.originLat, cached.originLon, userOrigin.lat, userOrigin.lon)) continue
        const attemptKey = `${it.id}:${userOrigin.lat},${userOrigin.lon}`
        if (attemptedDriveRef.current.has(attemptKey)) continue
        attemptedDriveRef.current.add(attemptKey)
        const info = await fetchDrivingInfo(userOrigin.lat, userOrigin.lon, trailStart[0], trailStart[1])
        if (cancelled) return
        if (info) resolved.set(it.id, { ...info, originLat: userOrigin.lat, originLon: userOrigin.lon })
        // Un piccolo respiro tra una chiamata e l'altra — il routing gira su un server demo
        // pubblico (OSRM), non va martellato con richieste parallele per l'intera galleria.
        await new Promise(r => setTimeout(r, 300))
      }
      if (cancelled || resolved.size === 0) return
      setDriveCache(prev => {
        const next = new Map(prev)
        for (const [id, v] of Array.from(resolved)) next.set(id, v)
        return next
      })
      for (const [id, v] of Array.from(resolved)) {
        updatePlannedMeta(id, {
          cachedDrivingDistanceMeters: v.distanceMeters,
          cachedDrivingDurationSeconds: v.durationSeconds,
          cachedDrivingOriginLat: v.originLat,
          cachedDrivingOriginLon: v.originLon,
        }).catch(() => {})
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOrigin, items, hike?.id, enrichmentReady])

  // Riempie in background la copertina reale (foto dell'archivio dtrek_places) e, per un Sito,
  // l'orario (dtrek_places.opening_hours — as-is dalla fonte, mai parsato, stesso principio di
  // components/guida/widgets/SitoInfoWidget.tsx) per ogni Borgo/Città o Sito della galleria —
  // senza una traccia GPS da disegnare, la copertina "Screen 1" (components/routehub/
  // CoverMap.tsx) resterebbe altrimenti solo lo sfondo scuro di ripiego, MAI una mappa (queste
  // Mete non ne hanno una, piano §48.9) — visto dal vivo su una preview Vercel come una copertina
  // nera. Stesso endpoint di GuideReader (fetch alla vera apertura della Guida), stesso pattern
  // del riempimento della distanza in auto sopra: parte solo a enrichmentReady, una scheda alla
  // volta con una piccola pausa, mai in corsa con le fetch critiche del percorso aperto.
  useEffect(() => {
    if (metaList.length === 0 || !enrichmentReady) return
    let cancelled = false
    ;(async () => {
      for (const h of metaList) {
        if (cancelled) return
        if (!h.metaType || h.metaType === 'sentiero' || !h.placeId) continue
        if (attemptedPlaceDetailRef.current.has(h.id)) continue
        attemptedPlaceDetailRef.current.add(h.id)
        try {
          const res = await fetch(`/api/places/${h.placeId}`)
          if (res.ok) {
            const data = await res.json() as { imageUrl?: string | null; openingHours?: unknown }
            const openingHoursLabel = h.metaType === 'sito' && typeof data.openingHours === 'string' && data.openingHours.trim()
              ? data.openingHours.trim()
              : undefined
            if (!cancelled && (data.imageUrl || openingHoursLabel)) {
              setItems(prev => prev.map(it => {
                if (it.id !== h.id) return it
                const next = { ...it, ...(data.imageUrl ? { coverPhotoUrl: data.imageUrl } : {}) }
                if (!openingHoursLabel) return next
                return { ...next, openingHoursLabel, statPills: statPillsForMeta(h, undefined, { poiCount: it.poiCount, openingHoursLabel }) }
              }))
            }
          }
        } catch { /* silenzioso — resta la copertina/orario di ripiego (nessuno) */ }
        // Stesso respiro della distanza in auto sopra — questo endpoint fa anche una ricerca
        // Wikipedia quando manca una foto/descrizione propria, non va martellato per l'intera
        // galleria in un colpo solo.
        await new Promise(r => setTimeout(r, 300))
      }
    })()
    return () => { cancelled = true }
  }, [metaList, enrichmentReady])

  // Riempie in background il conteggio dei punti di interesse nei dintorni per ogni Borgo/Città
  // della galleria — stesso servizio POI multi-fonte già usato per il Sentiero aperto (app/api/
  // pois: GNA/PTPR/Wikidata/Overpass dedotti, cache server-side di 7 giorni per bbox), mai una
  // nuova chiamata Overpass live indipendente per scheda. Raggio walkable di 600m dal centro per
  // il conteggio (più stretto del bbox richiesto all'API, che ha solo margine per i risultati) —
  // nessun conteggio "esatto" del perimetro del centro storico (non esiste ancora, piano §7),
  // solo un'indicazione dei punti nominati nei dintorni immediati. Solo POI con un nome: un nodo
  // OSM anonimo non è un punto di interesse per l'utente. Stesso pattern/cadenza degli altri
  // riempimenti in background sopra.
  useEffect(() => {
    if (metaList.length === 0 || !enrichmentReady) return
    let cancelled = false
    const BORGO_POI_RADIUS_M = 600
    ;(async () => {
      for (const h of metaList) {
        if (cancelled) return
        if (h.metaType !== 'borgo_citta' || h.latitude == null || h.longitude == null) continue
        const lat = h.latitude, lon = h.longitude
        if (attemptedPoiCountRef.current.has(h.id)) continue
        attemptedPoiCountRef.current.add(h.id)
        try {
          const bbox = computeBbox([[lat, lon]], 0.01)
          const res = await fetch(`/api/pois?bbox=${bbox}`)
          if (res.ok) {
            const all = await res.json() as PoiItem[]
            const count = Array.isArray(all)
              ? all.filter(p => p.name && haversineM(p.lat, p.lon, lat, lon) <= BORGO_POI_RADIUS_M).length
              : 0
            if (!cancelled && count > 0) {
              setItems(prev => prev.map(it => it.id === h.id
                ? { ...it, poiCount: count, statPills: statPillsForMeta(h, undefined, { poiCount: count, openingHoursLabel: it.openingHoursLabel }) }
                : it))
            }
          }
        } catch { /* silenzioso — resta senza pillola POI, mai un conteggio fabbricato */ }
        await new Promise(r => setTimeout(r, 300))
      }
    })()
    return () => { cancelled = true }
  }, [metaList, enrichmentReady])

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
    // Persists to the backend only — nothing in this component reads hike.cachedPois again
    // after the initial load (line ~164 always re-fetches the hike fresh from the store), so
    // mirroring it into the in-memory `hike` state here would just force an extra re-render
    // of the whole card for no visible effect.
    if (!poisFullyLoaded || !hike || (hike.cachedPois?.length ?? 0) > 0 || !pois.length) return
    updatePlannedMeta(hike.id, { cachedPois: pois, cachedPoiWiki: poiWikiEntries }).catch(() => {})
  }, [poisFullyLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useCtsRecompute({
    entity: hike,
    entityId: hike?.id,
    isFresh: (h) => h.cachedTrailScore != null && isScoreFresh(h.cachedScoresComputedAt),
    // In AND col confine esplicito di tipologia (piano guide-eccellenza §Fase 4) — il controllo
    // sui dati resta la prima difesa, mai sostituito: un Sito/Borgo cammino_urbano a cui viene
    // iniettata per errore una traccia di 2 punti da un bug di import non deve comunque produrre
    // un CTS Score.
    hasEnoughGps: (h) => (h.trackPoints ?? []).filter(p => p.lat && p.lon).length >= 2 && metaEligibleForHikingScores(h),
    poisReady: poisFullyLoaded,
    dtmProfile, terrainProfile, inProtectedArea, prefsLoaded,
    pois,
    prefs: { prefSforzo, prefDurata, hrRest, hrMax },
    compute: computeCtsForHike,
    onResult: (result) => setHike(prev => prev ? { ...prev, ...result } : prev),
    setComputing: setCtsComputing,
    onSettled: () => setCtsSettled(true),
  })

  // Once Sicurezza/Comfort TrailScore are both settled (no per-item fetch needed — this only runs
  // for the hike that's actually open), persists the aggregate to Supabase. From then on every
  // gallery render (this session, next session, other devices) reads that number back instantly
  // via previewScoreValue() instead of recomputing it from scratch. lib/computeTsForHike.ts's
  // refreshTsForHike already covers most of the "recompute after Safety/CTS changes" cases
  // fire-and-forget elsewhere; this effect stays as the one that also reacts to a *local*,
  // not-yet-persisted ctsResult (recomputed live from cachedBeautyScore + current preferences,
  // see the effect above).
  useEffect(() => {
    if (!hike) return
    const total = computeTrailScoreTotal(
      refinedSafety,
      { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore },
    )
    if (total <= 0 || total === hike.cachedTsTotal) return
    updatePlannedMeta(hike.id, { cachedTsTotal: total }).catch(() => {})
    setHike(prev => prev ? { ...prev, cachedTsTotal: total } : prev)
  }, [hike, refinedSafety, ctsResult]) // eslint-disable-line react-hooks/exhaustive-deps

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
  //
  // Gated on ctsSettled — same fix as driveCache above, same root cause: cachedBeautyScore/
  // cachedTrailScore/cachedSafetyScore/cachedTsTotal land one at a time as the pipeline
  // progresses, and writing sortValues.cts on each intermediate arrival re-sorts a TS-ordered
  // gallery repeatedly out from under the user right as they open a route (was the "galleria
  // impazzita" bug). Waiting for the settled signal collapses it into one final write.
  useEffect(() => {
    if (!hike || !ctsSettled) return
    const preview = scorePreviewFor(hike)
    const safetyPreview = hike.cachedSafetyScore && metaEligibleForHikingScores(hike)
      ? { overall: hike.cachedSafetyScore.overall, color: hike.cachedSafetyScore.color, label: hike.cachedSafetyScore.label }
      : undefined
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === hike.id)
      if (idx === -1 || (prev[idx].scorePreview?.value === preview?.value && prev[idx].safetyPreview?.overall === safetyPreview?.overall)) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], scorePreview: preview, safetyPreview, sortValues: { ...next[idx].sortValues!, cts: preview?.value ?? 0 } }
      return next
    })
  }, [hike?.id, hike?.cachedBeautyScore, hike?.cachedTrailScore, hike?.cachedSafetyScore, hike?.cachedTsTotal, ctsSettled]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayItems = useMemo(() => {
    // Distanza in auto REALE (OSRM) — non in linea d'aria: per l'itinerario aperto usa il valore
    // live di useDrivingDistance (che lo ricalcola/persiste se l'indirizzo è cambiato); per gli
    // altri usa il valore già cachato in Supabase l'ultima volta che quel percorso è stato aperto
    // (nessuna chiamata di routing per-scheda). Il link apre le indicazioni su Google Maps.
    const distancePillFor = (destPoint: [number, number] | null, distanceMeters: number | undefined) => {
      if (distanceMeters == null) return null
      const href = userOrigin && destPoint
        ? googleMapsDirectionsUrl(userOrigin.lat, userOrigin.lon, destPoint[0], destPoint[1])
        : undefined
      return { icon: Car, label: `${Math.round(distanceMeters / 1000)} km in auto`, href }
    }
    const pillsFor = (h: PlannedHike, distanceMeters: number | undefined, extra?: MetaExtraStats) => {
      const distPill = distancePillFor(getTrailStartPoint(h), distanceMeters)
      return statPillsForMeta(h, distPill, extra)
    }
    const sortValuesFor = (h: PlannedHike, previewValue: number, distanceMeters: number | undefined) => ({
      date: new Date(h.createdAt).getTime(), km: h.distanceMeters, dplus: h.elevationGain, cts: previewValue,
      distance: distanceMeters,
    })
    const mapped = items.map(it => {
      if (it.id !== hike?.id) {
        // Il valore cachato conta solo se calcolato con l'indirizzo attuale — altrimenti
        // l'effetto di sync qui sopra lo sta già ricalcolando in background.
        const cached = driveCache.get(it.id)
        const distanceMeters = cached && (!userOrigin || originMatches(cached.originLat, cached.originLon, userOrigin.lat, userOrigin.lon))
          ? cached.distanceMeters
          : undefined
        const destPoint = getTrailStartPoint({ routePolyline: it.polyline, latitude: it.latitude, longitude: it.longitude })
        const distPill = distancePillFor(destPoint, distanceMeters)
        if (!distPill) return it
        return { ...it, statPills: [...it.statPills, distPill], sortValues: it.sortValues ? { ...it.sortValues, distance: distanceMeters } : it.sortValues }
      }
      const distanceMeters = driving?.distanceMeters ?? hike.cachedDrivingDistanceMeters
      const preview = scorePreviewFor(hike)
      // scorePreview (the badge) tracks the live, still-settling value so its progress is visible;
      // sortValues.cts stays pinned to the last known-stable rank until ctsSettled, then snaps once
      // to the final value — otherwise the TS-sorted gallery reshuffles on every intermediate score
      // update while the user is still looking at the route they just opened.
      const stableCts = ctsSettled ? (preview?.value ?? 0) : (it.sortValues?.cts ?? preview?.value ?? 0)
      const extra = { poiCount: it.poiCount, openingHoursLabel: it.openingHoursLabel }
      return { ...it, statPills: pillsFor(hike, distanceMeters, extra), sortValues: sortValuesFor(hike, stableCts, distanceMeters), scorePreview: preview, plannedDate: hike.plannedDate }
    })
    // Deep link to a hike outside the active list (e.g. archived/expired) — still show it
    // standalone rather than 404, once its full record has loaded.
    if (hike && !mapped.some(it => it.id === hike.id)) {
      const distanceMeters = driving?.distanceMeters ?? hike.cachedDrivingDistanceMeters
      const preview = scorePreviewFor(hike)
      return [{ id: hike.id, title: hike.title, polyline: hike.routePolyline, metaType: hike.metaType, siteType: hike.siteType, latitude: hike.latitude, longitude: hike.longitude, statPills: pillsFor(hike, distanceMeters), sortValues: sortValuesFor(hike, preview?.value ?? 0, distanceMeters), scorePreview: preview, favorite: hike.favorite, plannedDate: hike.plannedDate }, ...mapped]
    }
    return mapped
  }, [items, hike, driving, userOrigin, driveCache, ctsSettled])

  const deletedToastNode = showDeletedToast ? (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-stone-900 text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2">
      <Check className="w-4 h-4 text-forest-400 shrink-0" /> Percorso eliminato
    </div>
  ) : null

  if (!listLoaded) {
    return <>{deletedToastNode}<HubSkeleton /></>
  }
  if (!currentId) {
    // items.length > 0 means the "pick the first item" effect above just hasn't committed its
    // setCurrentId yet (it fires one tick after listLoaded flips true) — genuinely empty is the
    // only case that should show the import CTA, otherwise this flashes on every single load.
    if (items.length > 0) return <>{deletedToastNode}<HubSkeleton /></>
    return (
      <>
        {deletedToastNode}
        <div className="fixed inset-0 bg-[#0b1a24] flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-stone-300 text-sm">Nessun percorso in attesa.</p>
          <button onClick={() => router.push('/upload?tab=gpx')} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold transition-colors">
            Crea una guida
          </button>
        </div>
      </>
    )
  }
  if (displayItems.length === 0) {
    return <>{deletedToastNode}<HubSkeleton /></>
  }

  const patch = async (data: Parameters<typeof updatePlannedMeta>[1]) => {
    if (!hike) return
    setSaving(true)
    try { await updatePlannedMeta(hike.id, data); setHike(prev => prev ? { ...prev, ...data } : prev) }
    finally { setSaving(false) }
  }

  // Non legata a `hike` (a differenza di patch sopra) — la stella va toccabile su qualunque
  // scheda della galleria, anche quella non ancora "aperta" (currentId/hike si aggiornano solo
  // dopo lo swipe, con un ritardo). Aggiorna items (stella sulla card) e hike se coincide (stella
  // nell'intestazione), poi persiste in background con lo stesso meccanismo di patch().
  const handleToggleFavorite = (routeItem: RouteHubItem) => {
    const next = !routeItem.favorite
    setItems(prev => prev.map(it => it.id === routeItem.id ? { ...it, favorite: next } : it))
    setHike(prev => prev && prev.id === routeItem.id ? { ...prev, favorite: next } : prev)
    updatePlannedMeta(routeItem.id, { favorite: next })
  }
  const saveNotes = async () => { await patch({ userNotes: notesVal }); setEditNotes(false) }
  // Stesso export DOM-based della guida a schermo (GuideReader.tsx), non più il documento jsPDF a
  // sé (utils/pdfExport/planned.ts, ritirato in Fase 4): erano due PDF diversi per lo stesso
  // percorso. cachedGuide è lo stesso testo che GuideReader tiene in stato — qui, fuori dal
  // lettore, si legge direttamente dall'hike persistito.
  const handleExportGuidePdf = async () => {
    if (!hike || exportingGuidePdf) return
    setExportingGuidePdf(true)
    setGuidePdfError(null)
    try {
      const { exportGuidePdf } = await import('@/utils/pdfExport')
      await exportGuidePdf(hike, hike.cachedGuide ?? '')
    } catch (err) {
      // Prima l'errore restava solo in console: da fuori il pulsante sembrava semplicemente non
      // fare nulla, indistinguibile da un pulsante inattivo.
      console.error('Export PDF guida fallito:', err)
      setGuidePdfError('Generazione del PDF non riuscita. Riprova.')
    } finally {
      setExportingGuidePdf(false)
    }
  }
  const saveTitle = async () => {
    const trimmed = titleVal.trim()
    if (!trimmed) return
    await patch({ title: trimmed })
    setItems(prev => prev.map(it => it.id === hike?.id ? { ...it, title: trimmed } : it))
    setEditTitle(false)
  }

  const handleDelete = async () => {
    if (!hike || !confirm('Eliminare questa escursione pianificata?')) return
    setSaving(true)
    try {
      await deletePlanned(hike.id)
      // Letto dall'effetto in cima al componente subito dopo il remount che segue router.push:
      // conferma "Percorso eliminato" indipendente da quanto ci mette a caricare il prossimo
      // percorso (o lo scheletro), che altrimenti sarebbe l'unico segnale visibile.
      if (typeof window !== 'undefined') sessionStorage.setItem('dtrek:justDeletedHike', '1')
      router.push('/guida')
    } finally { setSaving(false) }
  }
  const handleExtendPending = async () => {
    if (!hike) return
    const days = await getUserSettingsCached().then(d => d.guidePendingDays ?? 30).catch(() => 30)
    await patch({ pendingExpiresAt: new Date(Date.now() + days * 86400000).toISOString(), archivedAt: undefined })
  }
  const handleArchive = async () => { await patch({ archivedAt: new Date().toISOString() }); router.push('/guida') }

  const handleComputeCts = async () => {
    if (!hike) return
    const gps = (hike.trackPoints ?? []).filter(p => p.lat && p.lon)
    // Stesso confine esplicito di tipologia di useCtsRecompute sopra (piano guide-eccellenza
    // §Fase 4), in AND col controllo sui dati — mai in sua sostituzione.
    if (gps.length < 2 || !metaEligibleForHikingScores(hike)) return
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

  /**
   * L'utente ha dichiarato come percorre un itinerario lineare (sola andata / andata e ritorno,
   * vedi lib/routeMode.ts) — sia dal popup obbligatorio all'import sia dal toggle nella striscia
   * dei dati. Non è una preferenza di visualizzazione: distanza, dislivello e durata effettivi
   * cambiano, e con loro TEI/Comfort TrailScore e Sicurezza. Quindi si persiste la scelta e si
   * rifanno subito entrambi i punteggi (che a loro volta rimaterializzano il Trail Score v2
   * aggregato, vedi refreshTsForHike), invece di lasciare in vista dei numeri che descrivono una
   * camminata diversa da quella che l'utente ha appena dichiarato.
   *
   * I testi già scritti da Giulia NON si rigenerano: sono contenuto dell'utente, riscriverli in
   * automatico (a pagamento, per giunta) sarebbe una sorpresa costosa. Il popup lo dice
   * esplicitamente prima della scelta.
   */
  const handleRouteModeChange = async (mode: RouteMode) => {
    if (!hike || hike.routeMode === mode) return
    const updated: PlannedHike = { ...hike, routeMode: mode }
    setHike(updated)
    setCtsComputing(true)
    try {
      await updatePlannedMeta(hike.id, { routeMode: mode })
      const [cts, safety] = await Promise.all([
        computeCtsForHike(updated, {
          pois: poisFullyLoaded ? pois : undefined,
          dtmProfile, terrainProfile, inProtectedArea,
          prefs: prefsLoaded ? { prefSforzo, prefDurata, hrRest, hrMax } : undefined,
        }).catch(() => null),
        computeSafetyForHike(updated).catch(() => null),
      ])
      if (safety) setSafetyScore(safety)
      setHike(prev => prev && prev.id === updated.id ? {
        ...prev,
        ...(cts ?? {}),
        ...(safety ? { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() } : {}),
      } : prev)
      // cachedTsTotal è ricalcolato in background da refreshTsForHike (chiamato dalle due funzioni
      // qui sopra) e riletto dalla cache locale: senza rileggerlo, la copertina continuerebbe a
      // mostrare l'aggregato precedente finché la scheda non viene riaperta.
      const refreshed = await getPlannedById(updated.id)
      if (refreshed) setHike(prev => prev && prev.id === updated.id ? { ...prev, cachedTsTotal: refreshed.cachedTsTotal } : prev)
    } finally {
      setCtsComputing(false)
    }
  }

  const gpsPoints = hike?.trackPoints?.filter(p => p.lat && p.lon) ?? []
  const centerPt  = gpsPoints[Math.floor(gpsPoints.length / 2)]
  const hasGps    = gpsPoints.length > 0

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
              onChange={e => {
                const next = e.target.value || undefined
                patch({ plannedDate: next })
                // Anche nella lista, non solo sul percorso aperto: è `items` a nutrire galleria e
                // carosello, ed è da lì che la sottosezione "Prossima uscita" legge le date.
                setItems(prev => prev.map(it => it.id === hike?.id ? { ...it, plannedDate: next } : it))
                setShowDatePicker(false)
              }}
              className="text-sm text-stone-800 outline-none border border-stone-200 rounded-lg px-2 py-1.5"
            />
          </div>
        </>
      )}
    </div>
  )

  // Compact "scadenza" pill next to the title, replacing the full-width banner that used to sit
  // above the hero — same Proroga/Archivia actions, now tucked into a popover so a pending hike
  // doesn't push a whole extra block above the guide every time it's opened.
  const pendingChip = hike?.pendingExpiresAt && !hike.archivedAt ? (() => {
    const expiresAt = hike.pendingExpiresAt!
    const expired = new Date(expiresAt).getTime() < Date.now()
    const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    return (
      <div className="relative">
        <button
          onClick={() => setShowPendingActions(v => !v)}
          title={expired ? 'Guida scaduta' : `Scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}`}
          className={`flex items-center gap-1 h-9 px-2.5 rounded-full border transition-colors backdrop-blur-md text-xs font-semibold ${
            expired ? 'bg-amber-500/85 border-amber-300/40 text-white' : 'bg-black/50 border-white/15 text-white/80'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          {expired ? 'Scaduta' : `${daysLeft}g`}
        </button>
        {showPendingActions && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowPendingActions(false)} />
            <div className="absolute right-0 top-11 z-20 p-3 rounded-xl bg-white shadow-2xl border border-stone-200 w-56 space-y-2">
              <p className="text-xs text-stone-600 leading-snug">
                {expired ? 'Questa guida è scaduta.' : `In attesa — scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}.`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { handleExtendPending(); setShowPendingActions(false) }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-colors"
                >
                  Proroga
                </button>
                {expired && (
                  <button
                    onClick={() => { handleArchive(); setShowPendingActions(false) }}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:border-amber-400 text-amber-800 text-xs font-semibold transition-colors"
                  >
                    Archivia
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  })() : null

  // Il badge a doppio anello del Trail Score — sotto il sottotitolo AI invece che nella fila di
  // chip sopra il titolo (vedi TopOverlay). Come il vecchio scoreBadges, compare solo per l'hike
  // davvero aperto (routeItem.id === hike.id): è l'unico per cui la Sicurezza live (safetyScore)
  // è già in memoria, quindi preferibile al fallback cachato in routeItem.safetyPreview (usato
  // invece per i thumbnail di galleria, non qui).
  const scoreGaugeBadge = (routeItem: RouteHubItem, onTap: () => void) => {
    if (!hike || routeItem.id !== hike.id) return null
    // Confine esplicito di tipologia (piano guide-eccellenza) — senza questo, un Sito/Borgo
    // cammino_urbano restava con questo badge bloccato in caricamento per sempre: useSafetyScore
    // (Fase 4) non risolve mai `safetyScore` per una tipologia non idonea, quindi scoreLoading qui
    // sotto non diventava mai false e il ramo "punteggio ≤ 0 ⇒ nascondi" non scattava mai.
    if (!metaEligibleForHikingScores(hike)) return null
    // Mirrors previewScoreValue(): if the aggregate is already cached in Supabase, show it
    // instantly like the gallery thumbnail does. Only a hike that's never had a total computed
    // needs the live loading state (waiting on Safety/CTS to settle).
    const cached = hike.cachedTsTotal
    const scoreLoading = cached == null && (ctsComputing || safetyScore == null)
    // Il Valore grezzo (per la didascalia) non è mai cachato — solo il totale finale lo è — quindi
    // va ricalcolato comunque, anche quando il totale può usare la cache: è una formula pura sui
    // dati già in memoria, nessuna chiamata di rete in più.
    const breakdown = computeTrailScoreBreakdown(
      refinedSafety,
      { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore },
    )
    const trailScoreTotal = cached ?? breakdown.total
    if (!scoreLoading && trailScoreTotal <= 0) return null
    // w-full min-w-0 text-left sul <button> sotto: senza una larghezza esplicita un <button> usa
    // shrink-to-fit, che con testo whitespace-nowrap dentro (combinedSafety può essere lungo)
    // considera come larghezza minima l'intera frase non spezzata — il bottone si allargava oltre
    // lo schermo prima ancora che l'overflow-hidden interno al badge potesse entrare in gioco.
    // I puntini sull'anello Sicurezza dicono che c'è un avviso; la pillola qui sotto è ciò che si
    // tocca per leggerlo, senza dover prima aprire la guida e cercare "Verificato online" — vedi
    // components/guida/CoverNoticesChip.tsx per il perché non siano i puntini stessi il bersaglio.
    // Fuori dal <button> del badge, non dentro: due elementi interattivi annidati sarebbero HTML
    // non valido, e al tocco vincerebbe comunque quello esterno.
    const notices = normalizeGuideNotices(hike.cachedGuideNotices)
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          onClick={() => { setPendingScrollSection('dati_sicurezza'); onTap() }}
          title="Trail Score"
          className="block w-full min-w-0 text-left"
        >
          <TrailScoreGaugeBadge
            total={scoreLoading ? null : trailScoreTotal}
            value={breakdown.value}
            safety={refinedSafety}
            personalSafety={personalSafety}
            disclaimer="popup"
            loading={scoreLoading}
            vetoed={isTrailScoreVetoed(refinedSafety)}
            notices={notices}
          />
        </button>
        <CoverNoticesChip
          notices={notices}
          onOpenVerificato={() => { setPendingScrollSection('verificato'); onTap() }}
        />
      </div>
    )
  }

  const renderSection = (section: SectionKind, item: RouteHubItem, onClose: () => void) => {
    if (!hike || item.id !== hike.id) {
      return <div className={`py-10 text-center text-sm ${textMuted}`}>Caricamento…</div>
    }

    // Same reader previously at the standalone /guida/[id]/leggi page — now also hosts (as
    // widgets embedded in the article) everything that used to live in the dati/profilo/natura/
    // poi/sicurezza tabs, folded into one scrollable magazine guide reachable by dragging the
    // closed card open like any other route instead of navigating to a separate page. The
    // weather quick-view is gone too — "Prima di partire" already has the full widget, one
    // scroll away, so there's no separate icon/section for it anymore.
    if (section === 'featured') {
      const markers = hike.difficultyMarkers ?? []

      return (
        <GuideReader
          hike={hike}
          onHikeUpdate={patch => setHike(prev => prev ? { ...prev, ...patch } : prev)}
          onRouteModeChange={handleRouteModeChange}
          enrichmentReady={enrichmentReady}
          hasAiAccess={hasAiAccess}
          aiUnavailable={aiUnavailable}
          trialExpired={trialExpired}
          scrollToSectionKey={pendingScrollSection}
          onScrollToSectionConsumed={() => setPendingScrollSection(null)}
          highlightedPoiId={highlightedPoiId}
          onPoiTap={id => setHighlightedPoiId(prev => prev === id ? null : id)}
          weather={hasGps ? { lat: centerPt.lat!, lon: centerPt.lon!, mode: hike.plannedDate ? 'planned' as const : 'forecast' as const } : undefined}
          onOpenMap3D={hasGps ? () => setShow3D(true) : undefined}
          showGradient={showGradient}
          showAspect={showAspect}
          dtmProfile={dtmProfile}
          driving={drivingWithMaps}
          scores={{
            safety: refinedSafety,
            personalSafety,
            cts: { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore, computing: ctsComputing, onCompute: handleComputeCts },
            showAspectToggle: hasGps && dtmProfile?.source === 'dtm',
            showGradientToggle: hasGps && dtmProfile?.source === 'dtm' && !!hike.trackPoints?.some(p => p.altitudeMeters !== undefined),
            showAspect, showGradient,
            onToggleAspect: () => setShowAspect(a => !a),
            onToggleGradient: () => setShowGradient(g => !g),
          }}
          safetyDetails={{ assessment: hike.assessment, hasGps, osmId: hike.osmId, polyline: hike.routePolyline, plannedId: hike.id, markers, highlightedMarkerIndex: null }}
          poiList={{ pois, poiWikiEntries, hasGps, centerLat: centerPt?.lat, centerLon: centerPt?.lon, onWikiLoaded: setWikiPages }}
          natura={{ hasGps: hasGps && !!hike.routePolyline && hike.routePolyline.length >= 2, flora: flora.data, floraLoading: flora.loading, onOpenFloraGallery: () => setShowFloraGallery(true), onOpenAnimalGallery: () => setShowAnimalGallery(true) }}
        />
      )
    }

    // strumenti
    return (
      <div className="px-4 py-4 space-y-1">
        {/* Nessuna condizione sul testo della guida: il documento vale anche come scheda dati del
            percorso (copertina, mappa, statistiche, valutazione personalizzata, indice dei luoghi),
            che è ciò che il PDF jsPDF ritirato in Fase 4 produceva senza chiedere nulla all'AI.
            Le sezioni narrative mancanti vengono semplicemente saltate (GuideTemplate.tsx). */}
        <button
          onClick={handleExportGuidePdf}
          disabled={exportingGuidePdf}
          className={`w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left text-sm font-medium disabled:opacity-40 disabled:hover:bg-transparent ${textPrimary}`}
        >
          {exportingGuidePdf ? <Loader2 className="w-4 h-4 text-stone-400/60 animate-spin" /> : <Download className="w-4 h-4 text-stone-400/60" />}
          {exportingGuidePdf ? 'Genero PDF…' : 'Esporta PDF'}
        </button>
        {guidePdfError && <p className="px-2 pb-1 text-xs text-red-500">{guidePdfError}</p>}
        <button
          onClick={() => exportPlannedHikeToGpx(hike)}
          disabled={!hike.trackPoints?.length && !hike.routePolyline?.length}
          className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Download className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Esporta GPX</span>
        </button>
        <button onClick={() => { onClose(); setShowStreetView(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
          <Images className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Foto zona (street view)</span>
        </button>
        <div>
          {editTitle ? (
            <div className="px-2 py-2 space-y-2">
              <input autoFocus value={titleVal} onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleVal(hike.title); setEditTitle(false) } }}
                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-white outline-none focus:border-sky-500" />
              <div className="flex gap-2">
                <button onClick={saveTitle} disabled={saving || !titleVal.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-400 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                </button>
                <button onClick={() => { setTitleVal(hike.title); setEditTitle(false) }} className={`px-3 py-1.5 text-sm transition-colors ${textMuted}`}>Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setTitleVal(hike.title); setEditTitle(true) }} className="w-full flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-stone-100 transition-colors text-left">
              <Pencil className="w-4 h-4 text-stone-400/60" /> <span className={`text-sm font-medium ${textPrimary}`}>Rinomina percorso</span>
            </button>
          )}
        </div>
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

  const primaryAction = (routeItem: RouteHubItem): PrimaryAction | null => {
    // Per l'hike davvero aperto (unico per cui hike.routePolyline/borgoWalkPolyline sono già in
    // memoria, stesso motivo di scoreGaugeBadge sopra) niente bottone "Naviga" quando non c'è
    // proprio nulla da seguire — un Sito, o un Borgo/Città cammino_urbano il cui itinerario a
    // piedi non è (ancora) arrivato — invece di portare a un vicolo cieco
    // ("Impossibile avviare la navigazione: percorso non disponibile offline", app/guida/[id]/
    // naviga/page.tsx). Per ogni altra scheda della galleria resta mostrato: non c'è ancora modo
    // di sapere qui se avrà un itinerario senza caricarne il record intero, e il tocco stesso
    // porta comunque a quella pagina, che verifica di nuovo con i dati freschi.
    if (routeItem.id === hike?.id && !hike.routePolyline?.length && !hike.borgoWalkPolyline?.length) return null
    return {
      label: 'Naviga',
      icon: Navigation,
      // Prova prima l'app nativa Navigator (se il device può averla), altrimenti ricade sulla
      // stessa pagina di navigazione via web che serviva già da sola (lib/navigatorHandoff.ts).
      onClick: () => tryOpenNavigatorApp(router, `/guida/${encodeURIComponent(routeItem.id)}/naviga`),
      variant: 'terra',
    }
  }

  const currentItem = displayItems.find(i => i.id === currentId) ?? displayItems[0]
  const initialIndex = Math.max(0, displayItems.findIndex(i => i.id === currentItem.id))

  return (
    <>
      {deletedToastNode}
      <RouteHub
        mode="guida"
        items={displayItems}
        initialIndex={initialIndex}
        favoritesFilter={favoritesFilter}
        nextOutingFilter={nextOutingFilter}
        onToggleNextOutingFilter={() => setNextOutingFilter(v => !v)}
        onToggleFavoritesFilter={() => setFavoritesFilter(v => {
          // Uscendo dai preferiti si esce anche dalla loro sottosezione: "Prossima uscita" da sola
          // non avrebbe un insieme da restringere, e riaccendendo la stella si ritroverebbe attiva
          // una vista che l'utente non ha chiesto.
          if (v) setNextOutingFilter(false)
          return !v
        })}
        onToggleFavorite={handleToggleFavorite}
        onCompare={(routeItem) => router.push(`/statistiche?tab=confronta&pre=${encodeURIComponent(`p:${routeItem.id}`)}`)}
        onIndexChange={(item) => {
          setCurrentId(item.id)
          // Plain History API, not router.replace: `/guida` and `/guida/[id]` are different
          // page components, so a Next.js navigation between them unmounts/remounts this whole
          // hub (re-running every data-loading effect) and produces a visible double-render —
          // this is a purely cosmetic address-bar sync, so it doesn't need a real navigation.
          window.history.replaceState(null, '', `/guida/${encodeURIComponent(item.id)}`)
        }}
        bodyMode="continuous"
        renderSection={renderSection}
        primaryAction={primaryAction}
        scoreGaugeBadge={scoreGaugeBadge}
        scoreBadgesTargetSection="featured"
        summaryBanner={(routeItem) => hike && routeItem.id === hike.id ? hike.assessment?.summary : undefined}
        // "Consiglio" (Trail Score + Sicurezza in un'unica frase) sostituisce il vecchio
        // sottotitolo scritto una tantum dall'AI in generazione — quel testo non si aggiornava mai
        // quando lo storico o i punteggi cambiavano, e poteva finire in contraddizione con i
        // punteggi reali mostrati subito sopra. Nessun sottotitolo finché Sicurezza non è pronta,
        // invece di mostrare un giudizio provvisorio che poi cambia sotto gli occhi dell'utente.
        subtitle={(routeItem) => {
          if (!hike || routeItem.id !== hike.id || !personalSafety) return undefined
          const breakdown = computeTrailScoreBreakdown(
            refinedSafety,
            { result: ctsResult, cached: hike.cachedTrailScore, beautyScore: hike.cachedBeautyScore },
          )
          const trailScoreTotal = hike.cachedTsTotal ?? breakdown.total
          if (trailScoreTotal <= 0) return undefined
          return verdictPhrase(trailScoreTotal, personalSafety).label
        }}
        topOverlayVariant="magazine"
        headerActions={<>{pendingChip}{dateChip}</>}
        importLabel="Crea guida"
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
