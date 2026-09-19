// Orchestratore client-side della pipeline multi-tappa a step (step/network → step/build →
// step/enrich) — stesso principio di runStepBuild.ts per la Modalità A "Su misura": tre chiamate
// HTTP brevi invece di un'unica richiesta lunga, ciascuna col proprio tetto di 60s "fresco". Unica
// fonte di verità per le etichette di stage (STAGES sotto) e per la forma della risposta finale
// (MultiStopResponse) — components/upload/PersonalizeItineraryPanel.tsx le importa da qui invece
// di ridefinirle, così l'etichetta passata a `onStage` e quella cercata dalla barra di avanzamento
// (components/upload/RouteGenerationProgress.tsx) non possono disallinearsi.
import type { MultiStopMode } from './multiStopRoute'
import type { FoundRouteItem } from './foundRoute'
import type { GenerationStage } from '../../components/upload/RouteGenerationProgress'
import { postJSON } from './runStepBuild'

export interface MultiStopBuildStop {
  id: string
  name: string
  lat: number
  lon: number
  placeId?: string
  includePoi?: boolean
}

export interface MultiStopBuildParams {
  stops: MultiStopBuildStop[]
  mode: MultiStopMode
  targetDistanceKm: number
  // Default true lato UI (PersonalizeItineraryPanel.tsx) — un percorso già noto/riconosciuto è
  // considerato sicuro, l'utente deve disattivare esplicitamente questa preferenza, non il
  // contrario. Vedi lib/routeBuilder/multiStopRoute.ts's KNOWN_TRAIL_DISCOUNT.
  considerExistingTrails: boolean
}

export interface MultiStopLegResponse {
  fromStopIdx: number
  toStopIdx: number
  distanceM: number
  real: boolean
  fallbackReason?: 'too_far_from_network' | 'no_path'
}
/** La tappa scelta a mano, o un punto di interesse del Borgo/Città inserito da `includePoi` — non
 *  distinguibili qui: la sequenza intera è quella che `legs[].fromStopIdx/toStopIdx` indicizza,
 *  non le sole tappe inviate (vedi app/api/route-build/multi-stop/step/network/route.ts). */
export interface MultiStopFullStop { id: string; name: string; lat: number; lon: number }
export interface MultiStopResponse {
  ok: true
  stops: MultiStopFullStop[]
  legs: MultiStopLegResponse[]
  routePolyline: [number, number][]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
  trackPoints?: FoundRouteItem['track']['trackPoints']
  pois?: FoundRouteItem['pois']
}

// Etichette usate come checkpoint sia qui (onStage) sia dalla barra di avanzamento — vedi il
// commento in testa al file. `targetPct` cresce lungo l'array, non deve mai sommare esattamente
// 100 alla fine: il "riempimento" finale avviene semplicemente smontando la barra a generazione
// conclusa (RouteGenerationProgress si smonta quando `active` torna false), non un ultimo scatto a
// 100 che nessuno farebbe in tempo a vedere.
const STAGE_NETWORK_WITH_TRAILS = 'Cerco la rete pedonale e i percorsi noti della zona…'
const STAGE_NETWORK = 'Cerco la rete pedonale della zona…'
const STAGE_BUILD = 'Calcolo il percorso migliore…'
const STAGE_ENRICH = 'Rifinisco i dettagli…'

export const MULTISTOP_BUILD_STAGES: GenerationStage[] = [
  { label: STAGE_NETWORK_WITH_TRAILS, targetPct: 50 },
  { label: STAGE_NETWORK, targetPct: 50 },
  { label: STAGE_BUILD, targetPct: 85 },
  { label: STAGE_ENRICH, targetPct: 96 },
]

/**
 * Genera l'itinerario multi-tappa in tre chiamate HTTP brevi — vedi il commento in testa al file.
 * Non lancia mai per un errore applicativo (rete non disponibile, richiesta non valida...): torna
 * `{ result: null, message }` con un messaggio già pronto da mostrare, stesso contratto di
 * runStepBuild.ts. Un errore di rete/eccezione imprevista è l'unica cosa gestita da postJSON stesso
 * (già cattura e torna `ok:false` con un messaggio, mai un throw fino a qui).
 */
export async function runMultiStopStepBuild(
  params: MultiStopBuildParams, onStage: (stage: string) => void,
): Promise<{ result: MultiStopResponse | null; message: string | null }> {
  onStage(params.considerExistingTrails ? STAGE_NETWORK_WITH_TRAILS : STAGE_NETWORK)
  const net = await postJSON('/api/route-build/multi-stop/step/network', {
    stops: params.stops, considerExistingTrails: params.considerExistingTrails,
  })
  if (!net.ok) return { result: null, message: net.data.message || net.data.error || 'Generazione non riuscita, riprova.' }
  const { bbox, fullStops, knownTrailWayIds } = net.data as {
    bbox: [number, number, number, number]; fullStops: MultiStopFullStop[]; knownTrailWayIds: number[]
  }

  onStage(STAGE_BUILD)
  const build = await postJSON('/api/route-build/multi-stop/step/build', {
    bbox, fullStops, mode: params.mode, targetDistanceKm: params.targetDistanceKm, knownTrailWayIds,
  })
  if (!build.ok) return { result: null, message: build.data.message || build.data.error || 'Generazione non riuscita, riprova.' }
  const { legs, routePolyline, distanceM } = build.data as {
    legs: MultiStopLegResponse[]; routePolyline: [number, number][]; distanceM: number
  }

  onStage(STAGE_ENRICH)
  const enrich = await postJSON('/api/route-build/multi-stop/step/enrich', {
    routePolyline, distanceM, targetDistanceKm: params.targetDistanceKm, bbox,
  })
  if (!enrich.ok) return { result: null, message: enrich.data.message || enrich.data.error || 'Generazione non riuscita, riprova.' }

  return {
    result: {
      ok: true,
      stops: fullStops,
      legs,
      routePolyline: enrich.data.routePolyline,
      distanceMeters: enrich.data.distanceMeters,
      elevationGain: enrich.data.elevationGain,
      elevationLoss: enrich.data.elevationLoss,
      altitudeMax: enrich.data.altitudeMax,
      altitudeMin: enrich.data.altitudeMin,
      estimatedTimeSeconds: enrich.data.estimatedTimeSeconds,
      hasElevation: enrich.data.hasElevation,
      trackPoints: enrich.data.trackPoints,
      pois: enrich.data.pois,
    },
    message: null,
  }
}
