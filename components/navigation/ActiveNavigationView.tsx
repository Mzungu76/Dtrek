'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { AlertTriangle, BatteryWarning, ArrowUp, Download, CheckCircle2, Radio, Locate, Signpost } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import type { PlannedHike } from '@/lib/plannedStore'
import { updatePlannedMeta } from '@/lib/plannedStore'
import type { HikeNote } from '@/lib/blobStore'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { NavigationEngine } from '@/lib/navigation/navigationEngine'
import { detectRouteMoments } from '@/lib/navigation/routeMoments'
import { buildElevationProfile, remainingElevation } from '@/lib/navigation/elevationProfile'
import type { PaceUpdateResult } from '@/lib/navigation/paceAssistant'
import { altitudeTerrainMultiplier } from '@/lib/trailScore'
import { daylightMarginMinutes } from '@/lib/daylight'
import { requestOrientationPermission, isOrientationSupported, needsOrientationPermissionGesture } from '@/lib/navigation/orientation'
import { haversineM, bearingDeg } from '@/lib/geoUtils'
import { extractCuriosita } from '@/lib/guideText'
import type { TrackPoint, TcxActivity } from '@/lib/tcxParser'
import { buildActivityFromTrack } from '@/lib/navigation/trackToActivity'
import { saveActivityWithEnrichment } from '@/lib/activitySave'
import {
  loadNavigationSession, saveNavigationSession, newSessionSnapshot,
  queueTrackFix, drainTrackQueue, requeueTrackFixes, type NavigationSessionSnapshot,
  appendRecordedTrackPoint, loadRecordedTrack, clearRecordedTrack,
  loadParkingSpot, saveParkingSpot, clearParkingSpot, type ParkingSpot,
} from '@/lib/navigation/navigationStore'
import { usePoiNotes } from './usePoiNotes'
import { loadManifest, isManifestValid } from '@/lib/offline/packageManifest'
import { retryFieldNotePhotos } from '@/lib/offline/retryFieldNotePhotos'
import { retryFieldNotePhotoIfOnline } from '@/lib/offline/retryFieldNotePhotoIfOnline'
import { checkOfflineReadiness } from '@/lib/offline/offlineReadiness'
import { verifyOfflinePackageChecksum } from '@/lib/offline/packageManager'
import { ensureTrailGraph, loadTrailGraph } from '@/lib/navigation/trailGraphStore'
import type { WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import { computeEscapeOptions, type EscapeOption } from '@/lib/navigation/escapeEngine'
import { matchToTrailGraph, type MapMatchResult } from '@/lib/navigation/mapMatcher'
import EscapeOptionsSheet from './EscapeOptionsSheet'
import OfflinePackageDownloader from './OfflinePackageDownloader'
import LiveShareToggle from './LiveShareToggle'
import GroupModeSection from './GroupModeSection'
import { publishLivePosition } from '@/lib/navigation/liveLocationPublish'
import { LIVE_STALE_MS } from '@/lib/navigation/liveShareStatus'
import SosButton from './SosButton'
import GiuliaLiveQa from './GiuliaLiveQa'
import TrailConfidenceBadge from './TrailConfidenceBadge'
import { useTrailConfidence } from './useTrailConfidence'
import { watchBattery, watchBatteryLevel } from '@/lib/navigation/battery'
import { LocationModeDecider } from '@/lib/navigation/locationModeDecider'
import { haptics } from '@/lib/navigation/haptics'
import type { NavInstruction, NavPoi, NavState, RouteMoment, RouteProgress } from '@/lib/navigation/types'
import type { WildlifeRisk } from '@/lib/safetyScore'
import NavigationMap from './NavigationMap'
import NavigationMapLibre from './NavigationMapLibre'
import MapModeSwitcher, { type MapMode } from './MapModeSwitcher'
import PoiCalloutSheet from './PoiCalloutSheet'
import FieldNoteSheet from './FieldNoteSheet'
import SpeciesIdentifySheet from './SpeciesIdentifySheet'
import { PoiSpatialIndex } from '@/lib/navigation/poiProximity'
import { EPOCH_LABELS, type Epoch, type EpochPoi } from '@/lib/epochPois'
import InstructionBanner from './InstructionBanner'
import NavBottomStrip from './NavBottomStrip'
import NavStatsSheet from './NavStatsSheet'
import NavLayerRail from './NavLayerRail'
import ParkingSpotControl from './ParkingSpotControl'
import { buildSlopeSegments } from '@/lib/navigation/routeSlopeSegments'
import { readHighContrastPref, writeHighContrastPref } from '@/lib/navigation/highContrastPref'
import ConfirmEndDialog from './ConfirmEndDialog'
import EndHikeReviewDialog from './EndHikeReviewDialog'
import { speak } from '@/lib/navigation/speech'
import { useNearbyTrails } from './useNearbyTrails'
import { useNatura2000Overlay } from './useNatura2000Overlay'
import { useWeatherRefresh } from './useWeatherRefresh'
import { useSunTimes } from './useSunTimes'

interface Props {
  hike: PlannedHike
  /**
   * Dev/testing hook (lib/navigation/simulation/): when set, the engine's
   * GPS source is a scripted replay instead of the real device — see
   * app/guida/[id]/naviga/page.tsx's `?simulate=` query param. Never set
   * in normal use, so this stays entirely inert in production.
   */
  locationProviderFactory?: import('@/lib/native/locationSource').LocationProviderFactory
  /** Label shown in a persistent "SIMULAZIONE" banner whenever locationProviderFactory is set — the position on screen is never allowed to look like a real fix when it isn't one. */
  simulationLabel?: string
}

const FIX_STALE_MS = 20000 // if no fix arrives for this long, "moving time" stops accruing

export default function ActiveNavigationView({ hike, locationProviderFactory, simulationLabel }: Props) {
  const router = useRouter()
  // Questo componente serve sia Dtrek (web) sia la navigazione GPS nativa di Navigator, stessa
  // route condivisa /guida/[id]/naviga (lib/navigatorAllowedPaths.ts). A fine escursione, senza
  // questo controllo, andrebbe sempre verso /guida/{id} o /resoconto/{id} — schermate Dtrek che
  // Navigator non deve MAI mostrare al proprio interno, attivato o no (due icone distinte e
  // complementari, non una che "diventa" l'altra — docs/navigator-dtrek-boundary.md).
  // NavigatorRouteGuard.tsx le bloccherebbe comunque, ma solo DOPO che sono state renderizzate per
  // un frame (il lampo "si apre e si richiude subito" segnalato dall'utente) — meglio scegliere la
  // destinazione giusta qui, alla fonte.
  const isNativeApp = Capacitor.isNativePlatform()
  const engineRef = useRef<NavigationEngine | null>(null)
  const sessionRef = useRef<NavigationSessionSnapshot | null>(null)
  const remoteSessionId = useRef<string | null>(null)
  // Mirror in state di remoteSessionId.current — il ref da solo non fa ri-renderizzare
  // LiveShareToggle quando la sessione remota diventa disponibile (fetch fire-and-forget più
  // sotto), il toggle deve poterlo riflettere se l'utente apre il foglio prima che risolva.
  const [remoteSessionIdState, setRemoteSessionIdState] = useState<string | null>(null)
  const pendingEvents = useRef<{ type: string; payload?: Record<string, unknown>; createdAt: string }[]>([])
  const speechEnabledRef = useRef(true)
  const timerRunningRef = useRef(false)
  const lastFixAtRef = useRef<number | null>(null)
  const endConfirmedRef = useRef(false)
  // Raw fixes recorded while the timer is running (paused stretches are
  // excluded, same gate as the displayed distance/time stats) — the source
  // for the optional "save as a completed activity" step when navigation ends.
  const recordedTrackRef = useRef<TrackPoint[]>([])
  // Full RouteProgress (nearest point, distance, expected bearing) from the latest fix — kept in a
  // ref rather than state because it's only needed on-demand (Escape Engine snapshot), not for
  // rendering; `progress` state below stays the reduced shape the rest of the UI actually uses.
  const fullProgressRef = useRef<RouteProgress | null>(null)
  // Persisted trail graph for this hike (lib/navigation/trailGraphStore.ts), kept in memory once
  // loaded so Map Matching (below) and the Escape Engine sheet don't each re-read IndexedDB.
  const trailNetworkRef = useRef<WalkNetwork | null>(null)
  // Mirrors `state` for the positionUpdated closure below, which is only ever (re)created once
  // per hike.id — see the effect's dependency array — so it can't read the state variable itself
  // without capturing its value at mount time. Same pattern as timerRunningRef/speechEnabledRef.
  const stateRef = useRef<NavState>('idle')
  // Battery-aware automatic mode switching (Fase 8, lib/navigation/locationModeDecider.ts) — all
  // three refs feed decideLocationMode() on every fix without forcing a re-render for values the
  // UI itself doesn't display.
  const modeDeciderRef = useRef<LocationModeDecider | null>(null)
  const batteryStateRef = useRef<{ level: number | null; charging: boolean }>({ level: null, charging: true })
  const nextInstructionDistanceRef = useRef<number | null>(null)

  const [state, setState] = useState<NavState>('idle')
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ distanceAlongRouteM: number; totalRouteM: number } | null>(null)
  const [escapeSheetOpen, setEscapeSheetOpen] = useState(false)
  const [escapeLoading, setEscapeLoading] = useState(false)
  const [escapeOptions, setEscapeOptions] = useState<EscapeOption[] | null>(null)
  const [traveledDistanceM, setTraveledDistanceM] = useState(0)
  const [currentSpeedMs, setCurrentSpeedMs] = useState<number | null>(null)
  const [movingTimeMs, setMovingTimeMs] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [showConfirmEnd, setShowConfirmEnd] = useState(false)
  const [mapFallbackNotice, setMapFallbackNotice] = useState(false)
  const [instruction, setInstruction] = useState<{ current: NavInstruction; next: NavInstruction | null; distanceToNextM: number | null } | null>(null)
  const [callout, setCallout] = useState<{ title: string; extract?: string; imageUrl?: string } | null>(null)
  const [compassEnabled, setCompassEnabled] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  // Schermo acceso durante la navigazione — di default attivo (senza, il browser/OS può
  // spegnere lo schermo per timeout mentre si cammina, portandosi via l'unico canale visivo
  // di mappa/istruzioni finché l'utente non lo riaccende a mano). Disattivabile da chi
  // preferisce risparmiare batteria e affidarsi solo agli avvisi vocali/aptici.
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true)
  // DTREK-AUDIT.md P1 #20 — inizializzato a false qui (SSR-safe, useState non può leggere
  // localStorage al primo render) e allineato alla preferenza salvata subito dopo il mount, sotto.
  const [highContrastEnabled, setHighContrastEnabled] = useState(false)
  useEffect(() => { setHighContrastEnabled(readHighContrastPref()) }, [])
  const [isOnline, setIsOnline] = useState(true)
  const [mapMode, setMapMode] = useState<MapMode>('offline')
  const [is3D, setIs3D] = useState(false)
  const [pendingActivity, setPendingActivity] = useState<TcxActivity | null>(null)
  const [saveOfflineNotice, setSaveOfflineNotice] = useState(false)
  const [gpsLostPermissionDenied, setGpsLostPermissionDenied] = useState(false)
  const [offRouteBearingDeg, setOffRouteBearingDeg] = useState<number | null>(null)
  const [mapMatch, setMapMatch] = useState<MapMatchResult | null>(null)
  const [lowBatteryNotice, setLowBatteryNotice] = useState(false)
  const [offlinePackageWarning, setOfflinePackageWarning] = useState(false)
  const [offlineDegradedMissing, setOfflineDegradedMissing] = useState<string[]>([])
  const [offlineReady, setOfflineReady] = useState(false)
  const [showOfflineSheet, setShowOfflineSheet] = useState(false)
  const [showLiveShareSheet, setShowLiveShareSheet] = useState(false)
  const [liveSharingEnabled, setLiveSharingEnabled] = useState(false)
  const [liveShareToken, setLiveShareToken] = useState<string | null>(null)
  // DTREK-AUDIT.md P0 #8 — l'escursionista stesso deve poter sapere se il proprio "battito" di
  // posizione live smette di arrivare al server (oggi falliva in silenzio totale, senza che
  // nessuno se ne accorgesse finché un contatto non controllava a mano il link pubblico).
  const [liveShareSelfStale, setLiveShareSelfStale] = useState(false)
  const lastLivePublishSuccessRef = useRef<number | null>(null)
  const [showNatura2000, setShowNatura2000] = useState(false)
  const [wildlifeAlertDismissed, setWildlifeAlertDismissed] = useState(false)
  const [weatherLookaheadDismissed, setWeatherLookaheadDismissed] = useState(false)
  const [pace, setPace] = useState<PaceUpdateResult | null>(null)
  const [turnBackDismissed, setTurnBackDismissed] = useState(false)
  // Fino a 3 avvisi "bottom" (off-route/gps-lost, batteria scarica, rientro per
  // il buio) potevano impilarsi contemporaneamente con offset manuali a pixel
  // fissi. Ora si mostra solo il più critico, con gli altri dietro un
  // "+N altri avvisi" — nessun avviso è stato rimosso, solo riordinato per
  // priorità. Piano di ristrutturazione, Parte 2.8.
  const [bottomAlertsExpanded, setBottomAlertsExpanded] = useState(false)
  const turnBackAlertedRef = useRef(false)
  const [showFieldNote, setShowFieldNote] = useState(false)
  // Soluzione B (piano di restyling Navigator): sentieri vicini e POI accesi di default — stesso
  // aspetto di sempre finché non si tocca la rotaia — Pendenze spenta di default, è una lettura
  // in più da attivare quando serve, non il modo consueto di vedere il percorso. Il percorso
  // pianificato principale NON è tra questi toggle — resta sempre visibile, è la traccia da
  // seguire, non un layer opzionale.
  const [showNearbyTrails, setShowNearbyTrails] = useState(true)
  const [showPoiLayer, setShowPoiLayer] = useState(true)
  const [showSlopeLayer, setShowSlopeLayer] = useState(false)
  // Il pulsante "centra sulla mia posizione" vive qui ora (raggruppato con NavLayerRail), non più
  // dentro NavigationMap/NavigationMapLibre — quei due espongono solo recenter() via ref e
  // segnalano i cambi di follow-mode, così non c'è più un controllo indipendente a metà schermo
  // che si contende il centro con le rotaie qui sotto.
  const mapHandleRef = useRef<{ recenter: () => void } | null>(null)
  const [mapFollowMode, setMapFollowMode] = useState(true)
  // Sostituisce gli stati collassato/metà/pieno del vecchio NavBottomSheet: o la striscia sottile
  // (mappa protagonista) o il pannello dettagli a schermo intero, niente via di mezzo.
  const [showStatsSheet, setShowStatsSheet] = useState(false)
  // Punto in cui è rimasta l'auto — vedi lib/navigation/navigationStore.ts. Ricaricato all'apertura
  // così sopravvive a un refresh (o a un crash) a metà escursione, che è proprio il momento in cui
  // servirebbe di più.
  const [parkingSpot, setParkingSpot] = useState<ParkingSpot | null>(null)
  // Live-editable copy of the hike's notes: appended to as the hiker saves field notes during
  // navigation, persisted immediately (updatePlannedMeta) so nothing is lost if the app closes,
  // and read from here (not the stale hike.hikeNotes prop) when the recorded activity is saved.
  const [hikeNotes, setHikeNotes] = useState<HikeNote[]>(hike.hikeNotes ?? [])
  const hikeNotesRef = useRef(hikeNotes)
  useEffect(() => { hikeNotesRef.current = hikeNotes }, [hikeNotes])
  const [showSpeciesIdentify, setShowSpeciesIdentify] = useState(false)
  const [fieldNoteAutoCamera, setFieldNoteAutoCamera] = useState(false)

  // Already computed and cached pre-trip (region table + real GBIF occurrences + guardian-dog
  // OSM heuristic merged in lib/safetyScore.ts's getWildlifeRisks) — an area-wide, season/region
  // signal, not a point sighting feed, so this surfaces once per hike rather than as a
  // GPS-proximity trigger like POI callouts. Only shown when there's an actual elevated risk.
  const relevantWildlifeRisks = useMemo<WildlifeRisk[]>(() => {
    return (hike.cachedSafetyScore?.wildlifeRisks ?? []).filter((w) => w.dangerLevel === 'alto' || w.dangerLevel === 'moderato')
  }, [hike.cachedSafetyScore])

  const pois = useMemo<NavPoi[]>(() => {
    const raw = (hike.cachedPois ?? []) as PoiItem[]
    return raw.filter((p) => p.lat != null && p.lon != null).map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, name: p.name, type: p.type }))
  }, [hike.cachedPois])

  const poiWikiById = useMemo(() => {
    const map = new Map<string | number, WikiPage>()
    const raw = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
    for (const entry of raw) if (entry?.poi?.id != null) map.set(entry.poi.id, entry.wiki)
    return map
  }, [hike.cachedPoiWiki])

  // Prerequisito di attivazione della Guida IA (decisione 2, artifact "La Guida IA"): la narrazione
  // arricchita esiste per QUESTO percorso solo se la sua guida ha già generato la sezione "I luoghi
  // da non perdere" — un interruttore unico per percorso, non selettivo per singolo POI. Un utente
  // che non ha mai generato quella sezione non vede/sente nulla di diverso da oggi (solo l'estratto
  // Wikipedia già esistente), anche se lo stesso POI ha già una nota cachata da un altro sentiero.
  const hasLuoghiGuide = (hike.cachedGuide ?? '').includes('I luoghi da non perdere')
  const poiNotesById = usePoiNotes(hike.id, pois.map((p) => p.id), hasLuoghiGuide)

  const moments = useMemo<RouteMoment[]>(() => detectRouteMoments(hike.trackPoints ?? []), [hike.trackPoints])
  const elevationProfile = useMemo(() => buildElevationProfile(hike.trackPoints ?? []), [hike.trackPoints])
  // Layer Pendenze (NavLayerRail) — null quando il percorso non ha abbastanza dati di quota,
  // il che spegne automaticamente il layer anche se l'interruttore resta acceso (vedi il rail più sotto).
  const slopeSegments = useMemo(() => buildSlopeSegments(hike.trackPoints ?? []), [hike.trackPoints])
  // sacScale/surfaces/avgSlopeDeg aren't available on PlannedHike at navigation time (only
  // computed at trail-detail time) — only the altitude-physiology term applies live, terrain
  // multiplier defaults to 1 until those fields are cached onto the hike object too.
  const terrainMultiplier = useMemo(() => altitudeTerrainMultiplier(hike.altitudeMax).altPhysioMult, [hike.altitudeMax])
  const routePolyline = hike.routePolyline ?? []

  // Stratigrafia temporale: "oggi" means no historical overlay (normal navigation), the
  // slider only ever offers epochs this specific hike actually has content for — never a
  // fixed etrusca/romana/medievale set regardless of what was generated for the guide.
  const epochPois = useMemo<EpochPoi[]>(() => hike.cachedEpochPois ?? [], [hike.cachedEpochPois])
  const availableEpochs = useMemo<Epoch[]>(() => {
    const historical = (['etrusca', 'romana', 'medievale'] as const).filter((e) => epochPois.some((p) => p.epoch === e))
    return historical.length > 0 ? [...historical, 'oggi'] : []
  }, [epochPois])
  const [selectedEpoch, setSelectedEpoch] = useState<Epoch>('oggi')
  const filteredEpochPois = useMemo(() => epochPois.filter((p) => p.epoch === selectedEpoch), [epochPois, selectedEpoch])
  const epochPoiIndex = useMemo(
    () => new PoiSpatialIndex(filteredEpochPois.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, notifyRadiusM: 60 }))),
    [filteredEpochPois],
  )
  const shownEpochPoiIdsRef = useRef<Set<string>>(new Set())
  const [activeEpochCallout, setActiveEpochCallout] = useState<EpochPoi | null>(null)
  const guideExcerpts = useMemo(() => extractCuriosita(hike.cachedGuide ?? ''), [hike.cachedGuide])

  const nearbyTrails = useNearbyTrails(hike.id, routePolyline)
  const natura2000Features = useNatura2000Overlay(hike.id, routePolyline)

  useEffect(() => {
    let cancelled = false
    loadParkingSpot(hike.id).then(spot => { if (!cancelled) setParkingSpot(spot) }).catch(() => {})
    return () => { cancelled = true }
  }, [hike.id])

  const handleSaveParking = () => {
    if (!position) return
    const spot: ParkingSpot = { lat: position.lat, lon: position.lon, savedAt: Date.now() }
    setParkingSpot(spot)
    saveParkingSpot(hike.id, spot).catch(() => {})
    logEvent('parking_saved', { lat: spot.lat, lon: spot.lon })
    haptics.success()
  }

  const handleClearParking = () => {
    setParkingSpot(null)
    clearParkingSpot(hike.id).catch(() => {})
  }

  /** Tapping a POI marker directly on the map — same info, same sheet, as walking up to it and
   *  triggering the engine's own 'enteredPoi' event (see that handler below): a hiker shouldn't
   *  have to wait to get close just to find out what something is. No haptics/speech here, unlike
   *  the proximity trigger — this is a deliberate look-up, not an alert. */
  const handlePoiTap = (poiId: string | number) => {
    const poi = pois.find((p) => p.id === poiId)
    if (!poi) return
    const wiki = poiWikiById.get(poiId)
    const note = poiNotesById.get(Number(poiId))
    setCallout({ title: poi.name ?? 'Punto di interesse', extract: note ?? wiki?.extract, imageUrl: wiki?.thumbnail })
  }

  const parkingDistanceM = parkingSpot && position
    ? haversineM(position.lat, position.lon, parkingSpot.lat, parkingSpot.lon)
    : null
  const parkingBearingDeg = parkingSpot && position
    ? bearingDeg(position.lat, position.lon, parkingSpot.lat, parkingSpot.lon)
    : null

  const positionRef = useRef(position)
  positionRef.current = position
  const accuracyMRef = useRef(accuracyM)
  accuracyMRef.current = accuracyM
  // Stessa ragione di positionRef: il loop di pubblicazione posizione live vive dentro
  // l'effect di setup a mount unico più sotto (insieme a flushInterval/movingTimeInterval), una
  // chiusura diretta su liveSharingEnabled resterebbe congelata al valore di al momento del mount.
  const liveSharingEnabledRef = useRef(liveSharingEnabled)
  liveSharingEnabledRef.current = liveSharingEnabled

  // engine.on('enteredPoi', ...) below is registered once inside the big setup effect (deps:
  // [hike.id] only) — closing over poiNotesById directly would freeze it at whatever it was
  // (typically still empty, the fetch in usePoiNotes hasn't resolved yet) for the rest of the
  // session. A ref sidesteps that the same way positionRef/speechEnabledRef already do here.
  const poiNotesByIdRef = useRef(poiNotesById)
  poiNotesByIdRef.current = poiNotesById

  // Fase 11 di docs/navigator-orizzonti-roadmap.md — stesso motivo di positionRef: il refresh
  // meteo dentro useWeatherRefresh vive in un effect a mount unico, una chiusura diretta su
  // `pace` resterebbe congelata al valore del mount.
  const paceEtaRef = useRef<Date | null>(null)
  paceEtaRef.current = pace?.liveEtaDate ?? null

  const weatherLookahead = useWeatherRefresh(hike.id, routePolyline, positionRef, engineRef, paceEtaRef)
  // DTREK-AUDIT.md P1 #17 — cachedTrailScore (Comfort TrailScore personale, non gated) invece di
  // cachedTsTotal (già gated dalla Sicurezza): il gate viene applicato di nuovo, separatamente,
  // dentro computeTrailConfidence via safetyScore — così il fattore mostrato all'utente sa
  // distinguere "non ti si addice" da "non è sicuro" invece di un unico numero già mescolato.
  const { confidence: trailConfidence, closure: trailClosure } = useTrailConfidence(hike.id, routePolyline, hike.cachedTrailScore ?? null, hike.cachedSafetyScore?.overall ?? null)
  // Un nuovo avviso (testo diverso, es. l'ETA si sposta e ora indica pioggia invece di vento)
  // non deve restare nascosto solo perché un avviso precedente era stato chiuso.
  useEffect(() => { setWeatherLookaheadDismissed(false) }, [weatherLookahead?.message])
  const sunTimes = useSunTimes(hike.id, routePolyline, positionRef)

  const remainingPois = useMemo(() => {
    if (!position) return pois.map((p) => ({ id: p.id, name: p.name, distanceM: 0 }))
    return pois
      .map((p) => ({ id: p.id, name: p.name, distanceM: haversineM(position.lat, position.lon, p.lat, p.lon) }))
      .sort((a, b) => a.distanceM - b.distanceM)
  }, [pois, position])

  const logEvent = (type: string, payload?: Record<string, unknown>) => {
    pendingEvents.current.push({ type, payload, createdAt: new Date().toISOString() })
  }

  // priority di default 'normal' (si accoda) — solo chi passa esplicitamente 'critical'
  // interrompe un avviso in corso (Fase 6 di docs/navigator-orizzonti-roadmap.md).
  const speakIfEnabled = (text: string, priority: 'critical' | 'normal' = 'normal') => {
    if (speechEnabledRef.current) speak(text, { priority })
  }

  const flushToServer = async () => {
    if (!remoteSessionId.current) return
    const track = await drainTrackQueue(sessionRef.current!.sessionId)
    const events = pendingEvents.current.splice(0, pendingEvents.current.length)
    if (!track.length && !events.length) return
    try {
      const res = await fetch('/api/navigation/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, events, track }),
      })
      // A non-throwing non-OK response (401 expired session, 500, 413 batch
      // too large...) used to be treated as delivered and the batch was
      // dropped for good — only a fetch() that itself threw got requeued.
      // Put both events and track fixes back so the next flush retries them.
      if (!res.ok) {
        pendingEvents.current.unshift(...events)
        await requeueTrackFixes(sessionRef.current!.sessionId, track)
      }
    } catch {
      // best-effort: keep the events for the next flush attempt if the request itself throws before sending
      pendingEvents.current.unshift(...events)
      await requeueTrackFixes(sessionRef.current!.sessionId, track)
    }
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const restored = await loadNavigationSession(hike.id)
      const snapshot = restored ?? newSessionSnapshot(hike.id, crypto.randomUUID())
      sessionRef.current = snapshot

      // Restore any recorded points from a previous run that crashed/was
      // killed before confirmEnd() got to run — otherwise a tab crash right
      // before the end-of-hike review step silently loses the chance to
      // save the completed activity, even though the raw fixes made it into
      // the offline sync queue.
      recordedTrackRef.current = await loadRecordedTrack(hike.id)

      fetch('/api/navigation/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedHikeId: hike.id }),
      }).then((r) => r.ok ? r.json() : null).then((data) => {
        if (data?.sessionId) { remoteSessionId.current = data.sessionId; setRemoteSessionIdState(data.sessionId) }
      }).catch(() => {})

      // Fire-and-forget: makes the walkable trail graph around this route available for later
      // Map Matching/Escape Engine work (see lib/navigation/trailGraphStore.ts) even when the
      // hiker never explicitly downloaded an offline package. No-ops if already cached from a
      // previous navigation start or from that offline download; failure (Overpass slow/down) is
      // silently ignored — today's navigation already works with just the planned route.
      if (routePolyline.length > 1) {
        ensureTrailGraph(hike.id, routePolyline)
          .then((result) => { if (!cancelled && result) trailNetworkRef.current = result.network })
          .catch(() => {})
      }

      const engine = new NavigationEngine({ routePolyline, pois, moments, elevationProfile, terrainMultiplier, locationProviderFactory })
      engineRef.current = engine
      modeDeciderRef.current = new LocationModeDecider('trekking')

      engine.on('stateChanged', ({ to }) => { if (!cancelled) { setState(to); stateRef.current = to } })
      engine.on('paceUpdated', (result) => { if (!cancelled) setPace(result) })
      engine.on('positionUpdated', ({ raw, smoothed, progress, traveledDistanceM, instantSpeedMs }) => {
        if (cancelled) return
        lastFixAtRef.current = Date.now()
        setPosition({ lat: smoothed.lat, lon: smoothed.lon })
        setAccuracyM(raw.accuracyM ?? null)
        fullProgressRef.current = progress
        // Map Matching (Fase 4, lib/navigation/mapMatcher.ts) only has anything to add once
        // already recognized as off the planned route — while on-route this would just scan the
        // graph to confirm what's already known, so it's skipped entirely the rest of the time,
        // same economy principle as the Escape Engine's on-demand-only search.
        if (stateRef.current === 'off_route' || stateRef.current === 'wrong_direction') {
          setMapMatch(matchToTrailGraph({
            network: trailNetworkRef.current,
            lat: smoothed.lat,
            lon: smoothed.lon,
            distanceToRouteM: progress.distanceToRouteM,
          }))
        } else {
          // React bails out of the re-render when the value is unchanged (Object.is), so this is
          // a no-op most of the time — only clears the banner detail right after coming back on-route.
          setMapMatch(null)
        }
        // Position keeps updating even while the stats timer is paused (the
        // hiker still wants to see themselves on the map) — only the
        // recorded distance/speed stats freeze.
        if (timerRunningRef.current) {
          setProgress({ distanceAlongRouteM: progress.distanceAlongRouteM, totalRouteM: progress.totalRouteM })
          setTraveledDistanceM(traveledDistanceM)
          setCurrentSpeedMs(instantSpeedMs)
          const point: TrackPoint = {
            time: new Date(raw.ts).toISOString(),
            lat: raw.lat,
            lon: raw.lon,
            altitudeMeters: raw.altitudeM ?? undefined,
            speedMs: raw.speedMs ?? undefined,
          }
          recordedTrackRef.current.push(point)
          appendRecordedTrackPoint(hike.id, point).catch(() => {})
        }
        queueTrackFix(snapshot.sessionId, { ts: raw.ts, lat: raw.lat, lon: raw.lon, altitudeM: raw.altitudeM, speedMs: raw.speedMs, accuracyM: raw.accuracyM })

        // Battery-aware automatic mode switching (Fase 8) — re-evaluated on every fix, but
        // LocationModeDecider itself only actually returns a new mode once it should really
        // change (dwell-time hysteresis), so this rarely results in an actual setMode() call.
        const decidedMode = modeDeciderRef.current?.update({
          state: stateRef.current,
          instantSpeedMs,
          accuracyM: raw.accuracyM ?? null,
          distanceToNextInstructionM: nextInstructionDistanceRef.current,
          batteryLevel: batteryStateRef.current.level,
          batteryCharging: batteryStateRef.current.charging,
        }, Date.now())
        if (decidedMode) engineRef.current?.setLocationMode(decidedMode)
      })
      engine.on('bearingUpdated', ({ bearingDeg }) => { if (!cancelled) setBearing(bearingDeg) })
      // Smooth, high-frequency position for the map marker only (see renderTick's doc comment in
      // lib/navigation/types.ts) — 'positionUpdated' above stays the source of truth for stats/
      // route-deviation/recording, tied to real GPS fixes; this just keeps the dot gliding between them.
      engine.on('renderTick', ({ lat, lon, accuracyM }) => {
        if (cancelled) return
        setPosition({ lat, lon })
        setAccuracyM(accuracyM)
      })
      engine.on('instructionUpdated', (payload) => {
        nextInstructionDistanceRef.current = payload.distanceToNextM
        if (!cancelled) setInstruction(payload)
      })
      engine.on('enteredPoi', ({ poi }) => {
        if (cancelled) return
        logEvent('poi_reached', { poiId: poi.id })
        const wiki = poiWikiById.get(poi.id)
        const note = poiNotesByIdRef.current.get(Number(poi.id))
        const extract = note ?? wiki?.extract
        setCallout({ title: poi.name ?? 'Punto di interesse', extract, imageUrl: wiki?.thumbnail })
        speakIfEnabled(`${poi.name ?? 'Sei vicino a un punto di interesse'}. ${extract ?? ''}`.trim())
        haptics.notify()
      })
      engine.on('momentReached', ({ moment }) => {
        if (cancelled) return
        logEvent('moment_reached', { momentId: moment.id, kind: moment.kind })
        setCallout({ title: 'Giulia', extract: moment.text })
        speakIfEnabled(moment.text)
        haptics.notify()
      })
      engine.on('offRoute', ({ distanceToRouteM, bearingToRouteDeg }) => {
        if (cancelled) return
        logEvent('off_route', { distanceToRouteM })
        setOffRouteBearingDeg(bearingToRouteDeg)
        speakIfEnabled('Sei fuori dal percorso pianificato', 'critical')
        haptics.alert()
      })
      engine.on('wrongDirection', ({ expectedHeadingDeg }) => {
        if (cancelled) return
        logEvent('wrong_direction')
        // Reuses the off-route arrow indicator, pointed at the route's own forward direction
        // here rather than "back toward the nearest point" — same UI, the correct meaning for
        // this case (on the trail, just headed the wrong way along it).
        setOffRouteBearingDeg(expectedHeadingDeg)
        speakIfEnabled('Stai andando nella direzione sbagliata', 'critical')
        haptics.alert()
      })
      engine.on('backOnRoute', () => {
        if (cancelled) return
        logEvent('on_route_again')
        setOffRouteBearingDeg(null)
        setMapMatch(null)
      })
      engine.on('gpsLost', ({ permissionDenied }) => {
        if (cancelled) return
        logEvent('gps_lost', { permissionDenied })
        setGpsLostPermissionDenied(permissionDenied)
        speakIfEnabled(permissionDenied ? 'Permesso di localizzazione negato' : 'Segnale GPS assente', 'critical')
        haptics.alert()
      })
      engine.on('gpsRecovered', () => {
        if (cancelled) return
        logEvent('gps_recovered')
        setGpsLostPermissionDenied(false)
      })

      // The component can unmount while the awaits above are still pending — engineRef.current
      // is only set once we reach here, so the cleanup below has nothing to call .stop() on yet.
      // Without this check, engine.start() (which kicks off navigator.geolocation.watchPosition)
      // would still run after unmount, leaking a GPS watch nobody will ever stop.
      if (cancelled) return
      engine.start()
    })()

    const onlineListener = () => {
      setIsOnline(navigator.onLine)
      if (!navigator.onLine) return
      flushToServer()
      // Any field-note photo that couldn't upload at capture time (offline, see FieldNoteSheet.tsx)
      // gets a best-effort retry now that we're back online — never blocks/loses anything if it
      // fails again, see retryFieldNotePhotos.ts.
      retryFieldNotePhotos(hike.id, hikeNotesRef.current).then((changed) => {
        if (changed.length === 0 || cancelled) return
        setHikeNotes((prev) => {
          const merged = prev.map((n) => changed.find((c) => c.id === n.id) ?? n)
          updatePlannedMeta(hike.id, { hikeNotes: merged }).catch(() => {})
          return merged
        })
      }).catch(() => {})
    }
    window.addEventListener('online', onlineListener)
    window.addEventListener('offline', onlineListener)
    setIsOnline(navigator.onLine)

    // A dead phone mid-hike means no map and no GPS — warn once while
    // there's still time to react (power bank, screen brightness), and log
    // it so it shows up alongside the other navigation events.
    const stopBatteryWatch = watchBattery((level) => {
      if (cancelled) return
      setLowBatteryNotice(true)
      logEvent('low_battery', { level })
      speakIfEnabled('Batteria del telefono scarica')
      haptics.alert()
    })
    // Continuous feed (not just the one-shot low-battery warning above) for the automatic
    // mode decider (Fase 8, lib/navigation/locationModeDecider.ts) — kept in a ref rather than
    // state since nothing here needs to re-render on every percent of battery drain.
    const stopBatteryLevelWatch = watchBatteryLevel(({ level, charging }) => {
      batteryStateRef.current = { level, charging }
    })

    // If we're starting offline (or go offline before this resolves) with no fully-downloaded
    // offline package for this hike, some areas of the route may not be covered by cached tiles
    // (the one hard requirement, see lib/offline/offlineReadiness.ts) — worth a one-time heads-up
    // instead of the hiker discovering blank map tiles mid-trail. Pieces that only degrade the
    // experience (trail graph, elevation, POIs, nav instructions) get their own, separate notice.
    loadManifest(hike.id).then((manifest) => {
      if (cancelled) return
      const readiness = checkOfflineReadiness(manifest)
      if (!navigator.onLine) {
        if (!readiness.tilesReady) setOfflinePackageWarning(true)
        if (readiness.degradedMissing.length > 0) setOfflineDegradedMissing(readiness.degradedMissing)
      }
      setOfflineReady(readiness.tilesReady)

      // The manifest claiming "ready" only means the download completed — it says nothing about
      // whether the tiles are still intact in Cache Storage right now (partial eviction under
      // storage pressure, a corrupted write, etc.). Checked here, not blocking navigation start on
      // a mismatch (a false positive here must never strand a hiker who has a perfectly good
      // package) — surfaced as one more entry in the same non-blocking "degraded" notice.
      if (readiness.tilesReady) {
        verifyOfflinePackageChecksum(hike.id, manifest).then((ok) => {
          if (!cancelled && !ok) {
            setOfflineDegradedMissing((prev) => prev.includes('Integrità mappa offline non verificata')
              ? prev
              : [...prev, 'Integrità mappa offline non verificata'])
          }
        }).catch(() => {})
      }
    }).catch(() => {})

    const flushInterval = setInterval(() => { if (navigator.onLine) flushToServer() }, 30000)
    // "Moving time" ticks once a second while fixes keep arriving and the
    // timer isn't paused — a rough stand-in for Komoot's moving-vs-stopped
    // distinction without needing a separate speed-threshold state machine.
    const movingTimeInterval = setInterval(() => {
      if (timerRunningRef.current && lastFixAtRef.current != null && Date.now() - lastFixAtRef.current < FIX_STALE_MS) {
        setMovingTimeMs((prev) => prev + 1000)
      }
    }, 1000)
    // Fase 1 di docs/navigator-orizzonti-roadmap.md — ~15-20s, distinta dalla frequenza di
    // lettura del viewer pubblico (~10-15s, in LiveShareViewer.tsx). Best-effort puro, nessuna
    // coda: publishLivePosition() ignora silenziosamente un fallimento (offline), si riprova al
    // prossimo tick — stesso principio della creazione sessione poco sopra.
    const liveShareInterval = setInterval(() => {
      if (!liveSharingEnabledRef.current || !remoteSessionId.current) return
      // Deliberatamente NON legato a timerRunningRef: quel flag è solo il cronometro "tempo in
      // movimento" (avviato con play/pausa in NavBottomStrip/NavStatsSheet), un controllo separato dal motore GPS
      // — il fix di posizione arriva comunque, in pausa o no. Condizionare la condivisione live a
      // quel bottone avrebbe lasciato la posizione mai pubblicata finché l'utente non lo preme
      // esplicitamente, un requisito che chi attiva "Posizione live" non ha motivo di aspettarsi.
      if (positionRef.current) {
        publishLivePosition(remoteSessionId.current, {
          lat: positionRef.current.lat, lon: positionRef.current.lon,
          ts: Date.now(), accuracyM: accuracyMRef.current,
        }).then((ok) => {
          if (ok) lastLivePublishSuccessRef.current = Date.now()
        })
      }
      // DTREK-AUDIT.md P0 #8 — controllato a ogni tick indipendentemente dal successo qui sopra
      // (anche senza un fix GPS quest'ultima volta, l'assenza di successi recenti resta rilevante):
      // livello, non un evento una tantum, si auto-risolve appena un publish torna a riuscire.
      const successAgeMs = lastLivePublishSuccessRef.current == null ? Infinity : Date.now() - lastLivePublishSuccessRef.current
      setLiveShareSelfStale(successAgeMs >= LIVE_STALE_MS)
    }, 18000)

    return () => {
      cancelled = true
      engineRef.current?.stop()
      window.removeEventListener('online', onlineListener)
      window.removeEventListener('offline', onlineListener)
      stopBatteryWatch()
      stopBatteryLevelWatch()
      clearInterval(flushInterval)
      clearInterval(movingTimeInterval)
      clearInterval(liveShareInterval)
      if (sessionRef.current) saveNavigationSession(sessionRef.current).catch(() => {})
      flushToServer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.id])

  // The MapTiler-backed 3D styles need connectivity — fall back to the offline-safe map the moment the network drops.
  useEffect(() => {
    if (!isOnline && mapMode !== 'offline') setMapMode('offline')
  }, [isOnline, mapMode])

  const handleMapStyleFailed = (reason: string) => {
    // NavigationMapLibre already console.error's the detailed reason (key
    // missing/rejected, network, timeout...) — kept out of this user-facing
    // notice on purpose, but surfaced here too in case this handler is ever
    // reached without that log (e.g. future callers).
    console.error('[ActiveNavigationView] falling back to offline map:', reason)
    setMapMode('offline')
    setMapFallbackNotice(true)
    setTimeout(() => setMapFallbackNotice(false), 5000)
  }

  // Ending navigation must be a deliberate action: a stray tap on the close
  // button, the browser/phone back gesture, or an accidental tab close
  // should never silently drop a session mid-hike. We push a guard history
  // entry so a back-navigation is caught by popstate instead of leaving the
  // page, and warn on tab close/refresh via beforeunload (best-effort only —
  // iOS Safari ignores the custom message and sometimes the prompt itself).
  useEffect(() => {
    history.pushState({ dtrekNavGuard: true }, '')

    const onPopState = () => {
      if (endConfirmedRef.current) return
      history.pushState({ dtrekNavGuard: true }, '')
      setShowConfirmEnd(true)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (endConfirmedRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('popstate', onPopState)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  // Only iOS Safari gates the compass behind an explicit tap. Everywhere
  // else, requestOrientationPermission() resolves true with no native
  // prompt at all — silently enable it on mount instead of showing a button
  // that, on those platforms, does nothing visible when tapped (reported
  // as a confusing/"useless" control).
  useEffect(() => {
    if (isOrientationSupported() && !needsOrientationPermissionGesture()) {
      requestOrientationPermission().then(setCompassEnabled)
    }
  }, [])

  const handleEnableCompass = async () => {
    const granted = await requestOrientationPermission()
    setCompassEnabled(granted)
  }

  const handleToggleSpeech = () => {
    speechEnabledRef.current = !speechEnabledRef.current
    setSpeechEnabled(speechEnabledRef.current)
  }

  // Screen Wake Lock durante la sessione di navigazione attiva — stesso pattern già in uso per
  // il rendering video 3D (RouteMap3D.tsx), qui applicato a ciò per cui serve di più: senza,
  // lo schermo può spegnersi per timeout di sistema mentre si cammina, portandosi via mappa e
  // istruzioni finché l'utente non lo riaccende a mano. Un solo effetto, chiave sullo stato di
  // navigazione + il toggle utente, copre acquisizione/rilascio su ogni percorso di uscita
  // (stop, fine escursione, disattivazione manuale) senza duplicare la logica altrove.
  useEffect(() => {
    const active = state !== 'idle' && state !== 'finished'
    if (!active || !wakeLockEnabled) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = () => {
      navigator.wakeLock.request('screen')
        .then((s) => { if (cancelled) { s.release().catch(() => {}); return } sentinel = s })
        .catch(() => {}) // negato/non supportato in questo contesto: degrado silenzioso, la navigazione resta usabile
    }
    acquire()
    // Il browser rilascia il lock da solo quando il documento diventa "hidden" (cambio app, non
    // spegnimento schermo) — se poi torna visibile mentre si è ancora in navigazione, va richiesto di nuovo.
    const onVisibility = () => { if (document.visibilityState === 'visible' && !sentinel) acquire() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [state, wakeLockEnabled])

  const handleTogglePlayPause = () => {
    timerRunningRef.current = !timerRunningRef.current
    setTimerRunning(timerRunningRef.current)
  }

  const requestEnd = () => setShowConfirmEnd(true)

  const goToPlannedHike = () => router.push(isNativeApp ? '/navigatore' : `/guida/${hike.id}`)

  const confirmEnd = async () => {
    endConfirmedRef.current = true
    setShowConfirmEnd(false)
    haptics.success()
    if (remoteSessionId.current) {
      fetch('/api/navigation/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: remoteSessionId.current, status: 'completed' }),
      }).catch(() => {})
    }
    engineRef.current?.stop()

    // Enough of a recorded track to be worth offering a save — same review
    // step as importing an external GPX/FIT/TCX, instead of silently
    // discarding what was just walked.
    if (recordedTrackRef.current.length >= 2) {
      try {
        setPendingActivity(buildActivityFromTrack(recordedTrackRef.current))
        return
      } catch {
        // fall through to the original close behavior if the track can't be turned into an activity
      }
    }
    clearRecordedTrack(hike.id).catch(() => {})
    goToPlannedHike()
  }

  const cancelEnd = () => setShowConfirmEnd(false)

  const handleSaveFieldNote = (note: HikeNote) => {
    const updated = [...hikeNotes, note]
    setHikeNotes(updated)
    updatePlannedMeta(hike.id, { hikeNotes: updated }).catch(() => {})

    retryFieldNotePhotoIfOnline(hike.id, note, updated, (changed) => {
      setHikeNotes((prev) => {
        const merged = prev.map((n) => changed.find((c) => c.id === n.id) ?? n)
        updatePlannedMeta(hike.id, { hikeNotes: merged }).catch(() => {})
        return merged
      })
    })
  }

  /**
   * Snapshot, not live: the Escape Engine's graph search (lib/navigation/escapeEngine.ts) is cheap
   * once but not something to re-run on every GPS fix, so options are computed when the hiker
   * actually opens the sheet, with an explicit refresh rather than continuous recomputation.
   */
  const handleEscapeOptions = async () => {
    setEscapeSheetOpen(true)
    setEscapeLoading(true)
    try {
      const network = await loadTrailGraph(hike.id)
      const progressSnapshot = fullProgressRef.current
      if (!position || !progressSnapshot) {
        setEscapeOptions([])
        return
      }
      setEscapeOptions(computeEscapeOptions({
        network,
        routePolyline,
        currentLat: position.lat,
        currentLon: position.lon,
        progress: progressSnapshot,
        pois,
      }))
    } finally {
      setEscapeLoading(false)
    }
  }

  const handleSaveRecordedActivity = async (title: string, mode: 'overwrite' | 'new', reportCompletion: boolean, completionNote: string) => {
    if (!pendingActivity) return
    let offline = false
    const saved = await saveActivityWithEnrichment(pendingActivity, {
      title,
      linkedPlannedId: hike.id,
      linkedPlannedTrackPoints: (hike.trackPoints ?? []).filter((p) => p.lat && p.lon),
      hikeNotes,
      // 'overwrite' consumes the plan into this activity (as before); 'new' keeps the linkage
      // for reference (comparison chart, "generato da") but leaves the planned hike untouched
      // so it can be hiked again later instead of being deleted.
      deleteLinkedPlanned: mode === 'overwrite',
      onSyncResult: (ok) => { offline = !ok },
    })
    clearRecordedTrack(hike.id).catch(() => {})

    // Fase 4 di docs/navigator-orizzonti-roadmap.md — opt-in esplicito (checkbox deselezionata
    // di default in EndHikeReviewDialog.tsx), best-effort e fire-and-forget: non deve mai
    // ritardare né bloccare la navigazione verso il resoconto appena salvato.
    if (reportCompletion) {
      fetch('/api/trails/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: saved.id, note: completionNote || undefined }),
      }).catch(() => {})
    }
    if (offline) {
      // The record is already safe (written to IndexedDB before any network attempt — see
      // lib/activitySave.ts), but the dialog is about to be replaced by a page navigation with no
      // chance to say so otherwise. A brief pause with the reassurance visible beats silently
      // landing on the report page with no indication the save didn't reach the server yet.
      setSaveOfflineNotice(true)
      await new Promise((r) => setTimeout(r, 1800))
    }
    router.push(isNativeApp ? '/navigatore' : `/resoconto/${encodeURIComponent(saved.id)}`)
  }

  const handleDiscardRecordedActivity = () => {
    setPendingActivity(null)
    clearRecordedTrack(hike.id).catch(() => {})
    goToPlannedHike()
  }

  const distanceRemainingM = progress ? Math.max(0, progress.totalRouteM - progress.distanceAlongRouteM) : 0
  const avgSpeedMs = movingTimeMs > 0 ? traveledDistanceM / (movingTimeMs / 1000) : null
  const legacyEtaDate = avgSpeedMs && avgSpeedMs > 0.05 && distanceRemainingM > 0
    ? new Date(Date.now() + (distanceRemainingM / avgSpeedMs) * 1000)
    : null
  // PaceAssistant's live estimate (Naismith + weather + observed-pace blend) once it has
  // enough signal; falls back to the flat average-speed formula for the first stretch of
  // the hike (low confidence) rather than showing nothing.
  const etaDate = pace?.liveEtaDate ?? legacyEtaDate
  const elevationRemainingM = elevationProfile.length > 1
    ? remainingElevation(elevationProfile, progress?.distanceAlongRouteM ?? 0).gainM
    : null
  // "arrivo" esplicito prima dell'orario: senza etichetta, "13:40" letto di sfuggita durante il
  // cammino può leggersi come un tempo trascorso invece che come l'ora di arrivo stimata.
  const bottomStripSummary = `${(distanceRemainingM / 1000).toFixed(1)} km · ${
    etaDate ? `arrivo ${etaDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : '—'
  } · ${elevationRemainingM != null ? `+${Math.round(elevationRemainingM)} m` : '—'}`

  const daylightMarginMin = sunTimes?.sunset && etaDate ? daylightMarginMinutes(etaDate, sunTimes.sunset) : null

  // Turn-back advisory: even retracing the already-hiked portion starting right now, would
  // the hiker beat usable light (civil twilight end, minus a safety buffer)? Warning-only —
  // no alternate route is computed, matching the "avviso tempo insufficiente" scope.
  const TURN_BACK_SAFETY_BUFFER_MS = 30 * 60 * 1000
  const turnBackNow = !!(pace?.returnTripTimeSec != null && sunTimes?.dusk &&
    (Date.now() + pace.returnTripTimeSec * 1000) > (sunTimes.dusk.getTime() - TURN_BACK_SAFETY_BUFFER_MS))

  // Switching epoch is a deliberate "look back in time" action — re-arm every epoch poi as
  // unshown so the hiker sees the relevant callouts again for the newly selected period.
  useEffect(() => {
    shownEpochPoiIdsRef.current = new Set()
    setActiveEpochCallout(null)
  }, [selectedEpoch])

  useEffect(() => {
    if (!position || selectedEpoch === 'oggi' || filteredEpochPois.length === 0 || activeEpochCallout || callout) return
    const nearby = epochPoiIndex.nearby(position.lat, position.lon)
    const next = nearby.find((n) => !shownEpochPoiIdsRef.current.has(String(n.poi.id)))
    if (next) {
      const epochPoi = filteredEpochPois.find((p) => p.id === next.poi.id)
      if (epochPoi) {
        shownEpochPoiIdsRef.current.add(epochPoi.id)
        setActiveEpochCallout(epochPoi)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, selectedEpoch, activeEpochCallout, callout])

  useEffect(() => {
    if (turnBackNow && !turnBackAlertedRef.current) {
      turnBackAlertedRef.current = true
      logEvent('turnback_warning')
      if (speechEnabledRef.current) speak('Attenzione: potresti non avere abbastanza luce per rientrare. Valuta di tornare indietro ora.', { priority: 'critical' })
      haptics.alert()
    } else if (!turnBackNow) {
      turnBackAlertedRef.current = false
      setTurnBackDismissed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnBackNow])

  return (
    <div className="fixed inset-0 z-[2000] bg-stone-900 font-body">
      {mapMode === 'offline' ? (
        <NavigationMap
          ref={mapHandleRef}
          routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state}
          nearbyTrails={showNearbyTrails ? nearbyTrails : []} accuracyM={accuracyM} parkingSpot={parkingSpot} onPoiTap={handlePoiTap}
          showPois={showPoiLayer} slopeSegments={showSlopeLayer ? slopeSegments : null}
          onFollowModeChange={setMapFollowMode}
        />
      ) : (
        <NavigationMapLibre
          ref={mapHandleRef}
          routePolyline={routePolyline} pois={pois} position={position} bearingDeg={bearing} state={state}
          styleId={mapMode} is3D={is3D} onStyleFailed={handleMapStyleFailed} accuracyM={accuracyM}
          natura2000Features={natura2000Features} showNatura2000={showNatura2000}
          parkingSpot={parkingSpot} nearbyTrails={showNearbyTrails ? nearbyTrails : []} onPoiTap={handlePoiTap}
          showPois={showPoiLayer} slopeSegments={showSlopeLayer ? slopeSegments : null}
          onFollowModeChange={setMapFollowMode}
        />
      )}

      {locationProviderFactory && (
        <div className="absolute top-0 inset-x-0 z-20 bg-purple-700 text-white text-xs font-bold text-center py-1.5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}>
          SIMULAZIONE{simulationLabel ? ` — ${simulationLabel}` : ''} — nessun GPS reale in uso
        </div>
      )}

      {/* Soluzione B: colonna sinistra centrata verticalmente — rotaia dei layer (Sentieri vicini/
          POI/Pendenze) più il pulsante "centra sulla mia posizione", raggruppati invece di
          lasciare quest'ultimo a fluttuare da solo a metà schermo (dove si scontrava con la
          rotaia destra una volta centrata anche lei). */}
      <div className="absolute left-0 z-10 top-1/2 -translate-y-1/2 flex flex-col items-start gap-3">
        <NavLayerRail
          showNearbyTrails={showNearbyTrails} onToggleNearbyTrails={() => setShowNearbyTrails((v) => !v)}
          showPois={showPoiLayer} onTogglePois={() => setShowPoiLayer((v) => !v)}
          showSlope={showSlopeLayer} onToggleSlope={() => setShowSlopeLayer((v) => !v)}
        />
        <button
          onClick={() => mapHandleRef.current?.recenter()}
          aria-label="Centra sulla mia posizione"
          className={`ml-3 w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${
            mapFollowMode ? 'bg-terra-500 text-white' : 'bg-white text-stone-700'
          }`}
        >
          <Locate className="w-5 h-5" />
        </button>
      </div>

      <GiuliaLiveQa
        hikeTitle={hike.title}
        nearestPoiName={remainingPois[0]?.name}
        nearestPoiDistanceM={remainingPois[0]?.distanceM}
        distanceRemainingM={distanceRemainingM}
        isOnline={isOnline}
      />

      {/* Soluzione B: un'unica colonna in flusso — indicazione, epoche, avvisi — invece di tre
          elementi a offset fissi indipendenti. L'altezza reale di ciascuno sposta quello che
          viene sotto, quindi non si sovrappongono mai, qualunque combinazione sia attiva
          (istruzione espansa, più avvisi, epoche disponibili...). Scende sotto la barra
          SIMULAZIONE quando presente invece di finirci sotto. */}
      <div
        className="absolute left-3 right-3 z-10 flex flex-col items-center gap-2"
        style={{ top: `calc(env(safe-area-inset-top, 0px) + ${locationProviderFactory ? '44px' : '10px'})` }}
      >
        <div className="w-full">
          <InstructionBanner
            current={instruction?.current ?? null}
            next={instruction?.next ?? null}
            distanceToNextM={instruction?.distanceToNextM ?? null}
            speechEnabled={speechEnabled}
            onToggleSpeech={handleToggleSpeech}
            onClose={requestEnd}
            isOnline={isOnline}
            compassSupported={isOrientationSupported() && needsOrientationPermissionGesture()}
            compassEnabled={compassEnabled}
            onEnableCompass={handleEnableCompass}
            highContrast={highContrastEnabled}
          />
        </div>

        {availableEpochs.length > 0 && (
          <div className="flex gap-1 bg-white/95 rounded-full shadow-lg p-1">
            {availableEpochs.map((epoch) => (
              <button
                key={epoch}
                onClick={() => setSelectedEpoch(epoch)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
                  selectedEpoch === epoch ? 'bg-terra-500 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {EPOCH_LABELS[epoch]}
              </button>
            ))}
          </div>
        )}

        {(mapFallbackNotice || offlinePackageWarning || offlineDegradedMissing.length > 0 || (state !== 'idle' && relevantWildlifeRisks.length > 0 && !wildlifeAlertDismissed) || (weatherLookahead?.message && !weatherLookaheadDismissed)) && (
          <div className="flex flex-col items-center gap-2 w-full max-w-sm">
            {weatherLookahead?.message && !weatherLookaheadDismissed && (
              <div className="px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg font-body flex items-center gap-2">
                <span className="shrink-0">🌦️</span>
                {weatherLookahead.message}
                <button onClick={() => setWeatherLookaheadDismissed(true)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
              </div>
            )}

            {mapFallbackNotice && (
              <div className="px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg font-body">
                Mappa online non disponibile, uso la mappa offline
              </div>
            )}

            {offlinePackageWarning && (
              <div className="px-4 py-2 rounded-full bg-stone-800 text-white text-xs font-semibold shadow-lg font-body flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                Mappa offline incompleta per questo percorso
                <button onClick={() => setOfflinePackageWarning(false)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
              </div>
            )}

            {/* Offline Readiness Check (roadmap Fase 6) — tiles missing is the hard-blocker notice
                above; this one is for pieces that only degrade the experience (no escape
                suggestions, no elevation chart, no POI callouts...), never block navigation. */}
            {offlineDegradedMissing.length > 0 && (
              <div className="px-4 py-2 rounded-xl bg-stone-800 text-white text-xs shadow-lg font-body flex items-start gap-2 w-full">
                <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Dati offline incompleti per questo percorso</p>
                  <p className="text-stone-300 leading-snug">Non disponibili: {offlineDegradedMissing.join(', ')}</p>
                </div>
                <button onClick={() => setOfflineDegradedMissing([])} className="text-stone-400 hover:text-white shrink-0" aria-label="Chiudi avviso">✕</button>
              </div>
            )}

            {state !== 'idle' && relevantWildlifeRisks.length > 0 && !wildlifeAlertDismissed && (
              <div className="w-full px-4 py-3 rounded-xl bg-stone-800 text-white text-xs shadow-lg font-body">
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0">🐾</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold mb-1">Fauna nella zona: {relevantWildlifeRisks.map((w) => w.animal).join(', ')}</p>
                    <p className="text-stone-300 leading-snug">{relevantWildlifeRisks[0].tip}</p>
                  </div>
                  <button onClick={() => setWildlifeAlertDismissed(true)} className="text-stone-400 hover:text-white shrink-0" aria-label="Chiudi avviso">✕</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Soluzione B: un'unica rotaia destra, centrata verticalmente — SOS, mappa/layer,
          affidabilità, condivisione live, mappa offline, punto auto — invece di due colonne
          separate a offset fissi che finivano per scontrarsi con altri controlli fluttuanti. */}
      <div className="absolute right-3 z-10 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2">
        <SosButton
          fix={position ? { lat: position.lat, lon: position.lon, accuracyM } : null}
          liveShareUrl={liveShareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/live/${liveShareToken}` : null}
          onTriggered={(action) => logEvent('sos_triggered', { action })}
        />
        <MapModeSwitcher
          mode={mapMode} onModeChange={setMapMode} is3D={is3D} onToggle3D={() => setIs3D((v) => !v)} isOnline={isOnline}
          showNatura2000={showNatura2000} onToggleNatura2000={() => setShowNatura2000((v) => !v)}
        />
        <TrailConfidenceBadge confidence={trailConfidence} />
        {/* Raggiungibile sempre, non solo dal banner fuori-percorso: prima le "vie d'uscita"
            comparivano solo dentro l'avviso off_route/wrong_direction, che sparisce del tutto
            quando lo stato è gps_lost (l'avviso GPS perso lo sostituisce) — proprio nel momento
            in cui questo strumento serve di più. Un punto di accesso proattivo permette anche di
            consultarle "per sicurezza" mentre si è ancora regolarmente sul percorso. */}
        <button
          onClick={handleEscapeOptions}
          title="Vie d'uscita"
          className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg border bg-white/95 border-stone-200"
        >
          <Signpost className="w-5 h-5 text-stone-700" />
        </button>
        <button
          onClick={() => setShowLiveShareSheet(true)}
          title={liveSharingEnabled ? 'Condivisione posizione live attiva' : 'Condividi la tua posizione live'}
          className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border ${
            liveSharingEnabled ? 'bg-sky-600 border-sky-400/40' : 'bg-white/95 border-stone-200'
          }`}
        >
          <Radio className={`w-5 h-5 ${liveSharingEnabled ? 'text-white' : 'text-stone-700'}`} />
        </button>
        {routePolyline.length >= 2 && (
          <button
            onClick={() => setShowOfflineSheet(true)}
            title={offlineReady ? 'Mappa scaricata per offline' : 'Scarica mappa per offline'}
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border ${
              offlineReady ? 'bg-emerald-600 border-emerald-400/40' : 'bg-white/95 border-stone-200'
            }`}
          >
            {offlineReady ? <CheckCircle2 className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-stone-700" />}
          </button>
        )}
        <ParkingSpotControl
          spot={parkingSpot}
          position={position}
          distanceM={parkingDistanceM}
          bearingToSpotDeg={parkingBearingDeg}
          onSave={handleSaveParking}
          onClear={handleClearParking}
        />
      </div>

      <Sheet
        open={showOfflineSheet}
        onClose={() => {
          setShowOfflineSheet(false)
          loadManifest(hike.id).then((m) => {
            setOfflineReady(isManifestValid(m))
            setOfflineDegradedMissing(checkOfflineReadiness(m).degradedMissing)
          }).catch(() => {})
        }}
        title="Mappa offline"
      >
        <OfflinePackageDownloader
          hikeId={hike.id}
          routePolyline={routePolyline}
          hikeData={{ trackPoints: hike.trackPoints, cachedPois: hike.cachedPois }}
        />
      </Sheet>

      <Sheet
        open={showLiveShareSheet}
        onClose={() => setShowLiveShareSheet(false)}
        title="Condividi posizione"
      >
        <LiveShareToggle
          sessionId={remoteSessionIdState}
          onSharingChange={(enabled, token) => {
            setLiveSharingEnabled(enabled)
            setLiveShareToken(token)
            // Baseline al momento dell'attivazione — senza questo il primo tick dopo l'accensione
            // leggerebbe "nessun successo mai registrato" come se fosse già fermo da sempre.
            lastLivePublishSuccessRef.current = enabled ? Date.now() : null
            setLiveShareSelfStale(false)
          }}
        />
        <GroupModeSection
          sessionId={remoteSessionIdState}
          plannedHikeId={hike.id}
          onGroupActive={(active) => {
            if (active) {
              setLiveSharingEnabled(true)
              lastLivePublishSuccessRef.current = Date.now()
              setLiveShareSelfStale(false)
            }
          }}
        />
      </Sheet>

      {showFieldNote && (
        <FieldNoteSheet
          position={position} onSave={handleSaveFieldNote}
          onClose={() => { setShowFieldNote(false); setFieldNoteAutoCamera(false) }}
          autoOpenCamera={fieldNoteAutoCamera}
        />
      )}

      {showSpeciesIdentify && (
        <SpeciesIdentifySheet position={position} onClose={() => setShowSpeciesIdentify(false)} />
      )}

      {(() => {
        // Priorità (più critico prima): rientro per il buio, GPS perso,
        // fuori percorso, batteria scarica. Solo il più critico è sempre
        // visibile; gli altri restano raggiungibili dietro "+N altri avvisi"
        // invece di impilarsi tutti insieme con offset a pixel fissi.
        const alerts: { id: string; node: React.ReactNode }[] = []

        if (turnBackNow && !turnBackDismissed) {
          alerts.push({
            id: 'turnback',
            node: (
              <div className="max-w-[90%] px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2 text-center">
                <AlertTriangle size={16} className="shrink-0" />
                Luce insufficiente per rientrare — valuta di tornare indietro ora
                <button onClick={() => setTurnBackDismissed(true)} className="text-red-200 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
              </div>
            ),
          })
        }
        if (state === 'gps_lost') {
          alerts.push({
            id: 'gpslost',
            node: (
              <div className="max-w-[90%] px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold font-body shadow-lg flex flex-col gap-2 text-center">
                <div className="flex items-center gap-2 justify-center">
                  <AlertTriangle size={16} className="shrink-0" />
                  {gpsLostPermissionDenied
                    ? 'Permesso di localizzazione negato — attivalo nelle impostazioni del browser/telefono'
                    : 'Segnale GPS assente'}
                </div>
                {/* Con il GPS perso è esattamente quando le vie d'uscita servono di più — non
                    devono restare raggiungibili solo dall'avviso fuori-percorso, che questo
                    stesso avviso sostituisce. Usa l'ultima posizione nota (position/
                    fullProgressRef non vengono azzerati alla perdita del segnale). */}
                {!gpsLostPermissionDenied && (
                  <button
                    onClick={handleEscapeOptions}
                    className="self-center text-xs font-bold underline decoration-white/60 underline-offset-2 py-1"
                  >
                    Vie d&apos;uscita (dall&apos;ultima posizione nota)
                  </button>
                )}
              </div>
            ),
          })
        }
        // DTREK-AUDIT.md P0 #5 — un fatto strutturale di sicurezza (chiusura confermata da più
        // escursionisti) pesa più di una deviazione momentanea ma meno di un problema di
        // localizzazione attivo: dopo gps_lost, prima di off_route/wrong_direction. Solo
        // 'confirmed', non 'reported' — un singolo report non confermato resta visibile solo in
        // pianificazione (CurrentConditionsNotice.tsx), per non allarmare in cammino.
        if (trailClosure?.status === 'confirmed') {
          alerts.push({
            id: 'closure',
            node: (
              <div className="max-w-[90%] px-4 py-2 rounded-xl bg-red-800/90 text-white text-sm font-semibold font-body shadow-lg flex items-start gap-2 text-center">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Sentiero probabilmente chiuso — segnalato da almeno {trailClosure.reporterCount} escursionisti
                  {trailClosure.reason && <span className="block text-xs font-normal mt-0.5 italic">&ldquo;{trailClosure.reason}&rdquo;</span>}
                </span>
              </div>
            ),
          })
        }
        if (state === 'off_route' || state === 'wrong_direction') {
          const isWrongDirection = state === 'wrong_direction'
          alerts.push({
            id: 'offroute',
            node: (
              <div
                className={`max-w-[85%] px-4 py-3 rounded-xl text-white text-sm font-semibold font-body shadow-lg backdrop-blur-sm border-l-4 flex flex-col gap-2 ${
                  isWrongDirection ? 'bg-orange-950/85 border-orange-400' : 'bg-stone-900/85 border-terra-400'
                }`}
              >
                {/* Sfondo scuro traslucido invece di un blocco a colore pieno — resta
                    riconoscibile come avviso importante (bordo e icone in colore) senza dominare
                    lo schermo come il pieno arancione/terra faceva prima. Icona + messaggio su
                    una riga che può avvolgere normalmente (min-w-0 sullo span di testo, niente
                    più stringa nuda incollata al bottone) — il link "Vie d'uscita" è una riga a
                    sé sotto, non più incastrato in coda al testo dove finiva tagliato o scomodo
                    da toccare. */}
                <div className="flex items-start gap-2">
                  {offRouteBearingDeg != null && (
                    <ArrowUp size={16} className={`shrink-0 mt-0.5 ${isWrongDirection ? 'text-orange-300' : 'text-terra-300'}`} style={{ transform: `rotate(${offRouteBearingDeg}deg)` }} />
                  )}
                  <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${isWrongDirection ? 'text-orange-300' : 'text-terra-300'}`} />
                  <span className="min-w-0">
                    {isWrongDirection
                      ? 'Direzione sbagliata — segui la freccia'
                      : `Sei fuori dal percorso${offRouteBearingDeg != null ? ' — torna verso la freccia' : ' pianificato'}`}
                  </span>
                </div>
                <button
                  onClick={handleEscapeOptions}
                  className="self-start pl-6 text-xs font-bold underline decoration-white/60 underline-offset-2 py-1"
                >
                  Vie d&apos;uscita
                </button>
                {/* Map Matching (Fase 4, lib/navigation/mapMatcher.ts): distinguishes "off the plan
                    but on a real, mapped trail" (likely deliberate) from being off any known trail —
                    informational only, never changes the off-route verdict itself above. */}
                {mapMatch?.alternativeDetected && mapMatch.distanceToMatchM != null && (
                  <p className="text-xs font-normal text-white/85 pl-6">
                    {mapMatch.confidence === 'high'
                      ? `C'è un sentiero conosciuto proprio qui (${Math.round(mapMatch.distanceToMatchM)} m) — forse lo stai seguendo di proposito`
                      : `Sentiero noto nelle vicinanze (~${Math.round(mapMatch.distanceToMatchM)} m)`}
                  </p>
                )}
              </div>
            ),
          })
        }
        if (lowBatteryNotice) {
          alerts.push({
            id: 'battery',
            node: (
              <div className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2">
                <BatteryWarning size={16} className="shrink-0 text-amber-400" /> Batteria scarica
                <button onClick={() => setLowBatteryNotice(false)} className="text-stone-400 hover:text-white ml-1" aria-label="Chiudi avviso">✕</button>
              </div>
            ),
          })
        }
        // DTREK-AUDIT.md P0 #8 — solo per l'escursionista stesso, mai un banner critico
        // full-screen come turnback/gps_lost: chi ha attivato "Posizione live" deve sapere che il
        // proprio battito non sta più raggiungendo il server (oggi falliva in silenzio totale),
        // senza che questo interferisca con avvisi di navigazione ben più urgenti. Si
        // auto-risolve appena un publish torna a riuscire, nessun bottone di chiusura — vedi
        // liveShareInterval più sopra.
        if (liveSharingEnabledRef.current && liveShareSelfStale) {
          alerts.push({
            id: 'liveshare-self-stale',
            node: (
              <div className="px-4 py-2 rounded-xl bg-stone-800 text-white text-sm font-semibold font-body shadow-lg flex items-center gap-2">
                <Radio size={16} className="shrink-0 text-amber-400" /> La tua posizione live non si aggiorna
              </div>
            ),
          })
        }

        if (alerts.length === 0) return null
        const [primary, ...rest] = alerts

        return (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
            {primary.node}
            {rest.length > 0 && (
              <button
                onClick={() => setBottomAlertsExpanded(v => !v)}
                className="px-3 py-1 rounded-full bg-stone-900/80 text-white text-xs font-medium shadow-md"
              >
                {bottomAlertsExpanded ? 'Nascondi' : `+${rest.length} altr${rest.length === 1 ? 'o avviso' : 'i avvisi'}`}
              </button>
            )}
            {bottomAlertsExpanded && rest.map(a => <div key={a.id}>{a.node}</div>)}
          </div>
        )
      })()}

      <NavBottomStrip
        summary={bottomStripSummary}
        timerRunning={timerRunning}
        onTogglePlayPause={handleTogglePlayPause}
        onStop={requestEnd}
        onExpand={() => setShowStatsSheet(true)}
        highContrast={highContrastEnabled}
      />

      <NavStatsSheet
        open={showStatsSheet}
        onClose={() => setShowStatsSheet(false)}
        distanceCoveredM={traveledDistanceM}
        distanceRemainingM={distanceRemainingM}
        currentSpeedMs={currentSpeedMs}
        avgSpeedMs={avgSpeedMs}
        movingTimeMs={movingTimeMs}
        etaDate={etaDate}
        paceStatus={pace?.paceStatus ?? 'estimating'}
        daylightMarginMin={daylightMarginMin}
        timerRunning={timerRunning}
        onTogglePlayPause={handleTogglePlayPause}
        onStop={requestEnd}
        trackPoints={hike.trackPoints ?? []}
        currentDistanceM={progress?.distanceAlongRouteM ?? 0}
        remainingPois={remainingPois}
        guideExcerpts={guideExcerpts}
        onOpenFoto={() => { setFieldNoteAutoCamera(true); setShowFieldNote(true) }}
        onOpenNota={() => { setFieldNoteAutoCamera(false); setShowFieldNote(true) }}
        onOpenSpecie={() => setShowSpeciesIdentify(true)}
        wakeLockEnabled={wakeLockEnabled}
        onToggleWakeLock={() => setWakeLockEnabled((v) => !v)}
        highContrastEnabled={highContrastEnabled}
        onToggleHighContrast={() => setHighContrastEnabled((v) => { const next = !v; writeHighContrastPref(next); return next })}
      />

      {callout && (
        <PoiCalloutSheet title={callout.title} extract={callout.extract} imageUrl={callout.imageUrl} onClose={() => setCallout(null)} />
      )}

      {activeEpochCallout && (
        <PoiCalloutSheet
          title={`${activeEpochCallout.poiName} — ${EPOCH_LABELS[activeEpochCallout.epoch]}`}
          extract={activeEpochCallout.text}
          onClose={() => setActiveEpochCallout(null)}
        />
      )}

      {showConfirmEnd && <ConfirmEndDialog onConfirm={confirmEnd} onCancel={cancelEnd} />}

      {pendingActivity && (
        <EndHikeReviewDialog
          activity={pendingActivity}
          defaultTitle={hike.title}
          onSave={handleSaveRecordedActivity}
          onDiscard={handleDiscardRecordedActivity}
        />
      )}

      {saveOfflineNotice && (
        <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[3100] flex justify-center">
          <p className="max-w-sm text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shadow-lg">
            Sei offline: l&apos;escursione è salvata sul telefono e si sincronizzerà da sola non appena torni online.
          </p>
        </div>
      )}

      <EscapeOptionsSheet
        open={escapeSheetOpen}
        onClose={() => setEscapeSheetOpen(false)}
        loading={escapeLoading}
        options={escapeOptions}
        onRefresh={handleEscapeOptions}
      />
    </div>
  )
}
