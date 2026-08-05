'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl, { Map as MLMap, Marker, Popup } from 'maplibre-gl'
import { useEffect, useRef, useState, useCallback, useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import {
  X, Play, Pause, RotateCcw, Mountain, Camera, Images, Film,
  Download, Share2, ChevronLeft, ChevronRight, ImagePlus,
  Loader2, GripVertical, Check, Navigation, Layers, Sparkles, Copy, MapPin, Compass, ChevronUp,
} from 'lucide-react'
import StreetViewPanel from '@/components/StreetViewPanel'
import { fetchDayHourly, wmoInfo } from '@/lib/openmeteo'
import { getProfile } from '@/lib/userProfile'
import { type PoiItem, type PoiType, POI_META, buildPoiPopupHtml } from '@/lib/overpass'
import { poiBadgeMarkup } from '@/components/poiIcons'
import { fetchActivityPhotos, addActivityPhoto, updateActivityPhoto, removeActivityPhoto, type RoutePhoto } from '@/lib/activityPhotos'
import { readExifMetadata, placePhotoOnTrack } from '@/lib/exifGps'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { slopeDegToColor, aspectDegToColor } from '@/lib/dtm/dtmColors'
import { bearingDeg, circularMeanBearings } from '@/lib/navigation/orientation'
import { MAPTILER_STYLES as STYLES, MAPTILER_KEY as KEY, maptilerRasterTileUrl } from '@/lib/mapStyles'
import {
  computeVideoBudget, speedForTargetTotal, initialSpeedFor, clampSpeed,
  speedFromSlider, sliderFromSpeed, formatSpeed, formatTotal,
  INTRO_SEC, INTRO_FAST_SEC, OUTRO_SEC, MIN_ROUTE_SEC,
} from '@/lib/videoBudget'
import { getSunPosition, terrainSunLook, type TerrainSunLook } from '@/lib/daylight'
import {
  buildCumulativeDistances, progressToDistanceM, distanceMToProgress, buildJourneyTables, groupPhotoTimings,
  stopPhotoZoomAt, polaroidRotationDeg, hyperlapseIntensityAt, TOP_BAND_FRACTION, type CarouselPhotoTiming,
} from '@/lib/videoPhotoCarousel'
import { planPoiCards, projectPoisOnRoute, activeCardAt } from '@/lib/videoPoiCards'
import {
  planInterludes, interludeTotalFrames, DEFAULT_INTERLUDES, INTERLUDE_LABEL,
  recommendedInterludeSeconds, interludeIsDense,
  type InterludeKind, type InterludeSetting, type PlannedInterlude, type InterludeContent,
} from '@/lib/videoInterludes'
import {
  selectVisionFeatures, layoutVisionCallouts, recommendedVisionSeconds,
  DEFAULT_VISION_CATEGORIES, VISION_CATEGORY_LABEL, MAX_VISION_CALLOUTS, VISION_CAMERA_SECONDS,
  boundsOfRoute, fitZoomForBounds, centerOfBounds,
  type VisionCategory, type VisionSourceLine, type VisionFeature,
} from '@/lib/videoVision'
import { suggestCaptions, activeCaptionAt, type CaptionCandidate } from '@/lib/videoCaptions'
import type { BeautyScore } from '@/lib/beautyScore'
import type { WikiPage } from '@/lib/wikipedia'
import { normalizeGuideNotices, type GuideNotice } from '@/lib/guideNotices'
import { estimateVegetationBelt } from '@/lib/vegetationBelt'
import {
  coverRect, rrect, lerp, lerpAngle, shortestAngleTo, distM, smoothArray, clamp01,
  hexToRgb, effortRgb, hrEffortAt, buildMiniRoute,
  drawMapPin, drawHeartBadge, drawArrivalStars, drawRouteMilestone,
  drawPinTrail, drawPeakConquered, drawMiniMap, drawPhotoPin, drawPoiPin,
  drawVisionCallout, drawVisionTitle, VISION_CATEGORY_COLOR,
  drawStopPhotoZoom, drawHUD, drawTopBand, hudProgressBarTop, drawElevationMarker, safeInsetsFor, drawOpeningTitle,
  drawPoiTag, drawTeiPanel, drawIdentikit, drawEndCard,
  drawNumbersBeat, drawElevationBeat, drawNatureBeat, drawNoticesBeat, drawPlacesBeat, drawStoryCaption,
  drawPositionDot,
} from '@/lib/videoOverlays'

const SPEEDS = [
  { label: '½×', v: 0.5 },
  { label: '1×', v: 1   },
  { label: '3×', v: 3   },
]

// I preset non fissano più una durata: nel nuovo modello la durata è la somma delle parti (vedi
// lib/videoBudget.ts), quindi un preset che dichiarasse "30s" mentirebbe appena si accende
// un'opzione. Dichiarano invece il BERSAGLIO a cui portare il totale — da cui si ricava la
// velocità del cursore — e il ritmo dell'intro. Sono diventati stili editoriali: "Snappy" vuole un
// video corto e nervoso, "Epico" uno disteso, e la velocità è la conseguenza di quella intenzione
// su QUESTO percorso, non un numero uguale per tutti.
const VIDEO_PRESETS = {
  reels:  { targetSec: 30, fastIntro: true,  styleIdx: 1, orientation: '9:16'   as const, label: 'Reels',    desc: '9:16 · ~30s',        grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed45: { targetSec: 30, fastIntro: true,  styleIdx: 1, orientation: '4:5'    as const, label: 'Feed 4:5', desc: '4:5 · ~30s',         grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed11: { targetSec: 30, fastIntro: true,  styleIdx: 1, orientation: '1:1'    as const, label: 'Feed 1:1', desc: '1:1 · ~30s',         grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  epico:  { targetSec: 60, fastIntro: false, styleIdx: 0, orientation: '9:16'   as const, label: 'Epico',    desc: '9:16 · disteso',      grading: 'contrast(1.05) saturate(1.18) brightness(1.02)' },
  snappy: { targetSec: 15, fastIntro: true,  styleIdx: 1, orientation: '9:16'   as const, label: 'Snappy',   desc: '9:16 · corto e teso', grading: 'contrast(1.12) saturate(1.38) brightness(1.04)' },
} as const


const VIDEO_DIMS: Record<string, [number, number]> = {
  '9:16':   [1080, 1920],
  '4:5':    [1080, 1350],
  '1:1':    [1080, 1080],
  '1.91:1': [1080,  566],
  '16:9':   [1920, 1080],
}

// Overpass returns POIs with no cap (a route near villages/refuges can return 50-100+), and
// baking one GPU texture per POI in the video stalled rendering — cap to the most notable ones.
const MAX_VIDEO_POIS = 15
// Sotto questa distanza lungo il percorso due foto sono lo stesso momento e finiscono nella stessa
// sosta — vedi groupPhotoTimings.
const PHOTO_GROUP_GAP_M = 250
const POI_NOTABILITY_TIER: Record<PoiType, 0|1|2> = {
  peak: 0, hut: 0, bivouac: 0, pass: 0, viewpoint: 0,
  waterfall: 1, cave: 1, shelter: 1, ruins: 1, castle: 1, archaeological: 1, cross: 1, monument: 1, chapel: 1, tower: 1, bridge: 1,
  spring: 2, fountain: 2, picnic: 2, bench: 2,
}

// ── Types ──────────────────────────────────────────────────────────────────────

type VideoState = 'idle' | 'config' | 'preparing' | 'rendering' | 'finalizing' | 'done'

/** Massimo/minimo di una serie numerica SENZA lo spread `Math.max(...arr)`.
 *
 *  Lo spread passa un argomento per elemento: su una traccia GPS lunga (un'escursione registrata a
 *  un punto al secondo arriva tranquillamente a decine di migliaia di punti) supera il limite di
 *  argomenti del motore JS e lancia RangeError. Finiva nel `catch` della preparazione video, dove
 *  diventava il messaggio generico "riprova con meno foto/POI" — che mandava a cercare il problema
 *  esattamente dalla parte sbagliata, visto che dipendeva dalla LUNGHEZZA della traccia e non dalle
 *  foto. Costa anche molto meno quando serve ad ogni fotogramma. */
function seriesMax(arr: ArrayLike<number>): number {
  let m = -Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]
  return m === -Infinity ? 0 : m
}
function seriesMin(arr: ArrayLike<number>): number {
  let m = Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]
  return m === Infinity ? 0 : m
}

/** Annullamento chiesto dall'utente durante la preparazione: non è un errore e non deve mostrare
 *  nessun messaggio di fallimento. */
class PrepAborted extends Error {}

/**
 * Traduce l'eccezione della preparazione video in qualcosa che l'utente possa davvero usare.
 *
 * Prima qui c'era un unico messaggio ("riprova con meno foto/POI o riduci la durata") per QUALSIASI
 * eccezione, e l'oggetto `err` veniva scartato senza nemmeno un log: in produzione il guasto era
 * quindi indistinguibile — memoria esaurita, codec non supportato dal browser, modulo di codifica
 * non scaricato, tutti mostravano lo stesso consiglio, giusto in un caso su quattro.
 */
function prepErrorMessage(stage: string, err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  const msg  = String((err as { message?: string } | null)?.message ?? err ?? '')
  const both = `${name} ${msg}`
  if (/ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(both))
    return 'Non è stato possibile scaricare il modulo di codifica video. Controlla la connessione e ricarica la pagina.'
  if (name === 'NotSupportedError' || /codec|not supported|unsupported/i.test(both))
    return 'Questo browser non riesce a codificare un video a questa risoluzione. Prova un altro formato (o un altro browser).'
  if (name === 'SecurityError')
    return 'Una delle immagini non è utilizzabile nel video: il browser ne blocca la lettura. Prova a escluderla dal passo "Foto".'
  if (name === 'QuotaExceededError' || name === 'RangeError' || /out of memory|allocation (failed|size)/i.test(both))
    return 'Memoria insufficiente per un video così ricco. Riduci la durata, le foto, oppure passa a 30 fps.'
  return `Errore durante la preparazione del video (${stage}). Riprova con meno foto/POI o riduci la durata.`
}

// Passi del wizard video. L'ordine segue la TIMELINE del video stesso (apertura → viaggio → foto →
// rifiniture) dopo la scelta tecnica iniziale del formato: chi lo compila ripercorre mentalmente il
// filmato dall'inizio alla fine, invece di saltare tra impostazioni scollegate.
// Il passo "Apertura" conteneva UNA casella e una nota che ripeteva la casella: un passo intero da
// attraversare per una scelta sola. L'intro rapida è una questione di ritmo e ora sta nel passo
// "Percorso", accanto alla durata — che è la stessa domanda posta da un altro lato.
const WIZARD_STEPS = [
  { id: 'formato',  title: 'Formato',  sub: 'Dove pubblicherai il video' },
  { id: 'percorso', title: 'Percorso', sub: 'Il viaggio: ritmo, inquadrature, durata' },
  { id: 'foto',     title: 'Foto',     sub: 'Le tue foto lungo il tracciato' },
  { id: 'effetti',  title: 'Effetti',  sub: 'Dati a schermo e tocchi scenici' },
  { id: 'genera',   title: 'Genera',   sub: 'Controlla il riepilogo e avvia' },
] as const
type VideoPreset = 'reels' | 'feed45' | 'feed11' | 'epico' | 'snappy' | 'custom'
type BearingMode = 'follow' | 'orbit-cw' | 'orbit-ccw' | 'side-left' | 'side-right' | 'overhead'
type PlacingStep = 'pos'

interface ShotSegment {
  id: string; label: string; startP: number; endP: number
  pitch: [number, number]; zoom: [number, number]
  bearingMode: BearingMode; orbitDeg?: number
}


// ── Cinematic shot planner ─────────────────────────────────────────────────────

function planShots(pts: TrackPoint[], zIn = 10.5, zFoll = 13.8): ShotSegment[] {
  const N=pts.length; if(N<2) return []
  const shots:ShotSegment[]=[]
  shots.push({id:'intro',label:'Intro aereo',startP:0,endP:0.08,pitch:[20,48],zoom:[zIn,zFoll],bearingMode:'follow'})
  shots.push({id:'follow',label:'Seguimento',startP:0.08,endP:1.0,pitch:[48,48],zoom:[zFoll,zFoll],bearingMode:'follow'})
  return shots
}

function shotCamera(shot: ShotSegment, routeBearing: number, p: number, orbitBaseRef: React.MutableRefObject<number>): {pitch:number;zoom:number;bearing:number} {
  const tc=Math.max(0,Math.min(1,(p-shot.startP)/(shot.endP-shot.startP)))
  const pitch=lerp(shot.pitch[0],shot.pitch[1],tc), zoom=lerp(shot.zoom[0],shot.zoom[1],tc)
  let bearing=routeBearing
  switch(shot.bearingMode){
    case 'orbit-cw':  bearing=orbitBaseRef.current+tc*(shot.orbitDeg??90); break
    case 'orbit-ccw': bearing=orbitBaseRef.current-tc*(shot.orbitDeg??90); break
    case 'side-left': bearing=routeBearing-90; break
    case 'side-right':bearing=routeBearing+90; break
  }
  return {pitch,zoom,bearing:(bearing+360)%360}
}

// ── EXIF GPS parser ────────────────────────────────────────────────────────────

// ── Progressive route reveal helpers ──────────────────────────────────────────

/** Le quattro tinte selezionabili per il tracciato. Non una tavolozza libera: quattro tinte scelte
 *  per restare leggibili sopra un satellitare (dove il verde scuro sparisce nella vegetazione e il
 *  blu nell'acqua), tutte sature abbastanza da reggere la compressione di Reels e TikTok, che
 *  impasta per prime le tinte tenui. L'arancione resta il default — è quello con cui i video sono
 *  stati fatti finora. */
export type RouteColorKey = 'verde' | 'arancione' | 'blu' | 'rosso'

export const ROUTE_COLORS: Record<RouteColorKey, { label: string; hex: string }> = {
  verde:     { label: 'Verde',     hex: '#22c55e' },
  arancione: { label: 'Arancione', hex: '#f97316' },
  blu:       { label: 'Blu',       hex: '#38bdf8' },
  rosso:     { label: 'Rosso',     hex: '#ef4444' },
}

const DEFAULT_ROUTE_COLOR: RouteColorKey = 'arancione'

/** Alone attorno al tracciato: una linea larga e sfocata sotto quella piena, dello stesso colore.
 *  Serve a staccare il percorso dal terreno anche dove ci passa sopra qualcosa di simile per tinta
 *  (un sentiero già disegnato nella mappa, una radura chiara, la neve) — su un satellitare la sola
 *  linea piena a volte si perde. Volutamente discreto: non deve leggersi come un effetto. */
const GLOW_WIDTH_MULT = 3.4
const GLOW_BLUR = 10
const GLOW_OPACITY = 0.42

function applyRouteGlowLayer(
  map: MLMap, id: string, source: string, beforeId: string | undefined,
  colorHex: string, baseWidth: number, enabled: boolean,
) {
  try {
    if (!enabled) {
      if (map.getLayer(id)) map.removeLayer(id)
      return
    }
    if (!map.getLayer(id)) {
      map.addLayer({
        id, type: 'line', source,
        paint: {
          'line-color': colorHex, 'line-width': baseWidth * GLOW_WIDTH_MULT,
          'line-blur': GLOW_BLUR, 'line-opacity': GLOW_OPACITY,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, beforeId && map.getLayer(beforeId) ? beforeId : undefined)
    } else {
      map.setPaintProperty(id, 'line-color', colorHex)
    }
  } catch {}
}

// ── Luce del sole coerente con l'ora ──────────────────────────────────────────

/**
 * Ombreggiatura del rilievo calcolata dal DEM già caricato per il terreno 3D, illuminata dalla
 * direzione in cui il sole stava davvero durante l'escursione.
 *
 * `hillshade-illumination-anchor: 'map'` è la parte che conta: con l'ancoraggio predefinito
 * ('viewport') la luce è agganciata allo schermo e ruota insieme alla telecamera — le ombre
 * girerebbero mentre il volo cambia direzione, che è esattamente il contrario di un sole fermo nel
 * cielo. Ancorata alla mappa, la luce resta dov'è e a girare è solo chi guarda.
 *
 * Sotto ai layer del percorso: è illuminazione del terreno, non un elemento da leggere.
 */
function setupSunHillshade(map: MLMap) {
  if (map.getLayer('sun-hillshade')) return
  const under = ['vision-topo', 'route-glow', 'route-casing', 'route-line'].find(id => map.getLayer(id))
  try {
    map.addLayer({
      id: 'sun-hillshade', type: 'hillshade', source: 'terrain',
      paint: {
        'hillshade-illumination-anchor': 'map',
        'hillshade-illumination-direction': 315,
        'hillshade-exaggeration': 0,
      },
    } as never, under)
  } catch {}
}

/**
 * Applica la luce al terreno e al cielo. Quantizzata al grado e memorizzata: MapLibre ricalcola lo
 * stile a ogni setPaintProperty anche quando il valore non cambia, e questo verrebbe chiamato
 * sessanta volte al secondo per un sole che in tutta l'escursione si sposta di qualche decina di
 * gradi.
 */
function applySunLook(map: MLMap, look: TerrainSunLook, cache: Map<string, number | string>) {
  const set = (layer: string, prop: string, v: number | string) => {
    if (!map.getLayer(layer)) return
    const k = `${layer}:${prop}`
    if (cache.get(k) === v) return
    try { map.setPaintProperty(layer, prop, v as never); cache.set(k, v) } catch {}
  }
  const dir = Math.round(look.illuminationDirection)
  set('sun-hillshade', 'hillshade-illumination-direction', dir)
  set('sun-hillshade', 'hillshade-exaggeration', Math.round(look.exaggeration * 100) / 100)
  set('sun-hillshade', 'hillshade-highlight-color', look.highlightColor)
  set('sun-hillshade', 'hillshade-shadow-color', look.shadowColor)
  set('sun-hillshade', 'hillshade-accent-color', look.accentColor)
  // Il cielo segue lo stesso sole: la foschia si accende dalla parte giusta dell'orizzonte, che è
  // ciò che rende credibile l'ombreggiatura del terreno invece di farla sembrare un filtro.
  const polar = Math.round(look.skyPolar)
  const skyKey = `sky:${dir}:${polar}`
  if (cache.get('sky') !== skyKey && map.getLayer('sky')) {
    try {
      map.setPaintProperty('sky', 'sky-atmosphere-sun', [dir, polar] as never)
      cache.set('sky', skyKey)
    } catch {}
  }
}

/** Spegne l'ombreggiatura senza rimuovere il layer: rimontarlo a ogni cambio costerebbe di più. */
function clearSunLook(map: MLMap, cache: Map<string, number | string>) {
  if (!map.getLayer('sun-hillshade')) return
  if (cache.get('sun-hillshade:hillshade-exaggeration') === 0) return
  try { map.setPaintProperty('sun-hillshade', 'hillshade-exaggeration', 0); cache.set('sun-hillshade:hillshade-exaggeration', 0) } catch {}
}

// ── Stacco "Visione": velo topografico e linee affioranti ─────────────────────

/** Tinte delle linee che affiorano: le stesse di VISION_CATEGORY_COLOR, così una linea sulla mappa
 *  e l'etichetta che la nomina si leggono come la stessa cosa. */
const VISION_WATER_COLOR = '#38bdf8'
const VISION_TRAIL_COLOR = '#fbbf24'

/**
 * Prepara (una volta) i tre layer della Visione, tutti a opacità zero: il velo topografico e le due
 * famiglie di linee. Restano invisibili per tutto il video e si accendono solo durante lo stacco.
 *
 * Aggiunti sotto al tracciato (`beforeId`) di proposito: il percorso dell'utente deve restare
 * l'elemento in primo piano anche mentre la mappa si riempie di contesto.
 */
function setupVisionLayers(map: MLMap, lines: VisionSourceLine[], veil: boolean) {
  const under = ['route-glow', 'route-casing', 'route-line'].find(id => map.getLayer(id))
  try {
    if (veil) {
      if (!map.getSource('vision-topo-src')) {
        map.addSource('vision-topo-src', {
          type: 'raster', tiles: [maptilerRasterTileUrl('outdoor')], tileSize: 256,
        } as never)
      }
      if (!map.getLayer('vision-topo')) {
        map.addLayer({ id: 'vision-topo', type: 'raster', source: 'vision-topo-src',
          paint: { 'raster-opacity': 0 } } as never, under)
      }
    } else if (map.getLayer('vision-topo')) {
      map.removeLayer('vision-topo')
    }
  } catch {}

  const toFeature = (l: VisionSourceLine) => ({
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates: l.geometry.map(([la, lo]) => [lo, la]) },
    properties: { name: l.name },
  })
  const groups: [string, string, VisionSourceLine['kind']][] = [
    ['vision-water', VISION_WATER_COLOR, 'waterway'],
    ['vision-trails', VISION_TRAIL_COLOR, 'trail'],
  ]
  for (const [id, color, kind] of groups) {
    const data = { type: 'FeatureCollection' as const, features: lines.filter(l => l.kind === kind).map(toFeature) }
    try {
      const src = map.getSource(`${id}-src`) as { setData?: (d: unknown) => void } | undefined
      if (src?.setData) src.setData(data)
      else map.addSource(`${id}-src`, { type: 'geojson', data } as never)
      if (!map.getLayer(id)) {
        map.addLayer({
          id, type: 'line', source: `${id}-src`,
          paint: {
            'line-color': color, 'line-width': kind === 'waterway' ? 3.2 : 2.4,
            'line-opacity': 0,
            ...(kind === 'trail' ? { 'line-dasharray': [2, 1.6] } : {}),
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        } as never, under)
      }
    } catch {}
  }
}

/** Opacità dei tre layer durante lo stacco. Chiamata a ogni fotogramma della Visione (e una volta
 *  a zero quando finisce), quindi tiene una cache dell'ultimo valore: setPaintProperty forza un
 *  ricalcolo dello stile anche quando il valore non cambia. */
function setVisionLayerOpacity(map: MLMap, k: number, cache: Map<string, number>) {
  const set = (id: string, prop: string, v: number) => {
    if (!map.getLayer(id)) return
    const ck = `${id}:${prop}`
    if (cache.get(ck) === v) return
    try { map.setPaintProperty(id, prop, v); cache.set(ck, v) } catch {}
  }
  // Il velo si ferma sotto la piena opacità: il satellitare deve restare riconoscibile sotto, è
  // metà del senso di questo stacco. A opacità piena tanto varrebbe cambiare mappa.
  set('vision-topo', 'raster-opacity', k * 0.72)
  set('vision-water', 'line-opacity', k * 0.95)
  set('vision-trails', 'line-opacity', k * 0.9)
}

function setupRouteReveal(map: MLMap, pts: TrackPoint[], colorHex: string, glow: boolean) {
  if(map.getSource('route-traveled')) return
  map.addSource('route-traveled',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[pts[0].lon!,pts[0].lat!]]},properties:{}}})
  applyRouteGlowLayer(map,'route-traveled-glow','route-traveled',undefined,colorHex,5,glow)
  map.addLayer({id:'route-traveled',type:'line',source:'route-traveled',paint:{'line-color':colorHex,'line-width':5,'line-opacity':0.9},layout:{'line-cap':'round','line-join':'round'}})
  try{map.setPaintProperty('route-line','line-opacity',0.22)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.18)}catch{}
  // L'alone del percorso ancora da percorrere si spegne durante il rivelamento: resterebbe acceso
  // sopra tutto il tracciato, annullando proprio la distinzione fra fatto e da fare.
  try{if(map.getLayer('route-glow'))map.setPaintProperty('route-glow','line-opacity',GLOW_OPACITY*0.25)}catch{}
}

function cleanupRouteReveal(map: MLMap) {
  try{if(map.getLayer('route-traveled'))map.removeLayer('route-traveled')}catch{}
  try{if(map.getLayer('route-traveled-glow'))map.removeLayer('route-traveled-glow')}catch{}
  try{if(map.getSource('route-traveled'))map.removeSource('route-traveled')}catch{}
  try{map.setPaintProperty('route-line','line-opacity',1)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.55)}catch{}
  try{if(map.getLayer('route-glow'))map.setPaintProperty('route-glow','line-opacity',GLOW_OPACITY)}catch{}
}


// BearingPicker removed — orientation is now set directly on the map

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  trackPoints: TrackPoint[]
  title?: string
  onClose: () => void
  plannedDate?: string
  plannedTrackPoints?: TrackPoint[]
  activityId?: string
  distanceMeters?: number
  elevationGain?: number
  pois?: PoiItem[]
  initialVideoState?: 'idle' | 'config'
  dtmProfile?: TrailDtmProfile
  /** Punteggio TEI già calcolato (activity.linkedBeautyScore) — usato dalla modalità Illustrativo. */
  beautyScore?: BeautyScore
  /** POI abbinati alla loro pagina Wikipedia (immagine + estratto). Solo i POI che hanno
   *  un'immagine finiscono nelle schede del video: un nome e un'icona non raccontano niente che
   *  il segnaposto sulla mappa non dica già. */
  poiWiki?: { poi: PoiItem; wiki: WikiPage }[]
  /** Guida del percorso conservata sull'attività (lib/activitySave.ts). Assente sulle escursioni
   *  mai pianificate e su quelle salvate prima di quella colonna: la modalità Illustrativo deve
   *  funzionare comunque, semplicemente senza didascalie né stacchi che dipendono dal testo. */
  guide?: { text: string; notices?: (GuideNotice | string)[]; generatedAt?: string }
}

// ── Zoom sulla foto in sosta (anteprima DOM) ─────────────────────────────────────
// Controparte HTML/CSS di drawStopPhotoZoom (sopra) per l'anteprima interattiva — stessa logica di
// timing (stopPhotoZoomAt, lib/videoPhotoCarousel.ts), resa con dimensioni CSS invece che su
// canvas. La mappa MapLibre sotto non viene ridimensionata: la telecamera è già centrata sulle
// coordinate della foto durante la sosta, quindi questo overlay cresce/si richiude dal centro
// schermo, esattamente come nel video esportato.
function PhotoZoomOverlay({ photo, zoomT, stopT }: { photo: RoutePhoto | null; zoomT: number; stopT: number }) {
  if (!photo || zoomT <= 0.001) return null
  const PAD_FRAC = 0.05, CAP_FRAC = 0.22
  const pinPx = 70
  const peakW = `min(82vw, calc(72vh / ${1 + CAP_FRAC}))`
  const cardW = `calc(${pinPx}px + (${peakW} - ${pinPx}px) * ${zoomT})`
  const cardH = `calc(${cardW} * ${1 + CAP_FRAC})`
  const pad = `calc(${cardW} * ${PAD_FRAC})`
  const radius = Math.max(2, 8 * zoomT)
  const breathe = zoomT > 0.995 ? Math.sin(stopT * Math.PI * 2.4) * 0.8 : 0
  const showCaption = !!photo.caption && zoomT > 0.55
  const capAlpha = showCaption ? Math.min(1, (zoomT - 0.55) / 0.25) : 0
  const scrimAlpha = Math.min(0.4, zoomT * 0.45)
  // Stessa rotazione del canvas export: ruota MENTRE si apre (proporzionale a zoomT), non fissa
  // dall'inizio — una polaroid che si assesta invece di comparire già storta.
  const rotDeg = polaroidRotationDeg(photo.id) * zoomT
  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
      {zoomT > 0.02 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${scrimAlpha})` }} />}
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: cardW, height: cardH,
          transform: `translate(calc(-50% + ${breathe}vw), -50%) rotate(${rotDeg}deg)`,
          background: '#fffdf4',
          borderRadius: `${radius}px`,
          boxShadow: `0 ${6 * zoomT}px ${14 * zoomT}px rgba(0,0,0,${0.35 * zoomT})`,
        }}
      >
        <div
          className="absolute overflow-hidden"
          style={{ left: pad, top: pad, right: pad, height: `calc(${cardW} * ${1 - 2 * PAD_FRAC})`, borderRadius: `${radius * 0.4}px` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="w-full h-full object-cover" draggable={false} />
        </div>
        {showCaption && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center px-2 overflow-hidden"
            style={{ height: `calc(${cardW} * ${CAP_FRAC + PAD_FRAC})`, opacity: capAlpha }}
          >
            <p className="text-[#2c1a0e] italic text-center truncate" style={{ fontFamily: 'Georgia,serif', fontSize: `calc(${cardW} * 0.058)` }}>
              {photo.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RouteMap3D({ trackPoints, title, onClose, plannedDate, plannedTrackPoints, activityId, distanceMeters: distanceProp, elevationGain: elevGainProp, pois, initialVideoState, dtmProfile, beautyScore, poiWiki, guide }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<MLMap | null>(null)
  const markerRef      = useRef<Marker | null>(null)
  const animRef        = useRef<number>(0)
  const progressRef    = useRef(0)
  const lastTsRef      = useRef(0)
  const isPlayingRef   = useRef(false)
  // Stato del "viaggio tra una foto e l'altra" nell'anteprima carosello (previewingCarousel) — vedi
  // lib/videoPhotoCarousel.ts buildJourneyTables per l'equivalente pre-calcolato usato dall'export.
  const carouselTraveledMRef  = useRef(0)     // metri percorsi dall'inizio, solo quando si viaggia
  const carouselNextPhotoRef  = useRef(0)     // indice della prossima foto su cui fermarsi
  const carouselStopUntilRef  = useRef<number | null>(null)  // timestamp (ms) di fine sosta, null = in viaggio
  const gpsRef         = useRef<TrackPoint[]>([])
  const totalDistRef   = useRef(0)
  const exaggRef       = useRef(1.5)
  const handleScrubRef = useRef<(p: number) => void>(() => {})
  const elevStatsRef   = useRef({ gain: 0, altMax: 0 })

  // Video refs
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const videoChunksRef     = useRef<Blob[]>([])
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoObjUrlRef     = useRef<string | null>(null)
  const orbitBaseRef       = useRef(0)
  const frameCountRef      = useRef(0)
  const renderAbortRef     = useRef(false)
  const renderedFramesRef  = useRef(0)
  const encodedFramesRef   = useRef(0)
  // Avoids calling setPaintProperty every single frame when the opacity value hasn't
  // actually changed since the last frame — redundant calls force unnecessary style
  // recalc/repaint work on every tick, adding to GPU pressure during export.
  const lastIconOpacityRef = useRef<Map<string, number>>(new Map())
  // WebCodecs path refs
  const videoEncoderRef  = useRef<any>(null)
  const muxerRef         = useRef<any>(null)
  const muxerTargetRef   = useRef<any>(null)
  const photoPinCleanupRef = useRef<(() => void) | null>(null)
  const poiPinCleanupRef   = useRef<(() => void) | null>(null)
  const finalizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const webglLostCleanupRef = useRef<(() => void) | null>(null)

  // Smooth camera refs (exponential interpolation)
  const smoothBearRef  = useRef(0)
  const smoothPitchRef = useRef(65)
  const smoothZoomRef  = useRef(14)

  // Face image
  const faceImgRef   = useRef<HTMLImageElement | null>(null)
  const photoImgsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const photoMarkersRef = useRef<Map<string, import('maplibre-gl').Marker>>(new Map())

  // POI markers/popups (interactive view) + proximity auto-popup bookkeeping
  const poiMarkersRef     = useRef<Map<number, Marker>>(new Map())
  const poiPopupsRef      = useRef<Map<number, Popup>>(new Map())
  const poiTriggeredRef   = useRef<Set<number>>(new Set())
  const poiOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const poiOpenIdRef      = useRef<number | null>(null)

  const [mapReady,       setMapReady]      = useState(false)
  const [isPlaying,      setIsPlaying]     = useState(false)
  const [progress,       setProgress]      = useState(0)
  const [speedIdx,       setSpeedIdx]      = useState(1)
  const [styleIdx,       setStyleIdx]      = useState(0)
  const [exaggeration,   setExaggeration]  = useState(1.5)
  const [currentAlt,     setCurrentAlt]    = useState(0)
  const [coveredKm,      setCoveredKm]     = useState(0)
  const [shareToast,     setShareToast]    = useState('')
  const [showStreetView,     setShowStreetView]    = useState(false)
  const [showPlannedRoute,   setShowPlannedRoute]  = useState(false)
  const [showPois,           setShowPois]          = useState(true)
  const [dtmColorMode,       setDtmColorMode]      = useState<'none' | 'slope' | 'aspect'>('none')
  const [streetViewPos,  setStreetViewPos] = useState<[number,number]|null>(null)

  // Pannello statistiche/altimetria/controlli — trascinabile invece di un blocco fisso sempre
  // aperto, così su mobile la mappa 3D vera e propria resta il protagonista dello schermo invece
  // di essere schiacciata tra HUD in alto e profilo+controlli in basso (stesso pattern di
  // components/navigation/NavBottomSheet.tsx, qui a due sole altezze anziché tre).
  const [sheetExpanded,   setSheetExpanded]   = useState(false)
  const [sheetDragHeight, setSheetDragHeight] = useState<number | null>(null)
  const sheetDragStart = useRef<{ y: number; height: number } | null>(null)

  // Video config
  const [videoState,        setVideoState]       = useState<VideoState>(initialVideoState ?? 'idle')
  const [videoStep,         setVideoStep]        = useState(0)   // passo corrente del wizard, vedi WIZARD_STEPS
  // Velocità del cursore lungo il tracciato, in km di percorso per secondo di video: è QUESTO il
  // parametro che si imposta. La durata del video non si sceglie più, è la somma delle parti —
  // vedi lib/videoBudget.ts. Il valore iniziale si adatta al percorso (effetto più sotto): fisso
  // sarebbe assurdo su un giro da 25 km tanto quanto su uno da 2.
  const [videoSpeedKmS,     setVideoSpeedKmS]    = useState(0.35)
  const speedInitedRef = useRef<string | null>(null)
  const [videoOrientation,  setVideoOrientation] = useState<'9:16'|'4:5'|'1:1'|'1.91:1'|'16:9'>('9:16')
  const [videoFps,          setVideoFps]         = useState<30|60>(30)
  const [coverPhotoId,      setCoverPhotoId]      = useState<string|null>(null)
  const [videoShowTitle,    setVideoShowTitle]   = useState(true)
  const [videoShowStats,    setVideoShowStats]   = useState(true)
  const [videoShowProgress, setVideoShowProgress]= useState(true)
  const [videoShowPois,     setVideoShowPois]    = useState(false)
  const [videoRecordedBlob, setVideoRecordedBlob]= useState<Blob | null>(null)
  // Se l'ultimo render completato era un'anteprima veloce (solo una finestra di fotogrammi centrale
  // al percorso) invece del video intero — cambia il testo della schermata "pronto" di conseguenza.
  const [lastRenderWasPreview, setLastRenderWasPreview] = useState(false)
  const [lastRenderSeconds, setLastRenderSeconds] = useState(0)
  const [renderProgress,    setRenderProgress]   = useState(0)
  const [renderFrame,       setRenderFrame]      = useState(0)
  const [renderTotal,       setRenderTotal]      = useState(0)
  const [finalizeElapsedSec,setFinalizeElapsedSec]= useState(0)
  // Fase di preparazione (prima che il primo fotogramma venga disegnato): la mappa deve caricare il
  // terreno lungo tutto il percorso, e sono una ventina di attese in fila. Senza queste due
  // variabili il wizard restava immobile per tutto il tempo e sembrava che il pulsante non avesse
  // fatto nulla — la mappa si muoveva sullo sfondo, ma niente lo spiegava.
  const [prepLabel,         setPrepLabel]        = useState('')
  const [prepProgress,      setPrepProgress]     = useState(0)
  /** Motivo dell'ultimo tentativo fallito, mostrato nel wizard finché non si riprova. */
  const [videoError,        setVideoError]       = useState('')
  /** Generazione sospesa perché l'app è finita in secondo piano — vedi runWhenVisible. */
  const [renderPaused,      setRenderPaused]     = useState(false)
  /** Disiscrive l'attesa di ritorno in primo piano, se ce n'è una in corso. */
  const visibilityWaiterRef = useRef<(() => void) | null>(null)
  /** Ultima fase raggiunta: serve al messaggio d'errore, che senza saperlo può solo tirare a indovinare. */
  const prepStageRef = useRef('avvio')
  const [entertainIdx,      setEntertainIdx]      = useState(0)
  const [videoPreset,       setVideoPreset]      = useState<VideoPreset>('custom')
  const [photoDurationSec,  setPhotoDurationSec] = useState(3.0)
  // Stile "Carosello" (Sezione 4): la telecamera si ferma davvero su ogni foto già presente sul
  // percorso, che si apre da pin a quasi schermo intero e poi si richiude — vedi
  // lib/videoPhotoCarousel.ts. Default 'classic' per non cambiare il comportamento di chi non
  // tocca questa opzione.
  const [videoPhotoStyle,   setVideoPhotoStyle]  = useState<'classic'|'carousel'>('classic')
  // Effetto "hyperlapse" opzionale sui tratti di viaggio più lunghi (stile Carosello) — un leggero
  // sdoppiamento della mappa a scala crescente e opacità calante, per dare energia ai tratti dove
  // il viaggio dura davvero — vedi lib/videoPhotoCarousel.ts hyperlapseIntensityAt. Default off:
  // effetto stilistico, non tutti lo vogliono.
  const [videoHyperlapseEnabled, setVideoHyperlapseEnabled] = useState(false)
  // Pin dell'utente a schermo. Spegnendolo si spengono anche tutti gli effetti che gli sono
  // appesi (cuore, colore fatica, scia, ombra): esistono solo in funzione del pin, e lasciarli
  // accesi con il pin spento significherebbe un cuore che pulsa sopra il vuoto. Vedi
  // setShowUserPin più sotto, che li azzera in un colpo solo.
  const [videoShowUserPin, setVideoShowUserPin] = useState(true)
  // Modalità del video. "ricordo" = il filmato della TUA uscita (il pin, la fatica, le tue foto).
  // "illustrativo" = il percorso che si presenta: niente pin, niente dati personali, in primo piano
  // i luoghi e i punteggi oggettivi. Cambia il soggetto, quindi cambia anche cosa ha senso mostrare.
  const [videoMode, setVideoMode] = useState<'ricordo'|'illustrativo'>('ricordo')
  // Anche i luoghi fragili (grotte, siti archeologici, rovine, sorgenti) nelle schede POI. Spento di
  // proposito: un video illustrativo è fatto per far arrivare gente, ed è così che certi posti si
  // rovinano. Restano comunque come segnaposto sulla mappa, solo senza nome a schermo.
  const [videoPoiIncludeSensitive, setVideoPoiIncludeSensitive] = useState(false)
  // Solo i luoghi con un'immagine Wikipedia prendono una scheda. Acceso di default: una scheda
  // fatta di nome e icona non aggiunge nulla al segnaposto già presente sulla mappa.
  const [videoPoiRequireImage, setVideoPoiRequireImage] = useState(true)
  // Stacchi che spezzano il volo sul percorso — vedi lib/videoInterludes.ts.
  const [videoInterludes, setVideoInterludes] = useState<InterludeSetting[]>(DEFAULT_INTERLUDES)
  // Luce del terreno calcolata dalla posizione reale del sole all'ora dell'escursione, che avanza
  // insieme al cursore: all'inizio del video il sole sta dov'era alla partenza, alla fine dov'era
  // all'arrivo. Su un'uscita che comincia all'alba e finisce nel pomeriggio la luce gira davvero.
  const [videoSunLightEnabled, setVideoSunLightEnabled] = useState(true)
  // Categorie annotate dallo stacco "Visione" — vedi lib/videoVision.ts.
  const [visionCategories, setVisionCategories] = useState<VisionCategory[]>(DEFAULT_VISION_CATEGORIES)
  // Velo topografico durante la Visione: le tile dello stile outdoor sfumate sopra il satellitare.
  // Serve a far comparire ciò che la vegetazione nasconde (impluvi, curve di livello, sentieri
  // già mappati) senza rinunciare al satellitare, che è quello che rende il video bello.
  const [visionTopoVeil, setVisionTopoVeil] = useState(true)
  // Corsi d'acqua e sentieri con geometria per il bbox del percorso (/api/route-features).
  // Scaricati una volta all'apertura del wizard, non a ogni generazione.
  const [visionLines, setVisionLines] = useState<VisionSourceLine[]>([])

  /** Punti con coordinate valide, direttamente dalla prop.
   *
   *  NON `gps.current`: quel ref è dichiarato più in basso nel corpo del componente, e leggerlo da
   *  un useMemo — che gira DURANTE il render, a differenza di un useEffect — cade nella zona morta
   *  temporale della const e fa esplodere l'intera pagina con "Cannot access ... before
   *  initialization". Vale per qualunque cosa qui sopra: durante il render si possono leggere solo
   *  binding già dichiarati sopra di sé. */
  const visionRoutePoints = useMemo(
    () => trackPoints.filter(t => t.lat != null && t.lon != null),
    [trackPoints],
  )

  // Scarica corsi d'acqua e sentieri una sola volta, e solo quando il wizard video è aperto: chi
  // apre la mappa 3D per guardarla non deve pagare una chiamata Overpass che non userà.
  useEffect(() => {
    if (videoState !== 'config') return
    if (visionRoutePoints.length < 2) return
    let cancelled = false
    const lats = visionRoutePoints.map(p => p.lat!), lons = visionRoutePoints.map(p => p.lon!)
    const pad = 0.01
    const bbox = [Math.min(...lats) - pad, Math.min(...lons) - pad, Math.max(...lats) + pad, Math.max(...lons) + pad].join(',')
    fetch(`/api/route-features?bbox=${bbox}`)
      .then(r => r.ok ? r.json() : { lines: [] })
      .then((d: { lines?: VisionSourceLine[] }) => { if (!cancelled) setVisionLines(d.lines ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [videoState, visionRoutePoints])

  /** Le cose che la Visione annoterà davvero, già filtrate e ordinate — vedi lib/videoVision.ts.
   *  Calcolate qui (non al momento della generazione) perché il wizard deve poterle mostrare in
   *  anteprima e ricavarne la durata consigliata dello stacco. */
  const visionFeatures = useMemo<VisionFeature[]>(() => {
    if (visionRoutePoints.length < 2) return []
    const route = visionRoutePoints.map(p => [p.lat!, p.lon!] as [number, number])
    return selectVisionFeatures(
      route, visionLines,
      (pois ?? []).map(p => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, type: p.type, distFromTrack: p.distFromTrack })),
      visionCategories, MAX_VISION_CALLOUTS,
    )
  }, [visionRoutePoints, visionLines, pois, visionCategories])

  /** Finestra oraria vera dell'escursione, dai tempi registrati nella traccia.
   *
   *  Senza orari (percorso pianificato mai camminato, o traccia senza tempi) si ricade sulla data
   *  prevista alle 10 del mattino: è un'ipotesi dichiarata, non un dato — ma dà comunque una luce
   *  plausibile per la stagione e la latitudine, che è meglio dell'illuminazione di default fissa
   *  a nord-ovest indipendente da tutto. */
  const hikeTimeWindow = useMemo(() => {
    const withTime = (trackPoints ?? []).filter(t => t.time)
    const first = withTime[0]?.time ? new Date(withTime[0].time).getTime() : NaN
    const last = withTime[withTime.length - 1]?.time ? new Date(withTime[withTime.length - 1].time).getTime() : NaN
    if (Number.isFinite(first) && Number.isFinite(last) && last > first) return { start: first, end: last, real: true }
    const base = plannedDate ? new Date(plannedDate) : new Date()
    base.setHours(10, 0, 0, 0)
    return { start: base.getTime(), end: base.getTime() + 3 * 3600_000, real: false }
  }, [trackPoints, plannedDate])

  const sunLightRef = useRef(videoSunLightEnabled)
  sunLightRef.current = videoSunLightEnabled
  const hikeTimeWindowRef = useRef(hikeTimeWindow)
  hikeTimeWindowRef.current = hikeTimeWindow
  /** Ultimo valore scritto per ogni proprietà di luce — vedi applySunLook. */
  const sunLookCache = useRef(new Map<string, number | string>())

  // Anche fuori dalla generazione: la mappa interattiva mostra la stessa luce, così quello che si
  // vede nell'anteprima è quello che finirà nel video.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      setupSunHillshade(map)
      if (!videoSunLightEnabled) { clearSunLook(map, sunLookCache.current); return }
      if (!visionRoutePoints.length) return
      const mid = visionRoutePoints[Math.floor(visionRoutePoints.length / 2)]
      const look = terrainSunLook(getSunPosition(mid.lat!, mid.lon!, new Date(hikeTimeWindow.start)))
      applySunLook(map, look, sunLookCache.current)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [videoSunLightEnabled, hikeTimeWindow, visionRoutePoints])

  // Stessa ragione di routeColorRef: setupLayers gira dentro una callback registrata una volta e
  // leggerebbe il valore congelato al momento della registrazione.
  const visionLinesRef = useRef(visionLines)
  visionLinesRef.current = visionLines
  const visionVeilRef = useRef(visionTopoVeil)
  visionVeilRef.current = visionTopoVeil
  const visionFeaturesRef = useRef(visionFeatures)
  visionFeaturesRef.current = visionFeatures
  /** Ultimo valore scritto per ogni proprietà dei layer Visione — vedi setVisionLayerOpacity. */
  const visionOpacityCache = useRef(new Map<string, number>())
  /** Telecamera al primo fotogramma della Visione — origine e destinazione del rientro. */
  const visionStartCamRef = useRef<{ zoom: number; pitch: number; bearing: number; lon: number; lat: number } | null>(null)

  // Le linee arrivano dopo che la mappa è già in piedi: vanno versate nei layer quando atterrano,
  // altrimenti la Visione accenderebbe dei layer vuoti.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => setupVisionLayers(map, visionLines, visionTopoVeil)
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [visionLines, visionTopoVeil])
  // Chiusura ad anello: il finale torna all'inquadratura d'apertura invece di restare sul nero.
  // Reels e TikTok riavvolgono da soli, e nero→mappa è uno stacco che rompe il ciclo.
  const [videoLoopEnding, setVideoLoopEnding] = useState(true)
  // Tinta del tracciato (vedi ROUTE_COLORS) e alone attorno ad esso. L'alone è acceso di default:
  // costa nulla in resa e risolve il caso in cui il percorso si confonde con quello che ha sotto.
  const [routeColorKey, setRouteColorKey] = useState<RouteColorKey>(DEFAULT_ROUTE_COLOR)
  const [routeGlowEnabled, setRouteGlowEnabled] = useState(true)
  const routeColorHex = ROUTE_COLORS[routeColorKey].hex
  // Ref accanto allo state: i layer della mappa e il ciclo di render dei fotogrammi girano dentro
  // callback registrate una volta sola, che sullo state leggerebbero il valore congelato al
  // momento della registrazione — stesso motivo di exaggRef/gpsRef qui sopra.
  const routeColorRef = useRef(routeColorHex)
  routeColorRef.current = routeColorHex
  const routeGlowRef = useRef(routeGlowEnabled)
  routeGlowRef.current = routeGlowEnabled

  // Applica tinta e alone ai layer già in mappa quando l'utente li cambia dal wizard: senza, la
  // scelta si vedrebbe solo nel video generato e non nell'anteprima che si ha davanti.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      try { if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', routeColorHex) } catch {}
      try { if (map.getLayer('route-traveled')) map.setPaintProperty('route-traveled', 'line-color', routeColorHex) } catch {}
      applyRouteGlowLayer(map, 'route-glow', 'route', 'route-casing', routeColorHex, 4, routeGlowEnabled)
      if (map.getSource('route-traveled')) {
        applyRouteGlowLayer(map, 'route-traveled-glow', 'route-traveled', 'route-traveled', routeColorHex, 5, routeGlowEnabled)
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [routeColorHex, routeGlowEnabled])
  // Quote lungo il percorso: sostituiscono il grafico altimetrico, che a schermo piccolo e in
  // movimento non si leggeva. Numeri fermi nei punti che contano (vetta, punto più basso, salite
  // decise), con la freccia della pendenza.
  const [videoElevMarkersEnabled, setVideoElevMarkersEnabled] = useState(false)
  // Didascalie proposte dal testo della guida. Sono CANDIDATI modificabili, non un testo definitivo:
  // il testo della guida lo scrive un modello, e niente dovrebbe finire in un file destinato a
  // circolare senza che qualcuno l'abbia letto — vedi lib/videoCaptions.ts.
  const [videoCaptions, setVideoCaptions] = useState<CaptionCandidate[]>([])
  useEffect(() => { setVideoCaptions(suggestCaptions(guide?.text)) }, [guide?.text])
  // Gettone 3D a forma di cuore che pulsa al ritmo vero della FC, con i BPM correnti sopra —
  // entrambi gli stili video, richiede dati di frequenza cardiaca.
  const [videoHeartEffectEnabled, setVideoHeartEffectEnabled] = useState(false)
  // Colorazione del pin (gettone e foto insieme) in base alla fatica: celeste a riposo → verde →
  // ambra → rosso al massimo sforzo, sulla scala della FC di QUESTA uscita — vedi hrEffortAt.
  // Indipendente dal cuore: si può volere il pin che reagisce senza il cuore a schermo, o viceversa.
  const [videoPinEffortColorEnabled, setVideoPinEffortColorEnabled] = useState(false)
  // Scoppio di stelline al momento dell'arrivo finale del percorso (fase finale, non ad ogni foto).
  const [videoArrivalStarsEnabled, setVideoArrivalStarsEnabled] = useState(false)
  // Traguardi 25/50/75%: il numero sale dal punto del percorso toccato dal pin — vedi
  // drawRouteMilestone. Non si attiva durante una sosta su foto (verrebbe coperto dalla polaroid).
  const [videoMilestonesEnabled, setVideoMilestonesEnabled] = useState(false)
  // Scia che sfuma dietro al pin, lunga in proporzione alla velocità: rende leggibile il ritmo.
  const [videoTrailEnabled, setVideoTrailEnabled] = useState(false)
  // Tacche delle foto sulla barra di avanzamento, con lampo al passaggio del pin.
  const [videoPhotoMarksEnabled, setVideoPhotoMarksEnabled] = useState(false)
  // Cifre a rullo (contachilometri) per km e quota invece di numeri che scattano.
  const [videoOdometerEnabled, setVideoOdometerEnabled] = useState(false)
  // Momento "vetta conquistata" nel punto più alto: lampo, raggi e quota in grande.
  const [videoPeakMomentEnabled, setVideoPeakMomentEnabled] = useState(false)
  // Ombra del pin che si allunga e si inclina con la pendenza corrente.
  const [videoSlopeShadowEnabled, setVideoSlopeShadowEnabled] = useState(false)
  // Mini-mappa d'insieme in un angolo, con il tracciato intero e il punto di avanzamento.
  const [videoMiniMapEnabled, setVideoMiniMapEnabled] = useState(false)
  // Anteprima dal vivo del carosello (schermata Montaggio) — sostituisce temporaneamente il foglio
  // impostazioni con la mappa a schermo pieno, usando lo stesso tick() di anteprima già presente
  // per lo scrub del percorso fuori dal wizard video.
  const [previewingCarousel, setPreviewingCarousel] = useState(false)
  // Foto attualmente in sosta (con il suo avanzamento di zoom 0..1) nell'anteprima carosello — vedi
  // PhotoZoomOverlay più sotto e lib/videoPhotoCarousel.ts stopPhotoZoomAt.
  const [previewPhotoZoom, setPreviewPhotoZoom] = useState<{ photo: RoutePhoto | null; zoomT: number; stopT: number }>({ photo: null, zoomT: 0, stopT: 0 })
  // Ritmo d'ingresso: quanto dura il volo aereo iniziale prima che parta il percorso.
  // (I "ganci" testuali/fotografici che precedevano l'intro sono stati rimossi: nella pratica
  // rubavano il primo secondo senza aggiungere informazione, e il racconto ora è affidato alle
  // didascalie dalla guida e agli stacchi lungo il percorso.)
  const [videoHookFastIntro,        setVideoHookFastIntro]        = useState(true)
  const [zoomIntro,         setZoomIntro]        = useState(10.5)
  const [zoomFollow,        setZoomFollow]        = useState(13.8)
  const [zoomOutro,         setZoomOutro]         = useState(7.5)
  const [captionData,    setCaptionData]    = useState<{caption:string;hashtags:string}|null>(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [captionCopied,  setCaptionCopied]  = useState(false)

  // Post-production
  const [shotPlan,        setShotPlan]       = useState<ShotSegment[]>([])
  const [routePhotos,     setRoutePhotos]    = useState<RoutePhoto[]>([])
  // Foto in attesa di conferma di eliminazione — vedi il bottone a due tempi nell'elenco foto.
  const [pendingDeletePhotoId, setPendingDeletePhotoId] = useState<string|null>(null)
  // Foto escluse dal video (di default nessuna, cioè tutte incluse) — non persistito: è una
  // preferenza per-generazione, come videoPreset/videoSpeedKmS/ecc., non un dato della foto stessa.
  const [videoExcludedPhotoIds, setVideoExcludedPhotoIds] = useState<Set<string>>(new Set())
  const togglePhotoIncluded = (id: string) => setVideoExcludedPhotoIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const [placingPhoto,    setPlacingPhoto]   = useState<{id:string;step:PlacingStep}|null>(null)
  const placingPhotoRef = useRef<{id:string;step:PlacingStep}|null>(null)
  useEffect(()=>{ placingPhotoRef.current=placingPhoto },[placingPhoto])
  const [photoBeingAdded, setPhotoBeingAdded]= useState(false)

  // Screen Wake Lock: sullo schermo del telefono che si spegne durante il rendering, il
  // browser sospende il rendering WebGL/requestAnimationFrame — il video resta a metà finché
  // l'utente non riaccende lo schermo. Chiave su videoState (non su un punto specifico dentro
  // startRecording) così UN SOLO effetto copre tutti i percorsi di uscita (fine normale,
  // errore, annullamento): qualunque cosa porti fuori dagli stati attivi fa scattare
  // il cleanup dell'effetto, che rilascia il lock — niente da duplicare in ogni handler.
  // Copre anche 'preparing': la preparazione è una ventina di attese sulla mappa in fila, e uno
  // schermo che si spegne lì dentro si porta via il lavoro esattamente come durante il rendering.
  useEffect(() => {
    if (videoState !== 'preparing' && videoState !== 'rendering' && videoState !== 'finalizing') return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let active = true
    const acquire = () => {
      navigator.wakeLock.request('screen')
        .then(s => { if (!active) { s.release().catch(() => {}); return } sentinel = s })
        .catch(() => {}) // negato/non supportato in questo contesto: degrado silenzioso, non blocca il rendering
    }
    acquire()
    // Il lock viene rilasciato automaticamente dal browser quando il documento diventa
    // "hidden" (cambio app, non spegnimento schermo) — se poi torna visibile mentre siamo
    // ancora in rendering, va richiesto di nuovo.
    const onVisibility = () => { if (document.visibilityState === 'visible' && !sentinel) acquire() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
    }
  }, [videoState])

  // Chiudere o ricaricare la pagina durante la generazione butta via tutto: il video vive solo in
  // memoria fino a quando il muxer non ha finito, e non c'è modo di riprenderlo da dove era. Il
  // browser mostra la sua richiesta di conferma standard (il testo lo decide lui, non noi).
  useEffect(() => {
    if (videoState !== 'preparing' && videoState !== 'rendering' && videoState !== 'finalizing') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [videoState])

  // Contenuti della schermata di attesa durante il rendering: alcuni fatti calcolati sul
  // percorso corrente (così sono sempre pertinenti, non generici) mescolati a qualche
  // suggerimento sull'app — niente chiamate AI, solo dati già disponibili lato client.
  const entertainmentContent = useMemo(() => {
    const km = +((distanceProp ?? totalDistRef.current) / 1000).toFixed(1)
    const gain = Math.round(elevGainProp ?? elevStatsRef.current.gain)
    const alt = elevStatsRef.current.altMax
    const poiCount = pois?.length ?? 0
    const photoCount = routePhotos.filter(p => !videoExcludedPhotoIds.has(p.id)).length
    const facts: string[] = []
    if (km > 0) facts.push(`🥾 Hai percorso ${km} km — circa ${Math.round(km * 1300).toLocaleString('it-IT')} passi.`)
    if (gain > 60) facts.push(`⛰️ ${gain} m di dislivello: più di ${Math.max(1, Math.round(gain / 93))}× la Torre di Pisa.`)
    if (alt > 0) facts.push(`🏔️ Punto più alto toccato: ${alt} m.`)
    if (poiCount > 0) facts.push(`📍 ${poiCount} punti di interesse individuati lungo il percorso.`)
    if (photoCount > 0) facts.push(`📸 ${photoCount} ${photoCount === 1 ? 'foto entrerà' : 'foto entreranno'} nel video.`)
    const tips = [
      '💡 Nella mappa 3D puoi colorare il percorso per pendenza o esposizione (icona strati).',
      '⚙️ Ogni fotogramma viene composto direttamente sul tuo telefono, senza passare da un server.',
      '🎬 Il preset "Epico" applica una color grading pensata per il trekking in montagna.',
      '☑️ Puoi scegliere quali foto includere nel video con la spunta sulla galleria, prima di generare.',
      '🔋 Tienilo a schermo acceso: lo schermo spento mette in pausa il rendering.',
    ]
    return [...facts, ...tips]
  }, [distanceProp, elevGainProp, pois, routePhotos, videoExcludedPhotoIds])

  useEffect(() => {
    if (videoState !== 'preparing' && videoState !== 'rendering' && videoState !== 'finalizing') { setEntertainIdx(0); return }
    const id = setInterval(() => setEntertainIdx(i => (i + 1) % Math.max(1, entertainmentContent.length)), 4200)
    return () => clearInterval(id)
  }, [videoState, entertainmentContent.length])

  // Load persisted photos from the server on mount (migra automaticamente da localStorage se serve)
  useEffect(() => {
    if (!activityId) return
    fetchActivityPhotos(activityId).then(photos => {
      photos.forEach(photo => {
        const img = new Image()
        img.crossOrigin = 'anonymous' // required so canvas drawImage/toBlob don't taint on the remote Storage URL
        img.onload = () => { photoImgsRef.current.set(photo.id, img) }
        img.src = photo.url
      })
      setRoutePhotos(photos)
    }).catch(() => {
      setShareToast('Errore: impossibile caricare le foto del percorso')
      setTimeout(() => setShareToast(''), 3000)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gps = useRef(trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined))

  const hasBodyData = useMemo(() => {
    const pts=gps.current
    return pts.some(p=>(p.heartRateBpm??0)>0)||(pts.length>1&&pts.some(p=>!!p.time))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const altitudeSeries = useMemo(() => {
    const pts=gps.current; if(!pts.some(p=>p.altitudeMeters!==undefined)) return []
    const N=pts.length, S=Math.min(300,N), step=(N-1)/(S-1)
    return Array.from({length:S},(_,i)=>pts[Math.min(Math.round(i*step),N-1)].altitudeMeters??0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Distanza reale cumulata lungo il tracciato (non la frazione di progresso, che con punti GPS
  // diradati in alcuni tratti non è proporzionale alla distanza vera) — base dello stile Carosello
  // per il "viaggio tra una foto e l'altra" (lib/videoPhotoCarousel.ts).
  const cumDist = useMemo(() => buildCumulativeDistances(gps.current), []) // eslint-disable-line react-hooks/exhaustive-deps
  const totalDistanceM = cumDist.length ? cumDist[cumDist.length - 1] : 0

  // Timing condiviso da tick() (sosta+viaggio in anteprima) e dal render offline in goToRendering —
  // stessa forma { id, progress, distanceM }, non liste filtrate/ordinate indipendentemente.
  const carouselPhotoTimings = useMemo<CarouselPhotoTiming[]>(
    () => routePhotos
      .filter(p => !videoExcludedPhotoIds.has(p.id))
      .map(p => ({ id: p.id, progress: p.progress, distanceM: progressToDistanceM(p.progress, cumDist) }))
      .sort((a, b) => a.progress - b.progress),
    [routePhotos, videoExcludedPhotoIds, cumDist],
  )

  // Durata REALE del video, non quella dello slider. Lo slider imposta solo il ritmo del percorso:
  // soste foto, stacchi, intro e finale si aggiungono, e con qualche foto il totale arriva al
  // doppio. Chi imposta 30s si aspetta 30s, quindi il numero vero va mostrato dov'è la manopola.
  // Un'unica fonte per lo slider, il riepilogo e gli avvisi, così non possono divergere.
  /**
   * Quali stacchi (fra quelli accesi ora) troveranno davvero un varco nel montaggio, con la durata
   * e le foto attuali — la stessa domanda che planInterludes si pone in fase di generazione, posta
   * qui in anteprima.
   *
   * Nasce da un difetto reale: uno stacco acceso può restare fuori dal video senza che nulla lo
   * segnali — planInterludes lo scarta in silenzio quando non trova un intervallo abbastanza
   * lungo e libero da foto, e prima di questo controllo l'utente lo scopriva solo guardando il
   * video finito, senza sapere il perché. Qui si rifà lo stesso calcolo (stessa formula di
   * ROUTE_FRAMES/photoBusyFrames vista in goToRendering) sui dati correnti del wizard, così il
   * wizard può dirlo PRIMA di generare — e dire anche perché: quasi sempre sono le foto a occupare
   * lo spazio, la causa più comune e meno intuitiva da collegare all'effetto.
   */
  const interludeFitPreview = useMemo(() => {
    const fps = videoFps
    const photoReveal = Math.round(fps * photoDurationSec)
    const isCarouselPreview = videoPhotoStyle === 'carousel'
    const sorted = [...routePhotos].filter(ph => !videoExcludedPhotoIds.has(ph.id)).sort((a, b) => a.progress - b.progress)
    const stops = groupPhotoTimings(
      sorted.map(ph => ({ id: ph.id, progress: ph.progress, distanceM: progressToDistanceM(ph.progress, cumDist) })),
      PHOTO_GROUP_GAP_M,
    )
    // La velocità è ora il parametro primario: i metri al secondo del cursore SONO la velocità
    // scelta, non più un valore ricavato da una durata bersaglio.
    const cruiseMps = videoSpeedKmS * 1000
    const journey = isCarouselPreview
      ? buildJourneyTables(fps, cumDist, totalDistanceM, stops, photoDurationSec, cruiseMps)
      : null
    const routeFrames = journey
      ? journey.totalFrames
      : Math.round(fps * Math.max(MIN_ROUTE_SEC, (totalDistanceM / 1000) / clampSpeed(videoSpeedKmS)))
    const triggerFrames = isCarouselPreview ? [] : stops.map(g => Math.round(g.progress * routeFrames))
    const photoFrames = isCarouselPreview && journey
      ? stops.map((_, i) => {
          let start = -1, end = -1
          for (let f = 0; f < routeFrames; f++) { if (journey.stopIndexTable[f] === i) { if (start < 0) start = f; end = f + 1 } }
          return start >= 0 ? { start, end } : null
        }).filter((x): x is { start: number; end: number } => !!x)
      : triggerFrames.map(at => ({ start: at, end: at + photoReveal }))

    const isIllustrativoPreview = videoMode === 'illustrativo'
    const settingsForMode = isIllustrativoPreview ? videoInterludes : videoInterludes.filter(i => i.kind === 'visione')
    const planned = planInterludes(settingsForMode, {
      fps, routeFrames, photoFrames, breathFrames: Math.round(fps * 4),
      available: (kind) => {
        switch (kind) {
          case 'tei':     return !!beautyScore?.categories?.length
          case 'avvisi':  return normalizeGuideNotices(guide?.notices).length > 0
          case 'luoghi':  return (pois?.length ?? 0) > 0
          case 'profilo': return altitudeSeries.length > 1
          case 'visione': return visionFeatures.length > 0
          default: return true
        }
      },
    })
    return new Set(planned.map(pl => pl.kind))
  }, [videoFps, photoDurationSec, videoPhotoStyle, routePhotos, videoExcludedPhotoIds, cumDist,
      totalDistanceM, videoSpeedKmS, videoMode, videoInterludes, beautyScore, guide?.notices, pois,
      altitudeSeries, visionFeatures])

  /**
   * Da cosa è fatta la durata del video, voce per voce — vedi lib/videoBudget.ts.
   *
   * Non è più una stima che rincorre uno slider "durata": è il calcolo vero, e il totale che
   * mostra è quello che verrà generato. Le soste si contano per GRUPPO (le foto vicine si aprono
   * insieme) e gli stacchi solo per quelli che troveranno davvero posto nel montaggio — contare
   * quelli accesi ma scartati darebbe un totale più lungo del video reale.
   */
  const videoEstimate = useMemo(() => {
    const stops = groupPhotoTimings(carouselPhotoTimings, PHOTO_GROUP_GAP_M)
    const interludeSec = videoInterludes
      .filter(i => i.enabled && (videoMode === 'illustrativo' || i.kind === 'visione'))
      .filter(i => interludeFitPreview.has(i.kind))
      .reduce((a, i) => a + i.seconds, 0)
    const budget = computeVideoBudget({
      routeDistanceM: totalDistanceM,
      speedKmS: videoSpeedKmS,
      fastIntro: videoHookFastIntro,
      photoStops: stops.length,
      photoStopSec: photoDurationSec,
      interludeSec,
    })
    return {
      ...budget,
      total: Math.round(budget.totalSec),
      stops: stops.length,
      photos: carouselPhotoTimings.length,
      beatSec: interludeSec,
    }
  }, [carouselPhotoTimings, totalDistanceM, photoDurationSec, videoSpeedKmS,
      videoHookFastIntro, videoMode, videoInterludes, interludeFitPreview])

  /** Applica il ritmo di un preset: porta il totale al bersaglio dichiarato risolvendo per la
   *  velocità, con le opzioni accese in questo momento. Se il bersaglio è irraggiungibile (soste e
   *  stacchi da soli lo superano già) si prende la velocità più alta disponibile — il video sarà
   *  più lungo del preset, e il totale in cima lo dice apertamente invece di far finta di niente. */
  const applyPresetPacing = (pr: keyof typeof VIDEO_PRESETS) => {
    const cfg = VIDEO_PRESETS[pr]
    setVideoHookFastIntro(cfg.fastIntro)
    const solved = speedForTargetTotal(cfg.targetSec, {
      routeDistanceM: totalDistanceM,
      fastIntro: cfg.fastIntro,
      photoStops: videoEstimate.stops,
      photoStopSec: photoDurationSec,
      interludeSec: videoEstimate.beatSec,
    })
    setVideoSpeedKmS(solved ?? clampSpeed(Infinity))
  }

  // Velocità iniziale tarata sul percorso: un valore fisso darebbe un video di dieci secondi su un
  // giro da 2 km e di quattro minuti su uno da 25. Si imposta una sola volta per percorso — dopo
  // comanda l'utente, e non va sovrascritta a ogni foto aggiunta o opzione accesa.
  useEffect(() => {
    const key = `${trackPoints.length}:${Math.round(totalDistanceM)}`
    if (speedInitedRef.current === key || totalDistanceM <= 0) return
    speedInitedRef.current = key
    setVideoSpeedKmS(initialSpeedFor(totalDistanceM, 30, { fastIntro: videoHookFastIntro }))
  }, [totalDistanceM, trackPoints.length, videoHookFastIntro])

  const interludeContent = useMemo((): Record<InterludeKind, InterludeContent> => {
    const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
    const notices = normalizeGuideNotices(guide?.notices).slice(0, 3)   // drawNoticesBeat ne mostra 3
    const altMax = altitudeSeries.length ? Math.max(...altitudeSeries.slice(0, 20000)) : 0
    const belt = estimateVegetationBelt(trackPoints[0]?.lat ?? 45, altMax)
    const teiParts = (beautyScore?.categories ?? []).filter(c => c.key.startsWith('v_')).length
    const hasPenalty = (beautyScore?.categories ?? []).some(c => c.key === 'f_antr')
    return {
      numeri:  { items: 4, proseWords: 0 },
      profilo: { items: 2, proseWords: 0 },
      natura:  { items: 2, proseWords: countWords(belt.description) },
      tei:     { items: teiParts + (hasPenalty ? 1 : 0), proseWords: 0 },
      avvisi:  { items: notices.length, proseWords: notices.reduce((a, n) => a + countWords(n.text), 0) },
      // drawPlacesBeat ne mostra al massimo 4, mescolando luoghi notevoli e foto dell'utente
      luoghi:  { items: Math.min(4, Math.min(MAX_VIDEO_POIS, pois?.length ?? 0) + videoEstimate.stops), proseWords: 0 },
      // La Visione dura quanto ci vuole a leggere le etichette che avrà davvero: su un percorso
      // senza corsi d'acqua né bivi mappati sono due, non sei.
      visione: { items: Math.max(1, visionFeatures.length), proseWords: 0 },
    }
  }, [guide?.notices, altitudeSeries, trackPoints, beautyScore, pois, videoEstimate.stops, visionFeatures.length])

  const carouselEstimatedSec = videoPhotoStyle === 'carousel' ? videoEstimate.total : null

  const [weatherBadge, setWeatherBadge] = useState<{emoji:string;temp:number;label:string}|null>(null)

  // Load face photo from profile
  useEffect(() => {
    const face=getProfile().hikerFaceDataUrl; if(!face) return
    const img=new Image(); img.onload=()=>{faceImgRef.current=img}; img.src=face
  }, [])

  useEffect(() => {
    if(!plannedDate) return
    const pts=gps.current; if(!pts.length) return
    const cp=pts[Math.floor(pts.length/2)]; if(!cp.lat||!cp.lon) return
    fetchDayHourly(cp.lat,cp.lon,plannedDate).then(hours=>{
      const noon=hours.find(h=>h.time.slice(11,13)==='12')??hours[Math.floor(hours.length/2)]
      if(noon){const info=wmoInfo(noon.weathercode);setWeatherBadge({emoji:info.emoji,temp:Math.round(noon.temperature),label:info.label})}
    }).catch(()=>{})
  },[plannedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map click listener for photo placement ───────────────────────────────────

  useEffect(() => {
    const map=mapRef.current
    if(!map||!placingPhoto||placingPhoto.step!=='pos') return

    const handler=(e:any)=>{
      const pts=gpsRef.current; if(!pts.length) return
      const {lat,lng}=e.lngLat
      let minD=Infinity, bestIdx=0
      for(let i=0;i<pts.length;i++){const d=distM(pts[i].lat!,pts[i].lon!,lat,lng);if(d<minD){minD=d;bestIdx=i}}
      const prog=bestIdx/(pts.length-1)
      const photoId=placingPhoto.id, nearLat=pts[bestIdx].lat!, nearLon=pts[bestIdx].lon!
      setRoutePhotos(prev=>prev.map(p=>p.id===photoId
        ?{...p,progress:prog,lat:nearLat,lon:nearLon}:p))
      setPlacingPhoto(null)
      updateActivityPhoto(activityId!,photoId,{progress:prog,lat:nearLat,lon:nearLon}).catch(()=>{
        setShareToast('Errore: posizionamento foto non salvato'); setTimeout(()=>setShareToast(''),3000)
      })
    }
    map.on('click',handler)
    return ()=>{map.off('click',handler)}
  },[placingPhoto,activityId])

  // ── Photo markers on map ──────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const pts = gpsRef.current
    // Remove old photo markers
    photoMarkersRef.current.forEach(m => m.remove())
    photoMarkersRef.current.clear()
    // Add new photo markers
    routePhotos.forEach(photo => {
      const idx = Math.min(Math.round(photo.progress*(pts.length-1)), pts.length-1)
      const lon = pts[idx].lon!, lat = pts[idx].lat!
      const el = document.createElement('div')
      el.style.cssText = 'cursor:pointer'
      el.innerHTML = `<div style="position:relative;display:inline-block">
        <div style="width:36px;height:36px;background:white;border-radius:6px;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45);overflow:hidden">
          <img src="${photo.url}" style="width:100%;height:100%;object-fit:cover;display:block"/>
        </div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid white;margin:0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))"></div>
      </div>`
      const marker = new maplibregl.Marker({element:el, anchor:'bottom'}).setLngLat([lon,lat]).addTo(map)
      photoMarkersRef.current.set(photo.id, marker)
    })
    return () => {
      photoMarkersRef.current.forEach(m => m.remove())
      photoMarkersRef.current.clear()
    }
  }, [routePhotos, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── POI markers + popups on map ────────────────────────────────────────────────
  // DOM markers are independent of MapLibre's style/layer tree, so they survive
  // setStyle() / setupLayers() calls (style switcher) without extra handling.

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    poiMarkersRef.current.forEach(m => m.remove())
    poiMarkersRef.current.clear()
    poiPopupsRef.current.clear()
    ;(pois ?? []).forEach(poi => {
      const meta = POI_META[poi.type]
      const el = document.createElement('div')
      el.style.cssText = 'cursor:pointer'
      el.innerHTML = poiBadgeMarkup(poi.type, meta.color, 28, 3)
      el.style.display = showPois ? '' : 'none'
      const popup = new maplibregl.Popup({ maxWidth: '250px', offset: 14 }).setHTML(buildPoiPopupHtml(poi))
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lon, poi.lat]).setPopup(popup).addTo(map)
      poiMarkersRef.current.set(poi.id, marker)
      poiPopupsRef.current.set(poi.id, popup)
    })
    return () => {
      poiMarkersRef.current.forEach(m => m.remove())
      poiMarkersRef.current.clear()
      poiPopupsRef.current.clear()
    }
  }, [pois, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── POI layer visibility toggle ────────────────────────────────────────────────

  useEffect(() => {
    poiMarkersRef.current.forEach(m => { m.getElement().style.display = showPois ? '' : 'none' })
  }, [showPois])

  // ── Layer setup ───────────────────────────────────────────────────────────────

  const setupLayers=useCallback(()=>{
    const map=mapRef.current; if(!map) return
    const pts=gpsRef.current, N=pts.length; if(N<2) return
    if(!map.getSource('terrain'))
      map.addSource('terrain',{type:'raster-dem',url:`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`,tileSize:512})
    map.setTerrain({source:'terrain',exaggeration:exaggRef.current})
    if(!map.getLayer('sky')) try{map.addLayer({id:'sky',type:'sky',paint:{'sky-type':'atmosphere','sky-atmosphere-sun':[0,90],'sky-atmosphere-sun-intensity':15}} as any)}catch{}
    // Niente Z esplicita: con una Z incorporata (altitudine GPS registrata, spesso scostata di
    // decine di metri dal DEM del terreno) MapLibre disegna la linea a quella quota fissa invece
    // di drappeggiarla sul terreno 3D — mentre pin/camera (center) e route-traveled (sotto)
    // seguono sempre il DEM. Risultato: uno scostamento costante fra linea e pin per tutto il
    // percorso, non legato alla pendenza. Con sole [lon,lat] la linea si appoggia al DEM come
    // tutto il resto, stessa fonte di quota ovunque.
    const coords=pts.map(p=>[p.lon!,p.lat!] as [number,number])
    if(map.getSource('route')){(map.getSource('route') as any).setData({type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}})}
    else{map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}}})}
    applyRouteGlowLayer(map,'route-glow','route',undefined,routeColorRef.current,4,routeGlowRef.current)
    if(!map.getLayer('route-casing')) map.addLayer({id:'route-casing',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.55},layout:{'line-cap':'round','line-join':'round'}})
    if(!map.getLayer('route-line'))   map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':routeColorRef.current,'line-width':4},layout:{'line-cap':'round','line-join':'round'}})
    // Layer della Visione, invisibili finché non parte lo stacco — vedi setupVisionLayers.
    setupVisionLayers(map, visionLinesRef.current, visionVeilRef.current)
    setupSunHillshade(map)
    const i0=Math.min(Math.floor(progressRef.current*(N-1)),N-1)
    markerRef.current?.setLngLat([pts[i0].lon!,pts[i0].lat!])
  },[])

  // ── Map initialization ────────────────────────────────────────────────────────

  useEffect(()=>{
    const pts=gps.current; if(!containerRef.current||pts.length<2) return
    gpsRef.current=pts
    let cum=0,gain=0,altMax=pts[0].altitudeMeters??0
    for(let i=1;i<pts.length;i++){
      cum+=distM(pts[i-1].lat!,pts[i-1].lon!,pts[i].lat!,pts[i].lon!)
      const d=(pts[i].altitudeMeters??0)-(pts[i-1].altitudeMeters??0)
      if(d>0) gain+=d; if((pts[i].altitudeMeters??0)>altMax) altMax=pts[i].altitudeMeters??0
    }
    totalDistRef.current=cum; elevStatsRef.current={gain:Math.round(gain),altMax:Math.round(altMax)}
    setCurrentAlt(pts[0].altitudeMeters??0)
    let minLon=pts[0].lon!,maxLon=pts[0].lon!,minLat=pts[0].lat!,maxLat=pts[0].lat!
    for(const p of pts){if(p.lon!<minLon)minLon=p.lon!;if(p.lon!>maxLon)maxLon=p.lon!;if(p.lat!<minLat)minLat=p.lat!;if(p.lat!>maxLat)maxLat=p.lat!}
    const map=new (maplibregl.Map as any)({container:containerRef.current!,style:STYLES[0].url(),
      center:[(minLon+maxLon)/2,(minLat+maxLat)/2],zoom:11,pitch:55,bearing:0,antialias:true,preserveDrawingBuffer:true}) as MLMap
    mapRef.current=map

    map.on('load',()=>{
      setupLayers()
      const mkEl=(c:string)=>{const el=document.createElement('div');el.style.cssText=`width:14px;height:14px;border-radius:50%;background:${c};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)`;return el}
      new maplibregl.Marker({element:mkEl('#22c55e')}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      new maplibregl.Marker({element:mkEl('#ef4444')}).setLngLat([pts[pts.length-1].lon!,pts[pts.length-1].lat!]).addTo(map)

      // Map pin marker (with face photo if available in profile)
      const { hikerFaceDataUrl } = getProfile()
      const el=document.createElement('div')
      el.style.cssText='width:32px;height:44px;cursor:default'
      const ts=Date.now()
      el.innerHTML=`<svg viewBox="0 0 32 44" width="32" height="44" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pg${ts}" cx="38%" cy="28%">
            <stop offset="0%" stop-color="#93c5fd"/>
            <stop offset="100%" stop-color="#1d4ed8"/>
          </radialGradient>
          <clipPath id="fc${ts}"><circle cx="16" cy="13.5" r="12"/></clipPath>
        </defs>
        <filter id="ds"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.45"/></filter>
        <path d="M16 0C7.2 0 0 7.2 0 16c0 11 13.5 26.5 16 28 2.5-1.5 16-17 16-28C32 7.2 24.8 0 16 0z" fill="url(#pg${ts})" filter="url(#ds)"/>
        <circle cx="16" cy="13.5" r="13.5" fill="none" stroke="white" stroke-width="2.5"/>
        ${hikerFaceDataUrl
          ? `<image href="${hikerFaceDataUrl}" x="4" y="1" width="24" height="24" clip-path="url(#fc${ts})"/>`
          : `<circle cx="16" cy="11.5" r="3.8" fill="rgba(255,255,255,0.88)"/>
             <path d="M9.5 21.5 Q16 17 22.5 21.5" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="1.8" stroke-linecap="round"/>`
        }
      </svg>`
      const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([pts[0].lon!,pts[0].lat!]).addTo(map)
      markerRef.current=marker

      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:72,pitch:58,duration:2200})

      const onRouteClick=(e:any)=>{
        // use ref — closure captures stale state
        if(placingPhotoRef.current) return
        const g=gpsRef.current; if(g.length<2) return
        const {lat,lng}=e.lngLat; let minD=Infinity,bestIdx=0
        for(let i=0;i<g.length;i++){const d=distM(g[i].lat!,g[i].lon!,lat,lng);if(d<minD){minD=d;bestIdx=i}}
        handleScrubRef.current(bestIdx/(g.length-1))
      }
      map.on('click','route-casing',onRouteClick); map.on('click','route-line',onRouteClick)
      map.on('mouseenter','route-casing',()=>{map.getCanvas().style.cursor='pointer'})
      map.on('mouseleave','route-casing',()=>{map.getCanvas().style.cursor=''})
      setMapReady(true)
    })
    map.on('style.load',()=>{setupLayers();setMapReady(true)})

    return ()=>{
      renderAbortRef.current=true
      cancelAnimationFrame(animRef.current)
      visibilityWaiterRef.current?.()
      isPlayingRef.current=false
      if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
      try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
      if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
      try { webglLostCleanupRef.current?.() } catch {}
      muxerRef.current=null; muxerTargetRef.current=null
      if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
      map.remove(); mapRef.current=null; markerRef.current=null
    }
  },[setupLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{exaggRef.current=exaggeration;const map=mapRef.current;if(!map||!mapReady) return;try{map.setTerrain({source:'terrain',exaggeration})}catch{}},[exaggeration,mapReady])

  // ── Planned route overlay layer ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !plannedTrackPoints?.length) return
    const coords = plannedTrackPoints
      .filter(p => p.lat && p.lon)
      .map(p => [p.lon!, p.lat!] as [number, number])
    if (coords.length < 2) return
    const data = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} }
    if (map.getSource('planned-route')) {
      ;(map.getSource('planned-route') as any).setData(data)
    } else {
      map.addSource('planned-route', { type: 'geojson', data })
      map.addLayer({
        id: 'planned-route-line',
        type: 'line',
        source: 'planned-route',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: { 'line-color': '#a855f7', 'line-width': 3, 'line-dasharray': [2, 3], 'line-opacity': 0.9 },
      }, 'route-casing')
    }
  }, [mapReady, plannedTrackPoints])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    try { map.setLayoutProperty('planned-route-line', 'visibility', showPlannedRoute ? 'visible' : 'none') } catch {}
  }, [showPlannedRoute, mapReady])

  // ── DTM slope/aspect colored route overlay ─────────────────────────────────────
  // One short LineString per consecutive pair of dtmProfile.points (already ~15m apart along
  // the trail) with both colorSlope/colorAspect precomputed — a single source/layer with a
  // data-driven paint expression, not one addLayer() per segment. Only built when real DTM
  // data is present; route-line (the fixed-color default) remains the "Nessuno" fallback.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || dtmProfile?.source !== 'dtm' || dtmProfile.points.length < 2) return
    const pts = dtmProfile.points
    const features = []
    for (let i = 0; i < pts.length - 1; i++) {
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[pts[i].lon, pts[i].lat], [pts[i + 1].lon, pts[i + 1].lat]] },
        properties: { colorSlope: slopeDegToColor(pts[i].slopeDeg), colorAspect: aspectDegToColor(pts[i].aspectDeg) },
      })
    }
    const data = { type: 'FeatureCollection' as const, features }
    if (map.getSource('route-colored')) {
      ;(map.getSource('route-colored') as any).setData(data)
    } else {
      map.addSource('route-colored', { type: 'geojson', data })
      map.addLayer({
        id: 'route-colored',
        type: 'line',
        source: 'route-colored',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: { 'line-color': ['get', 'colorSlope'], 'line-width': 5 },
      })
    }
  }, [mapReady, dtmProfile])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('route-colored')) return
    try {
      if (dtmColorMode === 'none') {
        map.setLayoutProperty('route-colored', 'visibility', 'none')
        map.setLayoutProperty('route-line', 'visibility', 'visible')
      } else {
        map.setPaintProperty('route-colored', 'line-color', ['get', dtmColorMode === 'slope' ? 'colorSlope' : 'colorAspect'])
        map.setLayoutProperty('route-colored', 'visibility', 'visible')
        map.setLayoutProperty('route-line', 'visibility', 'none')
      }
    } catch {}
  }, [dtmColorMode, mapReady])

  const switchStyle=useCallback((i:number)=>{setStyleIdx(i);setMapReady(false);mapRef.current?.setStyle(STYLES[i].url())},[])

  // ── Normal preview animation ──────────────────────────────────────────────────

  useEffect(()=>{
    isPlayingRef.current=isPlaying
    if(!isPlaying){cancelAnimationFrame(animRef.current);return}
    lastTsRef.current=0
    const pts=gpsRef.current, N=pts.length, totalKm=totalDistRef.current/1000
    const tick=(ts:number)=>{
      if(!isPlayingRef.current) return
      const dt=lastTsRef.current?ts-lastTsRef.current:16; lastTsRef.current=ts
      let stoppedPhotoIdx: number | null = null, stopTVal = 0
      if (previewingCarousel) {
        // "Viaggio tra una foto e l'altra" (Sezione 4): sosta vera su ogni foto, poi viaggio verso
        // la successiva a ritmo costante rispetto alla distanza REALE — stessa idea (in forma
        // pre-calcolata) di buildJourneyTables, usata dal render offline. Stato in carouselStopUntilRef/
        // carouselTraveledMRef/carouselNextPhotoRef, azzerati dal pulsante "Anteprima carosello".
        if (carouselStopUntilRef.current !== null) {
          const stopMs = photoDurationSec * 1000
          const remaining = carouselStopUntilRef.current - ts
          if (remaining <= 0) { carouselStopUntilRef.current = null }
          else { stopTVal = 1 - remaining / stopMs; stoppedPhotoIdx = carouselNextPhotoRef.current - 1 }
        } else {
          const cruiseMps = videoSpeedKmS * 1000
          carouselTraveledMRef.current += cruiseMps * dt / 1000
          const nextPhoto = carouselPhotoTimings[carouselNextPhotoRef.current]
          if (nextPhoto && carouselTraveledMRef.current >= nextPhoto.distanceM) {
            carouselTraveledMRef.current = nextPhoto.distanceM
            progressRef.current = nextPhoto.progress
            carouselStopUntilRef.current = ts + photoDurationSec * 1000
            carouselNextPhotoRef.current += 1
          } else {
            progressRef.current = Math.min(1, distanceMToProgress(carouselTraveledMRef.current, cumDist))
          }
        }
      } else {
        progressRef.current=Math.min(1,progressRef.current+(dt*SPEEDS[speedIdx].v)/90000)
      }
      setProgress(progressRef.current)
      const rawIdx=progressRef.current*(N-1),i0=Math.floor(rawIdx),i1=Math.min(i0+1,N-1),frac=rawIdx-i0
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac, lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac
      markerRef.current?.setLngLat([lon,lat])
      setCurrentAlt(Math.round(alt)); setCoveredKm(+(progressRef.current*totalKm).toFixed(1))
      const li=Math.min(i0+Math.max(3,Math.round(N*0.015)),N-1)
      const bear=bearingDeg(lat,lon,pts[li].lat!,pts[li].lon!)
      // Niente più zoom telecamera sul percorso in prossimità di una foto (Sezione 4): è la foto
      // stessa che ora si ingrandisce a coprire lo schermo, vedi PhotoZoomOverlay più sotto.
      mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:180})
      if (previewingCarousel) {
        const zoomT = stoppedPhotoIdx !== null ? stopPhotoZoomAt(stopTVal) : 0
        const timing = stoppedPhotoIdx !== null ? carouselPhotoTimings[stoppedPhotoIdx] : null
        const photo = timing ? (routePhotos.find(rp => rp.id === timing.id) ?? null) : null
        setPreviewPhotoZoom({ photo, zoomT, stopT: stopTVal })
        const markerEl = markerRef.current?.getElement()
        if (markerEl) markerEl.style.opacity = String(1 - zoomT)
      }
      // Proximity auto-popup: open the popup of a nearby POI for ~1.5s, only one at a time
      if(showPois&&pois?.length){
        const PROXIMITY_M=40
        for(const poi of pois){
          const d=distM(lat,lon,poi.lat,poi.lon)
          if(d<=PROXIMITY_M){
            if(!poiTriggeredRef.current.has(poi.id)){
              poiTriggeredRef.current.add(poi.id)
              if(poiOpenIdRef.current!==null&&poiOpenIdRef.current!==poi.id){
                poiPopupsRef.current.get(poiOpenIdRef.current)?.remove()
              }
              if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current)}
              const popup=poiPopupsRef.current.get(poi.id), marker=poiMarkersRef.current.get(poi.id)
              if(popup&&marker&&mapRef.current){
                popup.setLngLat(marker.getLngLat()).addTo(mapRef.current)
                poiOpenIdRef.current=poi.id
                poiOpenTimeoutRef.current=setTimeout(()=>{
                  popup.remove(); poiOpenIdRef.current=null; poiOpenTimeoutRef.current=null
                },1500)
              }
            }
          } else {
            poiTriggeredRef.current.delete(poi.id)
          }
        }
      }
      if(progressRef.current<1){animRef.current=requestAnimationFrame(tick)}else{setIsPlaying(false)}
    }
    animRef.current=requestAnimationFrame(tick)
    return()=>{
      cancelAnimationFrame(animRef.current)
      if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current);poiOpenTimeoutRef.current=null}
    }
  },[isPlaying,speedIdx,showPois,pois,previewingCarousel,carouselPhotoTimings,cumDist,totalDistanceM,videoSpeedKmS,photoDurationSec,routePhotos])

  const reset=useCallback(()=>{
    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; progressRef.current=0
    poiTriggeredRef.current.clear()
    if(poiOpenTimeoutRef.current){clearTimeout(poiOpenTimeoutRef.current);poiOpenTimeoutRef.current=null}
    if(poiOpenIdRef.current!==null){poiPopupsRef.current.get(poiOpenIdRef.current)?.remove();poiOpenIdRef.current=null}
    setProgress(0);setIsPlaying(false)
    const pts=gpsRef.current; if(!pts.length) return
    markerRef.current?.setLngLat([pts[0].lon!,pts[0].lat!])
    setCurrentAlt(pts[0].altitudeMeters??0); setCoveredKm(0)
    let minLon=pts[0].lon!,maxLon=pts[0].lon!,minLat=pts[0].lat!,maxLat=pts[0].lat!
    for(const p of pts){if(p.lon!<minLon)minLon=p.lon!;if(p.lon!>maxLon)maxLon=p.lon!;if(p.lat!<minLat)minLat=p.lat!;if(p.lat!>maxLat)maxLat=p.lat!}
    mapRef.current?.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:72,pitch:58,duration:1200})
  },[])

  const handlePlay=()=>{if(progressRef.current>=1)reset();setIsPlaying(v=>!v)}

  const SHEET_COLLAPSED_PX = 118
  const sheetHeightFor = (expanded: boolean): number => {
    if (typeof window === 'undefined') return SHEET_COLLAPSED_PX
    return expanded ? Math.round(window.innerHeight * 0.6) : SHEET_COLLAPSED_PX
  }
  const clampSheetHeight = (v: number): number => {
    if (typeof window === 'undefined') return v
    return Math.min(Math.max(v, SHEET_COLLAPSED_PX), window.innerHeight * 0.85)
  }
  const handleSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    sheetDragStart.current = { y: e.clientY, height: sheetHeightFor(sheetExpanded) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleSheetPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheetDragStart.current) return
    const delta = sheetDragStart.current.y - e.clientY
    setSheetDragHeight(clampSheetHeight(sheetDragStart.current.height + delta))
  }
  const handleSheetPointerUp = () => {
    if (!sheetDragStart.current) return
    const current = sheetDragHeight ?? sheetHeightFor(sheetExpanded)
    const collapsedH = sheetHeightFor(false), expandedH = sheetHeightFor(true)
    setSheetExpanded(Math.abs(current - expandedH) < Math.abs(current - collapsedH))
    setSheetDragHeight(null)
    sheetDragStart.current = null
  }
  const sheetCurrentHeight = sheetDragHeight ?? sheetHeightFor(sheetExpanded)

  const handleCapture=useCallback(async()=>{
    const map=mapRef.current; if(!map) return
    const dU=map.getCanvas().toDataURL('image/png'), blob=await(await fetch(dU)).blob()
    const file=new File([blob],`dtrek-3d-${Date.now()}.png`,{type:'image/png'})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso 3D',text:'DTrek — Vista 3D',files:[file]});return}catch{}
    }
    const a=document.createElement('a');a.href=dU;a.download=`dtrek-3d-${Date.now()}.png`;a.click()
    setShareToast('Screenshot salvato!');setTimeout(()=>setShareToast(''),2500)
  },[title])

  const handleStreetViewHere=useCallback(()=>{
    const pts=gpsRef.current; if(!pts.length) return
    const i0=Math.min(Math.floor(progressRef.current*(pts.length-1)),pts.length-1)
    setStreetViewPos([pts[i0].lat!,pts[i0].lon!]);setShowStreetView(true)
  },[])

  const handleScrub=useCallback((p:number)=>{
    const pts=gpsRef.current; if(!pts.length) return
    if(isPlayingRef.current){isPlayingRef.current=false;setIsPlaying(false);cancelAnimationFrame(animRef.current)}
    progressRef.current=p;setProgress(p)
    const rawIdx=p*(pts.length-1),i0=Math.min(Math.floor(rawIdx),pts.length-1),i1=Math.min(i0+1,pts.length-1),frac=rawIdx-i0
    const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac, lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
    const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac
    markerRef.current?.setLngLat([lon,lat]);setCurrentAlt(Math.round(alt));setCoveredKm(+(p*totalDistRef.current/1000).toFixed(1))
    const li=Math.min(i0+Math.max(3,Math.round(pts.length*0.015)),pts.length-1)
    const bear=bearingDeg(lat,lon,pts[li].lat!,pts[li].lon!)
    mapRef.current?.easeTo({center:[lon,lat],bearing:bear,pitch:68,zoom:14.5,duration:300})
  },[]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{handleScrubRef.current=handleScrub},[handleScrub])

  // ── Photo upload ──────────────────────────────────────────────────────────────

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files=Array.from(e.target.files??[]); e.target.value=''; if(!files.length||!activityId) return
    setPhotoBeingAdded(true)
    const pts=gpsRef.current

    for(const file of files){
      const dataUrl=await new Promise<string>(res=>{const r=new FileReader();r.onload=ev=>res(ev.target!.result as string);r.readAsDataURL(file)})
      const img=new Image(); await new Promise<void>(res=>{img.onload=()=>res();img.src=dataUrl})
      // Square-crop to 800px
      const size=Math.min(img.width,img.height), cv=document.createElement('canvas'); cv.width=cv.height=800
      const cc=cv.getContext('2d')!; cc.drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,800,800)
      const cropped=cv.toDataURL('image/jpeg',0.82)
      const ci=new Image(); await new Promise<void>(res=>{ci.onload=()=>res();ci.src=cropped})

      // EXIF GPS
      // Stessa regola di app/components/ActivityPhotoManager.tsx, ora condivisa invece che
      // duplicata (lib/exifGps.ts): coordinate proprie, altrimenti orario di scatto, altrimenti
      // metà percorso. L'EXIF si legge dal file originale, non dal ritaglio prodotto qui sopra.
      const exifMeta=await readExifMetadata(file)
      const {progress,hasExifGps,lat:exifLat,lon:exifLon}=placePhotoOnTrack(exifMeta,pts)

      const id=`photo-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const caption=file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ').slice(0,40)
      photoImgsRef.current.set(id,ci)

      try {
        const saved=await addActivityPhoto(activityId,{
          id, dataUrl:cropped, progress, caption, hasExifGps,
          ...(exifLat !== undefined && exifLon !== undefined ? {lat:exifLat,lon:exifLon} : {}),
        })
        setRoutePhotos(prev=>[...prev,saved])
      } catch {
        photoImgsRef.current.delete(id)
        setShareToast('Errore: caricamento foto non riuscito'); setTimeout(()=>setShareToast(''),3000)
      }
    }
    setPhotoBeingAdded(false)
  }

  // ── Post-production helpers ───────────────────────────────────────────────────

  // Le inquadrature si calcolano una volta all'apertura del wizard: ricalcolarle ad ogni passo
  // cancellerebbe l'ordine che l'utente ha eventualmente cambiato a mano nel passo "Percorso".
  function openVideoWizard() {
    setShotPlan(planShots(gpsRef.current, zoomIntro, zoomFollow))
    setVideoStep(0); setVideoState('config')
  }
  const goToStep = (i: number) => setVideoStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, i)))

  /** Accende/spegne il pin utente. Spegnendolo azzera anche gli effetti che dipendono da lui:
   *  sono tutti ancorati alla sua posizione o alla sua sagoma, quindi senza pin non hanno nulla a
   *  cui attaccarsi. Riaccendendo il pin NON si ripristinano da soli: erano scelte dell'utente,
   *  ritornare a uno stato che non ha più chiesto sarebbe peggio che lasciarglieli riaccendere. */
  function setShowUserPin(on: boolean) {
    setVideoShowUserPin(on)
    if (!on) {
      setVideoHeartEffectEnabled(false)
      setVideoPinEffortColorEnabled(false)
      setVideoTrailEnabled(false)
      setVideoSlopeShadowEnabled(false)
    }
  }

  function moveShot(id: string, dir: -1|1) {
    setShotPlan(prev=>{
      const idx=prev.findIndex(s=>s.id===id); if(idx<0) return prev
      const next=[...prev], si=idx+dir; if(si<0||si>=next.length) return prev
      ;[next[idx],next[si]]=[next[si],next[idx]]
      let p=0; return next.map((s,i)=>{const dur=s.endP-s.startP,sP=p,eP=Math.min(1,p+dur);p=eP;return{...s,startP:sP,endP:i===next.length-1?1:eP}})
    })
  }

  // ── Cinematic rendering ───────────────────────────────────────────────────────

  const startRendering=useCallback(async (previewOnly = false)=>{
    const map=mapRef.current; if(!map) return
    if(typeof MediaRecorder==='undefined'){
      setVideoError('Questo browser non supporta la registrazione video. Prova con una versione aggiornata di Chrome, Safari o Firefox.')
      return
    }

    // Riscontro IMMEDIATO al clic. Tutto ciò che segue è asincrono e può durare parecchi secondi
    // (il precaricamento del terreno da solo è una ventina di attese sulla mappa): finché lo stato
    // passava a 'rendering' solo alla fine della preparazione, il wizard restava a schermo com'era
    // e l'unico segnale che stesse succedendo qualcosa era la mappa che si muoveva dietro il velo.
    renderAbortRef.current = false
    prepStageRef.current = 'avvio'
    setVideoError('')
    setPrepLabel('Preparazione…'); setPrepProgress(0)
    setVideoState('preparing')

    /** Segna la fase corrente e, insieme, fa da punto di annullamento: prima di questa modifica la
     *  preparazione non era interrompibile in nessun punto: premuto "Genera", l'unica via d'uscita
     *  era aspettare. */
    const prep = (label: string, pct: number) => {
      if (renderAbortRef.current) throw new PrepAborted()
      prepStageRef.current = label
      setPrepLabel(label); setPrepProgress(Math.min(1, Math.max(0, pct)))
    }

    // Guards every map.once('idle') wait against a context that never settles (e.g. GPU
    // pressure from many POI/photo textures) — without this the whole render hangs forever.
    const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ])

    // encode() is non-blocking — without backpressure a fast render loop can flood the
    // encoder's internal queue faster than it can drain it. Weaker mobile hardware
    // encoders react to a flooded queue by dropping/corrupting frames (visible as
    // flicker), so stall briefly until the queue has room before enqueuing more.
    const waitForEncoderQueue = async (enc: InstanceType<typeof VideoEncoder>) => {
      while (enc.encodeQueueSize > 2) await new Promise(r => setTimeout(r, 10))
    }

    // Shared failure path: an unhandled exception during setup, or a lost WebGL context
    // mid-render, otherwise leaves the UI stuck on "rendering"/"finalizing" with no feedback.
    let renderFailed = false
    const failRendering = (message: string) => {
      if (renderFailed) return
      renderFailed = true
      renderAbortRef.current = true
      cancelAnimationFrame(animRef.current)
      visibilityWaiterRef.current?.(); setRenderPaused(false)
      console.error('[dtrek] video rendering failed:', message)
      try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
      muxerRef.current=null; muxerTargetRef.current=null
      if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current=null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current=null } catch {}
      try { cleanupRouteReveal(map) } catch {}
      try { setVisionLayerOpacity(map, 0, visionOpacityCache.current) } catch {}
      const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
      const cont=containerRef.current; if(cont){cont.style.width='';cont.style.height=''}
      try { map.resize() } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { try{(map as any).setPixelRatio(window.devicePixelRatio||1)}catch{} }
      webglLostCleanupRef.current?.()
      // Ritorno al wizard, non alla mappa: ogni messaggio di errore qui chiede di cambiare
      // qualcosa e riprovare ("riduci la durata", "escludi quella foto", "prova un altro
      // formato"), e da 'idle' l'utente dovrebbe riaprire il wizard e ricompilarlo da capo.
      setVideoState('config')
      setPrepProgress(0); setPrepLabel('')
      setVideoError(message)
    }
    const onWebglContextLost = (e: Event) => {
      e.preventDefault?.()
      failRendering('Il contesto grafico (GPU) si è interrotto durante la generazione del video. Riprova con meno foto/POI o un video più breve.')
    }
    // Dentro il try: da qui in poi lo stato è 'preparing', e qualunque eccezione non intercettata
    // lascerebbe l'utente davanti a una schermata di preparazione che non finisce mai.
    try {

    const renderCanvas = map.getCanvas()
    renderCanvas.addEventListener('webglcontextlost', onWebglContextLost)
    webglLostCleanupRef.current = () => { try { renderCanvas.removeEventListener('webglcontextlost', onWebglContextLost) } catch {}; webglLostCleanupRef.current = null }

    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; setIsPlaying(false)
    progressRef.current=0; setProgress(0)
    const pts=gpsRef.current
    if(pts.length<2) {
      webglLostCleanupRef.current?.()
      setVideoError('Questa traccia non ha abbastanza punti GPS per generare un video.')
      setVideoState('config'); return
    }

    const [outW,outH]=VIDEO_DIMS[videoOrientation]

    // Resize map container to output resolution so tiles load at correct density
    prep('Preparazione della mappa…', 0.02)
    const cont=containerRef.current!
    const dpr=window.devicePixelRatio||1
    cont.style.width=`${outW/dpr}px`
    cont.style.height=`${outH/dpr}px`
    map.resize()
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})

    // 2× supersampling: map renders at 2× pixel density, drawImage downscales for sharper tiles
    if (typeof (map as any).setPixelRatio === 'function') {
      ;(map as any).setPixelRatio(dpr * 2)
      map.resize()
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }

    // Pre-compute smooth route bearings here so introBearing uses the same value
    // as the follow phase (which looks 12% ahead), eliminating the bearing jerk at intro→follow
    const N=pts.length
    const rawRouteBears=Array.from({length:Math.max(1,N-1)},(_,i)=>bearingDeg(pts[i].lat!,pts[i].lon!,pts[Math.min(i+1,N-1)].lat!,pts[Math.min(i+1,N-1)].lon!))
    const smoothRouteBears=circularMeanBearings(rawRouteBears,35)
    // Intro bearing must match what follow uses at p=0 (look 12% ahead) to avoid bearing jerk
    const introLookIdx=Math.min(Math.round(0.12*(N-1)),smoothRouteBears.length-1)
    const introBearing=smoothRouteBears[introLookIdx]
    // 20-position pre-warm at actual recording conditions (follow phase: zoomFollow + pitch 48°
    // with real route bearings) — eliminates tile pop-in from oblique view at non-north bearings
    const PREWARM_STEPS = 20
    const prewarmIdxs = Array.from({length:PREWARM_STEPS},(_,i)=>
      Math.min(Math.round(i/(PREWARM_STEPS-1)*(pts.length-1)),pts.length-1))
    // È la parte più lunga della preparazione (una ventina di attese in fila, ognuna fino a 8s):
    // vale la pena raccontarla passo per passo invece di lasciare lo schermo fermo.
    for (let k = 0; k < prewarmIdxs.length; k++) {
      const ki = prewarmIdxs[k]
      prep(`Caricamento del terreno… ${k + 1}/${prewarmIdxs.length}`, 0.05 + 0.55 * (k / prewarmIdxs.length))
      const bearing = smoothRouteBears[Math.min(ki,smoothRouteBears.length-1)]??introBearing
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomFollow,pitch:48,bearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Inquadratura d'insieme dello stacco "Visione": tutto il tracciato dentro il fotogramma, a
    // nord, vista dall'alto.
    //
    // Lo zoom si CALCOLA (lib/videoVision.ts), non si chiede a map.cameraForBounds: quel metodo
    // parte dallo stato corrente della telecamera, inclinazione compresa, e qui la mappa è ancora
    // a 48° per il pre-caricamento del volo — restituiva quindi uno zoom tarato su un'inquadratura
    // diversa da quella che la Visione avrebbe poi usato, lasciando un pezzo di percorso fuori dal
    // fotogramma proprio nel momento fatto per mostrarlo tutto.
    //
    // I margini tengono conto di dove finiscono le etichette: colonne laterali per i nomi, la
    // fascia del titolo in alto, il margine sicuro in basso.
    // safeInsetsFor invece della const `safeInsets`, che è dichiarata più in basso in questa
    // funzione: è una funzione pura sulle sole dimensioni, quindi le due danno lo stesso risultato.
    const visionSafe = safeInsetsFor(outW, outH)
    const visionRouteLatLon = pts.map(pp => [pp.lat!, pp.lon!] as [number, number])
    const visionBounds = boundsOfRoute(visionRouteLatLon)
    const visionPadding = {
      top:    visionSafe.top + Math.round(outH * 0.10),
      bottom: visionSafe.bottom + Math.round(outH * 0.06),
      left:   Math.max(visionSafe.left, Math.round(outW * 0.18)),
      right:  Math.max(visionSafe.right, Math.round(outW * 0.18)),
    }
    const visionCenter = visionBounds ? centerOfBounds(visionBounds) : { lat: pts[0].lat!, lon: pts[0].lon! }

    // ATTENZIONE all'unità di misura. MapLibre calcola lo zoom sul proprio viewport in pixel CSS
    // (clientWidth/clientHeight del contenitore), mentre outW/outH sono i pixel del VIDEO. Qui il
    // contenitore è largo outW/dpr, quindi passare outW significava chiedere l'inquadratura per un
    // viewport dpr volte più grande di quello vero: log2(dpr) livelli di zoom di troppo, cioè su un
    // telefono a dpr 2 un tracciato grande il doppio del fotogramma. Era questo il motivo per cui
    // il percorso continuava a uscire dai bordi.
    //
    // Si legge la dimensione reale del contenitore invece di dividere per dpr a mano: così il
    // calcolo resta corretto anche se un domani il contenitore venisse dimensionato diversamente.
    const contW = map.getContainer().clientWidth || outW
    const contH = map.getContainer().clientHeight || outH
    const toCss = contW / outW
    const visionPaddingCss = {
      top: visionPadding.top * toCss, bottom: visionPadding.bottom * toCss,
      left: visionPadding.left * toCss, right: visionPadding.right * toCss,
    }
    // `let` sul campo zoom: il controllo empirico più sotto può abbassarlo.
    const visionFit = {
      lon: visionCenter.lon,
      lat: visionCenter.lat,
      zoom: visionBounds ? fitZoomForBounds(visionBounds, { width: contW, height: contH }, visionPaddingCss) : zoomOutro,
    }
    const visionSetting = videoInterludes.find(i => i.kind === 'visione')
    const visionSeconds = visionSetting?.seconds ?? 6
    const visionCallouts = visionFeaturesRef.current

    // Pre-caricamento delle tile dell'inquadratura d'insieme, col velo topografico già acceso: è
    // un livello di zoom che il resto del video non tocca mai, quindi senza questo passaggio le
    // sue tile si caricherebbero sotto gli occhi proprio durante lo stacco.
    if (visionSetting?.enabled && visionCallouts.length > 0) {
      prep('Inquadratura d\u2019insieme\u2026', 0.60)
      if (mapRef.current) setVisionLayerOpacity(mapRef.current, 1, visionOpacityCache.current)

      // Verifica empirica dell'inquadratura, non solo il calcolo.
      //
      // La formula è esatta per una vista dall'alto su terreno piatto; la realtà ha
      // l'inclinazione della telecamera e il rilievo 3D, che spostano i punti proiettati in modi
      // che nessuna formula chiusa cattura del tutto (un crinale vicino al bordo si proietta più
      // in fuori del terreno che gli sta sotto). Invece di aggiungere margini a intuito, qui si
      // guarda dove i punti finiscono DAVVERO — map.project tiene conto sia dell'inclinazione sia
      // del terreno — e si allarga finché non sono tutti dentro.
      //
      // Converge in un paio di giri; il tetto di iterazioni evita che un caso patologico allarghi
      // all'infinito. Si campiona il tracciato: duecento punti descrivono l'ingombro quanto
      // diecimila, e questo gira dentro il ciclo di preparazione.
      const sampleStep = Math.max(1, Math.ceil(pts.length / 200))
      const samples = pts.filter((_, i) => i % sampleStep === 0 || i === pts.length - 1)
      for (let attempt = 0; attempt < 5; attempt++) {
        map.jumpTo({ center: [visionFit.lon, visionFit.lat], zoom: visionFit.zoom, pitch: 6, bearing: 0 })
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const sp of samples) {
          const pr = map.project([sp.lon!, sp.lat!])
          if (pr.x < minX) minX = pr.x
          if (pr.x > maxX) maxX = pr.x
          if (pr.y < minY) minY = pr.y
          if (pr.y > maxY) maxY = pr.y
        }
        const availW = Math.max(1, contW - visionPaddingCss.left - visionPaddingCss.right)
        const availH = Math.max(1, contH - visionPaddingCss.top - visionPaddingCss.bottom)
        const overflow = Math.max((maxX - minX) / availW, (maxY - minY) / availH)
        if (!Number.isFinite(overflow) || overflow <= 1) break
        // log2 dell'eccedenza è esattamente di quanto va abbassato lo zoom, più un'inezia perché
        // il giro successivo non si fermi esattamente sul filo.
        visionFit.zoom -= Math.log2(overflow) + 0.02
      }

      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
      if (mapRef.current) setVisionLayerOpacity(mapRef.current, 0, visionOpacityCache.current)
    }

    // Outro position (zoomed out) and intro zoom/pitch. Bearing 0: l'inquadratura d'insieme finale
    // si raddrizza sempre a nord (vedi la fase di finale nel ciclo di render), quindi è a nord che
    // vanno pre-caricate le tile — pre-caricarle con l'orientamento di apertura lascerebbe proprio
    // il fotogramma più largo, e più a lungo in vista, a caricarsi sotto gli occhi di chi guarda.
    prep('Inquadratura finale…', 0.62)
    map.jumpTo({center:[pts[N-1].lon!,pts[N-1].lat!],zoom:zoomOutro,pitch:8,bearing:0})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    prep('Inquadratura di apertura…', 0.66)
    for (const ki of prewarmIdxs.slice(0,5)) {
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Position at intro start
    map.jumpTo({center:[pts[0].lon!,pts[0].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    prep('Tracciato del percorso…', 0.74)

    // Hide HTML marker during rendering
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='0'

    // Initialize smooth camera from intro starting pose
    smoothBearRef.current=introBearing
    smoothPitchRef.current=20
    smoothZoomRef.current=zoomIntro
    orbitBaseRef.current=introBearing

    // Setup progressive route reveal
    try { setupRouteReveal(map, pts, routeColorRef.current, routeGlowRef.current) } catch {}

    const mapCanvas=map.getCanvas()
    // Margini che l'interfaccia di Reels/TikTok copre stabilmente: calcolati una volta, usati da
    // tutto ciò che si disegna vicino ai bordi.
    const safeInsets = safeInsetsFor(outW, outH)
    const composite=document.createElement('canvas'); composite.width=outW; composite.height=outH
    compositeCanvasRef.current=composite
    const ctx=composite.getContext('2d')!
    ctx.imageSmoothingEnabled=true
    ctx.imageSmoothingQuality='high'

    // Rilevatore di fotogrammi "vuoti" (Sezione 4, causa dei lampeggii/fotogrammi neri): a volte il
    // canvas WebGL di MapLibre, letto subito dopo l'evento 'render', contiene ancora il framebuffer
    // appena azzerato invece del disegno vero (race tra repaint e swap del compositor GPU — capita
    // più spesso nei tratti "follow" dove la camera attraversa terreno nuovo ogni fotogramma). Un
    // campione 8x8 rilevato come "quasi nero" indica proprio questo: si tratta il fotogramma come
    // "mappa non disponibile" e si salta SOLO il ridisegno (il composito trattiene l'ultimo buono,
    // vedi mapAvailableF/O più sotto), invece di incollare il nero nel video.
    // Il campione è 16x16 e si contano le celle quasi nere invece della sola media globale: un
    // fotogramma con un "buco" di terreno non ancora caricato (mezzo schermo nero, il resto
    // disegnato) ha una media ben sopra qualsiasi soglia utile, ma è comunque da scartare. La mappa
    // non è mai legittimamente nera (nessuna scena notturna, le dissolvenze al nero sono disegnate
    // sul canvas composito, non su questo), quindi "in gran parte nera" significa sempre "non pronta".
    const BLANK_CELL = 16
    const blankSampleCanvas=document.createElement('canvas'); blankSampleCanvas.width=BLANK_CELL; blankSampleCanvas.height=BLANK_CELL
    const blankSampleCtx=blankSampleCanvas.getContext('2d',{willReadFrequently:true})
    const isCanvasBlank=(cv:HTMLCanvasElement):boolean=>{
      if(!blankSampleCtx||cv.width<=0||cv.height<=0) return false
      try{
        blankSampleCtx.clearRect(0,0,BLANK_CELL,BLANK_CELL)
        blankSampleCtx.drawImage(cv,0,0,cv.width,cv.height,0,0,BLANK_CELL,BLANK_CELL)
        const data=blankSampleCtx.getImageData(0,0,BLANK_CELL,BLANK_CELL).data
        let sum=0, darkCells=0
        const total=BLANK_CELL*BLANK_CELL
        for(let i=0;i<data.length;i+=4){
          const lum=data[i]+data[i+1]+data[i+2]
          sum+=lum
          if(lum<12) darkCells++   // ~4/255 medi per canale: nero, non semplicemente scuro
        }
        return (sum/(total*3))<3 || (darkCells/total)>0.6
      }catch{ return false }
    }

    // Codec: H.264 dove supportato nativamente (Safari/iOS), VP9 su Chrome/Firefox.
    // NON specificare profili H.264 (avc1.640028 ecc.) — alcuni browser li dichiarano
    // supportati ma producono output scadente con l'encoder software di fallback.
    const mimeType=[
      'video/mp4;codecs=avc1',   // H.264 — Safari, Chrome/Android, Chrome/Windows
      'video/mp4',               // H.264 generico (fallback)
      'video/webm;codecs=vp9',   // VP9 — Chrome/Firefox desktop (buona qualità)
      'video/webm;codecs=vp8',   // VP8 — browser più vecchi
      'video/webm',
    ].find(t=>MediaRecorder.isTypeSupported(t))??''
    // ── Recording setup: WebCodecs (preferred) or MediaRecorder fallback ────────
    const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
    // Shared con la callback output() del VideoEncoder e finishRecording (stessa closure).
    // decodeTimestampUs viene assegnato in ORDINE DI ARRIVO alla callback output(), che secondo
    // WebCodecs è l'ordine di DECODIFICA (non necessariamente lo stesso della presentazione: con
    // latencyMode 'quality' l'encoder può usare B-frame, che referenziano fotogrammi futuri e
    // quindi vengono consegnati fuori ordine rispetto al loro chunk.timestamp — vedi il commento
    // più esteso su finishRecording per il perché questo è importante).
    const videoChunkBuffer: Array<{chunk: any, meta: any, decodeTimestampUs: number}> = []
    let videoDecodeIdx = 0

    const finishRecording = async () => {
      const ve = videoEncoderRef.current
      const mx = muxerRef.current
      const tgt = muxerTargetRef.current
      if (!ve) return
      setVideoState('finalizing')
      // Tick a visible elapsed-seconds counter — without this the UI shows a bar pinned at
      // 100% with static text for the whole flush/mux duration, looking frozen even when
      // it's legitimately still working (compression can take 20-30s for long/photo-heavy videos).
      setFinalizeElapsedSec(0)
      finalizeIntervalRef.current = setInterval(() => setFinalizeElapsedSec(s => s + 1), 1000)
      try {
      // Flush BEFORE nulling muxer: the output callback uses muxerRef.current. Guard with a
      // timeout so a stuck encoder (e.g. lost GPU context) surfaces as a recoverable error
      // instead of leaving the UI frozen on "finalizing" forever.
      try { await withTimeout(ve.flush(), 20000) } catch (err) {
        console.error('video flush:', err)
        try { ve.close() } catch {} // force-release a wedged encoder (e.g. lost GPU context)
      }
      // NIENTE ordinamento per timestamp qui — è il bug che ha causato a lungo sfarfallii e
      // fotogrammi corrotti (più visibili quanto più la scena è ricca, cioè esattamente da quando
      // sono stati aggiunti gli effetti più recenti: una scena più complessa rende più probabile
      // che l'encoder usi B-frame per comprimere meglio). mp4-muxer vuole i campioni nell'ordine di
      // DECODIFICA — che, con latencyMode 'quality', può differire dall'ordine di presentazione
      // quando l'encoder usa B-frame (referenziano fotogrammi futuri, quindi la callback output()
      // li consegna fuori dall'ordine cronologico del loro chunk.timestamp). L'ordine di ARRIVO a
      // output() però È l'ordine di decodifica per definizione — riordinare per timestamp
      // (presentazione) lo distruggeva. addVideoChunk(chunk, meta) a due argomenti, inoltre, usa
      // chunk.timestamp anche come timestamp di DECODIFICA: corretto solo senza B-frame. Passando
      // esplicitamente timestamp di presentazione e decodeTimestampUs (quest'ultimo assegnato in
      // ordine di arrivo, quindi già in ordine di decodifica) il muxer può ricostruire entrambi
      // correttamente via compositionTimeOffset, anche quando differiscono.
      for (const { chunk, meta, decodeTimestampUs } of videoChunkBuffer) {
        try { mx?.addVideoChunk(chunk, meta, chunk.timestamp, chunk.timestamp - decodeTimestampUs) } catch {}
      }
      // Finalize container, then null all refs
      try { mx?.finalize() } catch (err) { console.error('mux finalize:', err) }
      muxerRef.current=null; muxerTargetRef.current=null
      videoEncoderRef.current=null
      const buf = tgt?.buffer
      if (buf instanceof ArrayBuffer && buf.byteLength > 0) {
        setVideoRecordedBlob(new Blob([buf], { type: 'video/mp4' }))
        setVideoState('done')
      } else {
        console.error('mp4-muxer produced empty buffer — encoding failed')
        setShareToast('Errore: il video non è stato generato correttamente')
        setTimeout(() => setShareToast(''), 4000)
        setVideoState('idle')
      }
      if(mEl) mEl.style.opacity='1'
      try { cleanupRouteReveal(map) } catch {}
      try { setVisionLayerOpacity(map, 0, visionOpacityCache.current) } catch {}
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { ;(map as any).setPixelRatio(dpr) }
      cont.style.width=''; cont.style.height=''; map.resize()
      } finally {
        if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current = null }
        visibilityWaiterRef.current?.(); setRenderPaused(false)
        webglLostCleanupRef.current?.()
      }
    }

    if (hasWebCodecs) {
      prep('Avvio del codificatore video…', 0.78)
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
      const muxTarget = new ArrayBufferTarget()
      muxerTargetRef.current = muxTarget
      const muxOpts: any = {
        target: muxTarget,
        video: { codec: 'avc', width: outW, height: outH, frameRate: videoFps },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      }
      muxerRef.current = new Muxer(muxOpts)
      const ve = new VideoEncoder({
        // decodeTimestampUs = ordine di arrivo qui (= ordine di decodifica) tradotto in una
        // timeline sintetica a passo costante — vedi il commento esteso in finishRecording.
        output: (chunk: any, meta: any) => {
          videoChunkBuffer.push({ chunk, meta, decodeTimestampUs: Math.round(videoDecodeIdx * 1_000_000 / TARGET_FPS) })
          videoDecodeIdx++
        },
        error: (e: any) => console.error('VideoEncoder error:', e)
      })
      // Profilo AVC Baseline ('42' = profile_idc 66) invece di High/Main ('64'/'4d'): il profilo
      // Baseline VIETA i B-frame per specifica H.264 (non è un'impostazione che l'encoder può
      // scegliere di ignorare, è una restrizione del profilo stesso) — elimina strutturalmente la
      // classe di bug legata all'ordine di decodifica dei B-frame nel muxing (vedi il commento in
      // finishRecording), invece di limitarsi a gestirla correttamente. Costa una compressione
      // leggermente meno efficiente (file un po' più grandi a parità di qualità) — un compromesso
      // accettato qui perché la priorità è l'affidabilità, non la dimensione del file.
      const avcCandidates = ['avc1.420034','avc1.42002a','avc1.420028','avc1.42001f']
      let chosenCodec = 'avc1.420028'
      // Preferisce l'encoder SOFTWARE a quello hardware: gli encoder H.264 hardware su vari SoC
      // Android hanno bug WebCodecs documentati (frame corrotti/riordinati) — 'prefer-software' è
      // solo una preferenza (se non disponibile il browser ripiega comunque sull'hardware), non
      // un requisito che possa far fallire isConfigSupported. Più lento, ma più prevedibile —
      // la priorità qui è la correttezza del video, non la velocità di rendering.
      for (const c of avcCandidates) {
        try {
          const sup = await VideoEncoder.isConfigSupported({ codec: c, width: outW, height: outH, bitrate: videoFps===60?25_000_000:20_000_000, framerate: videoFps, latencyMode: 'quality', hardwareAcceleration: 'prefer-software' })
          if (sup.supported) { chosenCodec = c; break }
        } catch {}
      }
      // 'quality' (not 'realtime'): this is a file export, not a live stream — the spec
      // explicitly allows 'realtime' encoders to drop/degrade frames under load to
      // minimize latency, which is the wrong tradeoff here and was producing flicker.
      // configure() lancia (NotSupportedError) se il browser non regge questa combinazione di
      // risoluzione/bitrate/profilo — succede su alcuni dispositivi e non su altri, ed è una delle
      // cause plausibili del fallimento visto solo in produzione. Chiudere l'encoder prima di
      // rilanciare: non è ancora in videoEncoderRef, quindi failRendering non lo troverebbe.
      try {
        ve.configure({ codec: chosenCodec, width: outW, height: outH, bitrate: videoFps===60?25_000_000:20_000_000, framerate: videoFps, latencyMode: 'quality', hardwareAcceleration: 'prefer-software' })
      } catch (err) {
        try { ve.close() } catch {}
        throw err
      }
      videoEncoderRef.current = ve

    } else {
      // MediaRecorder fallback (browsers without WebCodecs)
      const videoStream=(composite as any).captureStream(videoFps) as MediaStream
      const recorder=new MediaRecorder(videoStream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:videoFps===60?25_000_000:20_000_000})
      videoChunksRef.current=[]
      recorder.ondataavailable=(e:BlobEvent)=>{if(e.data.size>0)videoChunksRef.current.push(e.data)}
      recorder.onstop=()=>{
        const blob=new Blob(videoChunksRef.current,{type:mimeType||'video/webm'})
        setVideoRecordedBlob(blob); setVideoState('done')
        if(mEl) mEl.style.opacity='1'
        try { cleanupRouteReveal(map) } catch {}
        try { setVisionLayerOpacity(map, 0, visionOpacityCache.current) } catch {}
      try { setVisionLayerOpacity(map, 0, visionOpacityCache.current) } catch {}
        try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
        try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
        if (typeof (map as any).setPixelRatio === 'function') { ;(map as any).setPixelRatio(dpr) }
        cont.style.width=''; cont.style.height=''; map.resize()
        webglLostCleanupRef.current?.()
      }
      mediaRecorderRef.current=recorder; recorder.start(100)
    }


    // N, rawRouteBears, smoothRouteBears computed above (before introBearing)

    // Body data pre-computation
    const SAMPLES=Math.min(300,N), step=(N-1)/(SAMPLES-1)
    const rawHr=Array.from({length:SAMPLES},(_,i)=>pts[Math.min(Math.round(i*step),N-1)].heartRateBpm??0)
    const rawSpeed=Array.from({length:SAMPLES},(_,i)=>{
      const idx=Math.min(Math.round(i*step),N-1); if(idx===0) return 0
      const prev=Math.max(0,idx-1)
      const t0=pts[prev].time?new Date(pts[prev].time!).getTime():0, t1=pts[idx].time?new Date(pts[idx].time!).getTime():0
      if(!t0||!t1||t1<=t0) return 0
      return(distM(pts[prev].lat!,pts[prev].lon!,pts[idx].lat!,pts[idx].lon!)/((t1-t0)/1000))*3.6
    })
    const smoothSpeed=smoothArray(rawSpeed,4)
    const smoothHr=smoothArray(rawHr,4)
    const hrMax=Math.max(...smoothHr), hrMin=Math.min(...smoothHr.filter(v=>v>0),hrMax)
    const spMax=Math.max(...smoothSpeed), hasHr=hrMax>0, hasSpeed=spMax>0
    // Prefer authoritative stored values over recomputed-from-GPS (which can differ due to downsampling)
    const totalKm=(distanceProp ?? totalDistRef.current) / 1000
    const elevGain = elevGainProp ?? elevStatsRef.current.gain

    // Immagini Wikipedia dei luoghi (modalità Illustrativo). Caricate QUI, prima di aprire il
    // rendering, e non a colpi di effetto asincrono: il piano delle schede si costruisce fra poche
    // righe e deve già sapere quali luoghi hanno davvero un'immagine utilizzabile.
    //
    // crossOrigin='anonymous' non è un dettaglio: il canvas composito finisce in `new VideoFrame(...)`,
    // che su canvas contaminato lancia — una singola immagine remota senza CORS farebbe fallire
    // l'esportazione INTERA, non solo quel fotogramma. Chi non carica (rete, 404, CORS negato)
    // semplicemente non entra nella mappa qui sotto, e il suo luogo torna a essere un segnaposto.
    const poiImages = new Map<number, HTMLImageElement>()
    if (videoMode === 'illustrativo' && poiWiki?.length) {
      prep('Immagini dei luoghi…', 0.82)
      await Promise.all(poiWiki.map(({ poi, wiki }) => new Promise<void>(resolve => {
        if (!wiki.thumbnail) { resolve(); return }
        const im = new Image()
        im.crossOrigin = 'anonymous'
        const done = () => resolve()
        const timer = setTimeout(done, 6000)   // una miniatura lenta non blocca la generazione
        im.onload = () => { clearTimeout(timer); poiImages.set(poi.id, im); resolve() }
        im.onerror = () => { clearTimeout(timer); done() }
        im.src = wiki.thumbnail
      })))
    }

    const TARGET_FPS=videoFps
    const PHOTO_REVEAL_FRAMES = Math.round(TARGET_FPS * photoDurationSec)
    const sortedPhotos = [...routePhotos]
      .filter(ph => !videoExcludedPhotoIds.has(ph.id))
      .sort((a,b)=>a.progress-b.progress)
      .filter(ph => photoImgsRef.current.has(ph.id))
      .map(ph => ({photo:ph, img:photoImgsRef.current.get(ph.id)!}))

    // Foto vicine fra loro = un solo momento, una sola sosta (più polaroid sparpagliate insieme).
    // Dieci scatti dello stesso panorama darebbero altrimenti dieci interruzioni di fila.
    const photoStops = groupPhotoTimings(
      sortedPhotos.map(sp => ({ id: sp.photo.id, progress: sp.photo.progress, distanceM: progressToDistanceM(sp.photo.progress, cumDist) })),
      PHOTO_GROUP_GAP_M,
    ).map(g => ({
      ...g,
      photos: g.ids.map(id => sortedPhotos.find(sp => sp.photo.id === id)!).filter(Boolean),
    }))

    // Bake photo pins into MapLibre's WebGL render as a symbol layer.
    // This ensures pins are geo-anchored and never wander relative to the map —
    // they move exactly with map tiles, unlike a canvas overlay that composites
    // after the render pass and drifts under pitched-camera perspective.
    const photoPinLayerId  = 'dtrek-photo-pins-layer'
    const photoPinSourceId = 'dtrek-photo-pins'
    if (sortedPhotos.length > 0) {
      prep('Segnaposti delle foto…', 0.86)
      const iconSc = 2  // render 2× for crispness; pixelRatio:2 → 45×54 CSS px
      const photoPinImageIds: string[] = []
      for (const s of sortedPhotos) {
        // Una foto sola non deve poter far fallire l'esportazione intera: getImageData lancia
        // SecurityError se il canvas è contaminato (immagine remota senza CORS) e drawPhotoPin
        // lancia se l'immagine non è decodificabile. Il pin salta, il video si fa lo stesso.
        try {
          const W = 45 * iconSc, H = 45 * iconSc, tipH = 9 * iconSc
          const offC = document.createElement('canvas')
          offC.width = W; offC.height = H + tipH
          const offCtx = offC.getContext('2d')!
          offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
          drawPhotoPin(offCtx, W / 2, H + tipH, iconSc, s.img)
          const imgId = `dtrek-photo-pin-${s.photo.id}`
          const imageData = offCtx.getImageData(0, 0, offC.width, offC.height)
          if (map.hasImage(imgId)) map.removeImage(imgId)
          map.addImage(imgId, imageData, { pixelRatio: iconSc })
          photoPinImageIds.push(imgId)
        } catch (err) {
          console.error('[dtrek] segnaposto foto non creato', s.photo.id, err)
        }
      }
      // Solo i segnaposti la cui texture è stata davvero creata: un riferimento a un'icona
      // inesistente lascerebbe MapLibre a lamentarsi ad ogni fotogramma per nulla.
      const pinFeatures = sortedPhotos
        .filter(s => photoPinImageIds.includes(`dtrek-photo-pin-${s.photo.id}`))
        .map(s => {
        const pi = Math.min(Math.round(s.photo.progress * (N - 1)), N - 1)
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.photo.lon ?? pts[pi].lon!, s.photo.lat ?? pts[pi].lat!] },
          properties: { pinId: `dtrek-photo-pin-${s.photo.id}` },
        }
      })
      try {
        map.addSource(photoPinSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: pinFeatures } })
        map.addLayer({
          id: photoPinLayerId, type: 'symbol', source: photoPinSourceId,
          layout: {
            'icon-image': ['get', 'pinId'],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': (outW / 1080) / dpr,
          },
          paint: { 'icon-opacity': 0 },
        } as any)
        await withTimeout(new Promise<void>(r => map.once('idle', r as any)), 8000).catch(()=>{})
      } catch {}
      photoPinCleanupRef.current = () => {
        const m = mapRef.current; if (!m) return
        try { m.removeLayer(photoPinLayerId) } catch {}
        try { m.removeSource(photoPinSourceId) } catch {}
        for (const id of photoPinImageIds) { try { m.removeImage(id) } catch {} }
      }
    }

    // Bake POI badges into MapLibre's WebGL render as a symbol layer (same rationale as photo pins).
    // Overpass returns POIs with no cap (a route near villages/refuges can return 50-100+),
    // and baking one texture per POI overwhelmed the GPU and stalled the 'idle' wait below —
    // cap the count, prioritize the most notable types, and share one image per distinct type.
    const poiPinLayerId  = 'dtrek-poi-pins-layer'
    const poiPinSourceId = 'dtrek-poi-pins'
    const videoPois = (pois ?? []).slice()
      .sort((a, b) => (POI_NOTABILITY_TIER[a.type] - POI_NOTABILITY_TIER[b.type]) || (a.distFromTrack - b.distFromTrack))
      .slice(0, MAX_VIDEO_POIS)
    if (videoShowPois && videoPois.length > 0) {
      prep('Segnaposti dei luoghi…', 0.90)
      const iconSc = 2
      const poiPinImageIds: string[] = []
      const poiTypesUsed = Array.from(new Set(videoPois.map(p => p.type)))
      for (const type of poiTypesUsed) {
        // POI_META è indicizzato su PoiType, ma i POI arrivano da Overpass e possono essere stati
        // salvati da una versione dell'app che conosceva un tipo in più: senza questa guardia un
        // solo tipo sconosciuto faceva fallire l'INTERA preparazione con un TypeError, che il
        // catch esterno riportava come "riprova con meno foto/POI".
        const meta = POI_META[type]
        if (!meta) { console.error('[dtrek] tipo di POI sconosciuto, segnaposto saltato:', type); continue }
        try {
          const D = 32 * iconSc
          const offC = document.createElement('canvas')
          offC.width = D; offC.height = D
          const offCtx = offC.getContext('2d')!
          offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
          drawPoiPin(offCtx, D / 2, D / 2, iconSc, meta.emoji)
          const imgId = `dtrek-poi-pin-type-${type}`
          const imageData = offCtx.getImageData(0, 0, D, D)
          if (map.hasImage(imgId)) map.removeImage(imgId)
          map.addImage(imgId, imageData, { pixelRatio: iconSc })
          poiPinImageIds.push(imgId)
        } catch (err) {
          console.error('[dtrek] segnaposto POI non creato', type, err)
        }
      }
      const poiPinFeatures = videoPois
        .filter(poi => poiPinImageIds.includes(`dtrek-poi-pin-type-${poi.type}`))
        .map(poi => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [poi.lon, poi.lat] },
        properties: { pinId: `dtrek-poi-pin-type-${poi.type}` },
      }))
      try {
        map.addSource(poiPinSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: poiPinFeatures } })
        map.addLayer({
          id: poiPinLayerId, type: 'symbol', source: poiPinSourceId,
          layout: {
            'icon-image': ['get', 'pinId'],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-size': (outW / 1080) / dpr,
          },
          paint: { 'icon-opacity': 0 },
        } as any)
        await withTimeout(new Promise<void>(r => map.once('idle', r as any)), 8000).catch(()=>{})
      } catch {}
      poiPinCleanupRef.current = () => {
        const m = mapRef.current; if (!m) return
        try { m.removeLayer(poiPinLayerId) } catch {}
        try { m.removeSource(poiPinSourceId) } catch {}
        for (const id of poiPinImageIds) { try { m.removeImage(id) } catch {} }
      }
    }

    // Intro: fixed duration where p=0 (route frozen, camera swoops in) — più breve se il toggle
    // "intro rapida" è attivo (Sezione 4: un'apertura lenta è il motivo #1 per cui si scrolla via
    // sui social), altrimenti la durata originale.
    // Assoluti, non più una frazione della durata: nel nuovo modello la durata è la SOMMA delle
    // parti, quindi farne dipendere una parte sarebbe circolare. Ed è comunque la scelta giusta —
    // la soglia oltre cui un'apertura "è lunga" sta nell'attenzione di chi guarda, non nella
    // lunghezza del video. Vedi lib/videoBudget.ts.
    const INTRO_FRAMES = Math.round(TARGET_FPS * (videoHookFastIntro ? INTRO_FAST_SEC : INTRO_SEC))
    const isCarousel = videoPhotoStyle === 'carousel'
    // In modalità Illustrativo il soggetto è il percorso: niente pin utente, niente dati corporei,
    // e i POI diventano protagonisti invece che decorazione.
    const isIllustrativo = videoMode === 'illustrativo'
    // La mappa resta sempre a schermo intero (mai ritagliata) — titolo/statistiche/grafici in alto
    // (drawTopBand) e la foto in sosta (drawStopPhotoZoom) le si sovrappongono, non la restringono.
    const topBandH = isCarousel ? Math.round(outH * TOP_BAND_FRACTION) : 0
    // Calcolato una sola volta (non ad ogni frame) — distanza reale (non la frazione di progresso,
    // vedi lib/videoPhotoCarousel.ts) di ogni foto lungo il tracciato; base della timeline "viaggio
    // tra una foto e l'altra" (buildJourneyTables).
    const photoTimings: CarouselPhotoTiming[] = sortedPhotos.map(s => ({
      id: s.photo.id, progress: s.photo.progress, distanceM: progressToDistanceM(s.photo.progress, cumDist),
    }))
    // Outro: separate phase after route completes (~17% of route duration, min 3s)
    const OUTRO_FRAMES = Math.round(TARGET_FPS * OUTRO_SEC)

    renderedFramesRef.current = 0
    encodedFramesRef.current  = 0
    const outroStartBearRef = { current: -1 as number }
    // Fase (0..1) del battito cardiaco, accumulata frame per frame invece di derivata da
    // "tempo % periodo": il BPM (quindi il periodo del battito) cambia nel corso del video, e un
    // modulo su un periodo che cambia salterebbe di fase ad ogni variazione — accumulare l'avanzamento
    // di fase frame per frame (bpm/60 battiti al secondo, integrato nel tempo) resta invece continuo.
    const heartPhaseRef = { current: 0 }
    // Traguardi 25/50/75%: quota → fotogramma in cui il pin l'ha toccata (si scatta una volta sola).
    // Registrato durante il rendering invece che pre-calcolato perché `p` dipende dalle tabelle del
    // viaggio (soste comprese); in anteprima parziale un traguardo già superato semplicemente non
    // compare, ed è corretto così.
    const milestoneHitRef = [0.25, 0.5, 0.75].map(mark => ({ mark, hitFrame: -1 }))
    const MILESTONE_FRAMES = Math.round(TARGET_FPS * 1.7)
    // Quota massima raggiunta: stesso meccanismo dei traguardi, ma una volta sola e sul punto più
    // alto. 1,6 s invece di 2: è un lampo che sottolinea un momento, e a due secondi cominciava a
    // sembrare che il video si fosse fermato lì.
    const peakHitRef = { current: -1 }
    const PEAK_FRAMES = Math.round(TARGET_FPS * 1.6)
    // Tracciato d'insieme normalizzato per la mini-mappa: calcolato UNA volta, non ad ogni fotogramma.
    const miniRoute = videoMiniMapEnabled ? buildMiniRoute(pts) : []
    // Avanzamenti delle foto incluse, per le tacche sulla barra
    const photoMarks = videoPhotoMarksEnabled ? sortedPhotos.map(s => s.photo.progress) : undefined
    // Proiezione di un punto GPS nelle coordinate del canvas composito: map.project dà pixel CSS del
    // contenitore, mentre si disegna dal canvas WebGL ritagliato da coverRect — servono entrambe le
    // conversioni (CSS→pixel del canvas, poi ritaglio→composito).
    const projectToComposite = (lon: number, lat: number, cr: { sx:number; sy:number; sw:number; sh:number }) => {
      const q = map!.project([lon, lat] as any)
      const kx = mapCanvas.width / Math.max(1, mapCanvas.clientWidth)
      const ky = mapCanvas.height / Math.max(1, mapCanvas.clientHeight)
      return { x: (q.x * kx - cr.sx) * outW / cr.sw, y: (q.y * ky - cr.sy) * outH / cr.sh }
    }
    /** Punti della scia: dal pin all'indietro lungo il percorso, per una lunghezza che cresce con la
     *  velocità corrente (corta quando si va piano, lunga quando si spinge). */
    const trailPointsAt = (prog: number, speedKmh: number, cr: { sx:number; sy:number; sw:number; sh:number }) => {
      const lenM = 70 + 320 * clamp01((speedKmh - 1.5) / 6)
      const dNow = prog * totalDistanceM
      const dFrom = Math.max(0, dNow - lenM)
      const out: { x: number; y: number }[] = []
      const STEPS = 22
      for (let i = 0; i <= STEPS; i++) {
        const d = dFrom + (dNow - dFrom) * (i / STEPS)
        const pp = distanceMToProgress(d, cumDist)
        const idx = Math.min(pts.length - 1, Math.max(0, Math.round(pp * (pts.length - 1))))
        const q = pts[idx]
        if (q?.lon == null || q?.lat == null) continue
        out.push(projectToComposite(q.lon, q.lat, cr))
      }
      return out
    }

    // Pre-compute peak position on route (for peak callout)
    const peakRouteP = (() => {
      let maxA = -Infinity, peakIdx = 0
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i].altitudeMeters ?? 0
        if (a > maxA) { maxA = a; peakIdx = i }
      }
      return peakIdx / Math.max(1, pts.length - 1)
    })()

    // "Carosello": timeline "viaggio tra una foto e l'altra" — sosta vera su ogni foto (tempo =
    // photoDurationSec), poi viaggio verso la successiva a ritmo costante rispetto alla distanza
    // REALE (cruiseMps, derivato dallo slider "durata" come riferimento di ritmo, non più un
    // traguardo fisso — la durata effettiva del video ne è una conseguenza). "Classico": invariato,
    // percorso a ritmo costante alla velocità scelta, con la pausa a schermo
    // intero aggiunta per ogni foto (vedi il branch "Classico" più sotto).
    const cruiseMps = videoSpeedKmS * 1000
    const journey = isCarousel
      ? buildJourneyTables(TARGET_FPS, cumDist, totalDistanceM, photoStops, photoDurationSec, cruiseMps)
      : null
    const ROUTE_FRAMES = journey
      ? journey.totalFrames
      : Math.round(TARGET_FPS * Math.max(MIN_ROUTE_SEC, (totalDistanceM / 1000) / clampSpeed(videoSpeedKmS)))
    const photoTriggerRouteFrames = isCarousel ? [] : photoStops.map(g => Math.round(g.progress * ROUTE_FRAMES))
    // Le componenti TEI arrivano già pronte in linkedBeautyScore (vedi teiToBeautyScore in
    // lib/tei.ts): le cinque V_* su scala 0-10, e f_antr come frazione di penalità.
    const teiView = (() => {
      if (!isIllustrativo || !beautyScore?.categories?.length) return null
      const parts = beautyScore.categories
        .filter(c => c.key.startsWith('v_'))
        .map(c => ({ label: c.label.replace(/^V\.\s*/, ''), value: c.score / 10 }))
      if (parts.length === 0) return null
      const antr = beautyScore.categories.find(c => c.key === 'f_antr')
      return {
        score: beautyScore.overall,
        label: beautyScore.gradeLabel,
        color: beautyScore.color,
        parts,
        penalty: antr ? { label: 'Antropico', value: antr.score } : undefined,
      }
    })()

    // Gli avvisi delle guide più vecchie sono stringhe semplici invece di {severity,text}:
    // normalizzare prima dell'uso, non dare per scontata la forma nuova (vedi lib/guideNotices.ts).
    const normalizedNotices = normalizeGuideNotices(guide?.notices)
    // Calcolati UNA volta: servono in mezza dozzina di punti, alcuni dei quali dentro il ciclo dei
    // fotogrammi. Vedi seriesMax/seriesMin sul perché non è più uno spread.
    const altMaxAll = seriesMax(altitudeSeries)
    const altMinAll = seriesMin(altitudeSeries)
    // Cifra d'apertura: si sceglie quella che colpisce di più per QUESTO percorso, non sempre la
    // stessa — su un anello pianeggiante il dislivello non dice niente, su una salita secca sì.
    const openingHeadline = (() => {
      const altMax = altMaxAll
      if (elevGain >= 700) return `+${Math.round(elevGain)} m di salita`
      if (altMax >= 1800)  return `Fino a ${Math.round(altMax)} m`
      if (totalKm >= 12)   return `${totalKm.toFixed(1)} km a piedi`
      return `${totalKm.toFixed(1)} km · +${Math.round(elevGain)} m`
    })()

    // Punti di quota da segnalare: la vetta, il punto più basso, e qualche gradino di dislivello
    // in mezzo. Scelti sui MASSIMI/MINIMI reali invece che a intervalli regolari — un numero piazzato
    // ogni tot per cento cadrebbe quasi sempre dove non succede niente.
    const elevMarks = (() => {
      if (!videoElevMarkersEnabled || altitudeSeries.length < 3) return [] as { p: number; m: number; trend: 'up'|'down'|'flat' }[]
      const n = altitudeSeries.length
      const maxI = altitudeSeries.indexOf(altMaxAll)
      const minI = altitudeSeries.indexOf(altMinAll)
      const cand: number[] = [maxI, minI]
      for (const frac of [0.25, 0.5, 0.75]) cand.push(Math.round(frac * (n - 1)))
      const trendAt = (i: number): 'up'|'down'|'flat' => {
        const w = Math.max(1, Math.round(n * 0.03))
        const d = altitudeSeries[Math.min(n-1, i+w)] - altitudeSeries[Math.max(0, i-w)]
        return d > 8 ? 'up' : d < -8 ? 'down' : 'flat'
      }
      return cand.filter((v, k) => cand.indexOf(v) === k).sort((a2,b2)=>a2-b2)
        // Troppo vicini fra loro si accavallerebbero a schermo
        .filter((i, k, arr) => k === 0 || i - arr[k-1] > n * 0.08)
        .map(i => ({ p: i / (n - 1), m: altitudeSeries[i], trend: trendAt(i) }))
    })()

    // Tempo realmente impiegato, dai timestamp del tracciato: è un fatto del percorso così com'è
    // stato camminato, non una stima teorica (e non è il CTS, che è tarato sulla persona).
    const routeTimeLabel = (() => {
      const t0 = pts.find(q => q.time)?.time, t1 = [...pts].reverse().find(q => q.time)?.time
      if (!t0 || !t1) return '—'
      const secs = (new Date(t1).getTime() - new Date(t0).getTime()) / 1000
      if (!(secs > 0)) return '—'
      const hh = Math.floor(secs / 3600), mm = Math.round((secs % 3600) / 60)
      return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`
    })()

    // Stacchi: fermano il volo per far leggere i dati. Solo quelli che hanno davvero qualcosa da
    // mostrare — un pannello "avvisi" senza guida o "TEI" senza punteggio sarebbe una schermata vuota.
    // Fotogrammi di percorso già occupati da una foto: gli stacchi li devono evitare, e tenersi a
    // qualche secondo di distanza — due interruzioni attaccate spezzano il ritmo quanto una lunga.
    const photoBusyFrames = isCarousel && journey
      ? photoStops.map((_, i) => {
          let start = -1, end = -1
          for (let f = 0; f < ROUTE_FRAMES; f++) {
            if (journey.stopIndexTable[f] === i) { if (start < 0) start = f; end = f + 1 }
          }
          return start >= 0 ? { start, end } : null
        }).filter((x): x is { start: number; end: number } => !!x)
      : photoTriggerRouteFrames.map(at => ({ start: at, end: at + PHOTO_REVEAL_FRAMES }))

    prep('Montaggio della scaletta…', 0.94)
    // Gli stacchi "commento" (numeri, profilo, TEI…) restano una cosa della modalità Illustrativo.
    // La Visione no: non commenta l'escursione, spiega il percorso — e serve tanto a chi racconta
    // la propria uscita quanto a chi presenta l'itinerario. Nelle altre modalità è l'unico ammesso.
    const interludeSettingsForMode = isIllustrativo
      ? videoInterludes
      : videoInterludes.filter(i => i.kind === 'visione')
    const plannedInterludes = planInterludes(interludeSettingsForMode, {
      fps: TARGET_FPS,
      routeFrames: ROUTE_FRAMES,
      photoFrames: photoBusyFrames,
      breathFrames: Math.round(TARGET_FPS * 4),
      available: (kind) => {
        switch (kind) {
          case 'tei':    return !!teiView
          case 'avvisi': return normalizedNotices.length > 0
          case 'luoghi': return (pois?.length ?? 0) > 0
          case 'profilo': return altitudeSeries.length > 1
          // Senza niente di caratteristico da annotare la Visione sarebbe solo un allargamento
          // muto: meglio non farla che farla vuota.
          case 'visione': return visionFeaturesRef.current.length > 0
          default: return true
        }
      },
    })
    // photoStops, non sortedPhotos: le pause reali sono una per GRUPPO di foto vicine (vedi la
    // lista `pauses` più sotto, costruita su photoStops). Contare le foto una per una allocava
    // fotogrammi che nessuna pausa avrebbe mai occupato, e quel surplus finiva nel ramo del finale
    // con outroP già saturo a 1 — cioè in una coda di fotogrammi congelati in fondo al video, tanto
    // più lunga quanto più le foto erano raggruppate. Con 5 foto in 2 soste erano 9 secondi di
    // immagine ferma. Ora il totale allocato coincide con quello consumato.
    const TOTAL_FRAMES = INTRO_FRAMES + ROUTE_FRAMES + (isCarousel ? 0 : photoStops.length * PHOTO_REVEAL_FRAMES) + interludeTotalFrames(plannedInterludes) + OUTRO_FRAMES

    // Anteprima veloce (Sezione 4, debug): renderizza solo una finestra di fotogrammi centrale al
    // percorso invece del video intero — pensata per riprodurre in pochi secondi un bug legato a
    // una sosta su una foto, senza aspettare l'intera esportazione. Individua le finestre "foto"
    // (soste, stile Carosello; rivelazioni a schermo intero, stile Classico) in indice di
    // fotogramma GLOBALE, sceglie quella più centrale, e vi aggiunge un contorno di viaggio prima e
    // dopo così si vede anche la transizione, non solo la foto isolata.
    const photoWindows: { start: number; end: number }[] = []
    const followBase = INTRO_FRAMES
    if (isCarousel && journey) {
      let curIdx = -1, curStart = -1
      for (let f = 0; f < journey.totalFrames; f++) {
        const idx = journey.stopIndexTable[f]
        if (idx !== curIdx) {
          if (curIdx >= 0) photoWindows.push({ start: followBase + curStart, end: followBase + f })
          curIdx = idx; curStart = f
        }
      }
      if (curIdx >= 0) photoWindows.push({ start: followBase + curStart, end: followBase + journey.totalFrames })
    } else if (!isCarousel) {
      let pauseOffset = 0
      // Su photoStops, come la lista `pauses`: photoTriggerRouteFrames è indicizzato per gruppo,
      // quindi iterare sulle singole foto leggeva indici inesistenti oltre il numero di soste.
      for (let i = 0; i < photoStops.length; i++) {
        const triggerF = photoTriggerRouteFrames[i] + pauseOffset
        photoWindows.push({ start: followBase + triggerF, end: followBase + triggerF + PHOTO_REVEAL_FRAMES })
        pauseOffset += PHOTO_REVEAL_FRAMES
      }
    }
    const previewContextSec = videoHyperlapseEnabled ? 6 : 3
    const previewContext = Math.round(TARGET_FPS * previewContextSec)
    const previewChosen = photoWindows.length > 0
      ? photoWindows[Math.floor(photoWindows.length / 2)]
      : { start: followBase + Math.round(ROUTE_FRAMES / 2), end: followBase + Math.round(ROUTE_FRAMES / 2) }
    const previewStartFrame = Math.max(0, previewChosen.start - previewContext)
    const previewEndFrame = Math.min(TOTAL_FRAMES, previewChosen.end + previewContext)
    const RENDER_START_FRAME = previewOnly ? previewStartFrame : 0
    const RENDER_END_FRAME = previewOnly ? previewEndFrame : TOTAL_FRAMES
    setLastRenderWasPreview(previewOnly)
    setLastRenderSeconds((RENDER_END_FRAME - RENDER_START_FRAME) / TARGET_FPS)

    /** Stato di "volo sul percorso" a un dato fotogramma di percorso — estratto perché serve sia al
     *  caso normale sia agli stacchi, che congelano la telecamera su un fotogramma preciso. */
    const followStateAt = (routeFrame: number) => {
      if (journey) {
        const rf = Math.min(Math.max(0, routeFrame), ROUTE_FRAMES - 1)
        const stopIdx = journey.stopIndexTable[rf]
        return {
          p: journey.pTable[rf], followFrame: routeFrame,
          stopIndex: stopIdx >= 0 ? stopIdx : undefined,
          stopT: stopIdx >= 0 ? journey.stopTTable[rf] : undefined,
        }
      }
      // Divide by ROUTE_FRAMES-1 so the last follow frame reaches p=1.0 (exactly pts[N-1]),
      // preventing a small center jump at the follow→outro transition
      return { p: Math.min(1, routeFrame / Math.max(1, ROUTE_FRAMES - 1)), followFrame: routeFrame }
    }

    // Tutte le pause della fase percorso in UNA lista ordinata: rivelazioni foto (solo stile
    // Classico) e stacchi (entrambi gli stili). Devono condividere un unico accumulatore, altrimenti
    // due meccanismi di congelamento indipendenti si sommano male e ognuno sposta le posizioni
    // dell'altro. `triggerRouteFrame` è in spazio "percorso", cioè al netto delle pause precedenti.
    type Pause =
      | { at: number; frames: number; kind: 'photo'; photoIdx: number }
      | { at: number; frames: number; kind: 'interlude'; interlude: PlannedInterlude }
    const pauses: Pause[] = [
      ...(isCarousel ? [] : photoStops.map((_, i): Pause => ({
        at: photoTriggerRouteFrames[i], frames: PHOTO_REVEAL_FRAMES, kind: 'photo', photoIdx: i,
      }))),
      ...plannedInterludes.map((pi): Pause => ({
        at: pi.triggerRouteFrame, frames: pi.frames, kind: 'interlude', interlude: pi,
      })),
    ].sort((a, b) => a.at - b.at)

    // Finestre degli stacchi in fotogrammi globali — servono al piano delle schede POI per non
    // programmarne una sotto un pannello.
    const interludeRanges: { start: number; end: number }[] = []
    {
      let off = 0
      for (const pz of pauses) {
        const trig = pz.at + off
        if (pz.kind === 'interlude') interludeRanges.push({ start: INTRO_FRAMES + trig, end: INTRO_FRAMES + trig + pz.frames })
        off += pz.frames
      }
    }

    const frameToState = (frameIdx: number): {p:number; introP?:number; reveal?:{group:{photos:{photo:RoutePhoto;img:HTMLImageElement}[]};revealFrame:number}; outroP?:number; followFrame?:number; stopIndex?:number; stopT?:number; interlude?:{kind:InterludeKind; t:number}} => {
      // Intro phase: route frozen at p=0, camera interpolates via introP 0→1
      if (frameIdx < INTRO_FRAMES) {
        return {p: 0, introP: frameIdx / Math.max(1, INTRO_FRAMES - 1)}
      }
      const afterIntro = frameIdx - INTRO_FRAMES
      let pauseOffset = 0
      for (const pz of pauses) {
        const triggerF = pz.at + pauseOffset
        if (afterIntro < triggerF) break
        if (afterIntro < triggerF + pz.frames) {
          if (pz.kind === 'photo') {
            const g = photoStops[pz.photoIdx]
            return {p: g.progress, reveal: {group: g, revealFrame: afterIntro - triggerF}}
          }
          // Stacco: la telecamera resta ferma dov'era e il pannello si sovrappone alla mappa (che
          // continua a essere disegnata), così l'entrata è una dissolvenza e non un taglio netto.
          return {
            ...followStateAt(pz.at),
            interlude: { kind: pz.interlude.kind, t: (afterIntro - triggerF) / pz.frames },
          }
        }
        pauseOffset += pz.frames
      }
      const routeFrame = afterIntro - pauseOffset
      if (routeFrame >= ROUTE_FRAMES) {
        const outroFrame = routeFrame - ROUTE_FRAMES
        return {p: 1.0, outroP: Math.min(1, outroFrame / Math.max(1, OUTRO_FRAMES - 1))}
      }
      return followStateAt(routeFrame)
    }

    // ── Modalità "Illustrativo": pianificazione delle schede POI ────────────────
    // Il quando di ogni scheda dipende da frameToState (le pause foto e le soste del carosello
    // spostano il fotogramma in cui la telecamera passa su un punto), quindi si costruisce una
    // tabella avanzamento→fotogramma percorrendo una volta sola la fase di percorso, invece di
    // ricavarla con una formula che dovrebbe replicare quelle stesse pause.
    const poiPlan = (() => {
      if (!isIllustrativo || !pois?.length) return null
      const frameOfP: number[] = []
      for (let f = followBase; f < TOTAL_FRAMES; f++) {
        const st = frameToState(f)
        if (st.outroP !== undefined) break
        // I fotogrammi di stacco vanno saltati: lì l'avanzamento è congelato e la scheda sarebbe
        // comunque coperta dal pannello, quindi non sono un buon punto a cui agganciare un luogo.
        if (st.interlude || st.followFrame === undefined) continue
        const bucket = Math.min(999, Math.max(0, Math.round(st.p * 999)))
        if (frameOfP[bucket] === undefined) frameOfP[bucket] = f
      }
      let last = followBase
      for (let i = 0; i < 1000; i++) { if (frameOfP[i] === undefined) frameOfP[i] = last; else last = frameOfP[i] }
      const routeLatLon = pts.filter(q => q.lat != null && q.lon != null).map(q => ({ lat: q.lat!, lon: q.lon! }))
      // `thumbnail` viene valorizzato SOLO per le immagini davvero caricate poco sopra: così un
      // luogo la cui miniatura non è arrivata viene declassato a segnaposto da requireImage,
      // invece di programmare una scheda che poi resterebbe con il riquadro vuoto.
      const wikiById = new Map((poiWiki ?? []).map(({ poi, wiki }) => [poi.id, {
        thumbnail: poiImages.has(poi.id) ? wiki.thumbnail : undefined,
        extract: wiki.extract,
      }]))
      return planPoiCards(projectPoisOnRoute(pois, routeLatLon, wikiById), {
        progressToFrame: (p) => frameOfP[Math.min(999, Math.max(0, Math.round(p * 999)))],
        cardFrames:   Math.round(TARGET_FPS * 2.6),
        minGapFrames: Math.round(TARGET_FPS * 0.7),
        lastFrame:    followBase + ROUTE_FRAMES,
        maxCards:     10,
        minSpacingP:  0.055,
        groupWindowP: 0.022,
        includeSensitive: videoPoiIncludeSensitive,
        requireImage: videoPoiRequireImage,
        blockedRanges: interludeRanges,
      })
    })()

    // NB: renderAbortRef viene azzerato all'INIZIO della preparazione, non qui — azzerarlo a questo
    // punto cancellerebbe un annullamento chiesto durante la preparazione stessa, facendo partire
    // il rendering che l'utente ha appena fermato.
    setRenderTotal(RENDER_END_FRAME - RENDER_START_FRAME); setRenderFrame(0); frameCountRef.current=RENDER_START_FRAME
    lastIconOpacityRef.current.clear()

    // Always recompute shots with current slider values so intro/follow/outro
    // all use the same zoomFollow, even if sliders were changed after the wizard opened
    const currentShots=planShots(pts, zoomIntro, zoomFollow)

    // Ritardo prima che il callout di vetta possa comparire: subito dopo l'intro lo schermo sta
    // ancora pulendosi dal titolo d'apertura, e due testi sovrapposti non li legge nessuno.
    const TITLE_DUR = Math.round(TARGET_FPS * 2.2)
    // Strip database code prefix (e.g. "dtrek1234567890" or "dtrek1234567890 - Titolo")
    const displayTitle=(title??'').replace(/^dtrek[a-z0-9]+\s*[-–:·\s]*/i,'').trim()||(title??'')

    // Fires callback after MapLibre renders the current frame, with a 600ms fallback.
    // Prevents the render loop from stalling if MapLibre skips a render cycle
    // (e.g. when the camera has fully converged and the map considers the scene unchanged).
    // Callback is allowed to be async (capture callbacks await encoder backpressure).
    // Candidato per gli sporadici fotogrammi neri/vuoti segnalati sui tratti di viaggio più lunghi
    // (Sezione 4): la telecamera lì attraversa più terreno nuovo per frame che durante una sosta
    // (ferma su un punto già "assestato"), quindi ha più probabilità di catturare un fotogramma
    // mentre MapLibre ha appena ripitturato ma i tile della nuova porzione di mappa non sono ancora
    // arrivati — 'render' si attiva ad ogni ridisegno, non solo quando tutto è caricato. Concede
    // qualche ripittura extra (limitata) prima di catturare, invece di aspettare 'idle' (troppo
    // lento da fare ad ogni fotogramma) o catturare subito (rischio di terreno non ancora pronto).
    const onNextRender = (cb: () => void | Promise<void>) => {
      let fired = false
      // NB: un tentativo precedente ritardava cb() di un requestAnimationFrame extra dopo 'render',
      // nell'ipotesi di dare tempo al compositor. In pratica ha peggiorato drasticamente il problema
      // (quasi tutti i fotogrammi neri): il ritardo sposta sistematicamente la lettura dentro il
      // PROSSIMO ciclo di ripittura interno di MapLibre (subito dopo il suo gl.clear(), prima del
      // ridisegno vero) invece che fuori da esso. cb() resta quindi sincrono rispetto a 'render';
      // il rilevatore isCanvasBlank sotto resta come rete di sicurezza per i casi (rari) in cui
      // anche questa lettura sincrona cade nella finestra sbagliata.
      const fire = () => { if (!fired) { fired = true; cb() } }
      let attempts = 0
      const MAX_TILE_WAIT_ATTEMPTS = 3
      const tryFire = () => {
        if (fired) return
        const tilesReady = typeof (map as any).areTilesLoaded === 'function' ? (map as any).areTilesLoaded() : true
        if (tilesReady || attempts >= MAX_TILE_WAIT_ATTEMPTS) { fire(); return }
        attempts++
        // Richiedere un'altra ripittura è essenziale, non facoltativo: senza triggerRepaint la
        // catena di tentativi si BLOCCA ogni volta che MapLibre non ha nulla da ridisegnare da sé
        // (camera già assestata, in attesa dei tile dalla rete) — nessun evento 'render' arriva
        // più e si finiva sistematicamente sul timeout qui sotto. È esattamente ciò che accade nei
        // tratti veloci (tile mai pronti in tempo) e non in quelli lenti: la causa dell'asimmetria
        // segnalata sui fotogrammi neri.
        try { map!.once('render' as any, tryFire); map!.triggerRepaint() } catch { fire() }
      }
      try { map!.once('render' as any, tryFire); map!.triggerRepaint() } catch {}
      // Rete di sicurezza se gli eventi 'render' non arrivano affatto. Non cattura direttamente:
      // catturare da un timer significa leggere il canvas WebGL in un istante arbitrario, anche a
      // metà di una ripittura di MapLibre (dopo il suo gl.clear(), prima che abbia ridisegnato) —
      // cioè un fotogramma nero. Forza invece una ripittura e cattura DENTRO il suo evento 'render'.
      setTimeout(() => {
        if (fired) return
        try { map!.once('render' as any, fire); map!.triggerRepaint() } catch { fire() }
        // Ultimissima istanza (mappa che non ripittura affatto): qui isCanvasBlank resta l'unica
        // protezione, e in quel caso il composito trattiene l'ultimo fotogramma buono.
        setTimeout(fire, 400)
      }, 600)
    }

    /**
     * Sospende la generazione finché l'app non torna in primo piano, invece di lasciarla proseguire
     * a vuoto.
     *
     * Con il documento nascosto requestAnimationFrame smette proprio di essere chiamato (è la
     * specifica: gli animation frame girano solo per documenti visibili) e MapLibre di conseguenza
     * non ridipinge più. Le due reti di sicurezza a tempo dentro onNextRender però continuavano a
     * scattare, catturando il canvas COM'ERA RIMASTO: il video proseguiva con la mappa congelata e
     * HUD, cuore e barra di avanzamento che scorrevano sopra un'immagine ferma, a circa un
     * fotogramma al secondo di orologio. isCanvasBlank non poteva accorgersene — quel canvas non è
     * nero, è solo vecchio — quindi il risultato era un video sbagliato che sembrava riuscito.
     *
     * Restituisce true se ha messo in pausa: chi chiama deve interrompersi subito e non fare nulla.
     * Alla ripresa `resume` rifà il fotogramma da capo (il contatore non è ancora avanzato).
     */
    const runWhenVisible = (resume: () => void): boolean => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') return false
      visibilityWaiterRef.current?.()   // una sola attesa alla volta
      const onVis = () => {
        if (document.visibilityState !== 'visible') return
        visibilityWaiterRef.current?.()
        setRenderPaused(false)
        if (renderAbortRef.current) return
        // La mappa in background non ha ridipinto: senza forzare una ripittura il primo fotogramma
        // dopo la ripresa catturerebbe ancora il canvas vecchio, cioè proprio ciò che si evita qui.
        try { map.triggerRepaint() } catch {}
        resume()
      }
      document.addEventListener('visibilitychange', onVis)
      visibilityWaiterRef.current = () => {
        document.removeEventListener('visibilitychange', onVis)
        visibilityWaiterRef.current = null
      }
      setRenderPaused(true)
      return true
    }

    const renderNextFrame = () => {
      if(renderAbortRef.current) return
      const frameIdx=frameCountRef.current
      // La finalizzazione va lasciata correre anche a schermo spento: non disegna nulla, non
      // dipende da requestAnimationFrame, e fermarla qui significherebbe buttare via un video
      // ormai completo solo perché l'ultimo fotogramma è caduto nel momento sbagliato.
      if(frameIdx>=RENDER_END_FRAME){
        if(videoEncoderRef.current){ finishRecording().catch(err=>{ console.error(err); failRendering('Errore durante la finalizzazione del video. Riprova.') }) }
        else { mediaRecorderRef.current?.stop() }
        return
      }
      // Punto di pausa principale: fra un fotogramma e l'altro, prima di impegnare qualsiasi cosa.
      if (runWhenVisible(renderNextFrame)) return

      const {p, introP, reveal, outroP, followFrame, stopIndex, stopT, interlude} = frameToState(frameIdx)
      setRenderProgress((frameIdx-RENDER_START_FRAME)/Math.max(1,RENDER_END_FRAME-RENDER_START_FRAME)); setRenderFrame(frameIdx-RENDER_START_FRAME)

      // Luce del terreno all'ora vera del punto in cui si è arrivati. Il sole avanza col cursore:
      // trenta secondi di video ripercorrono le ore vere dell'escursione, quindi su un'uscita che
      // parte all'alba e finisce nel pomeriggio le ombre girano e si accorciano davvero. Prima di
      // disegnare, così l'ombreggiatura è già quella giusta nel fotogramma che sta per essere
      // catturato invece di arrivare con un fotogramma di ritardo.
      if (mapRef.current) {
        if (sunLightRef.current) {
          const win = hikeTimeWindowRef.current
          const sunP = clamp01(introP !== undefined ? 0 : outroP !== undefined ? 1 : p)
          const when = new Date(win.start + (win.end - win.start) * sunP)
          const si = Math.min(Math.max(0, Math.round(sunP * (N - 1))), N - 1)
          applySunLook(mapRef.current, terrainSunLook(getSunPosition(pts[si].lat!, pts[si].lon!, when)), sunLookCache.current)
        } else {
          clearSunLook(mapRef.current, sunLookCache.current)
        }
      }

      // During photo reveal: hold camera, show photo fullscreen with Ken Burns effect
      if (reveal) {
        requestAnimationFrame(async ()=>{
          if (renderAbortRef.current) return
          // Il contatore non è ancora avanzato: alla ripresa questo stesso fotogramma si rifà da capo.
          if (runWhenVisible(renderNextFrame)) return
          try {
          const t = reveal.revealFrame / PHOTO_REVEAL_FRAMES
          const alpha = t<0.08 ? t/0.08 : t>0.92 ? (1-t)/0.08 : 1
          const groupPhotos = reveal.group.photos
          const lead = groupPhotos[0]
          const img = lead.img
          // Se la foto non è ancora completamente decodificata (raro: sortedPhotos è già filtrato
          // sulle immagini caricate, ma resta una guardia difensiva) salta SOLO il ridisegno — non
          // il clearRect qui sotto, così il canvas composito mantiene l'ultimo contenuto buono
          // invece di restare vuoto, e viene comunque codificato più sotto: un fotogramma duplicato
          // è impercettibile, un buco nella timeline dei timestamp no (vedi mapAvailableF/O).
          const imgReady = img.complete && img.naturalWidth > 0
          if (imgReady) {
          ctx.clearRect(0, 0, outW, outH)
          if (groupPhotos.length > 1) {
            // Gruppo di scatti dello stesso momento: si aprono insieme come polaroid posate su un
            // tavolo, invece di scorrere una dopo l'altra come tante interruzioni separate.
            const bg = ctx.createLinearGradient(0, 0, 0, outH)
            bg.addColorStop(0, '#132433'); bg.addColorStop(1, '#080f16')
            ctx.fillStyle = bg; ctx.fillRect(0, 0, outW, outH)
            const zoomT = Math.min(1, t / 0.15) * (t > 0.85 ? Math.max(0, (1 - t) / 0.15) : 1)
            drawStopPhotoZoom(ctx, outW, outH, Math.min(outW,outH)/1080,
              groupPhotos.map(g => ({ img: g.img, caption: g.photo.caption?.trim(), id: g.photo.id })),
              zoomT, t)
          } else {
          // Ken Burns: slow zoom + gentle drift per photo
          const photoIdx = sortedPhotos.findIndex(sp => sp.photo.id === lead.photo.id)
          const kbScale = 1 + 0.07 * t
          const driftDir = (photoIdx % 2 === 0) ? 1 : -1
          const kbDX = driftDir * outW * 0.03 * t
          const kbDY = outH * 0.02 * t
          const srcA = img.width / img.height
          const dstA = outW / outH
          let sx=0,sy=0,sw=img.width,sh=img.height
          if(srcA>dstA){sw=Math.round(sh*dstA);sx=(img.width-sw)/2}
          else{sh=Math.round(sw/dstA);sy=(img.height-sh)/2}
          ctx.save()
          ctx.translate(outW/2 + kbDX, outH/2 + kbDY)
          ctx.scale(kbScale, kbScale)
          ctx.drawImage(img, sx, sy, sw, sh, -outW/2, -outH/2, outW, outH)
          ctx.restore()
          // Vignette
          const vig=ctx.createRadialGradient(outW/2,outH/2,outW*0.3,outW/2,outH/2,outW*0.75)
          vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.35)')
          ctx.fillStyle=vig; ctx.fillRect(0,0,outW,outH)
          // Caption
          if(lead.photo.caption){
            const sc2=Math.min(outW,outH)/1080
            ctx.globalAlpha=alpha
            ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,outH-Math.round(100*sc2),outW,Math.round(100*sc2))
            ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle'
            ctx.font=`italic ${Math.round(38*sc2)}px Georgia,serif`
            ctx.fillText(lead.photo.caption,outW/2,outH-Math.round(50*sc2))
            ctx.globalAlpha=1
          }
          }
          // Fade overlay
          ctx.globalAlpha=1-alpha; ctx.fillStyle='black'; ctx.fillRect(0,0,outW,outH); ctx.globalAlpha=1
          }
          if (videoEncoderRef.current) {
            await waitForEncoderQueue(videoEncoderRef.current)
            let _vf: InstanceType<typeof VideoFrame> | null = null
            try { const lfi = frameCountRef.current - RENDER_START_FRAME; _vf = new VideoFrame(composite, { timestamp: Math.round(lfi * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: lfi % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
            finally { _vf?.close() }
          }
          } catch (err) { console.error('[dtrek] reveal frame error:', err) }
          frameCountRef.current++; renderedFramesRef.current++
          renderNextFrame()
        })
        return
      }

      // Outro phase: camera pulls back from the route end, straightening to north, after traversal
      if (outroP !== undefined) {
        const LOOP_BACK_FROM = 0.72
        if (outroStartBearRef.current < 0) outroStartBearRef.current = smoothBearRef.current
        // Ease-in² on orbit so it starts at near-zero angular velocity, eliminating the
        // bearing velocity discontinuity at the follow→outro transition
        const easedOutroP = outroP * outroP
        // Lo zoom out finale si raddrizza sempre col nord fisico in alto. Fino a qui la telecamera
        // ha seguito la direzione di marcia, quindi il tracciato appariva ruotato di un angolo
        // qualsiasi: nell'inquadratura d'insieme — quella che si guarda per capire DOVE si è stati,
        // e l'unica che si può confrontare con una cartina — l'orientamento arbitrario è proprio
        // ciò che rende il percorso irriconoscibile. Si arriva a nord per la via più corta
        // (shortestAngleTo), non ruotando sempre nello stesso verso, altrimenti mezzo giro di
        // troppo verrebbe percorso all'indietro.
        //
        // Con la chiusura ad anello attiva il nord viene raggiunto alla fine dell'allargamento
        // (LOOP_BACK_FROM), non all'ultimo fotogramma: dopo di quello la telecamera torna
        // all'inquadratura d'apertura per chiudere il ciclo. È l'inquadratura d'insieme a essere
        // orientata a nord, che è quella che conta.
        const northTurnSpan = videoLoopEnding ? LOOP_BACK_FROM : 1
        const northT = Math.min(1, easedOutroP / (northTurnSpan * northTurnSpan))
        const outroBearing = (outroStartBearRef.current
          + shortestAngleTo(outroStartBearRef.current, 0) * northT + 360) % 360
        const outroPitch = lerp(48, 8, outroP)
        const outroZoom_val = lerp(zoomFollow, zoomOutro, outroP)
        smoothBearRef.current = lerpAngle(smoothBearRef.current, outroBearing, 0.04)
        smoothPitchRef.current = lerp(smoothPitchRef.current, outroPitch, 0.06)
        smoothZoomRef.current = lerp(smoothZoomRef.current, outroZoom_val, 0.06)
        // Chiusura ad anello: nell'ultima parte del finale la telecamera torna all'inquadratura di
        // partenza. Reels e TikTok riavvolgono da soli, e un video che finisce su una schermata nera
        // e riparte da una mappa dà uno stacco netto che rompe il ciclo — mentre chiudere dove si è
        // aperti fa ripartire il filmato senza soluzione di continuità, e chi guarda spesso lo vede
        // due o tre volte invece di una.
        const loopT = (videoLoopEnding && outroP > LOOP_BACK_FROM)
          ? (outroP - LOOP_BACK_FROM) / (1 - LOOP_BACK_FROM) : 0
        const loopEase = loopT * loopT * (3 - 2 * loopT)   // parte e arriva con velocità nulla
        const endLon = pts[N-1].lon!, endLat = pts[N-1].lat!
        const cLon = endLon + (pts[0].lon! - endLon) * loopEase
        const cLat = endLat + (pts[0].lat! - endLat) * loopEase
        if (loopT > 0) {
          // Verso l'inquadratura d'apertura: stesso rilievo, stesso zoom, stessa direzione
          smoothPitchRef.current = lerp(smoothPitchRef.current, 20, 0.06 + 0.10 * loopEase)
          smoothZoomRef.current  = lerp(smoothZoomRef.current, zoomIntro, 0.06 + 0.10 * loopEase)
          smoothBearRef.current  = lerpAngle(smoothBearRef.current, introBearing, 0.05 + 0.10 * loopEase)
        }
        const outroElev = mapRef.current?.queryTerrainElevation?.([cLon, cLat]) ?? undefined
        mapRef.current?.jumpTo({
          center: [cLon, cLat],
          bearing: smoothBearRef.current, pitch: smoothPitchRef.current, zoom: smoothZoomRef.current,
          ...(outroElev != null ? { elevation: outroElev } : {}),
        })
        // Photo/POI pins: fade out over first 30% of outro via symbol layer opacity.
        // setPaintProperty forces a style recalc even when the value is unchanged —
        // skip the call when the cached value already matches.
        const outroIconOpacity = outroP < 0.3 ? (1 - outroP / 0.3) : 0
        if (lastIconOpacityRef.current.get(photoPinLayerId) !== outroIconOpacity) {
          try { map!.setPaintProperty(photoPinLayerId, 'icon-opacity', outroIconOpacity); lastIconOpacityRef.current.set(photoPinLayerId, outroIconOpacity) } catch {}
        }
        if (lastIconOpacityRef.current.get(poiPinLayerId) !== outroIconOpacity) {
          try { map!.setPaintProperty(poiPinLayerId, 'icon-opacity', outroIconOpacity); lastIconOpacityRef.current.set(poiPinLayerId, outroIconOpacity) } catch {}
        }
        try { map!.triggerRepaint() } catch {}
        onNextRender(async () => {
          if (!mapRef.current) { frameCountRef.current++; renderedFramesRef.current++; renderNextFrame(); return }
          // Pausa qui, PRIMA di catturare: è il punto in cui la rete di sicurezza a tempo di
          // onNextRender scattava a mappa nascosta e incollava nel video un canvas vecchio.
          if (runWhenVisible(renderNextFrame)) return
          try {
          // Se la mappa non è momentaneamente disponibile (resize/context hiccup) salta SOLO il
          // ridisegno: il canvas composito mantiene l'ultimo contenuto buono, che viene comunque
          // codificato più sotto — saltare anche la codifica lascerebbe un vuoto nella timeline dei
          // timestamp del video (il contatore fotogramma avanza comunque), che alcuni player
          // riempiono con un fotogramma nero invece di trattenere l'ultimo buono: un fotogramma
          // duplicato è impercettibile, un buco nella timeline no.
          const mapAvailableO = mapCanvas.width > 0 && mapCanvas.height > 0 && !isCanvasBlank(mapCanvas)
          if (mapAvailableO) {
          ctx.clearRect(0, 0, outW, outH)
          // ctx.filter (color grading) rimosso qui — vedi la nota estesa nel blocco "follow" più
          // sotto sul perché.
          const crO = coverRect(mapCanvas.width, mapCanvas.height, outW, outH)
          ctx.drawImage(mapCanvas, crO.sx, crO.sy, crO.sw, crO.sh, 0, 0, outW, outH)
          const sc2 = Math.min(outW, outH) / 1080
          // User pin visible at start of outro, fades out over first 20%
          if (videoShowUserPin && outroP < 0.2) {
            const siHrO = SAMPLES - 1  // p=1.0 in fase di finale: ultimo campione della serie
            const bpmNowO = hasHr ? smoothHr[siHrO] : 0
            const effortO = (videoPinEffortColorEnabled && hasHr) ? hrEffortAt(smoothHr, siHrO, hrMin, hrMax) : null
            if (videoHeartEffectEnabled && bpmNowO > 0) heartPhaseRef.current = (heartPhaseRef.current + (bpmNowO/60)/TARGET_FPS) % 1
            ctx.globalAlpha = 1 - outroP / 0.2
            drawMapPin(ctx, outW/2, outH/2, outW/1080, faceImgRef.current, effortO)
            if (videoHeartEffectEnabled && bpmNowO > 0) drawHeartBadge(ctx, outW/2, outH/2, outW/1080, bpmNowO, heartPhaseRef.current)
            ctx.globalAlpha = 1
          }
          // Scoppio di stelline all'arrivo finale (opzionale) — un solo momento, non ad ogni foto,
          // agganciato all'inizio del finale mentre il pin sfuma via.
          const STAR_BURST_WINDOW = 0.28
          if (videoArrivalStarsEnabled && outroP < STAR_BURST_WINDOW) {
            drawArrivalStars(ctx, outW/2, outH/2, outW/1080, outroP / STAR_BURST_WINDOW)
          }
          // Il punteggio NON compare più nel finale: era l'unica cosa che ci finiva sempre, senza
          // che nessuno l'avesse chiesta, e come stacco esiste già fra le opzioni (INTERLUDE_LABEL
          // 'tei'), dove l'utente decide se e dove metterlo.

          // Schermata di chiusura — il disegno sta in drawEndCard (lib/videoOverlays.ts), qui
          // resta solo il QUANDO. `fade` sale da FADE_START e, con la chiusura ad anello, ritorna a
          // zero mentre la telecamera rientra sull'inquadratura d'apertura: velo e scheda se ne
          // vanno insieme e l'ultimo fotogramma coincide col primo.
          const FADE_START = 0.34
          // Senza anello la scheda deve essere PIENA prima della fine, non arrivarci appena in
          // tempo: prima si completava esattamente all'ultimo fotogramma e restava leggibile per
          // una frazione di secondo.
          const cardEnd = videoLoopEnding ? LOOP_BACK_FROM : 0.62
          const loopOutRaw = videoLoopEnding && outroP > LOOP_BACK_FROM
            ? (outroP - LOOP_BACK_FROM) / (1 - LOOP_BACK_FROM) : 0
          const loopOut = 1 - loopOutRaw * loopOutRaw * (3 - 2 * loopOutRaw)
          if (outroP > FADE_START) {
            const fa = Math.pow(Math.max(0, Math.min(1, (outroP - FADE_START) / Math.max(0.01, cardEnd - FADE_START))), 1.2) * loopOut
            drawEndCard(ctx, outW, outH, sc2, { title: displayTitle, km: totalKm, elevGain }, fa)
          }
          }

          // Codifica SEMPRE, anche quando mapAvailableO era false (in quel caso composite trattiene
          // l'ultimo fotogramma buono) — vedi il commento su mapAvailableO sopra.
          if (videoEncoderRef.current) {
            await waitForEncoderQueue(videoEncoderRef.current)
            let _vf: InstanceType<typeof VideoFrame> | null = null
            try { const lfi = frameCountRef.current - RENDER_START_FRAME; _vf = new VideoFrame(composite, { timestamp: Math.round(lfi * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: lfi % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
            finally { _vf?.close() }
          }
          } catch (err) { console.error('[dtrek] outro frame error:', err) }
          frameCountRef.current++; renderedFramesRef.current++
          renderNextFrame()
        })
        return
      }

      // Quanto è "aperta" la Visione in questo fotogramma, 0→1. Serve anche al disegno, più sotto:
      // titolo, statistiche e barra di avanzamento appartengono al volo, e mentre la mappa si
      // allarga per essere annotata devono uscire di scena — altrimenti si sovrappongono proprio
      // alle etichette, che è quello che succedeva.
      let visionWide = 0

      const rawIdx=p*(N-1), i0=Math.floor(rawIdx), i1=Math.min(i0+1,N-1), frac=rawIdx-i0
      // During intro p=0 → lon/lat = pts[0]; follow/outro → actual position
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
      const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac

      if (interlude?.kind === 'visione') {
        // ── Visione: la telecamera si alza e allarga fino a inquadrare tutto il percorso ──────
        // A differenza degli altri stacchi (pannello sopra una mappa ferma) qui la mappa è il
        // contenuto: si allarga a volo d'uccello, orientata a nord come una cartina, e su di essa
        // affiorano le linee. Il ritorno alla telecamera di percorso non serve programmarlo: appena
        // lo stacco finisce il ramo "follow" riprende a inseguire il proprio bersaglio, e i lerp
        // riportano l'inquadratura al suo posto con la stessa morbidezza di sempre.
        const vt = clamp01(interlude.t)
        // Inquadratura di partenza congelata al primo fotogramma dello stacco: da lì si va al fit
        // e da lì si torna, quindi il rientro riconsegna alla fase di volo esattamente la
        // telecamera che le era stata tolta.
        if (!visionStartCamRef.current) {
          visionStartCamRef.current = {
            zoom: smoothZoomRef.current, pitch: smoothPitchRef.current, bearing: smoothBearRef.current,
            lon, lat,
          }
        }
        const from = visionStartCamRef.current
        // Ingresso e uscita: si allarga nel primo tratto, resta larga mentre si leggono le
        // etichette, e ricomincia a stringere sull'ultimo pezzo così il rientro non è uno scatto.
        const enter = clamp01(vt / (VISION_CAMERA_SECONDS / Math.max(0.1, visionSeconds)))
        const leave = clamp01((vt - 0.86) / 0.14)
        const wide = Math.min(1 - Math.pow(1 - enter, 3), 1 - leave * leave)
        visionWide = wide
        // Assegnazione diretta, non il filtro esponenziale usato nel volo: lì serve ad ammorbidire
        // un bersaglio che sobbalza col GPS, qui il movimento è una coreografia e il filtro
        // introdurrebbe solo un ritardo — con l'effetto che l'inquadratura non raggiunge mai
        // davvero il fit e il percorso resta tagliato, che è il difetto da correggere.
        smoothBearRef.current  = lerpAngle(from.bearing, 0, wide)
        smoothPitchRef.current = lerp(from.pitch, 6, wide)
        smoothZoomRef.current  = lerp(from.zoom, visionFit.zoom, wide)
        const vLon = from.lon + (visionFit.lon - from.lon) * wide
        const vLat = from.lat + (visionFit.lat - from.lat) * wide
        const vElev = mapRef.current?.queryTerrainElevation?.([vLon, vLat]) ?? undefined
        mapRef.current?.jumpTo({
          center: [vLon, vLat], bearing: smoothBearRef.current,
          pitch: smoothPitchRef.current, zoom: smoothZoomRef.current,
          ...(vElev != null ? { elevation: vElev } : {}),
        })
        // Le linee e il velo entrano insieme all'allargamento e se ne vanno con esso.
        if (mapRef.current) setVisionLayerOpacity(mapRef.current, wide, visionOpacityCache.current)
      } else if (introP !== undefined) {
        visionStartCamRef.current = null
        // ── Intro: camera swoops in, route stays at p=0, pin hidden ──────────
        const introShot = currentShots.find(s => s.id === 'intro') ?? currentShots[0]
        // Ease-out on introP: target reaches follow values by ~80% of intro, giving
        // the IIR filter time to converge before the follow phase starts.
        const easedIntroP = 1 - Math.pow(1 - introP, 2)
        const targetPitch = lerp(introShot.pitch[0], introShot.pitch[1], easedIntroP)
        const targetZoom  = lerp(introShot.zoom[0],  introShot.zoom[1],  easedIntroP)
        // Faster lerp in the last 30% of intro to ensure full convergence
        const lerpF = introP > 0.7 ? lerp(0.07, 0.14, (introP - 0.7) / 0.3) : 0.07
        smoothBearRef.current  = lerpAngle(smoothBearRef.current, introBearing, 0.022)
        smoothPitchRef.current = lerp(smoothPitchRef.current, targetPitch, lerpF)
        smoothZoomRef.current  = lerp(smoothZoomRef.current, targetZoom, lerpF)
        // Elevazione del terreno passata esplicitamente insieme al center: senza questo,
        // MapLibre la risincronizza con un frame di ritardo rispetto a jumpTo (centerClampedToGround
        // aggiorna transform.elevation nel render loop successivo, non nella stessa chiamata) — su
        // un pendio ripido quel ritardo di un frame sposta visibilmente il punto "a schermo centro"
        // rispetto al tracciato realmente drappeggiato sul terreno 3D, facendo apparire il pin
        // fuori dal percorso proprio nei tratti in salita/discesa più marcata.
        const introElev = mapRef.current?.queryTerrainElevation?.([pts[0].lon!, pts[0].lat!]) ?? undefined
        mapRef.current?.jumpTo({
          center: [pts[0].lon!, pts[0].lat!], bearing: smoothBearRef.current,
          pitch: smoothPitchRef.current, zoom: smoothZoomRef.current,
          ...(introElev != null ? { elevation: introElev } : {}),
        })
      } else {
        visionStartCamRef.current = null
        // ── Follow: camera tracks GPS, pin moves ──────────────────────────────
        // Route bearing: look 12% ahead so camera anticipates direction
        const lookIdx=Math.min(Math.round((p+0.12)*(N-1)),smoothRouteBears.length-1)
        const routeBear=smoothRouteBears[lookIdx]
        const followShot = currentShots.find(s => s.id === 'follow') ?? currentShots[currentShots.length-1]
        const cam = shotCamera(followShot, routeBear, p, orbitBaseRef)
        // Niente più zoom telecamera sul percorso in prossimità di una foto (Sezione 4): è la foto
        // stessa che ora si ingrandisce a coprire lo schermo durante la sosta, vedi drawStopPhotoZoom.
        smoothBearRef.current  = lerpAngle(smoothBearRef.current, cam.bearing, 0.022)
        smoothPitchRef.current = lerp(smoothPitchRef.current, cam.pitch, 0.06)
        smoothZoomRef.current  = lerp(smoothZoomRef.current, cam.zoom, 0.06)
        // Stesso motivo del commento sopra (fase intro) — qui è il caso più visibile: center
        // cambia a ogni frame seguendo il GPS, quindi un ritardo di un frame nell'elevazione è
        // costante durante tutta la fase "follow", non solo un guizzo isolato.
        const followElev = mapRef.current?.queryTerrainElevation?.([lon, lat]) ?? undefined
        mapRef.current?.jumpTo({
          center:[lon,lat], bearing:smoothBearRef.current,
          pitch:smoothPitchRef.current, zoom:smoothZoomRef.current,
          ...(followElev != null ? { elevation: followElev } : {}),
        })
        // Colorazione progressiva del percorso. Prima si aggiornava ogni 20 fotogrammi (due terzi
        // di secondo!) e sempre fino a un punto INTERO del tracciato: il colore avanzava quindi a
        // scatti larghi, tanto più visibili quanto più i punti GPS sono radi. Ora si aggiorna ad
        // ogni fotogramma e l'ultimo vertice è interpolato sulla posizione esatta del pin, così la
        // punta colorata sta sempre esattamente sotto di lui e l'avanzamento è continuo.
        if(mapRef.current){
          const cov=pts.slice(0,i0+1).map(pp=>[pp.lon!,pp.lat!])
          cov.push([lon,lat])
          try{(mapRef.current.getSource('route-traveled') as any)?.setData({type:'Feature',geometry:{type:'LineString',coordinates:cov},properties:{}})}catch{}
        }
      }

      // Photo/POI pins: hidden in intro, visible in follow (symbol layer driven by opacity).
      // Skip the call when the cached value already matches — avoids a style recalc
      // every single frame for a value that's constant for the whole intro or follow phase.
      const followIconOpacity = introP !== undefined ? 0 : 1
      // Il pin della foto in sosta si "apre" sul canvas (drawStopPhotoZoom) — il suo pin sulla
      // mappa sfuma via man mano che quello cresce, per non vederli sovrapposti.
      const stopZoomT = (isCarousel && stopIndex !== undefined) ? stopPhotoZoomAt(stopT ?? 0) : 0
      const photoIconOpacity = followIconOpacity * (1 - stopZoomT)
      if (lastIconOpacityRef.current.get(photoPinLayerId) !== photoIconOpacity) {
        try { map!.setPaintProperty(photoPinLayerId, 'icon-opacity', photoIconOpacity); lastIconOpacityRef.current.set(photoPinLayerId, photoIconOpacity) } catch {}
      }
      if (lastIconOpacityRef.current.get(poiPinLayerId) !== followIconOpacity) {
        try { map!.setPaintProperty(poiPinLayerId, 'icon-opacity', followIconOpacity); lastIconOpacityRef.current.set(poiPinLayerId, followIconOpacity) } catch {}
      }
      // Capture frame after MapLibre's own render pass completes (guarantees frame reflects jumpTo)
      try { map!.triggerRepaint() } catch {}
      onNextRender(async ()=>{
        if(!mapRef.current) { frameCountRef.current++; renderedFramesRef.current++; renderNextFrame(); return }
        // Vedi il gemello nel ramo del finale: pausa prima di catturare, non dopo.
        if (runWhenVisible(renderNextFrame)) return
        try {

        // Se la mappa non è momentaneamente disponibile (resize/context hiccup) salta SOLO il
        // ridisegno: il canvas composito mantiene l'ultimo contenuto buono, che viene comunque
        // codificato più sotto — saltare anche la codifica lascerebbe un vuoto nella timeline dei
        // timestamp del video (il contatore fotogramma avanza comunque), che alcuni player
        // riempiono con un fotogramma nero invece di trattenere l'ultimo buono: un fotogramma
        // duplicato è impercettibile, un buco nella timeline no.
        const mapAvailableF = mapCanvas.width > 0 && mapCanvas.height > 0 && !isCanvasBlank(mapCanvas)
        if (mapAvailableF) {
        ctx.clearRect(0, 0, outW, outH)
        // Color grading (ctx.filter) rimosso qui di proposito, come debug mirato allo sfarfallio/
        // fotogrammi neri segnalati: ctx.filter su canvas 2D è una delle operazioni più costose
        // (spesso richiede un intero passaggio software di post-processing, non solo GPU) ed è nota
        // per implementazioni incoerenti/difettose su alcuni motori mobile in accelerazione
        // GPU — specialmente filtrando un drawImage che ha per sorgente un canvas WebGL, esattamente
        // il caso qui (mapCanvas è il canvas di MapLibre). Applicato/rimosso ad OGNI fotogramma per
        // l'intero video, non un uso occasionale. Punto ragionevole da eliminare prima di continuare
        // a cercare altrove, avendo già escluso diverse altre cause plausibili senza risolvere.
        const crF = coverRect(mapCanvas.width, mapCanvas.height, outW, outH)
        ctx.drawImage(mapCanvas,crF.sx,crF.sy,crF.sw,crF.sh,0,0,outW,outH)

        // Hyperlapse opzionale (Sezione 4): un leggero sdoppiamento della mappa a scala crescente e
        // opacità calante, solo nei tratti di viaggio più lunghi — dà energia dove il viaggio dura
        // davvero, invece che essere costante per tutto il video.
        if (isCarousel && videoHyperlapseEnabled && journey && followFrame !== undefined) {
          const hlT = hyperlapseIntensityAt(followFrame, journey.travelSegments)
          if (hlT > 0.02) {
            ctx.save(); ctx.globalAlpha = hlT * 0.30
            ctx.translate(outW/2, outH/2); ctx.scale(1.05, 1.05); ctx.translate(-outW/2, -outH/2)
            ctx.drawImage(mapCanvas, crF.sx, crF.sy, crF.sw, crF.sh, 0, 0, outW, outH)
            ctx.restore()
            ctx.save(); ctx.globalAlpha = hlT * 0.16
            ctx.translate(outW/2, outH/2); ctx.scale(1.10, 1.10); ctx.translate(-outW/2, -outH/2)
            ctx.drawImage(mapCanvas, crF.sx, crF.sy, crF.sw, crF.sh, 0, 0, outW, outH)
            ctx.restore()
          }
        }

        const sc2=Math.min(outW,outH)/1080
        // Con lo stile "Carosello", durante la sosta su una foto è quest'ultima (drawStopPhotoZoom,
        // più sotto) a occupare il centro schermo: il pin dell'utente non si disegna in quel caso.
        const stopZoomTNow = (isCarousel && stopIndex !== undefined) ? stopPhotoZoomAt(stopT ?? 0) : 0

        // Cuore/colore FC (opzionali e indipendenti, entrambi gli stili): fatica nel punto corrente
        // del percorso e avanzamento della fase del battito — vedi hrEffortAt/heartPhaseRef sopra.
        const siHr = Math.min(Math.round(p*(SAMPLES-1)), SAMPLES-1)
        const bpmNow = hasHr ? smoothHr[siHr] : 0
        const effortNow = (videoPinEffortColorEnabled && hasHr) ? hrEffortAt(smoothHr, siHr, hrMin, hrMax) : null
        if (videoHeartEffectEnabled && bpmNow > 0) {
          heartPhaseRef.current = (heartPhaseRef.current + (bpmNow / 60) / TARGET_FPS) % 1
        }

        // Apertura: titolo + cifra forte SOPRA l'intro aerea. Non è una schermata a sé — l'intro
        // dura comunque, e lasciarla muta significa aprire con secondi in cui non c'è nulla da
        // leggere, che sui social è il modo più efficace per farsi scorrere via.
        if (videoShowTitle && introP !== undefined && !isIllustrativo) {
          drawOpeningTitle(ctx, outW, outH, sc2, displayTitle, openingHeadline, introP)
        }

        // Carta d'identità del percorso, sopra l'intro aereo (modalità Illustrativo): solo numeri
        // oggettivi, quelli veri per chiunque lo cammini. Niente CTS — è tarato sulla persona e
        // descrive chi cammina, non il sentiero.
        if (isIllustrativo && introP !== undefined) {
          drawIdentikit(ctx, outW, outH, sc2, displayTitle, [
            { k: 'distanza',  v: `${totalKm.toFixed(1)} km` },
            { k: 'dislivello', v: `+${elevGain} m` },
            { k: 'quota max', v: `${Math.round(altMaxAll)} m` },
            { k: 'luoghi',    v: `${poiPlan ? poiPlan.cards.length + poiPlan.markers.length : 0}` },
          ], introP)
        }

        // Pendenza normalizzata nel punto corrente (per l'ombra che si allunga in salita): differenza
        // di quota su una finestra corta della serie già ricampionata, ±12 m di dislivello = ±1.
        const slopeNow = (videoSlopeShadowEnabled && altitudeSeries.length > 2)
          ? (() => {
              const wgap = Math.max(1, Math.round(altitudeSeries.length * 0.02))
              const iA = Math.max(0, siHr - wgap), iB = Math.min(altitudeSeries.length - 1, siHr)
              return Math.max(-1, Math.min(1, (altitudeSeries[iB] - altitudeSeries[iA]) / 12))
            })()
          : 0

        // Scia dietro al pin: sotto al pin stesso, così la coda gli passa "dietro" e non sopra.
        if (videoShowUserPin && videoTrailEnabled && introP === undefined && stopZoomTNow <= 0.001) {
          const spNow = hasSpeed ? smoothSpeed[siHr] : 3
          const trailCol = effortNow == null ? hexToRgb(routeColorRef.current) : effortRgb(effortNow)
          drawPinTrail(ctx, trailPointsAt(p, spNow, crF), sc2, trailCol)
        }

        // Momento "vetta conquistata": un solo scatto, al primo superamento del punto più alto.
        // Il pin fa un saltello mentre parte — da qui pinHop, applicato al disegno del pin sotto.
        let pinHop = 0
        if (videoPeakMomentEnabled && introP === undefined && stopZoomTNow <= 0.001) {
          if (peakHitRef.current < 0 && p >= peakRouteP) peakHitRef.current = frameIdx
          const el = peakHitRef.current < 0 ? -1 : frameIdx - peakHitRef.current
          if (el >= 0 && el < PEAK_FRAMES) {
            const ht = Math.min(1, el / (TARGET_FPS * 0.45))
            pinHop = -Math.sin(ht * Math.PI) * 34 * sc2   // un solo balzo, torna a terra da solo
          }
        }

        // Senza pin non si capirebbe più a che punto si è: la telecamera è sempre centrata e la
        // punta colorata del tracciato finisce esattamente al centro dello schermo. Un pallino che
        // pulsa nel colore del percorso segna la posizione senza reintrodurre la persona.
        if (!videoShowUserPin && introP === undefined && stopZoomTNow <= 0.001) {
          drawPositionDot(ctx, outW/2, outH/2, sc2, routeColorRef.current, (frameIdx / (TARGET_FPS * 1.4)) % 1)
        }

        // User pin: canvas center = GPS position; always visible in follow, fades in over last 30% of intro
        if (videoShowUserPin && stopZoomTNow <= 0.001) {
          if (introP === undefined) {
            drawMapPin(ctx, outW/2, outH/2 + pinHop, outW/1080, faceImgRef.current, effortNow, slopeNow)
            if (videoHeartEffectEnabled && bpmNow > 0) drawHeartBadge(ctx, outW/2, outH/2 + pinHop, outW/1080, bpmNow, heartPhaseRef.current)
          } else if (introP > 0.7) {
            ctx.globalAlpha = (introP - 0.7) / 0.3
            drawMapPin(ctx, outW/2, outH/2, outW/1080, faceImgRef.current, effortNow, slopeNow)
            if (videoHeartEffectEnabled && bpmNow > 0) drawHeartBadge(ctx, outW/2, outH/2, outW/1080, bpmNow, heartPhaseRef.current)
            ctx.globalAlpha = 1
          }
        }

        // Traguardi 25/50/75%: si scattano solo fuori dalle soste (durante una sosta la polaroid
        // occupa lo schermo e li coprirebbe) — così un traguardo raggiunto in sosta parte appena
        // la foto si richiude, invece di andare perso.
        if (videoMilestonesEnabled && introP === undefined && stopZoomTNow <= 0.001) {
          for (const mk of milestoneHitRef) {
            if (mk.hitFrame < 0 && p >= mk.mark) mk.hitFrame = frameIdx
            const el = mk.hitFrame < 0 ? -1 : frameIdx - mk.hitFrame
            if (el >= 0 && el < MILESTONE_FRAMES) {
              drawRouteMilestone(ctx, outW/2, outH/2, sc2, Math.round(mk.mark*100), el / MILESTONE_FRAMES)
            }
          }
        }

        // Schede dei luoghi (modalità Illustrativo): una sola casella a schermo per costruzione,
        // vedi lib/videoPoiCards.ts. Non si disegnano durante una sosta foto: la polaroid occupa
        // già il centro e le due cose si contenderebbero lo stesso spazio.
        if (poiPlan && !interlude && stopZoomTNow <= 0.001) {
          const active = activeCardAt(poiPlan, frameIdx)
          if (active) {
            const lead = active.card.pois[0]
            const meta = POI_META[lead.type]
            const others = active.card.pois.slice(1)
            // Ancora = il punto vero sulla mappa. Se cade fuori schermo si riporta al bordo: la
            // linea continua a indicare la direzione giusta invece di uscire dal fotogramma.
            const raw = projectToComposite(lead.lon, lead.lat, crF)
            const mrg = 42 * sc2
            const ax = Math.max(mrg, Math.min(outW - mrg, raw.x))
            const ay = Math.max(mrg, Math.min(outH - mrg, raw.y))
            drawPoiTag(ctx, outW, outH, sc2, ax, ay, {
              title: lead.name ?? meta.label,
              kind: meta.label,
              emoji: meta.emoji,
              color: meta.color,
              blurb: lead.blurb,
              image: poiImages.get(lead.id),
              extra: others.length
                ? 'con ' + others.map(o => o.name ?? POI_META[o.type].label).join(' · ')
                : undefined,
            }, active.t)
          }
        }

        // Vetta: disegnata dopo il pin, così raggi e numero gli stanno davanti
        if (videoPeakMomentEnabled && peakHitRef.current >= 0) {
          const el = frameIdx - peakHitRef.current
          if (el >= 0 && el < PEAK_FRAMES) {
            drawPeakConquered(ctx, outW/2, outH/2, outW, outH, sc2, altMaxAll, el / PEAK_FRAMES)
          }
        }

        if (isCarousel) {
          // Titolo, statistiche, profilo altimetrico e grafici corpo in un'unica fascia in alto,
          // sovrapposta alla mappa con una leggera trasparenza (drawTopBand) — sfuma via mentre la
          // foto in sosta si ingrandisce (graphAlpha), per non restare addosso alla foto.
          // Sfuma anche con la Visione, per lo stesso motivo dell'HUD Classico: la fascia porta il
          // titolo e le statistiche del volo, e resterebbe sopra le etichette dello stacco.
          const graphAlpha = (1 - stopZoomTNow) * (1 - visionWide)
          if (graphAlpha > 0.01) {
            ctx.save()
            try {
              ctx.globalAlpha = graphAlpha
              drawTopBand(ctx, outW, topBandH, sc2, {
                title: displayTitle, showTitle: videoShowTitle, showStats: videoShowStats, showProgress: videoShowProgress,
                coveredKm: +(p*totalKm).toFixed(1), totalKm: +totalKm.toFixed(1), alt: Math.round(alt), elevGain, progress: p,
                photoMarks, odometer: videoOdometerEnabled, insets: safeInsets,
              })
            } finally { ctx.restore() }
          }

          // La foto in sosta si apre da pin a quasi schermo intero, poi si richiude — vedi
          // drawStopPhotoZoom e lib/videoPhotoCarousel.ts stopPhotoZoomAt per la forma temporale.
          if (stopIndex !== undefined && photoStops[stopIndex]) {
            drawStopPhotoZoom(ctx, outW, outH, sc2,
              photoStops[stopIndex].photos.map(g => ({ img: g.img, caption: g.photo.caption?.trim(), id: g.photo.id })),
              stopZoomTNow, stopT ?? 0)
          }
        } else {
        // Pillola con la quota massima quando la telecamera ci passa sopra.
        //
        // La finestra era ±0,042 di PERCORSO, cioè l'8,4% del tracciato: su un video da un minuto
        // sono cinque secondi buoni, e con lo stile Carosello — dove l'avanzamento si ferma davvero
        // durante le soste — bastava una foto vicino al punto più alto per lasciarla incollata a
        // schermo per tutta la sosta. Era questo il "si blocca per troppi secondi".
        // Ora la finestra è un TEMPO (≈2,4 s), convertito in percorso: la stessa cosa che fanno già
        // i segnalini di quota poco sopra.
        // Non compare se sono attivi i segnalini di quota (mostrano lo stesso numero nello stesso
        // punto) o il momento della quota massima (che è la versione in grande di questa pillola):
        // erano tre modi di dire la stessa cosa, sovrapposti.
        const peakWindowP = Math.min(0.042, (TARGET_FPS * 2.4) / Math.max(1, ROUTE_FRAMES))
        const peakDist=Math.abs(p-peakRouteP)
        if(!videoElevMarkersEnabled&&!videoPeakMomentEnabled&&peakDist<peakWindowP&&altitudeSeries.length>0&&introP===undefined&&frameIdx>TITLE_DUR){
          const peakAlpha=Math.pow(Math.max(0,1-peakDist/peakWindowP),0.5)*0.9
          const maxAlt=Math.round(altMaxAll)
          const label=`▲ ${maxAlt} m`
          ctx.save()
          ctx.font=`700 ${Math.round(20*sc2)}px -apple-system,sans-serif`
          const lw=ctx.measureText(label).width+Math.round(28*sc2), lh=Math.round(38*sc2)
          const lx=Math.round((outW-lw)/2), ly=Math.round(outH*0.115)
          ctx.globalAlpha=peakAlpha
          ctx.fillStyle='rgba(0,0,0,0.6)'; rrect(ctx,lx,ly,lw,lh,lh/2); ctx.fill()
          ctx.fillStyle='#60a5fa'; ctx.textAlign='center'; ctx.textBaseline='middle'
          ctx.fillText(label,outW/2,ly+lh/2)
          ctx.globalAlpha=1; ctx.restore()
        }

        // La vecchia "title card" (velo nero + titolo sui primi 2,2s del percorso) è stata tolta:
        // arrivava DOPO l'intro, cioè dopo il momento in cui si decide se guardare, e per farlo
        // spegneva la mappa proprio mentre il percorso partiva. Il suo compito lo fa ora
        // drawOpeningTitle, sovrimpresso all'intro senza rubarle tempo.
        // Sfuma via mentre la Visione si apre: il suo titolo e le sue etichette occupano lo stesso
        // spazio, e due titoli sovrapposti non si leggono né l'uno né l'altro.
        if (visionWide < 0.99) {
          ctx.globalAlpha = 1 - visionWide
          drawHUD(ctx,outW,outH,{showTitle:videoShowTitle,title:displayTitle,showStats:videoShowStats,coveredKm:+(p*totalKm).toFixed(1),totalKm:+totalKm.toFixed(1),alt:Math.round(alt),elevGain,showProgress:videoShowProgress,progress:p,shotLabel:introP!==undefined?'Intro aereo':'Seguimento',photoMarks,odometer:videoOdometerEnabled})
          ctx.globalAlpha = 1
        }
        }

        // Quota nei punti notevoli: compare quando la telecamera ci passa sopra e sfuma via.
        // Ancorata poco sopra il centro, dove sta il pin — è quello il punto del percorso.
        if (videoElevMarkersEnabled && !interlude && introP === undefined && stopZoomTNow <= 0.001) {
          const windowP = Math.min(0.06, (TARGET_FPS * 2.2) / Math.max(1, ROUTE_FRAMES))
          for (const em of elevMarks) {
            const d = p - em.p
            if (d >= 0 && d < windowP) {
              drawElevationMarker(ctx, outW/2, outH/2 - 150*sc2, sc2, em.m, em.trend, d / windowP)
              break
            }
          }
        }

        // Didascalia dalla guida: sopra al percorso, ma mai insieme a uno stacco o a una foto in
        // sosta — tre testi contemporanei a schermo non li legge nessuno.
        if (isIllustrativo && !interlude && stopZoomTNow <= 0.001 && introP === undefined) {
          const capWindowP = Math.min(0.5, (TARGET_FPS * 3.6) / Math.max(1, ROUTE_FRAMES))
          const act = activeCaptionAt(videoCaptions, p, capWindowP)
          if (act) drawStoryCaption(ctx, outW, outH, sc2, act.caption.text, act.t)
        }

        // Stacco: pannello a schermo intero sopra la mappa (che resta disegnata sotto, ferma sul
        // punto in cui la telecamera si è fermata) — così l'entrata è una dissolvenza, non un taglio.
        // Va dopo fascia/HUD e prima della mini-mappa: quando il pannello è opaco copre tutto.
        if (interlude) {
          const it = interlude.t
          switch (interlude.kind) {
            case 'visione': {
              // Unico stacco che NON copre la mappa con un pannello: la mappa è il contenuto. Si
              // disegna solo il titolo e, sopra ai punti veri, le etichette collegate da una linea.
              //
              // La proiezione va chiesta alla mappa a ogni fotogramma (non calcolata una volta):
              // durante l'allargamento la telecamera si sta ancora muovendo, e un'ancora calcolata
              // in anticipo scivolerebbe via dal luogo che sta indicando. Le coordinate tornano in
              // pixel del canvas della mappa e vanno riportate nel fotogramma finale, che è
              // ritagliato in proporzione diversa (coverRect).
              const mapC = mapRef.current
              if (mapC && visionCallouts.length > 0) {
                const crV = coverRect(mapCanvas.width, mapCanvas.height, outW, outH)
                const kx = outW / crV.sw, ky = outH / crV.sh
                const dprV = mapCanvas.width / Math.max(1, mapC.getContainer().clientWidth)
                const project = (la: number, lo: number) => {
                  const pt = mapC.project([lo, la])
                  return { x: (pt.x * dprV - crV.sx) * kx, y: (pt.y * dprV - crV.sy) * ky }
                }
                const laid = layoutVisionCallouts(visionCallouts, project, {
                  width: outW, height: outH,
                  insets: {
                    // Sotto al blocco del titolo dello stacco, che col corpo più grande arriva a
                    // circa 105·sc dal margine sicuro: sopra ci finirebbe la prima etichetta.
                    top: safeInsets.top + Math.round(124 * sc2), bottom: safeInsets.bottom + Math.round(70 * sc2),
                    left: safeInsets.left + Math.round(14 * sc2), right: safeInsets.right + Math.round(14 * sc2),
                  },
                  labelWidth: Math.round(360 * sc2),
                  // Alzato con la dimensione del testo: qualificatore, nome e sottolineatura
                  // occupano ora più spazio in verticale, e righe troppo fitte li farebbero
                  // toccare fra un'etichetta e la successiva.
                  rowHeight: Math.round(124 * sc2),
                })
                drawVisionTitle(ctx, outW, sc2, safeInsets.top, title ?? 'Il percorso', it)
                // Le etichette entrano una dopo l'altra dentro la finestra che resta dopo
                // l'allargamento della telecamera: tutte insieme sarebbero un lampo illeggibile.
                const startAt = VISION_CAMERA_SECONDS / Math.max(0.1, visionSeconds)
                const window = Math.max(0.05, 0.9 - startAt)
                const per = window / Math.max(1, laid.length)
                for (const c of laid) {
                  const localT = clamp01((it - (startAt + c.order * per * 0.75)) / Math.max(0.06, per * 1.6))
                  const fadeOut = 1 - clamp01((it - 0.9) / 0.1)
                  if (localT <= 0.001) continue
                  ctx.globalAlpha = fadeOut
                  drawVisionCallout(ctx, sc2, {
                    name: c.feature.name, qualifier: c.feature.qualifier,
                    anchorX: c.anchorX, anchorY: c.anchorY,
                    labelX: c.labelX, labelY: c.labelY, side: c.side, order: c.order,
                  }, VISION_CATEGORY_COLOR[c.feature.category] ?? '#fff', localT, Math.round(360 * sc2))
                  ctx.globalAlpha = 1
                }
              }
              break
            }
            case 'numeri':
              drawNumbersBeat(ctx, outW, outH, sc2, [
                { k: 'distanza',   v: `${totalKm.toFixed(1)} km` },
                { k: 'dislivello', v: `+${elevGain} m` },
                { k: 'quota max',  v: `${Math.round(altMaxAll)} m` },
                { k: 'in cammino', v: routeTimeLabel },
              ], it)
              break
            case 'profilo':
              drawElevationBeat(ctx, outW, outH, sc2, altitudeSeries, [
                { k: 'dislivello +', v: `+${elevGain} m` },
                { k: 'pendenza media', v: dtmProfile?.avgSlopeDeg != null ? `${Math.round(dtmProfile.avgSlopeDeg)}°` : '—' },
              ], it)
              break
            case 'natura': {
              const belt = estimateVegetationBelt(pts[0]?.lat ?? 45, altMaxAll)
              drawNatureBeat(ctx, outW, outH, sc2, {
                belt: belt.label.charAt(0).toUpperCase() + belt.label.slice(1),
                description: belt.description,
                extra: [
                  { k: 'quota max', v: `${Math.round(altMaxAll)} m` },
                  { k: 'dislivello', v: `+${elevGain} m` },
                ],
              }, it)
              break
            }
            case 'tei':
              if (teiView) drawTeiPanel(ctx, outW, outH, sc2, teiView, it)
              break
            case 'avvisi':
              drawNoticesBeat(ctx, outW, outH, sc2, {
                notices: normalizedNotices,
                verifiedOn: guide?.generatedAt
                  ? new Date(guide.generatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
                  : undefined,
              }, it)
              break
            case 'luoghi': {
              // Luoghi notevoli e foto dell'utente insieme, in ordine di percorso: chi guarda si
              // chiede "cosa c'è lungo il cammino", e sono due risposte alla stessa domanda.
              const fromPois = (poiPlan?.cards.flatMap(c => c.pois) ?? [])
                .filter(q => q.name)
                .map(q => ({
                  atP: q.progress, name: q.name!, kind: POI_META[q.type].label,
                  emoji: POI_META[q.type].emoji, color: POI_META[q.type].color,
                  image: poiImages.get(q.id),
                }))
              const fromPhotos = photoStops.map(g => ({
                atP: g.progress,
                name: g.photos[0]?.photo.caption?.trim() || 'La tua foto',
                kind: g.photos.length > 1 ? `${g.photos.length} scatti` : 'Il tuo scatto',
                emoji: '📷', color: '#e08d3c',
                image: g.photos[0]?.img,
                caption: g.photos.length > 1 ? undefined : undefined,
              }))
              const list = [...fromPois, ...fromPhotos].sort((a2, b2) => a2.atP - b2.atP)
              if (list.length) drawPlacesBeat(ctx, outW, outH, sc2, list, it)
              break
            }
          }
        }

        // Mini-mappa d'insieme: per ultima, così resta sopra a fascia/HUD.
        //
        // Appoggiata alla barra di avanzamento in basso a destra, non più a mezz'aria sopra la
        // mappa: lì galleggiava proprio nella fascia dove passano le polaroid dei punti foto e ci
        // finiva sopra. Ancorata al chrome sta dove l'occhio già cerca i dati del video, e la
        // striscia bassa è l'unica che nessun altro elemento attraversa.
        //
        // Durante la Visione non si disegna affatto: quello stacco È una mappa d'insieme, e
        // sovrapporgliene una seconda in miniatura è ridondante oltre che un ingombro in più
        // proprio dove servono le etichette.
        if (videoMiniMapEnabled && miniRoute.length > 1 && introP === undefined && visionWide < 0.5) {
          const mmSize = Math.round(outW * 0.15)
          const mmPad = Math.round(18 * sc2)
          const mmX = outW - Math.max(safeInsets.right, mmPad) - mmSize
          const mmY = isCarousel
            // Col Carosello la barra sta nella fascia in alto: in basso resta libero, e ci si
            // appoggia al margine sicuro invece che a un HUD che qui non c'è.
            ? outH - safeInsets.bottom - mmSize - mmPad
            : Math.round(hudProgressBarTop(outW, outH, videoShowProgress)) - mmSize - mmPad
          const mmCol = effortNow == null ? hexToRgb(routeColorRef.current) : effortRgb(effortNow)
          // Resta visibile anche durante una sosta su foto: è il riferimento d'insieme, e proprio
          // mentre una polaroid occupa il centro serve di più, non di meno.
          ctx.globalAlpha = 1 - visionWide * 2
          drawMiniMap(ctx, mmX, mmY, mmSize, sc2, miniRoute, p, mmCol)
          ctx.globalAlpha = 1
        }
        }

        // Codifica SEMPRE, anche quando mapAvailableF era false (in quel caso composite trattiene
        // l'ultimo fotogramma buono) — vedi il commento su mapAvailableF sopra: un fotogramma
        // duplicato è impercettibile, un buco nella timeline dei timestamp no.
        if (videoEncoderRef.current) {
          await waitForEncoderQueue(videoEncoderRef.current)
          let _vf: InstanceType<typeof VideoFrame> | null = null
          try { const lfi = frameCountRef.current - RENDER_START_FRAME; _vf = new VideoFrame(composite, { timestamp: Math.round(lfi * 1_000_000 / TARGET_FPS), duration: Math.round(1_000_000 / TARGET_FPS) }); videoEncoderRef.current.encode(_vf, { keyFrame: lfi % (TARGET_FPS * 2) === 0 }); encodedFramesRef.current++ } catch {}
          finally { _vf?.close() }
        }
        } catch (err) { console.error('[dtrek] frame error:', err) }
        frameCountRef.current++; renderedFramesRef.current++
        renderNextFrame()
      })
    }

    prep('Avvio del rendering…', 1)
    setVideoState('rendering')
    renderNextFrame()

    } catch (err) {
      // Annullamento dell'utente: cancelRendering ha già ripulito tutto e riportato lo stato a
      // 'idle', non c'è nessun fallimento da segnalare.
      if (err instanceof PrepAborted) { webglLostCleanupRef.current?.(); return }
      // L'errore VERO, non solo il consiglio. Prima veniva scartato senza nemmeno un log: in
      // produzione non c'era modo di sapere cosa fosse andato storto.
      console.error(`[dtrek] preparazione video fallita (fase: ${prepStageRef.current}):`, err)
      failRendering(prepErrorMessage(prepStageRef.current, err))
    }
  },[videoSpeedKmS,videoFps,videoOrientation,videoShowTitle,videoShowStats,videoShowProgress,title,routePhotos,videoExcludedPhotoIds,videoPreset,altitudeSeries,photoDurationSec,zoomIntro,zoomFollow,zoomOutro,pois,videoShowPois,videoPhotoStyle,videoHookFastIntro,videoHyperlapseEnabled,videoMode,videoPoiIncludeSensitive,videoPoiRequireImage,poiWiki,guide,videoInterludes,videoCaptions,videoElevMarkersEnabled,videoLoopEnding,beautyScore,videoShowUserPin,videoHeartEffectEnabled,videoPinEffortColorEnabled,videoArrivalStarsEnabled,videoMilestonesEnabled,videoTrailEnabled,videoPhotoMarksEnabled,videoOdometerEnabled,videoPeakMomentEnabled,videoSlopeShadowEnabled,videoMiniMapEnabled,cumDist,totalDistanceM])

  const cancelRendering=useCallback(()=>{
    renderAbortRef.current=true; cancelAnimationFrame(animRef.current)
    visibilityWaiterRef.current?.(); setRenderPaused(false)
    frameCountRef.current=0
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
    mediaRecorderRef.current=null; compositeCanvasRef.current=null
    try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
    muxerRef.current=null; muxerTargetRef.current=null
    if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
    try { webglLostCleanupRef.current?.() } catch {}
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
    if(mapRef.current) try{cleanupRouteReveal(mapRef.current)}catch{}
    // I layer della Visione tornano invisibili: restano montati per il prossimo video, ma la mappa
    // interattiva non deve ritrovarsi addosso il velo topografico dopo una generazione.
    if(mapRef.current) try{setVisionLayerOpacity(mapRef.current,0,visionOpacityCache.current)}catch{}
    try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
    try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
    // Restore container size and map DPR (set at render start, normally restored by finishRecording)
    const map=mapRef.current; const cont=map?.getContainer()
    if(cont){cont.style.width='';cont.style.height=''}
    if(map){try{map.resize()}catch{};if(typeof(map as any).setPixelRatio==='function'){try{(map as any).setPixelRatio(window.devicePixelRatio)}catch{}}}
    // Annullare durante la PREPARAZIONE riporta al wizard, non alla mappa: chi ferma la generazione
    // in quella fase quasi sempre vuole cambiare un'impostazione e riprovare, e mandarlo a 'idle'
    // gli farebbe riaprire il wizard da capo. Ad annullamento avvenuto durante il rendering vero, la
    // destinazione resta 'idle' come prima.
    setVideoState(s => s === 'preparing' ? 'config' : 'idle')
    setRenderProgress(0); setPrepProgress(0); setPrepLabel(''); setVideoRecordedBlob(null)
  },[])

  const handleVideoDownload=useCallback(()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    if(videoObjUrlRef.current) URL.revokeObjectURL(videoObjUrlRef.current)
    const url=URL.createObjectURL(videoRecordedBlob)
    videoObjUrlRef.current=url
    const a=document.createElement('a');a.href=url;a.download=`dtrek-3d-${Date.now()}.${ext}`;a.click()
    setTimeout(()=>{ if(videoObjUrlRef.current===url){ URL.revokeObjectURL(url); videoObjUrlRef.current=null } },60_000)
    setShareToast('Video salvato!');setTimeout(()=>setShareToast(''),2500)
  },[videoRecordedBlob])

  const handleVideoShare=useCallback(async()=>{
    if(!videoRecordedBlob) return
    const ext=videoRecordedBlob.type.includes('mp4')?'mp4':'webm'
    const file=new File([videoRecordedBlob],`dtrek-3d-${Date.now()}.${ext}`,{type:videoRecordedBlob.type})
    if(typeof navigator!=='undefined'&&(navigator as any).canShare?.({files:[file]})){
      try{await navigator.share({title:title??'Percorso DTrek',text:'DTrek — Video 3D',files:[file]});setVideoState('idle');setVideoRecordedBlob(null);return}catch{}
    }
    handleVideoDownload()
  },[videoRecordedBlob,title,handleVideoDownload])

  const totalKm=+(totalDistRef.current/1000).toFixed(1)

  const generateCaption = useCallback(async () => {
    setCaptionLoading(true)
    setCaptionData(null)
    try {
      const km   = (distanceProp ?? totalDistRef.current) / 1000
      const gain = elevGainProp  ?? elevStatsRef.current.gain
      const alt  = elevStatsRef.current.altMax
      const res  = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title:         title ?? 'Escursione',
          distanceKm:    +km.toFixed(1),
          elevationGain: gain,
          maxAlt:        alt,
          date:          plannedDate,
          videoFormat:   videoOrientation,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message ?? `Errore ${res.status}`)
      setCaptionData(json)
    } catch (e: any) {
      setShareToast(e.message || 'Errore generazione caption')
      setTimeout(() => setShareToast(''), 3000)
    } finally {
      setCaptionLoading(false)
    }
  }, [title, distanceProp, elevGainProp, plannedDate, videoOrientation])

  const downloadCover = useCallback(() => {
    if (!coverPhotoId) return
    const photo = routePhotos.find(p => p.id === coverPhotoId)
    if (!photo) return
    const img = photoImgsRef.current.get(coverPhotoId)
    if (!img) return
    const [w, h] = VIDEO_DIMS[videoOrientation]
    const can = document.createElement('canvas'); can.width = w; can.height = h
    const c = can.getContext('2d')!
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'
    const imgAR = img.width / img.height, canAR = w / h
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (imgAR > canAR) { sw = Math.round(sh * canAR); sx = (img.width - sw) / 2 }
    else { sh = Math.round(sw / canAR); sy = (img.height - sh) / 2 }
    c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
    can.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `dtrek-cover-${Date.now()}.jpg`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setShareToast('Copertina salvata!')
      setTimeout(() => setShareToast(''), 2500)
    }, 'image/jpeg', 0.92)
  }, [coverPhotoId, routePhotos, videoOrientation])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[80] isolate bg-black flex flex-col" style={{touchAction:'none'}}>
      <div ref={containerRef} className="flex-1 w-full h-full" />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 pointer-events-none">
        <div className="flex items-start justify-between flex-wrap gap-y-2 p-3 bg-gradient-to-b from-black/65 to-transparent">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex gap-1 bg-black/45 backdrop-blur-md rounded-xl p-1 w-fit">
              {STYLES.map((s,i)=>(
                <button key={s.label} onClick={()=>switchStyle(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${styleIdx===i?'bg-white text-stone-900 shadow':'text-white/80 hover:bg-white/20'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {title&&<p className="text-white text-sm font-semibold drop-shadow-md ml-1 max-w-[280px] truncate">{title}</p>}
          </div>
          <div className="flex items-center flex-wrap justify-end gap-2 pointer-events-auto mt-0.5">
            <button onClick={handleStreetViewHere} title="Foto della zona"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Images style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            <button onClick={openVideoWizard} title="Crea video"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Film style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            <button onClick={handleCapture} title="Screenshot"
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <Camera style={{width:'1.1rem',height:'1.1rem'}}/>
            </button>
            {plannedTrackPoints && plannedTrackPoints.filter(p=>p.lat&&p.lon).length >= 2 && (
              <button onClick={()=>setShowPlannedRoute(v=>!v)} title="Percorso pianificato"
                className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
                  showPlannedRoute ? 'bg-terra-500/90 hover:bg-terra-600 text-white' : 'bg-black/50 hover:bg-black/75 text-white'
                }`}>
                <Layers style={{width:'1.1rem',height:'1.1rem'}}/>
              </button>
            )}
            {pois && pois.length > 0 && (
              <button onClick={()=>setShowPois(v=>!v)} title="Punti di interesse"
                className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
                  showPois ? 'bg-terra-500/90 hover:bg-terra-600 text-white' : 'bg-black/50 hover:bg-black/75 text-white'
                }`}>
                <MapPin style={{width:'1.1rem',height:'1.1rem'}}/>
              </button>
            )}
            {dtmProfile?.source === 'dtm' && (
              <button
                onClick={() => setDtmColorMode(m => m === 'none' ? 'slope' : m === 'slope' ? 'aspect' : 'none')}
                title={dtmColorMode === 'none' ? 'Colora per pendenza/esposizione (DTM)' : dtmColorMode === 'slope' ? 'Pendenza (DTM) — tocca per esposizione' : 'Esposizione (DTM) — tocca per disattivare'}
                className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
                  dtmColorMode === 'slope' ? 'bg-emerald-500/80 hover:bg-emerald-600 text-white'
                  : dtmColorMode === 'aspect' ? 'bg-sky-500/80 hover:bg-sky-600 text-white'
                  : 'bg-black/50 hover:bg-black/75 text-white'
                }`}>
                {dtmColorMode === 'aspect' ? <Compass style={{width:'1.1rem',height:'1.1rem'}}/> : <Layers style={{width:'1.1rem',height:'1.1rem'}}/>}
              </button>
            )}
            <button onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md hover:bg-black/75 flex items-center justify-center text-white transition-colors shadow-lg">
              <X className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </div>

      {/* Pannello statistiche/altimetria/controlli — trascinabile: parte come una striscia
          minima (quota/km/meteo + play) e si trascina verso l'alto per il resto, lasciando la
          mappa 3D vera e propria come protagonista dello schermo su mobile. */}
      <div
        className={`absolute bottom-0 inset-x-0 z-10 bg-black/60 backdrop-blur-md rounded-t-2xl shadow-2xl border-t border-white/10 overflow-hidden ${
          sheetDragHeight === null ? 'transition-[height] duration-200 ease-out' : ''
        }`}
        style={{ height: `${sheetCurrentHeight}px` }}
      >
        <div
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
          onClick={() => { if (sheetDragHeight === null) setSheetExpanded(v => !v) }}
          className="w-full flex flex-col items-center gap-2 pt-2 pb-3 px-4 touch-none cursor-grab active:cursor-grabbing select-none"
        >
          <span className="w-9 h-1 rounded-full bg-white/30" />
          <div className="w-full flex items-center gap-3">
            <button
              onClick={e=>{e.stopPropagation();handlePlay()}} onPointerDown={e=>e.stopPropagation()}
              disabled={!mapReady}
              className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-stone-900 shadow-lg hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-35 shrink-0"
            >
              {isPlaying?<Pause className="w-4 h-4"/>:<Play className="w-4 h-4 translate-x-0.5"/>}
            </button>
            <div className="flex-1 min-w-0 text-white">
              <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums">
                <Mountain className="w-3.5 h-3.5 text-terra-300 shrink-0"/>
                <span>{currentAlt} m</span>
                <span className="text-white/40 font-normal">·</span>
                <span>{coveredKm}/{totalKm} km</span>
              </div>
              {weatherBadge&&(
                <div className="flex items-center gap-1 text-[11px] text-white/60 mt-0.5">
                  <span className="leading-none">{weatherBadge.emoji}</span>
                  <span className="truncate">{weatherBadge.label}</span>
                  <span>{weatherBadge.temp}°</span>
                </div>
              )}
            </div>
            <ChevronUp className={`w-4 h-4 text-white/50 transition-transform shrink-0 ${sheetExpanded?'rotate-180':''}`} />
          </div>
        </div>

        {sheetExpanded && (
          <div
            className="overflow-y-auto px-4 pb-6"
            style={{ height: `calc(${sheetCurrentHeight}px - 78px)` }}
            onPointerDown={e=>e.stopPropagation()}
          >
            <div className="relative mb-2">
              {altitudeSeries.length>1?(()=>{
                const minA=seriesMin(altitudeSeries),maxA=seriesMax(altitudeSeries),range=maxA-minA||1,H=56
                const pp=altitudeSeries.map((a,i)=>`${((i/(altitudeSeries.length-1))*1000).toFixed(0)},${(H-((a-minA)/range)*(H-6)).toFixed(1)}`).join(' ')
                const cx=(progress*1000).toFixed(1)
                return(
                  <div className="w-full rounded-xl overflow-hidden backdrop-blur-sm bg-black/30 border border-white/10" style={{height:`${H}px`}}>
                    <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="w-full h-full">
                      <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e08d3c" stopOpacity="0.5"/><stop offset="100%" stopColor="#d97220" stopOpacity="0.08"/></linearGradient></defs>
                      <polygon points={`0,${H} ${pp} 1000,${H}`} fill="url(#eg)"/>
                      <polyline points={pp} fill="none" stroke="#f2cd9d" strokeWidth="2.5" strokeLinejoin="round"/>
                      <line x1={cx} y1="0" x2={cx} y2={H} stroke="white" strokeWidth="2" strokeDasharray="4,3" opacity="0.75"/>
                    </svg>
                  </div>
                )
              })():(
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                  <div className="h-full rounded-full" style={{width:`${progress*100}%`,background:'linear-gradient(90deg,#d97220,#e9ab64)'}}/>
                </div>
              )}
              <input type="range" min={0} max={1} step={0.0005} value={progress} onChange={e=>handleScrub(+e.target.value)}
                className="absolute w-full opacity-0 cursor-pointer" style={{height:'64px',top:'50%',transform:'translateY(-50%)'}}/>
            </div>
            <div className="flex justify-between mb-4 text-[10px] font-medium px-0.5">
              <span className="text-white/50">0 km</span>
              {altitudeSeries.length>0&&<span className="text-terra-300">{currentAlt} m slm</span>}
              <span className="text-white/50">{totalKm} km</span>
            </div>

            <div className="max-w-sm mx-auto flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <button onClick={reset} className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition-colors border border-white/10">
                  <RotateCcw className="w-4 h-4"/>
                </button>
                <button onClick={handlePlay} disabled={!mapReady}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-stone-900 shadow-2xl hover:bg-stone-100 active:scale-95 transition-all disabled:opacity-35">
                  {isPlaying?<Pause className="w-7 h-7"/>:<Play className="w-7 h-7 translate-x-0.5"/>}
                </button>
                <div className="flex gap-0.5 bg-white/15 rounded-xl p-1 border border-white/10">
                  {SPEEDS.map((s,i)=>(
                    <button key={s.label} onClick={()=>setSpeedIdx(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${speedIdx===i?'bg-white text-stone-900 shadow':'text-white/70 hover:bg-white/20'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/50 whitespace-nowrap font-medium">Rilievo</span>
                <input type="range" min={1} max={3} step={0.1} value={exaggeration} onChange={e=>setExaggeration(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-[#e08d3c] cursor-pointer"/>
                <span className="text-[11px] text-white font-bold w-8 text-right">{exaggeration.toFixed(1)}×</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {!mapReady&&videoState==='idle'&&(
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 text-white">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin"/>
          <p className="text-sm font-medium text-white/70">Caricamento mappa 3D…</p>
        </div>
      )}

      {shareToast&&(
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md text-stone-800 text-sm font-semibold px-4 py-2 rounded-full shadow-xl pointer-events-none">
          ✓ {shareToast}
        </div>
      )}

      {showStreetView&&streetViewPos&&(
        <StreetViewPanel lat={streetViewPos[0]} lon={streetViewPos[1]} title={title} onClose={()=>setShowStreetView(false)}/>
      )}

      {/* ══ VIDEO CONFIG ════════════════════════════════════════════════════════ */}
      {/* ══ WIZARD VIDEO ═════════════════════════════════════════════════════════
          Un unico foglio a passi invece dei due elenchi "Impostazioni" + "Montaggio":
          intestazione fissa con il passo corrente, corpo scorrevole, piè di pagina fisso con
          avanti/indietro. I passi seguono la timeline del video — vedi WIZARD_STEPS. */}
      {videoState==='config'&&!placingPhoto&&!previewingCarousel&&(
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-end z-20 pointer-events-auto">
          <div className="w-full bg-stone-900/97 rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">

            {/* Intestazione fissa: dove sono, quanto manca */}
            <div className="px-5 pt-5 pb-3.5 border-b border-white/10 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-terra-400 text-[10px] font-bold tracking-[0.14em] mb-0.5">
                    PASSO {videoStep+1} DI {WIZARD_STEPS.length}
                  </p>
                  <h2 className="text-white font-bold text-lg leading-tight">{WIZARD_STEPS[videoStep].title}</h2>
                  <p className="text-white/45 text-xs mt-0.5 leading-snug">{WIZARD_STEPS[videoStep].sub}</p>
                </div>
                <button onClick={()=>setVideoState('idle')} className="text-white/45 hover:text-white shrink-0 -mt-0.5"><X className="w-5 h-5"/></button>
              </div>
              {/* Barra dei passi, cliccabile: si può tornare indietro senza rifare tutto */}
              <div className="flex gap-1.5">
                {WIZARD_STEPS.map((s,i)=>(
                  <button key={s.id} onClick={()=>goToStep(i)} title={s.title}
                    className={`flex-1 h-1.5 rounded-full transition-colors ${i===videoStep?'bg-terra-400':i<videoStep?'bg-forest-500':'bg-white/15 hover:bg-white/25'}`}/>
                ))}
              </div>

              {/* Durata totale, sempre in vista in OGNI passo — è il senso del nuovo modello: non
                  si imposta una durata, la si compone, quindi ogni opzione accesa o spenta deve
                  avere un effetto visibile nel momento in cui la si tocca, non alla fine.
                  La barra sotto il numero mostra DI COSA è fatta: è lì che si legge cosa togliere
                  per accorciare, cosa che il solo numero non può dire. */}
              {(()=>{
                const est = videoEstimate
                const parts: { key: string; label: string; sec: number; color: string }[] = [
                  { key:'intro', label:'intro',   sec: est.introSec,     color:'#64748b' },
                  { key:'volo',  label:'volo',    sec: est.routeSec,     color:'#22c55e' },
                  { key:'foto',  label:'soste',   sec: est.photoSec,     color:'#f59e0b' },
                  { key:'beat',  label:'stacchi', sec: est.interludeSec, color:'#38bdf8' },
                  { key:'fine',  label:'finale',  sec: est.outroSec,     color:'#64748b' },
                ].filter(p=>p.sec>0.05)
                const over = est.total > 60
                return (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-white/45 text-[10px] font-bold tracking-[0.14em]">DURATA TOTALE</span>
                      <span className={`text-lg font-black tabular-nums leading-none ${over?'text-terra-300':'text-white'}`}>
                        {formatTotal(est.totalSec)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/10">
                      {parts.map(pt=>(
                        <div key={pt.key} title={`${pt.label}: ${Math.round(pt.sec)}s`}
                          style={{ width:`${(pt.sec/Math.max(1,est.totalSec))*100}%`, background:pt.color }}/>
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {parts.map(pt=>(
                        <span key={pt.key} className="flex items-center gap-1 text-[10px] text-white/45">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:pt.color}}/>
                          {pt.label} {Math.round(pt.sec)}s
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Esito di un tentativo fallito. Non un toast che sparisce dopo qualche secondo: il
                messaggio dice cosa cambiare ("riduci la durata", "escludi quella foto") e deve
                restare leggibile mentre lo si cambia davvero. */}
            {videoError&&(
              <div className="mx-5 mt-4 rounded-xl bg-red-500/12 border border-red-400/40 px-3.5 py-3 flex items-start gap-2.5 shrink-0">
                <span className="text-red-300 text-sm leading-none mt-0.5">⚠</span>
                <p className="text-red-100 text-[12px] leading-relaxed flex-1">{videoError}</p>
                <button onClick={()=>setVideoError('')} className="text-red-200/60 hover:text-red-100 shrink-0"><X className="w-4 h-4"/></button>
              </div>
            )}

            {/* Corpo scorrevole */}
            <div className="px-5 py-5 overflow-y-auto flex-1 space-y-6">

              {/* ── PASSO 1 · FORMATO ───────────────────────────────────────────── */}
              {videoStep===0&&(<>
                {/* La scelta che condiziona tutte le altre: di chi parla il video */}
                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">A COSA SERVE QUESTO VIDEO</p>
                  <div className="space-y-2">
                    {([
                      {id:'ricordo' as const, label:'Il mio ricordo', desc:'La tua uscita: il pin con la tua foto, la fatica, le tue immagini.'},
                      {id:'illustrativo' as const, label:'Far conoscere il percorso', desc:'Il sentiero che si presenta: i luoghi con il loro nome e i punteggi. Senza dati personali.'},
                    ]).map(opt=>(
                      <button key={opt.id} onClick={()=>{
                        setVideoMode(opt.id)
                        // Il pin è il soggetto di un ricordo e un intruso in una descrizione:
                        // lo si allinea alla modalità (e con lui gli effetti che gli stanno addosso).
                        setShowUserPin(opt.id==='ricordo')
                        if (opt.id==='illustrativo') setVideoShowPois(true)
                      }}
                        className={`w-full text-left rounded-xl px-3.5 py-3 border transition-colors ${
                          videoMode===opt.id ? 'bg-forest-500/20 border-forest-400/60' : 'bg-white/7 border-transparent hover:bg-white/10'
                        }`}>
                        <p className={`text-sm font-bold ${videoMode===opt.id?'text-forest-300':'text-white'}`}>{opt.label}</p>
                        <p className="text-white/45 text-[11px] mt-0.5 leading-snug">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  {videoMode==='illustrativo'&&(pois?.length??0)===0&&(
                    <p className="text-terra-300 text-[11px] mt-2 leading-relaxed">
                      Su questo percorso non risultano punti di interesse: il video resterà una descrizione di numeri e punteggi.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-white/45 text-[11px] font-semibold tracking-wider">FORMATO INSTAGRAM</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['reels','feed45','feed11'] as const).map(pr=>(
                      <button key={pr} onClick={()=>{
                        setVideoPreset(pr)
                        applyPresetPacing(pr)
                        switchStyle(VIDEO_PRESETS[pr].styleIdx)
                        setVideoOrientation(VIDEO_PRESETS[pr].orientation)
                        setVideoFps(30)
                      }} className={`py-3 rounded-xl flex flex-col items-center transition-all ${videoPreset===pr?'bg-forest-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                        <span className="text-sm font-bold">{VIDEO_PRESETS[pr].label}</span>
                        <span className="text-[10px] opacity-65 mt-0.5">{VIDEO_PRESETS[pr].desc}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-white/45 text-[11px] font-semibold tracking-wider pt-1">STILE CINEMATICO</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['epico','snappy'] as const).map(pr=>(
                      <button key={pr} onClick={()=>{
                        setVideoPreset(pr)
                        applyPresetPacing(pr)
                        switchStyle(VIDEO_PRESETS[pr].styleIdx)
                        setVideoOrientation(VIDEO_PRESETS[pr].orientation)
                        setVideoFps(30)
                      }} className={`py-3 rounded-xl flex flex-col items-center transition-all ${videoPreset===pr?'bg-forest-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                        <span className="text-sm font-bold">{VIDEO_PRESETS[pr].label}</span>
                        <span className="text-[10px] opacity-65 mt-0.5">{VIDEO_PRESETS[pr].desc}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>setVideoPreset('custom')} className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${videoPreset==='custom'?'bg-white/25 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    Personalizzato — scelgo io tutto
                  </button>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">PROPORZIONI</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {key:'9:16',   sub:'Reels/Story'},
                      {key:'4:5',    sub:'Feed verticale'},
                      {key:'1:1',    sub:'Feed quadrato'},
                      {key:'1.91:1', sub:'Feed orizzontale'},
                      {key:'16:9',   sub:'YouTube/PC'},
                    ] as const).map(({key,sub})=>(
                      <button key={key} onClick={()=>setVideoOrientation(key as any)}
                        className={`py-2.5 rounded-xl flex flex-col items-center transition-all ${videoOrientation===key?'bg-forest-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                        <span className="text-sm font-bold">{key}</span>
                        <span className="text-[9px] opacity-60 mt-0.5">{sub}</span>
                      </button>
                    ))}
                  </div>
                  {(videoOrientation==='9:16'||videoOrientation==='4:5')&&(
                    <p className="text-white/30 text-[11px] mt-2 leading-relaxed">
                      Sui formati verticali la grafica resta dentro i margini che Instagram e TikTok coprono con didascalia e pulsanti.
                    </p>
                  )}
                </div>

                {videoOrientation==='9:16'&&(
                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">FLUIDITÀ</p>
                    <div className="flex gap-2">
                      {([30,60] as const).map(fps=>(
                        <button key={fps} onClick={()=>setVideoFps(fps)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoFps===fps?'bg-forest-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                          {fps} fps{fps===60?' · Reels':''}
                        </button>
                      ))}
                    </div>
                    <p className="text-white/30 text-[11px] mt-2 leading-relaxed">60 fps rende il movimento più fluido ma allunga il tempo di generazione.</p>
                  </div>
                )}
              </>)}

              {/* ── PASSO 2 · PERCORSO ──────────────────────────────────────────── */}
              {videoStep===1&&(<>
                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">STILE MAPPA</p>
                  <div className="flex gap-2">
                    {STYLES.map((s,i)=>(
                      <button key={s.label} onClick={()=>switchStyle(i)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${styleIdx===i?'bg-white text-stone-900':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">VELOCITÀ DEL CURSORE</p>
                  <p className="text-white/30 text-[11px] mb-3 leading-relaxed">
                    Quanto percorso scorre in un secondo di video. La durata non si imposta più: è la somma di questa velocità e di tutto ciò che accendi — la trovi sempre in cima.
                  </p>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={1} step={0.001}
                      value={sliderFromSpeed(videoSpeedKmS)}
                      onChange={e=>{ setVideoSpeedKmS(speedFromSlider(+e.target.value)); setVideoPreset('custom') }}
                      className="flex-1 h-1.5 rounded-full accent-terra-400 cursor-pointer"/>
                    <span className="text-white text-xs font-bold tabular-nums w-[4.8rem] text-right">{formatSpeed(videoSpeedKmS)}</span>
                  </div>
                  <p className="text-white/40 text-[11px] mt-1.5 leading-relaxed">
                    Il percorso scorre in ~{Math.round(videoEstimate.routeSec)}s{videoEstimate.stillSec>0?`, più ${Math.round(videoEstimate.stillSec)}s a telecamera ferma fra foto e pannelli`:''}.
                  </p>

                  {/* Bersagli: l'altra direzione del modello. La velocità resta il controllo, ma
                      quando serve un video "da 30 secondi" — perché va pubblicato da qualche parte —
                      si preme il bersaglio e la velocità ci si adegua. Un bersaglio irraggiungibile
                      con le opzioni accese si disabilita, invece di consegnare una velocità che non
                      mantiene la promessa. */}
                  <p className="text-white/45 text-[11px] font-semibold mt-4 mb-1.5 tracking-wider">OPPURE PORTA IL TOTALE A</p>
                  <div className="flex gap-2">
                    {[15,30,60,90].map(target=>{
                      const solved = speedForTargetTotal(target, {
                        routeDistanceM: totalDistanceM,
                        fastIntro: videoHookFastIntro,
                        photoStops: videoEstimate.stops,
                        photoStopSec: photoDurationSec,
                        interludeSec: videoEstimate.beatSec,
                      })
                      const active = Math.abs(videoEstimate.totalSec - target) < 0.6
                      return (
                        <button key={target} disabled={solved==null}
                          onClick={()=>{ if(solved!=null){ setVideoSpeedKmS(solved); setVideoPreset('custom') } }}
                          title={solved==null?'Con le opzioni accese questo totale non è raggiungibile: intro, finale, soste e stacchi da soli lo superano già':undefined}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            solved==null ? 'bg-white/5 text-white/25 cursor-not-allowed'
                            : active ? 'bg-forest-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                          {target}s
                        </button>
                      )
                    })}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer mt-4">
                    <input type="checkbox" checked={videoHookFastIntro} onChange={e=>setVideoHookFastIntro(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Intro aerea più rapida</span>
                  </label>
                  <p className="text-white/30 text-[11px] mt-1 pl-6 leading-relaxed">
                    Un&apos;apertura lunga è il motivo principale per cui si scorre via: attiva, il volo iniziale dura {INTRO_FAST_SEC}s invece di {INTRO_SEC}s.
                  </p>

                  {(()=>{
                    const est = videoEstimate
                    const over = est.total > 60
                    const tooStill = est.stillPct > 45
                    const grouped = est.photos > est.stops
                    if (!over && !tooStill && !grouped) return null
                    return (
                      <div className={`mt-3 rounded-xl px-3.5 py-2.5 ${over||tooStill ? 'bg-terra-500/15 border border-terra-500/35' : 'bg-white/5'}`}>
                        {grouped&&(
                          <p className="text-forest-300/80 text-[11px] leading-relaxed">
                            {est.photos} foto raggruppate in {est.stops} soste: quelle vicine si aprono insieme.
                          </p>
                        )}
                        {over && (
                          <p className={`text-terra-300/85 text-[11px] leading-relaxed ${grouped?'mt-1':''}`}>
                            Oltre i 60s Instagram declassa i Reels e i caroselli non lo accettano. Alza la velocità, accorcia la sosta per foto o spegni qualche stacco.
                          </p>
                        )}
                        {tooStill && (
                          <p className="text-terra-300/85 text-[11px] mt-1 leading-relaxed">
                            {Math.round(est.stillSec)}s su {est.total}s ({est.stillPct}%) sono a telecamera ferma fra foto e pannelli: il video rischia di sembrare più una presentazione che un viaggio.
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-3 tracking-wider">ZOOM CINEMATICO</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-white/55 text-xs w-28 shrink-0">Zoom iniziale</span>
                      <input type="range" min={7} max={14} step={0.5} value={zoomIntro} onChange={e=>setZoomIntro(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-terra-400 cursor-pointer"/>
                      <span className="text-white text-xs font-bold w-8 text-right">{zoomIntro.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/55 text-xs w-28 shrink-0">Zoom percorso</span>
                      <input type="range" min={10} max={16} step={0.5} value={zoomFollow} onChange={e=>setZoomFollow(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-terra-400 cursor-pointer"/>
                      <span className="text-white text-xs font-bold w-8 text-right">{zoomFollow.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/55 text-xs w-28 shrink-0">Zoom finale</span>
                      <input type="range" min={5} max={12} step={0.5} value={zoomOutro} onChange={e=>setZoomOutro(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-terra-400 cursor-pointer"/>
                      <span className="text-white text-xs font-bold w-8 text-right">{zoomOutro.toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">INQUADRATURE</p>
                  <div className="space-y-2">
                    {shotPlan.map((shot,idx)=>(
                      <div key={shot.id} className="flex items-center gap-2 bg-white/7 rounded-xl px-3 py-2.5">
                        <GripVertical className="w-4 h-4 text-white/25 shrink-0"/>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{shot.label}</p>
                          <p className="text-white/38 text-[10px]">
                            {Math.round(shot.startP*100)}%→{Math.round(shot.endP*100)}% ·{' '}
                            {{'follow':'Seguimento','orbit-cw':'Orbita ↻','orbit-ccw':'Orbita ↺','side-left':'Lat. sx','side-right':'Lat. dx','overhead':'Zenitale'}[shot.bearingMode]}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button disabled={idx===0} onClick={()=>moveShot(shot.id,-1)}
                            className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20">
                            <ChevronLeft className="w-3.5 h-3.5"/>
                          </button>
                          <button disabled={idx===shotPlan.length-1} onClick={()=>moveShot(shot.id,1)}
                            className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 disabled:opacity-20">
                            <ChevronRight className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* ── PASSO 3 · FOTO ──────────────────────────────────────────────── */}
              {videoStep===2&&(<>
                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">COME APPAIONO LE FOTO</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      {id:'classic' as const,  label:'Classico',  desc:'Schermo intero, telecamera ferma'},
                      {id:'carousel' as const, label:'Carosello', desc:'Il pin della foto si apre in primo piano'},
                    ]).map(opt=>(
                      <button key={opt.id} onClick={()=>setVideoPhotoStyle(opt.id)}
                        className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${
                          videoPhotoStyle===opt.id ? 'bg-forest-500/20 border-forest-400/60' : 'bg-white/7 border-transparent hover:bg-white/10'
                        }`}>
                        <p className={`text-sm font-semibold ${videoPhotoStyle===opt.id?'text-forest-300':'text-white'}`}>{opt.label}</p>
                        <p className="text-white/40 text-[10px] mt-0.5 leading-snug">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  {videoPhotoStyle==='carousel'&&routePhotos.length>0&&(
                    <button
                      onClick={()=>{
                        reset()
                        carouselTraveledMRef.current = 0; carouselNextPhotoRef.current = 0; carouselStopUntilRef.current = null
                        setPreviewingCarousel(true); setIsPlaying(true)
                      }}
                      className="mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors">
                      <Play className="w-3.5 h-3.5"/> Anteprima carosello
                    </button>
                  )}
                  {videoPhotoStyle==='carousel'&&carouselEstimatedSec!==null&&(
                    <p className="text-white/40 text-[10px] mt-2 text-center">
                      Durata stimata del video: <span className="text-white/70 font-semibold">~{carouselEstimatedSec}s</span> — conseguenza della sosta per foto e del ritmo di viaggio, non un traguardo fisso.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">
                    {videoPhotoStyle==='classic' ? 'DURATA POLAROID' : 'SOSTA SU OGNI FOTO'}
                  </p>
                  <div className="flex items-center gap-3">
                    <input type="range" min={3} max={10} step={0.5} value={photoDurationSec} onChange={e=>setPhotoDurationSec(+e.target.value)} className="flex-1 h-1.5 rounded-full accent-terra-400 cursor-pointer"/>
                    <span className="text-white text-sm font-bold w-16 text-right">{photoDurationSec.toFixed(1)}s / foto</span>
                  </div>
                </div>

                {videoPhotoStyle==='carousel'&&(
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={videoHyperlapseEnabled} onChange={e=>setVideoHyperlapseEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                      <span className="text-white text-xs font-semibold">Energia sui tratti lunghi (hyperlapse)</span>
                    </label>
                    <p className="text-white/30 text-[10px] mt-1 pl-6">Un leggero effetto di velocità solo dove il tratto tra due foto è più lungo.</p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/45 text-[11px] font-semibold tracking-wider">
                      FOTO DEL PERCORSO {routePhotos.length>0&&<span className="text-terra-400">({routePhotos.length})</span>}
                    </p>
                    <label className={`flex items-center gap-1.5 text-xs font-semibold text-terra-400 hover:text-terra-300 cursor-pointer transition-colors ${photoBeingAdded?'opacity-50 pointer-events-none':''}`}>
                      {photoBeingAdded?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<ImagePlus className="w-3.5 h-3.5"/>}
                      Aggiungi
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload}/>
                    </label>
                  </div>
                  {routePhotos.length===0?(
                    <div className="border border-dashed border-white/15 rounded-xl p-5 text-center">
                      <p className="text-white/35 text-sm">Nessuna foto</p>
                      <p className="text-white/22 text-xs mt-1">GPS automatico da EXIF · tocca il percorso per posizionare</p>
                    </div>
                  ):(
                    <div className="space-y-2.5">
                      {routePhotos.map(photo=>{
                        const included = !videoExcludedPhotoIds.has(photo.id)
                        return (
                        <div key={photo.id} className={`bg-white/7 rounded-xl p-2.5 transition-opacity ${included?'':'opacity-45'}`}>
                          <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                              <img src={photo.url} alt="" className="w-14 h-14 rounded-lg object-cover"/>
                              {photo.hasExifGps&&(
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-forest-500 flex items-center justify-center" title="GPS automatico">
                                  <Check className="w-2.5 h-2.5 text-white"/>
                                </span>
                              )}
                              <button onClick={()=>togglePhotoIncluded(photo.id)}
                                title={included?'Escludi dal video':'Includi nel video'}
                                className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white/80 transition-colors ${included?'bg-forest-500':'bg-white/20'}`}>
                                {included&&<Check className="w-3 h-3 text-white"/>}
                              </button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <input
                                value={photo.caption}
                                onChange={e=>setRoutePhotos(prev=>prev.map(p=>p.id===photo.id?{...p,caption:e.target.value}:p))}
                                onBlur={e=>{
                                  const caption=e.target.value
                                  updateActivityPhoto(activityId!,photo.id,{caption}).catch(()=>{
                                    setShareToast('Errore: didascalia non salvata'); setTimeout(()=>setShareToast(''),3000)
                                  })
                                }}
                                placeholder="Testo della polaroid…"
                                className="w-full bg-transparent text-white text-xs font-medium placeholder:text-white/28 focus:outline-none border-b border-white/12 focus:border-white/35 pb-0.5 mb-2"
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                {!photo.hasExifGps&&(
                                  <button onClick={()=>setPlacingPhoto({id:photo.id,step:'pos'})}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-terra-400 hover:text-terra-300 bg-terra-500/15 rounded-lg px-2 py-1 transition-colors">
                                    <Navigation className="w-3 h-3"/>
                                    {photo.progress!==0.5?`${Math.round(photo.progress*100)}% ✓`:'Posiziona'}
                                  </button>
                                )}
                                {photo.hasExifGps&&(
                                  <span className="text-[10px] text-forest-300 font-medium">📍 {Math.round(photo.progress*100)}%</span>
                                )}
                                {/* Eliminazione a due tempi: il primo tocco chiede conferma al
                                    posto della crocetta, il secondo elimina. Una crocetta da 14 px
                                    che cancella per sempre una foto al primo tocco è troppo facile
                                    da centrare per sbaglio, soprattutto su un telefono. */}
                                {pendingDeletePhotoId===photo.id ? (
                                  <span className="ml-auto flex items-center gap-1">
                                    <button onClick={()=>setPendingDeletePhotoId(null)}
                                      className="text-[10px] font-semibold text-white/45 hover:text-white/80 px-1.5 py-1 transition-colors">
                                      Annulla
                                    </button>
                                    <button onClick={()=>{
                                      const id=photo.id
                                      setPendingDeletePhotoId(null)
                                      setRoutePhotos(prev=>prev.filter(p=>p.id!==id));photoImgsRef.current.delete(id)
                                      setVideoExcludedPhotoIds(prev=>{ if(!prev.has(id)) return prev; const next=new Set(prev); next.delete(id); return next })
                                      removeActivityPhoto(activityId!,id).catch(()=>{
                                        setShareToast('Errore: eliminazione foto non riuscita'); setTimeout(()=>setShareToast(''),3000)
                                      })
                                    }}
                                      className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg px-2 py-1 transition-colors">
                                      Elimina
                                    </button>
                                  </span>
                                ) : (
                                  <button onClick={()=>setPendingDeletePhotoId(photo.id)}
                                    title="Elimina questa foto"
                                    className="ml-auto text-white/25 hover:text-red-400 transition-colors p-1 -m-1">
                                    <X className="w-3.5 h-3.5"/>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              </>)}

              {/* ── PASSO 4 · EFFETTI ───────────────────────────────────────────── */}
              {videoStep===3&&(<>
                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DATI A SCHERMO</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {l:'Titolo',v:videoShowTitle,s:setVideoShowTitle,ok:true},
                      {l:'Statistiche',v:videoShowStats,s:setVideoShowStats,ok:true},
                      {l:'Progresso',v:videoShowProgress,s:setVideoShowProgress,ok:true},
                      {l:'Quote sul percorso',v:videoElevMarkersEnabled,s:setVideoElevMarkersEnabled,ok:altitudeSeries.length>2},
                      {l:'POI',v:videoShowPois,s:setVideoShowPois,ok:(pois?.length??0)>0},
                    ].map(item=>(
                      <button key={item.l} onClick={()=>item.ok&&item.s(v=>!v)} disabled={!item.ok}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${!item.ok?'opacity-30 cursor-not-allowed bg-white/5 text-white/40':item.v?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                        {item.l}
                        {!item.ok&&<span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                      </button>
                    ))}
                  </div>
                  {videoElevMarkersEnabled&&<p className="text-white/30 text-[11px] mt-2 leading-relaxed">La quota compare come numero nei punti che contano (il più alto, il più basso, i cambi di pendenza), con la freccia della salita — al posto del vecchio grafico altimetrico, illeggibile a schermo piccolo.</p>}
                  {videoShowPois&&<p className="text-white/30 text-[11px] mt-2 leading-relaxed">I punti di interesse non aggiungono tempo al video (a differenza delle foto) — vengono mostrati i {Math.min(MAX_VIDEO_POIS, pois?.length??0)} più rilevanti vicino al percorso.</p>}
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">IL TUO PIN</p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoShowUserPin}
                      onChange={e=>setShowUserPin(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Mostra il pin con la tua foto</span>
                  </label>
                  {!videoShowUserPin&&(
                    <p className="text-white/30 text-[11px] mb-2 pl-6 leading-relaxed">
                      Senza pin il video racconta il percorso invece di te. Gli effetti qui sotto sono legati al pin e restano spenti.
                    </p>
                  )}
                  {/* Tutto ciò che segue vive addosso al pin: senza, non ha nulla a cui attaccarsi */}
                  <div className={videoShowUserPin?'':'opacity-40 pointer-events-none'}>
                    <label className={`flex items-center gap-2 mb-2 ${hasBodyData&&videoShowUserPin?'cursor-pointer':'opacity-40'}`}>
                      <input type="checkbox" checked={videoHeartEffectEnabled} disabled={!hasBodyData||!videoShowUserPin}
                        onChange={e=>setVideoHeartEffectEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                      <span className="text-white text-xs font-semibold">Cuore 3D che batte + BPM</span>
                    </label>
                    <label className={`flex items-center gap-2 mb-2 ${hasBodyData&&videoShowUserPin?'cursor-pointer':'opacity-40'}`}>
                      <input type="checkbox" checked={videoPinEffortColorEnabled} disabled={!hasBodyData||!videoShowUserPin}
                        onChange={e=>setVideoPinEffortColorEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                      <span className="text-white text-xs font-semibold">Pin colorato dalla fatica</span>
                    </label>
                    {videoPinEffortColorEnabled&&hasBodyData&&videoShowUserPin&&(
                      <p className="text-white/30 text-[11px] mb-2 pl-6 leading-relaxed">Gettone e foto virano insieme: celeste a riposo → verde → ambra → rosso nel punto di massimo sforzo.</p>
                    )}
                    <label className={`flex items-center gap-2 mb-2 ${videoShowUserPin?'cursor-pointer':''}`}>
                      <input type="checkbox" checked={videoTrailEnabled} disabled={!videoShowUserPin}
                        onChange={e=>setVideoTrailEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                      <span className="text-white text-xs font-semibold">Scia luminosa dietro al pin</span>
                    </label>
                    <label className={`flex items-center gap-2 ${videoShowUserPin?'cursor-pointer':''}`}>
                      <input type="checkbox" checked={videoSlopeShadowEnabled} disabled={!videoShowUserPin}
                        onChange={e=>setVideoSlopeShadowEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                      <span className="text-white text-xs font-semibold">Ombra che si allunga in salita</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">VISIONE D&rsquo;INSIEME</p>
                  <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                    Poco dopo la partenza il volo si allarga fino a inquadrare tutto il percorso, orientato a nord.
                    Sopra il satellitare affiora ciò che la vegetazione nasconde, e le cose caratteristiche vengono nominate una alla volta.
                    Si accende e si spegne dallo stacco &laquo;{INTERLUDE_LABEL.visione}&raquo; qui sopra.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {(Object.keys(VISION_CATEGORY_LABEL) as VisionCategory[]).map(cat => {
                      const on = visionCategories.includes(cat)
                      const count = visionFeatures.filter(f => f.category === cat).length
                      return (
                        <button
                          key={cat}
                          onClick={() => setVisionCategories(prev => on ? prev.filter(c => c !== cat) : [...prev, cat])}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors border ${
                            on ? 'bg-white/15 border-white/40 text-white' : 'bg-transparent border-white/10 text-white/40'
                          }`}
                        >
                          {VISION_CATEGORY_LABEL[cat]}{on && count > 0 ? ` · ${count}` : ''}
                        </button>
                      )
                    })}
                  </div>
                  <label className="flex items-start gap-2 mb-2.5 cursor-pointer">
                    <input type="checkbox" checked={visionTopoVeil}
                      onChange={e=>setVisionTopoVeil(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                    <span className="text-white text-xs font-semibold leading-snug">
                      Velo topografico
                      <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                        La mappa outdoor sfuma sopra il satellitare per la durata dello stacco: impluvi, curve di livello e sentieri già mappati tornano visibili. Il satellitare resta riconoscibile sotto.
                      </span>
                    </span>
                  </label>
                  {visionFeatures.length > 0 ? (
                    <p className="text-forest-300/80 text-[11px] leading-relaxed">
                      Verranno nominati: {visionFeatures.map(f => f.name).join(' · ')}.
                    </p>
                  ) : (
                    <p className="text-terra-300/85 text-[11px] leading-relaxed">
                      Qui OpenStreetMap non ha corsi d&apos;acqua, sentieri o luoghi con un nome vicino al tracciato: senza niente da nominare la Visione viene saltata.
                    </p>
                  )}
                </div>

                {videoMode==='illustrativo'&&(
                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">SCHEDE DEI LUOGHI</p>
                    <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                      I luoghi si presentano uno alla volta, in una sola casella a schermo.
                      Fontane, panchine e aree picnic restano segnaposti sulla mappa: sono troppi e troppo fitti per meritarsi una scheda.
                    </p>
                    <label className="flex items-start gap-2 mb-2 cursor-pointer">
                      <input type="checkbox" checked={videoPoiRequireImage}
                        onChange={e=>setVideoPoiRequireImage(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                      <span className="text-white text-xs font-semibold leading-snug">
                        Solo luoghi con una foto da Wikipedia
                        <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                          Una scheda con la foto del posto racconta qualcosa; un nome accanto a un&apos;icona ripete il segnaposto che c&apos;è già sulla mappa.
                        </span>
                      </span>
                    </label>
                    {(() => {
                      const withImg = (poiWiki ?? []).filter(e => !!e.wiki.thumbnail).length
                      if (withImg > 0) return (
                        <p className="text-forest-300/80 text-[11px] mb-2 pl-6 leading-relaxed">
                          Su questo percorso {withImg === 1 ? 'c\u2019è 1 luogo con foto' : `ce ne sono ${withImg} con foto`}.
                        </p>
                      )
                      return (
                        <p className="text-terra-300/85 text-[11px] mb-2 pl-6 leading-relaxed">
                          Qui nessun luogo ha una foto su Wikipedia: con questa opzione attiva non comparirà nessuna scheda.
                          Il resto del video (stacchi, punteggi, percorso) funziona comunque.
                        </p>
                      )
                    })()}
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={videoPoiIncludeSensitive}
                        onChange={e=>setVideoPoiIncludeSensitive(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                      <span className="text-white text-xs font-semibold leading-snug">
                        Nomina anche grotte, rovine, siti archeologici e sorgenti
                        <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                          Spento, questi restano puntini senza nome. Un video fatto per girare porta gente: è così che certi posti si rovinano.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {(
                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-1 tracking-wider">STACCHI</p>
                    <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                      {videoMode==='illustrativo'
                        ? 'Il volo si ferma e un pannello resta a schermo il tempo di essere letto. La durata consigliata è calcolata su quanto c\u2019è davvero da leggere in quel pannello, su questo percorso.'
                        : 'Gli stacchi che commentano i dati appartengono alla modalità Illustrativo. La Visione no: non commenta l\u2019escursione, spiega il percorso — e serve anche quando stai raccontando la tua uscita.'}
                    </p>
                    {videoInterludes.map((iv, idx) => {
                      // Fuori dall'Illustrativo l'unico stacco disponibile è la Visione — vedi
                      // interludeSettingsForMode nella generazione, che applica la stessa regola.
                      if (videoMode!=='illustrativo' && iv.kind!=='visione') return null
                      const unavailable =
                        (iv.kind==='tei'    && !beautyScore?.categories?.length) ||
                        (iv.kind==='avvisi' && normalizeGuideNotices(guide?.notices).length===0) ||
                        (iv.kind==='luoghi' && (pois?.length ?? 0)===0) ||
                        (iv.kind==='visione' && visionFeatures.length===0)
                      const patch = (change: Partial<InterludeSetting>) =>
                        setVideoInterludes(prev => prev.map((x,i)=>i===idx?{...x,...change}:x))
                      const advised = recommendedInterludeSeconds(iv.kind, interludeContent[iv.kind])
                      const dense = interludeIsDense(iv.kind, interludeContent[iv.kind])
                      const offAdvice = Math.abs(iv.seconds - advised) >= 0.5
                      // Acceso, con dati da mostrare, ma senza un varco abbastanza lungo e libero
                      // da foto in cui stare: planInterludes lo scarterebbe in silenzio in fase di
                      // generazione. Vedi interludeFitPreview per il perché di questo controllo.
                      const wontFit = iv.enabled && !unavailable && !interludeFitPreview.has(iv.kind)
                      return (
                        <div key={iv.kind} className={`mb-2.5 ${unavailable?'opacity-40':''}`}>
                          <label className={`flex items-center gap-2 ${unavailable?'':'cursor-pointer'}`}>
                            <input type="checkbox" checked={iv.enabled && !unavailable} disabled={unavailable}
                              onChange={e=>{
                                // Attivandolo si parte dalla durata consigliata invece che da un numero
                                // fisso uguale per tutti: è la scelta giusta nella grande maggioranza
                                // dei casi, e resta comunque spostabile col cursore qui sotto.
                                patch(e.target.checked ? {enabled:true, seconds:advised} : {enabled:false})
                              }} className="w-4 h-4 accent-forest-500"/>
                            <span className="text-white text-xs font-semibold">{INTERLUDE_LABEL[iv.kind]}</span>
                            {unavailable
                              ? <span className="text-white/35 text-[10px]">— dati non disponibili</span>
                              : <span className="text-white/30 text-[10px]">· consigliati {advised}s</span>}
                          </label>
                          {wontFit && (
                            <p className="pl-6 mt-1 text-amber-300/90 text-[10px] leading-relaxed">
                              Con la durata e le foto attuali non c&apos;è un momento libero abbastanza lungo: nel video generato questo stacco non comparirà. Sono di solito le foto a occupare lo spazio — prova ad accorciarne la durata, a togliere qualche foto, oppure ad allungare il percorso qui sotto.
                            </p>
                          )}
                          {iv.enabled&&!unavailable&&(
                            <div className="pl-6 mt-1.5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-white/45 text-[10px] w-14 shrink-0">durata</span>
                                <input type="range" min={3} max={8} step={0.5} value={iv.seconds}
                                  onChange={e=>patch({seconds:+e.target.value})}
                                  className="flex-1 h-1 rounded-full accent-terra-400 cursor-pointer"/>
                                <span className="text-white/70 text-[10px] font-bold w-8 text-right">{iv.seconds}s</span>
                              </div>
                              {offAdvice&&(
                                <button onClick={()=>patch({seconds:advised})}
                                  className="text-terra-300/90 hover:text-terra-200 text-[10px] font-semibold underline underline-offset-2">
                                  {iv.seconds < advised
                                    ? `Sotto il consigliato: a ${iv.seconds}s non si fa in tempo a leggerlo — porta a ${advised}s`
                                    : `Sopra il consigliato: bastano ${advised}s — porta a ${advised}s`}
                                </button>
                              )}
                              {dense&&(
                                <p className="text-white/30 text-[10px] leading-relaxed">
                                  Questo pannello ha parecchio da leggere: sopra i 7s però diventa una pausa, quindi il contenuto viene comunque mostrato in forma ridotta.
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-white/45 text-[10px] w-14 shrink-0">quando</span>
                                <input type="range" min={5} max={95} step={1} value={Math.round(iv.atP*100)}
                                  onChange={e=>patch({atP:+e.target.value/100})}
                                  className="flex-1 h-1 rounded-full accent-terra-400 cursor-pointer"/>
                                <span className="text-white/70 text-[10px] font-bold w-8 text-right">{Math.round(iv.atP*100)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {(() => {
                      // Ora si confronta col TOTALE vero, non più con la durata del solo volo: è il
                      // totale che l'utente vede in cima, ed è rispetto a quello che "metà video di
                      // pannelli fermi" significa qualcosa.
                      const secs = videoEstimate.beatSec
                      if (secs > videoEstimate.totalSec * 0.4) return (
                        <p className="text-terra-300/85 text-[11px] mt-1 leading-relaxed">
                          {Math.round(secs)}s di pannelli fermi su {formatTotal(videoEstimate.totalSec)} di video: rischia di essere più una presentazione che un viaggio.
                        </p>
                      )
                      return null
                    })()}
                  </div>
                )}

                {videoMode==='illustrativo'&&(
                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-1 tracking-wider">DIDASCALIE DALLA GUIDA</p>
                    {videoCaptions.length===0?(
                      <p className="text-white/35 text-[11px] leading-relaxed">
                        {guide?.text
                          ? 'Nella guida non ci sono frasi abbastanza brevi da stare a schermo.'
                          : 'Questa escursione non ha una guida: le didascalie sono disponibili solo sui percorsi che ne avevano una.'}
                      </p>
                    ):(<>
                      <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                        Frasi prese dalla guida. <span className="text-white/60">Rileggile prima di pubblicare</span>: le ha scritte l&apos;AI, e finiscono in un video che poi gira.
                      </p>
                      {videoCaptions.map((c, idx) => {
                        const patch = (change: Partial<CaptionCandidate>) =>
                          setVideoCaptions(prev => prev.map((x,i)=>i===idx?{...x,...change}:x))
                        return (
                          <div key={c.id} className="mb-2.5">
                            <label className="flex items-start gap-2 cursor-pointer mb-1">
                              <input type="checkbox" checked={c.enabled}
                                onChange={e=>patch({enabled:e.target.checked})} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                              <span className="text-white/45 text-[10px] font-semibold uppercase tracking-wider">
                                {c.source==='il_percorso'?'Il percorso':c.source==='luoghi'?'Luoghi':c.source==='natura'?'Natura':'Guida'}
                              </span>
                            </label>
                            {c.enabled&&(
                              <div className="pl-6">
                                <textarea
                                  value={c.text} rows={2} maxLength={110}
                                  onChange={e=>patch({text:e.target.value})}
                                  className="w-full bg-white/7 rounded-xl px-3 py-2 text-white text-xs font-medium outline-none focus:bg-white/10 border border-transparent focus:border-white/20 resize-none"
                                />
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-white/45 text-[10px] w-14 shrink-0">quando</span>
                                  <input type="range" min={5} max={95} step={1} value={Math.round(c.atP*100)}
                                    onChange={e=>patch({atP:+e.target.value/100})}
                                    className="flex-1 h-1 rounded-full accent-terra-400 cursor-pointer"/>
                                  <span className="text-white/70 text-[10px] font-bold w-8 text-right">{Math.round(c.atP*100)}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>)}
                  </div>
                )}

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">MOMENTI LUNGO IL CAMMINO</p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoMilestonesEnabled}
                      onChange={e=>setVideoMilestonesEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Traguardi 25/50/75% del percorso</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoPeakMomentEnabled}
                      onChange={e=>setVideoPeakMomentEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Quota massima raggiunta</span>
                  </label>
                  <p className="text-white/30 text-[11px] mt-1 pl-6 leading-relaxed">
                    Un lampo e la quota in grande nel punto più alto del tracciato. Non lo chiamiamo &quot;vetta&quot;: il punto più alto di un giro non è quasi mai una cima.
                  </p>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">LUCE</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoSunLightEnabled}
                      onChange={e=>setVideoSunLightEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                    <span className="text-white text-xs font-semibold leading-snug">
                      Ombre del sole all&apos;ora vera
                      <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                        Il rilievo viene illuminato da dove stava davvero il sole, e la luce avanza col cursore: se sei partito all&apos;alba, nel video le ombre si accorciano e girano come quel giorno. Col sole basso diventano più lunghe e più calde.
                      </span>
                    </span>
                  </label>
                  {videoSunLightEnabled && (() => {
                    const fmt = (t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                    const day = new Date(hikeTimeWindow.start).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
                    return hikeTimeWindow.real ? (
                      <p className="text-forest-300/80 text-[11px] mt-1.5 pl-6 leading-relaxed">
                        Dagli orari della traccia: {day}, dalle {fmt(hikeTimeWindow.start)} alle {fmt(hikeTimeWindow.end)}.
                      </p>
                    ) : (
                      <p className="text-terra-300/85 text-[11px] mt-1.5 pl-6 leading-relaxed">
                        Questa traccia non ha orari: la luce è quella del {day} verso le {fmt(hikeTimeWindow.start)}, una stima plausibile per stagione e latitudine, non l&apos;ora reale.
                      </p>
                    )
                  })()}
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">IL TRACCIATO</p>
                  <div className="flex gap-2 mb-3">
                    {(Object.keys(ROUTE_COLORS) as RouteColorKey[]).map(k => (
                      <button
                        key={k}
                        onClick={() => setRouteColorKey(k)}
                        title={ROUTE_COLORS[k].label}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl border transition-colors ${
                          routeColorKey === k ? 'border-white/70 bg-white/10' : 'border-white/10 hover:border-white/25'
                        }`}
                      >
                        <span
                          className="w-full h-1.5 rounded-full"
                          style={{
                            background: ROUTE_COLORS[k].hex,
                            boxShadow: routeGlowEnabled ? `0 0 7px 1px ${ROUTE_COLORS[k].hex}` : 'none',
                          }}
                        />
                        <span className={`text-[10px] font-semibold ${routeColorKey === k ? 'text-white' : 'text-white/45'}`}>
                          {ROUTE_COLORS[k].label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={routeGlowEnabled}
                      onChange={e=>setRouteGlowEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                    <span className="text-white text-xs font-semibold leading-snug">
                      Alone attorno al tracciato
                      <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                        Una sfumatura dello stesso colore sotto la linea: stacca il percorso dal terreno anche dove ci passa sopra qualcosa di simile per tinta — un sentiero già disegnato, una radura chiara, la neve.
                      </span>
                    </span>
                  </label>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">IL FINALE</p>
                  <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                    L&apos;inquadratura d&apos;insieme si raddrizza sempre col nord in alto, come una cartina: è quella che si guarda per capire dove si è stati.
                  </p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoArrivalStarsEnabled}
                      onChange={e=>setVideoArrivalStarsEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Stelline all&apos;arrivo</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoLoopEnding}
                      onChange={e=>setVideoLoopEnding(e.target.checked)} className="w-4 h-4 accent-forest-500 mt-0.5"/>
                    <span className="text-white text-xs font-semibold leading-snug">
                      Chiusura ad anello
                      <span className="block text-white/35 text-[11px] font-normal mt-0.5">
                        La telecamera torna all&apos;inquadratura d&apos;apertura e la schermata di chiusura sfuma via con lei: l&apos;ultimo fotogramma è uguale al primo. Reels e TikTok riavvolgono da soli, e così il video riparte senza stacco.
                      </span>
                    </span>
                  </label>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">TOCCHI IN PIÙ</p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoPhotoMarksEnabled}
                      onChange={e=>setVideoPhotoMarksEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Tacche delle foto sulla barra di avanzamento</span>
                  </label>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoOdometerEnabled}
                      onChange={e=>setVideoOdometerEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Numeri a rullo (contachilometri)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoMiniMapEnabled}
                      onChange={e=>setVideoMiniMapEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Mini-mappa d&apos;insieme in un angolo</span>
                  </label>
                </div>

                <div className="bg-white/5 rounded-xl px-3 py-2.5 border border-white/8">
                  <p className="text-white/45 text-[10px] font-semibold uppercase tracking-wider mb-1">Sempre attivi, senza toccare nulla</p>
                  <p className="text-white/38 text-[10px] leading-relaxed">
                    ✦ Movimento lento sulle foto &nbsp;·&nbsp; ✦ Titolo e dato forte sull&apos;apertura &nbsp;·&nbsp; ✦ Percorso che si colora avanzando &nbsp;·&nbsp; ✦ Schermata finale con le statistiche &nbsp;·&nbsp; ✦ Camera fluida
                  </p>
                </div>
              </>)}

              {/* ── PASSO 5 · GENERA ────────────────────────────────────────────── */}
              {videoStep===4&&(()=>{
                const includedPhotoCount = videoEstimate.photos
                const est = videoEstimate.total
                const over = est > 60
                const effects = [
                  !videoShowUserPin&&'Senza pin utente',
                  routeColorKey!==DEFAULT_ROUTE_COLOR&&`Tracciato ${ROUTE_COLORS[routeColorKey].label.toLowerCase()}`,
                  !routeGlowEnabled&&'Senza alone',
                  videoSunLightEnabled&&(hikeTimeWindow.real?'Ombre all\u2019ora vera':'Ombre (ora stimata)'),
                  videoMode==='illustrativo'&&videoPoiRequireImage&&'Solo luoghi con foto',
                  videoLoopEnding&&'Chiusura ad anello',
                  videoElevMarkersEnabled&&'Quote sul percorso',
                  videoHeartEffectEnabled&&'Cuore 3D + BPM',
                  videoPinEffortColorEnabled&&'Pin dalla fatica',
                  videoTrailEnabled&&'Scia',
                  videoSlopeShadowEnabled&&'Ombra in salita',
                  videoMilestonesEnabled&&'Traguardi %',
                  videoPeakMomentEnabled&&'Quota max',
                  videoArrivalStarsEnabled&&'Stelline',
                  videoPhotoMarksEnabled&&'Tacche foto',
                  videoOdometerEnabled&&'Numeri a rullo',
                  videoMiniMapEnabled&&'Mini-mappa',
                  videoHyperlapseEnabled&&videoPhotoStyle==='carousel'&&'Hyperlapse',
                ].filter(Boolean) as string[]
                const rows: [string,string][] = [
                  ['Modalità', videoMode==='ricordo'?'Il mio ricordo':'Descrizione del percorso'],
                  ['Formato', `${videoOrientation} · ${videoFps} fps`],
                  ['Ritmo', videoHookFastIntro?'intro rapida':'intro estesa'],
                  ['Stile foto', videoPhotoStyle==='classic'?'Classico':'Carosello'],
                  ['Foto incluse', includedPhotoCount===0?'nessuna':`${includedPhotoCount}${videoEstimate.stops<includedPhotoCount?` in ${videoEstimate.stops} soste`:''}`],
                  ['Durata reale', `~${est}s${videoEstimate.stillPct>0?` · ${videoEstimate.stillPct}% fermo`:''}`],
                ]
                // Fuori dall'Illustrativo l'unico stacco candidato è la Visione — stessa regola di
                // interludeSettingsForMode in goToRendering. Prima questa riga compariva solo in
                // Illustrativo, quindi in "Il mio ricordo" la Visione restava fuori dal riepilogo
                // anche quando accesa: non si vedeva né che ci sarebbe stata né che sarebbe mancata.
                const beatsForMode = videoMode==='illustrativo' ? videoInterludes : videoInterludes.filter(i=>i.kind==='visione')
                const onBeats = beatsForMode.filter(i=>i.enabled)
                const fittingBeats = onBeats.filter(i=>interludeFitPreview.has(i.kind))
                const droppedBeats = onBeats.filter(i=>!interludeFitPreview.has(i.kind))
                rows.splice(5, 0,
                  ['Stacchi', fittingBeats.length ? `${fittingBeats.length} · ${fittingBeats.reduce((a,i)=>a+i.seconds,0)}s` : 'nessuno'],
                )
                if (videoMode==='illustrativo') {
                  rows.splice(6, 0,
                    ['Luoghi con foto', `${(poiWiki ?? []).filter(e=>!!e.wiki.thumbnail).length}`],
                    ['Didascalie', `${videoCaptions.filter(c=>c.enabled&&c.text.trim()).length}`],
                  )
                }
                return (<>
                  <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                    {rows.map(([k,v],i)=>(
                      <div key={k} className={`flex items-center justify-between px-3.5 py-2.5 ${i>0?'border-t border-white/8':''}`}>
                        <span className="text-white/50 text-xs">{k}</span>
                        <span className="text-white text-xs font-semibold text-right ml-3">{v}</span>
                      </div>
                    ))}
                  </div>
                  {droppedBeats.length > 0 && (
                    <p className="text-amber-300/90 text-[11px] leading-relaxed -mt-1">
                      {droppedBeats.length===1
                        ? `"${INTERLUDE_LABEL[droppedBeats[0].kind]}" è acceso ma non troverà un momento libero abbastanza lungo: non comparirà in questo video.`
                        : `${droppedBeats.map(b=>`"${INTERLUDE_LABEL[b.kind]}"`).join(' e ')} sono accesi ma non troveranno un momento libero abbastanza lungo: non compariranno in questo video.`}
                      {' '}Torna al passo <button onClick={()=>goToStep(3)} className="text-terra-300 font-semibold hover:text-terra-200 underline underline-offset-2">Effetti</button> per vedere perché.
                    </p>
                  )}

                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">EFFETTI ATTIVI ({effects.length})</p>
                    {effects.length===0?(
                      <p className="text-white/35 text-xs">Nessuno — il video sarà pulito e sobrio. Puoi tornare al passo <button onClick={()=>goToStep(3)} className="text-terra-400 font-semibold hover:text-terra-300">Effetti</button> per aggiungerne.</p>
                    ):(
                      <div className="flex flex-wrap gap-1.5">
                        {effects.map(e=>(
                          <span key={e} className="text-[10px] font-semibold text-forest-200 bg-forest-500/20 border border-forest-500/30 rounded-lg px-2 py-1">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {over&&(
                    <div className="rounded-xl px-3.5 py-2.5 bg-terra-500/15 border border-terra-500/35">
                      <p className="text-terra-300 text-xs font-semibold">~{est}s: oltre il limite dei 60s di Instagram.</p>
                      <p className="text-white/40 text-[11px] mt-1 leading-relaxed">Puoi generarlo lo stesso — su YouTube non è un problema, e su Reels resta pubblicabile ma con meno distribuzione.</p>
                    </div>
                  )}

                  <div>
                    <button onClick={()=>startRendering(true)} className="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-2">
                      <Sparkles className="w-3.5 h-3.5"/> Anteprima veloce
                    </button>
                    <p className="text-white/30 text-[11px] mt-1.5 text-center leading-relaxed">
                      Genera solo pochi secondi centrali: serve a controllare l&apos;effetto prima di aspettare il video intero.
                    </p>
                  </div>

                  <p className="text-white/25 text-[10px] text-center leading-relaxed">
                    MP4 · H.264/VP9 · {videoFps} fps · rendering fotogramma per fotogramma.<br/>
                    Tieni l&apos;app in primo piano fino alla fine.
                  </p>
                </>)
              })()}

            </div>

            {/* Piè di pagina fisso: la navigazione resta sempre a portata di pollice */}
            <div className="px-5 py-4 border-t border-white/10 shrink-0 flex gap-3">
              {videoStep===0?(
                <button onClick={()=>setVideoState('idle')} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20">Annulla</button>
              ):(
                <button onClick={()=>goToStep(videoStep-1)} className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20">← Indietro</button>
              )}
              {videoStep<WIZARD_STEPS.length-1?(
                <button onClick={()=>goToStep(videoStep+1)} className="flex-[2] py-3.5 rounded-2xl bg-forest-500 hover:bg-forest-600 text-white font-bold">
                  Avanti · {WIZARD_STEPS[videoStep+1].title} →
                </button>
              ):(
                <button onClick={()=>startRendering()} className="flex-[2] py-3.5 rounded-2xl bg-terra-600 hover:bg-terra-700 text-white font-bold flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-white animate-pulse"/>
                  Genera il video
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ══ PHOTO PLACEMENT — click on route ════════════════════════════════════ */}
      {videoState==='config'&&placingPhoto?.step==='pos'&&(
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Instruction banner */}
          <div className="absolute top-0 inset-x-0 pointer-events-auto">
            <div className="m-3 bg-forest-600/95 backdrop-blur-md rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
              <Navigation className="w-5 h-5 text-white shrink-0 animate-pulse"/>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Tocca il percorso sulla mappa</p>
                <p className="text-forest-100 text-xs mt-0.5">La foto verrà posizionata nel punto più vicino</p>
              </div>
              <button onClick={()=>setPlacingPhoto(null)} className="text-forest-100 hover:text-white transition-colors pointer-events-auto">
                <X className="w-5 h-5"/>
              </button>
            </div>
          </div>
          {/* Photo thumbnail corner */}
          {routePhotos.find(p=>p.id===placingPhoto.id)&&(
            <div className="absolute top-20 right-3 pointer-events-none">
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-1.5 shadow-xl border border-white/20">
                <img src={routePhotos.find(p=>p.id===placingPhoto.id)!.url} alt="" className="w-16 h-16 rounded-lg object-cover"/>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Anteprima dal vivo del carosello: sostituisce temporaneamente il foglio Montaggio,
          lasciando la mappa a schermo pieno visibile — stesso tick() di anteprima già usato per lo
          scrub del percorso, con la telecamera che si ferma davvero su ogni foto e la foto stessa
          che si ingrandisce a coprire lo schermo (PhotoZoomOverlay) invece del percorso che zooma. */}
      {videoState==='config'&&previewingCarousel&&(
        <>
          <PhotoZoomOverlay photo={previewPhotoZoom.photo} zoomT={previewPhotoZoom.zoomT} stopT={previewPhotoZoom.stopT}/>
          <div className="absolute inset-x-0 top-0 z-30 flex justify-end px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pointer-events-auto">
            <button
              onClick={()=>{
                setIsPlaying(false); setPreviewingCarousel(false)
                setPreviewPhotoZoom({ photo: null, zoomT: 0, stopT: 0 })
                const markerEl = markerRef.current?.getElement()
                if (markerEl) markerEl.style.opacity = '1'
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-semibold shadow-lg">
              <X className="w-3.5 h-3.5"/> Torna al montaggio
            </button>
          </div>
        </>
      )}


      {/* ══ PREPARAZIONE / RENDERING ════════════════════════════════════════════ */}
      {/* "preparazione" è una fase a sé e va mostrata come tale: dura parecchi secondi (la mappa
          deve caricare il terreno lungo tutto il percorso, una ventina di attese in fila) e prima
          non aveva alcuna schermata — si premeva "Genera" e non sembrava succedere nulla. */}
      {(videoState==='preparing'||videoState==='rendering'||videoState==='finalizing')&&(
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="absolute inset-0 bg-black/35 pointer-events-auto"/>
          <div className="absolute top-4 left-4 right-4 pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${renderPaused?'bg-white/40':'animate-pulse '+(videoState==='finalizing'?'bg-amber-400':videoState==='preparing'?'bg-forest-400':'bg-red-500')}`}/>
                  <span className="text-white text-sm font-bold tracking-wide">
                    {renderPaused?'IN PAUSA':videoState==='finalizing'?'ELABORAZIONE':videoState==='preparing'?'PREPARAZIONE':'RENDERING'}
                  </span>
                </div>
                {videoState!=='finalizing'&&<button onClick={cancelRendering} className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1 bg-white/10 rounded-full">Annulla</button>}
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mb-2">
                {videoState==='finalizing'
                  ? <div className="h-full w-2/5 rounded-full bg-amber-400 progress-indeterminate"/>
                  : videoState==='preparing'
                    ? <div className="h-full rounded-full bg-forest-400" style={{width:`${prepProgress*100}%`,transition:'width .25s ease-out'}}/>
                    : <div className="h-full rounded-full bg-forest-500" style={{width:`${renderProgress*100}%`,transition:'none'}}/>
                }
              </div>
              {renderPaused
                ? <p className="text-white/55 text-xs">Ripresa in corso…</p>
                : videoState==='finalizing'
                  ? <p className="text-white/55 text-xs">Compressione in corso… ({finalizeElapsedSec}s)</p>
                  : videoState==='preparing'
                    ? <p className="text-white/55 text-xs">{prepLabel||'Preparazione…'}</p>
                    : <p className="text-white/55 text-xs">Frame {renderFrame}/{renderTotal} · {Math.round(renderProgress*100)}%</p>
              }
              <p className="text-white/30 text-[10px] mt-0.5">
                {renderPaused
                  ? 'La generazione si è fermata quando l’app è passata in secondo piano: riprende da dove era rimasta'
                  : videoState==='finalizing'
                    ? 'Può richiedere fino a 20-30s con video lunghi o molte foto — non chiudere questa schermata'
                    : videoState==='preparing'
                      ? 'La mappa sta caricando il terreno lungo tutto il percorso: serve a evitare buchi e scatti nel video'
                      : 'Tieni aperta questa schermata: il video si genera qui, e passando ad altre app si mette in pausa'}
              </p>
            </div>
          </div>

          {/* Schermata di attesa: fatti sul percorso corrente + suggerimenti sull'app,
              a rotazione, mentre il rendering procede in background sulla stessa mappa. */}
          <div className="flex-1 flex items-center justify-center px-6 pointer-events-none">
            <div key={entertainIdx} className="fade-up bg-black/55 backdrop-blur-sm rounded-2xl px-5 py-4 max-w-xs text-center">
              <p className="text-white/85 text-sm leading-relaxed">{entertainmentContent[entertainIdx % entertainmentContent.length]}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ DONE ════════════════════════════════════════════════════════════════ */}
      {videoState==='done'&&(
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-20 pointer-events-auto">
          <div className="bg-stone-900/97 rounded-3xl px-6 py-7 mx-4 w-full max-w-sm shadow-2xl space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
                <Film className="w-7 h-7 text-green-400"/>
              </div>
              <h2 className="text-white font-bold text-lg">{lastRenderWasPreview ? 'Anteprima pronta!' : 'Video pronto!'}</h2>
              <p className="text-white/50 text-sm mt-1">1080p · {Math.round(lastRenderSeconds)}s · {videoOrientation} · {videoFps}fps</p>
              {lastRenderWasPreview && <p className="text-white/35 text-xs mt-1">Solo pochi secondi centrali al percorso, con tutti gli effetti selezionati — non il video intero.</p>}
            </div>
            <div className="flex flex-col gap-2.5">
              <button onClick={handleVideoShare} className="w-full py-3.5 rounded-2xl bg-forest-500 hover:bg-forest-600 text-white font-bold flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4"/>Condividi
              </button>
              <button onClick={handleVideoDownload} className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center justify-center gap-2">
                <Download className="w-4 h-4"/>Scarica
              </button>
            </div>

            {/* ── Copertina ────────────────────────────────────────────── */}
            {routePhotos.length>0&&(
              <div className="border-t border-white/10 pt-4 space-y-2.5">
                <p className="text-white/45 text-[11px] font-semibold tracking-wider">COPERTINA VIDEO</p>
                <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
                  {routePhotos.map(photo=>(
                    <button key={photo.id} onClick={()=>setCoverPhotoId(prev=>prev===photo.id?null:photo.id)}
                      className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${coverPhotoId===photo.id?'border-terra-400 scale-105 shadow-lg shadow-terra-500/30':'border-white/10 opacity-55 hover:opacity-90'}`}>
                      <img src={photo.url} className="w-full h-full object-cover" alt=""/>
                    </button>
                  ))}
                </div>
                {coverPhotoId?(
                  <button onClick={downloadCover}
                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all">
                    <Download className="w-3.5 h-3.5"/>Scarica copertina .jpg
                  </button>
                ):(
                  <p className="text-white/30 text-[11px] text-center">Tocca una foto per usarla come copertina su Instagram</p>
                )}
              </div>
            )}

            {/* ── Caption Instagram ─────────────────────────────────────── */}
            <div className="border-t border-white/10 pt-4 space-y-2.5">
              <p className="text-white/45 text-[11px] font-semibold tracking-wider">CAPTION INSTAGRAM</p>
              {!captionData ? (
                <button onClick={generateCaption} disabled={captionLoading}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all">
                  {captionLoading
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Generazione…</>
                    : <><Sparkles className="w-4 h-4"/>Genera Caption con AI</>
                  }
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-white/8 rounded-xl px-3.5 py-3 text-white/85 text-sm leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {captionData.caption}
                  </div>
                  {captionData.hashtags && (
                    <div className="bg-white/5 rounded-xl px-3.5 py-2.5 text-forest-200/80 text-xs leading-relaxed max-h-20 overflow-y-auto">
                      {captionData.hashtags}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={()=>{
                      const full = captionData.hashtags
                        ? `${captionData.caption}\n\n${captionData.hashtags}`
                        : captionData.caption
                      navigator.clipboard.writeText(full)
                      setCaptionCopied(true); setTimeout(()=>setCaptionCopied(false), 2000)
                    }} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-all">
                      {captionCopied ? <><Check className="w-3.5 h-3.5 text-green-400"/>Copiata!</> : <><Copy className="w-3.5 h-3.5"/>Copia tutto</>}
                    </button>
                    <button onClick={()=>{ setCaptionData(null); setCaptionCopied(false) }}
                      className="px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-white/55 text-sm font-semibold transition-all" title="Rigenera">
                      ↺
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2.5">
              <button onClick={()=>{setVideoState('config');setVideoStep(WIZARD_STEPS.length-1);setVideoRecordedBlob(null);setRenderProgress(0);setCaptionData(null);setCoverPhotoId(null)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">← Impostazioni</button>
              <button onClick={()=>{setVideoState('idle');setVideoRecordedBlob(null);setRenderProgress(0);setCaptionData(null);setCoverPhotoId(null)}}
                className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
