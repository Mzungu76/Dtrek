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
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { slopeDegToColor, aspectDegToColor } from '@/lib/dtm/dtmColors'
import { bearingDeg, circularMeanBearings } from '@/lib/navigation/orientation'
import { MAPTILER_STYLES as STYLES, MAPTILER_KEY as KEY } from '@/lib/mapStyles'
import {
  buildCumulativeDistances, progressToDistanceM, distanceMToProgress, buildJourneyTables,
  stopPhotoZoomAt, polaroidRotationDeg, hyperlapseIntensityAt, TOP_BAND_FRACTION, type CarouselPhotoTiming,
} from '@/lib/videoPhotoCarousel'
import { planPoiCards, projectPoisOnRoute, activeCardAt } from '@/lib/videoPoiCards'
import type { BeautyScore } from '@/lib/beautyScore'
import type { WikiPage } from '@/lib/wikipedia'
import type { GuideNotice } from '@/lib/guideNotices'
import {
  coverRect, rrect, lerp, lerpAngle, distM, smoothArray, clamp01,
  hexToRgb, effortRgb, hrEffortAt, buildMiniRoute,
  drawMapPin, drawHeartBadge, drawArrivalStars, drawRouteMilestone,
  drawPinTrail, drawPeakConquered, drawMiniMap, drawPhotoPin, drawPoiPin,
  drawStopPhotoZoom, drawHUD, drawTopBand, drawVideoElevProfile, type GraphData,
  drawPoiCard, drawTeiPanel, drawIdentikit,
} from '@/lib/videoOverlays'

const SPEEDS = [
  { label: '½×', v: 0.5 },
  { label: '1×', v: 1   },
  { label: '3×', v: 3   },
]

const VIDEO_PRESETS = {
  reels:  { duration: 30, styleIdx: 1, orientation: '9:16'   as const, label: 'Reels',    desc: '9:16 · 1080×1920',   grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed45: { duration: 30, styleIdx: 1, orientation: '4:5'    as const, label: 'Feed 4:5', desc: '4:5 · 1080×1350',    grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  feed11: { duration: 30, styleIdx: 1, orientation: '1:1'    as const, label: 'Feed 1:1', desc: '1:1 · 1080×1080',    grading: 'contrast(1.08) saturate(1.25) brightness(1.03)' },
  epico:  { duration: 30, styleIdx: 0, orientation: '9:16'   as const, label: 'Epico',    desc: '9:16 · cinematico',   grading: 'contrast(1.05) saturate(1.18) brightness(1.02)' },
  snappy: { duration: 15, styleIdx: 1, orientation: '9:16'   as const, label: 'Snappy',   desc: '9:16 · social-ready', grading: 'contrast(1.12) saturate(1.38) brightness(1.04)' },
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
const POI_NOTABILITY_TIER: Record<PoiType, 0|1|2> = {
  peak: 0, hut: 0, bivouac: 0, pass: 0, viewpoint: 0,
  waterfall: 1, cave: 1, shelter: 1, ruins: 1, castle: 1, archaeological: 1, cross: 1, monument: 1, chapel: 1, tower: 1, bridge: 1,
  spring: 2, fountain: 2, picnic: 2, bench: 2,
}

// ── Types ──────────────────────────────────────────────────────────────────────

type VideoState = 'idle' | 'config' | 'rendering' | 'finalizing' | 'done'

// Passi del wizard video. L'ordine segue la TIMELINE del video stesso (apertura → viaggio → foto →
// rifiniture) dopo la scelta tecnica iniziale del formato: chi lo compila ripercorre mentalmente il
// filmato dall'inizio alla fine, invece di saltare tra impostazioni scollegate.
const WIZARD_STEPS = [
  { id: 'formato',  title: 'Formato',  sub: 'Dove pubblicherai il video' },
  { id: 'apertura', title: 'Apertura', sub: 'I primi secondi, quelli che fermano lo scroll' },
  { id: 'percorso', title: 'Percorso', sub: 'Come si vede il viaggio' },
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

async function readExifGps(file: File): Promise<{lat:number;lon:number}|null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const buf=e.target?.result as ArrayBuffer; if(!buf){resolve(null);return}
      const view=new DataView(buf)
      try {
        if(view.getUint16(0)!==0xFFD8){resolve(null);return}
        let off=2
        while(off<view.byteLength-2){
          const marker=view.getUint16(off); off+=2
          if(marker===0xFFE1){
            const len=view.getUint16(off); off+=2
            const hb=new Uint8Array(buf,off,4)
            if(Array.from(hb).map(b=>String.fromCharCode(b)).join('')!=='Exif'){resolve(null);return}
            const ts=off+6, tv=new DataView(buf,ts), le=tv.getUint16(0)===0x4949
            const rd16=(o:number)=>tv.getUint16(o,le), rd32=(o:number)=>tv.getUint32(o,le)
            const ifd0=rd32(4), n0=rd16(ifd0); let gOff=0
            for(let i=0;i<n0;i++){const eo=ifd0+2+i*12;if(rd16(eo)===0x8825){gOff=rd32(eo+8);break}}
            if(!gOff){resolve(null);return}
            const gN=rd16(gOff), gd:Record<number,number[]>={}
            for(let i=0;i<gN;i++){
              const eo=gOff+2+i*12, tag=rd16(eo), type=rd16(eo+2), count=rd32(eo+4)
              if(type===5){const vOff=rd32(eo+8), vals:number[]=[];for(let j=0;j<count;j++){const n=rd32(vOff+j*8),d=rd32(vOff+j*8+4);vals.push(d?n/d:0)};gd[tag]=vals}
            }
            const la=gd[2],lo=gd[4]; if(!la||!lo){resolve(null);return}
            resolve({lat:la[0]+la[1]/60+la[2]/3600,lon:lo[0]+lo[1]/60+lo[2]/3600}); return
          }
          off+=view.getUint16(off)-2+2
        }
      } catch {}
      resolve(null)
    }
    reader.readAsArrayBuffer(file.slice(0,65536))
  })
}

// ── Progressive route reveal helpers ──────────────────────────────────────────

function setupRouteReveal(map: MLMap, pts: TrackPoint[]) {
  if(map.getSource('route-traveled')) return
  map.addSource('route-traveled',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[pts[0].lon!,pts[0].lat!]]},properties:{}}})
  map.addLayer({id:'route-traveled',type:'line',source:'route-traveled',paint:{'line-color':'#f97316','line-width':5,'line-opacity':0.9},layout:{'line-cap':'round','line-join':'round'}})
  try{map.setPaintProperty('route-line','line-opacity',0.22)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.18)}catch{}
}

function cleanupRouteReveal(map: MLMap) {
  try{if(map.getLayer('route-traveled'))map.removeLayer('route-traveled')}catch{}
  try{if(map.getSource('route-traveled'))map.removeSource('route-traveled')}catch{}
  try{map.setPaintProperty('route-line','line-opacity',1)}catch{}
  try{map.setPaintProperty('route-casing','line-opacity',0.55)}catch{}
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
  const [videoDuration,     setVideoDuration]    = useState(30)
  const [videoOrientation,  setVideoOrientation] = useState<'9:16'|'4:5'|'1:1'|'1.91:1'|'16:9'>('9:16')
  const [videoFps,          setVideoFps]         = useState<30|60>(30)
  const [coverPhotoId,      setCoverPhotoId]      = useState<string|null>(null)
  const [videoShowTitle,    setVideoShowTitle]   = useState(true)
  const [videoShowStats,    setVideoShowStats]   = useState(true)
  const [videoShowProgress, setVideoShowProgress]= useState(true)
  const [videoShowBody,     setVideoShowBody]    = useState(true)
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
  // Foto escluse dal video (di default nessuna, cioè tutte incluse) — non persistito: è una
  // preferenza per-generazione, come videoPreset/videoDuration/ecc., non un dato della foto stessa.
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
  // errore, annullamento): qualunque cosa porti fuori da 'rendering'/'finalizing' fa scattare
  // il cleanup dell'effetto, che rilascia il lock — niente da duplicare in ogni handler.
  useEffect(() => {
    if (videoState !== 'rendering' && videoState !== 'finalizing') return
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
    if (videoState !== 'rendering' && videoState !== 'finalizing') { setEntertainIdx(0); return }
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

  // Durata stimata del video in stile Carosello — non più un traguardo fisso (vedi
  // buildJourneyTables), quindi mostrata qui come riferimento invece che imposta dallo slider.
  const carouselEstimatedSec = useMemo(() => {
    if (videoPhotoStyle !== 'carousel') return null
    const cruiseMps = totalDistanceM > 0 ? totalDistanceM / Math.max(5, videoDuration) : 3.5
    const journey = buildJourneyTables(videoFps, cumDist, totalDistanceM, carouselPhotoTimings, photoDurationSec, cruiseMps)
    const introSec = Math.max(1.1, videoDuration * 0.05)
    const outroSec = Math.max(3, videoDuration * 0.17)
    return Math.round(introSec + journey.totalFrames / videoFps + outroSec)
  }, [videoPhotoStyle, cumDist, totalDistanceM, carouselPhotoTimings, photoDurationSec, videoDuration, videoFps])

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
      updateActivityPhoto(photoId,{progress:prog,lat:nearLat,lon:nearLon}).catch(()=>{
        setShareToast('Errore: posizionamento foto non salvato'); setTimeout(()=>setShareToast(''),3000)
      })
    }
    map.on('click',handler)
    return ()=>{map.off('click',handler)}
  },[placingPhoto])

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
    if(!map.getLayer('route-casing')) map.addLayer({id:'route-casing',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.55},layout:{'line-cap':'round','line-join':'round'}})
    if(!map.getLayer('route-line'))   map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#ff4444','line-width':4},layout:{'line-cap':'round','line-join':'round'}})
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
          const cruiseMps = totalDistanceM > 0 ? totalDistanceM / Math.max(5, videoDuration) : 3.5
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
  },[isPlaying,speedIdx,showPois,pois,previewingCarousel,carouselPhotoTimings,cumDist,totalDistanceM,videoDuration,photoDurationSec,routePhotos])

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
      const gpsCoords=await readExifGps(file)
      let progress=0.5, hasExifGps=false, exifLat: number|undefined, exifLon: number|undefined
      if(gpsCoords&&pts.length>1){
        hasExifGps=true
        exifLat=gpsCoords.lat; exifLon=gpsCoords.lon
        let minD=Infinity, bestIdx=0
        for(let i=0;i<pts.length;i++){const d=distM(pts[i].lat!,pts[i].lon!,gpsCoords.lat,gpsCoords.lon);if(d<minD){minD=d;bestIdx=i}}
        progress=bestIdx/(pts.length-1)
      }

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
      setShareToast('Registrazione video non supportata su questo browser')
      setTimeout(()=>setShareToast(''),3000); setVideoState('idle'); return
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
      console.error('[dtrek] video rendering failed:', message)
      try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
      muxerRef.current=null; muxerTargetRef.current=null
      if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current=null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current=null } catch {}
      try { cleanupRouteReveal(map) } catch {}
      const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
      const cont=containerRef.current; if(cont){cont.style.width='';cont.style.height=''}
      try { map.resize() } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { try{(map as any).setPixelRatio(window.devicePixelRatio||1)}catch{} }
      webglLostCleanupRef.current?.()
      setVideoState('idle')
      setShareToast(message)
      setTimeout(()=>setShareToast(''),4500)
    }
    const onWebglContextLost = (e: Event) => {
      e.preventDefault?.()
      failRendering('Il contesto grafico (GPU) si è interrotto durante la generazione del video. Riprova con meno foto/POI o un video più breve.')
    }
    const renderCanvas = map.getCanvas()
    renderCanvas.addEventListener('webglcontextlost', onWebglContextLost)
    webglLostCleanupRef.current = () => { try { renderCanvas.removeEventListener('webglcontextlost', onWebglContextLost) } catch {}; webglLostCleanupRef.current = null }

    try {

    cancelAnimationFrame(animRef.current); isPlayingRef.current=false; setIsPlaying(false)
    progressRef.current=0; setProgress(0)
    const pts=gpsRef.current; if(pts.length<2) { webglLostCleanupRef.current?.(); return }

    const [outW,outH]=VIDEO_DIMS[videoOrientation]

    // Resize map container to output resolution so tiles load at correct density
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
    for (const ki of prewarmIdxs) {
      const bearing = smoothRouteBears[Math.min(ki,smoothRouteBears.length-1)]??introBearing
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomFollow,pitch:48,bearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Outro position (zoomed out) and intro zoom/pitch
    map.jumpTo({center:[pts[N-1].lon!,pts[N-1].lat!],zoom:zoomOutro,pitch:8,bearing:introBearing})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    for (const ki of prewarmIdxs.slice(0,5)) {
      map.jumpTo({center:[pts[ki].lon!,pts[ki].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
      await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})
    }
    // Position at intro start
    map.jumpTo({center:[pts[0].lon!,pts[0].lat!],zoom:zoomIntro,pitch:20,bearing:introBearing})
    await withTimeout(new Promise<void>(r=>map.once('idle',r as any)), 8000).catch(()=>{})

    // Hide HTML marker during rendering
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='0'

    // Initialize smooth camera from intro starting pose
    smoothBearRef.current=introBearing
    smoothPitchRef.current=20
    smoothZoomRef.current=zoomIntro
    orbitBaseRef.current=introBearing

    // Setup progressive route reveal
    try { setupRouteReveal(map, pts) } catch {}

    const mapCanvas=map.getCanvas()
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
      try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
      try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
      if (typeof (map as any).setPixelRatio === 'function') { ;(map as any).setPixelRatio(dpr) }
      cont.style.width=''; cont.style.height=''; map.resize()
      } finally {
        if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current = null }
        webglLostCleanupRef.current?.()
      }
    }

    if (hasWebCodecs) {
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
      ve.configure({ codec: chosenCodec, width: outW, height: outH, bitrate: videoFps===60?25_000_000:20_000_000, framerate: videoFps, latencyMode: 'quality', hardwareAcceleration: 'prefer-software' })
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

    const TARGET_FPS=videoFps
    const PHOTO_REVEAL_FRAMES = Math.round(TARGET_FPS * photoDurationSec)
    const sortedPhotos = [...routePhotos]
      .filter(ph => !videoExcludedPhotoIds.has(ph.id))
      .sort((a,b)=>a.progress-b.progress)
      .filter(ph => photoImgsRef.current.has(ph.id))
      .map(ph => ({photo:ph, img:photoImgsRef.current.get(ph.id)!}))

    // Bake photo pins into MapLibre's WebGL render as a symbol layer.
    // This ensures pins are geo-anchored and never wander relative to the map —
    // they move exactly with map tiles, unlike a canvas overlay that composites
    // after the render pass and drifts under pitched-camera perspective.
    const photoPinLayerId  = 'dtrek-photo-pins-layer'
    const photoPinSourceId = 'dtrek-photo-pins'
    if (sortedPhotos.length > 0) {
      const iconSc = 2  // render 2× for crispness; pixelRatio:2 → 45×54 CSS px
      const photoPinImageIds: string[] = []
      for (const s of sortedPhotos) {
        const W = 45 * iconSc, H = 45 * iconSc, tipH = 9 * iconSc
        const offC = document.createElement('canvas')
        offC.width = W; offC.height = H + tipH
        const offCtx = offC.getContext('2d')!
        offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
        drawPhotoPin(offCtx, W / 2, H + tipH, iconSc, s.img)
        const imgId = `dtrek-photo-pin-${s.photo.id}`
        const imageData = offCtx.getImageData(0, 0, offC.width, offC.height)
        try { if (map.hasImage(imgId)) map.removeImage(imgId); map.addImage(imgId, imageData, { pixelRatio: iconSc }) } catch {}
        photoPinImageIds.push(imgId)
      }
      const pinFeatures = sortedPhotos.map(s => {
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
      const iconSc = 2
      const poiPinImageIds: string[] = []
      const poiTypesUsed = Array.from(new Set(videoPois.map(p => p.type)))
      for (const type of poiTypesUsed) {
        const D = 32 * iconSc
        const offC = document.createElement('canvas')
        offC.width = D; offC.height = D
        const offCtx = offC.getContext('2d')!
        offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'
        drawPoiPin(offCtx, D / 2, D / 2, iconSc, POI_META[type].emoji)
        const imgId = `dtrek-poi-pin-type-${type}`
        const imageData = offCtx.getImageData(0, 0, D, D)
        try { if (map.hasImage(imgId)) map.removeImage(imgId); map.addImage(imgId, imageData, { pixelRatio: iconSc }) } catch {}
        poiPinImageIds.push(imgId)
      }
      const poiPinFeatures = videoPois.map(poi => ({
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
    const INTRO_FRAMES = videoHookFastIntro
      ? Math.round(TARGET_FPS * Math.max(1.1, videoDuration * 0.05))
      : Math.round(TARGET_FPS * Math.max(2, videoDuration * 0.08))
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
    const OUTRO_FRAMES = Math.round(TARGET_FPS * Math.max(3, videoDuration * 0.17))

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
    // Vetta conquistata: stesso meccanismo dei traguardi, ma una volta sola e sul punto più alto.
    const peakHitRef = { current: -1 }
    const PEAK_FRAMES = Math.round(TARGET_FPS * 2.0)
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
    // percorso a ritmo costante per esattamente videoDuration secondi, con la pausa a schermo
    // intero aggiunta per ogni foto (vedi il branch "Classico" più sotto).
    const cruiseMps = totalDistanceM > 0 ? totalDistanceM / Math.max(5, videoDuration) : 3.5
    const journey = isCarousel
      ? buildJourneyTables(TARGET_FPS, cumDist, totalDistanceM, photoTimings, photoDurationSec, cruiseMps)
      : null
    const ROUTE_FRAMES = journey ? journey.totalFrames : Math.round(TARGET_FPS * videoDuration)
    const photoTriggerRouteFrames = isCarousel ? [] : sortedPhotos.map(s => Math.round(s.photo.progress * ROUTE_FRAMES))
    const TOTAL_FRAMES = INTRO_FRAMES + ROUTE_FRAMES + (isCarousel ? 0 : sortedPhotos.length * PHOTO_REVEAL_FRAMES) + OUTRO_FRAMES

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
      for (let i = 0; i < sortedPhotos.length; i++) {
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

    const frameToState = (frameIdx: number): {p:number; introP?:number; reveal?:{photo:RoutePhoto;img:HTMLImageElement;revealFrame:number}; outroP?:number; followFrame?:number; stopIndex?:number; stopT?:number} => {
      // Intro phase: route frozen at p=0, camera interpolates via introP 0→1
      if (frameIdx < INTRO_FRAMES) {
        return {p: 0, introP: frameIdx / Math.max(1, INTRO_FRAMES - 1)}
      }
      const afterIntro = frameIdx - INTRO_FRAMES
      let pauseOffset = 0
      if (!isCarousel) {
        for (let i = 0; i < sortedPhotos.length; i++) {
          const triggerF = photoTriggerRouteFrames[i] + pauseOffset
          if (afterIntro < triggerF) break
          if (afterIntro < triggerF + PHOTO_REVEAL_FRAMES) {
            return {p: sortedPhotos[i].photo.progress, reveal: {...sortedPhotos[i], revealFrame: afterIntro - triggerF}}
          }
          pauseOffset += PHOTO_REVEAL_FRAMES
        }
      }
      const routeFrame = afterIntro - pauseOffset
      if (routeFrame >= ROUTE_FRAMES) {
        const outroFrame = routeFrame - ROUTE_FRAMES
        return {p: 1.0, outroP: Math.min(1, outroFrame / Math.max(1, OUTRO_FRAMES - 1))}
      }
      if (journey) {
        const rf = Math.min(routeFrame, ROUTE_FRAMES - 1)
        const stopIdx = journey.stopIndexTable[rf]
        return {
          p: journey.pTable[rf], followFrame: routeFrame,
          stopIndex: stopIdx >= 0 ? stopIdx : undefined,
          stopT: stopIdx >= 0 ? journey.stopTTable[rf] : undefined,
        }
      }
      // Divide by ROUTE_FRAMES-1 so the last follow frame reaches p=1.0 (exactly pts[N-1]),
      // preventing a small center jump at the follow→outro transition
      return {p: Math.min(1, routeFrame / Math.max(1, ROUTE_FRAMES - 1)), followFrame: routeFrame}
    }

    // ── Modalità "Illustrativo": pianificazione delle schede POI ────────────────
    // Il quando di ogni scheda dipende da frameToState (le pause foto e le soste del carosello
    // spostano il fotogramma in cui la telecamera passa su un punto), quindi si costruisce una
    // tabella avanzamento→fotogramma percorrendo una volta sola la fase di percorso, invece di
    // ricavarla con una formula che dovrebbe replicare quelle stesse pause.
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

    const poiPlan = (() => {
      if (!isIllustrativo || !pois?.length) return null
      const frameOfP: number[] = []
      for (let f = followBase; f < TOTAL_FRAMES; f++) {
        const st = frameToState(f)
        if (st.outroP !== undefined) break
        if (st.followFrame === undefined) continue
        const bucket = Math.min(999, Math.max(0, Math.round(st.p * 999)))
        if (frameOfP[bucket] === undefined) frameOfP[bucket] = f
      }
      let last = followBase
      for (let i = 0; i < 1000; i++) { if (frameOfP[i] === undefined) frameOfP[i] = last; else last = frameOfP[i] }
      const routeLatLon = pts.filter(q => q.lat != null && q.lon != null).map(q => ({ lat: q.lat!, lon: q.lon! }))
      return planPoiCards(projectPoisOnRoute(pois, routeLatLon), {
        progressToFrame: (p) => frameOfP[Math.min(999, Math.max(0, Math.round(p * 999)))],
        cardFrames:   Math.round(TARGET_FPS * 2.6),
        minGapFrames: Math.round(TARGET_FPS * 0.7),
        lastFrame:    followBase + ROUTE_FRAMES,
        maxCards:     10,
        minSpacingP:  0.055,
        groupWindowP: 0.022,
        includeSensitive: videoPoiIncludeSensitive,
      })
    })()

    setRenderTotal(RENDER_END_FRAME - RENDER_START_FRAME); setRenderFrame(0); frameCountRef.current=RENDER_START_FRAME; renderAbortRef.current=false
    lastIconOpacityRef.current.clear()

    // Always recompute shots with current slider values so intro/follow/outro
    // all use the same zoomFollow, even if sliders were changed after the wizard opened
    const currentShots=planShots(pts, zoomIntro, zoomFollow)

    const TITLE_DUR = Math.round(TARGET_FPS * 2.2)  // 2.2s title card
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

    const renderNextFrame = () => {
      if(renderAbortRef.current) return
      const frameIdx=frameCountRef.current
      if(frameIdx>=RENDER_END_FRAME){
        if(videoEncoderRef.current){ finishRecording().catch(err=>{ console.error(err); failRendering('Errore durante la finalizzazione del video. Riprova.') }) }
        else { mediaRecorderRef.current?.stop() }
        return
      }

      const {p, introP, reveal, outroP, followFrame, stopIndex, stopT} = frameToState(frameIdx)
      setRenderProgress((frameIdx-RENDER_START_FRAME)/Math.max(1,RENDER_END_FRAME-RENDER_START_FRAME)); setRenderFrame(frameIdx-RENDER_START_FRAME)

      // During photo reveal: hold camera, show photo fullscreen with Ken Burns effect
      if (reveal) {
        requestAnimationFrame(async ()=>{
          if (renderAbortRef.current) return
          try {
          const t = reveal.revealFrame / PHOTO_REVEAL_FRAMES
          const alpha = t<0.08 ? t/0.08 : t>0.92 ? (1-t)/0.08 : 1
          const img = reveal.img
          // Se la foto non è ancora completamente decodificata (raro: sortedPhotos è già filtrato
          // sulle immagini caricate, ma resta una guardia difensiva) salta SOLO il ridisegno — non
          // il clearRect qui sotto, così il canvas composito mantiene l'ultimo contenuto buono
          // invece di restare vuoto, e viene comunque codificato più sotto: un fotogramma duplicato
          // è impercettibile, un buco nella timeline dei timestamp no (vedi mapAvailableF/O).
          const imgReady = img.complete && img.naturalWidth > 0
          if (imgReady) {
          ctx.clearRect(0, 0, outW, outH)
          // Ken Burns: slow zoom + gentle drift per photo
          const photoIdx = sortedPhotos.findIndex(s => s.photo.id === reveal.photo.id)
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
          if(reveal.photo.caption){
            const sc2=Math.min(outW,outH)/1080
            ctx.globalAlpha=alpha
            ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,outH-Math.round(100*sc2),outW,Math.round(100*sc2))
            ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle'
            ctx.font=`italic ${Math.round(38*sc2)}px Georgia,serif`
            ctx.fillText(reveal.photo.caption,outW/2,outH-Math.round(50*sc2))
            ctx.globalAlpha=1
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

      // Outro phase: camera orbits and pulls back from route end after traversal completes
      if (outroP !== undefined) {
        if (outroStartBearRef.current < 0) outroStartBearRef.current = smoothBearRef.current
        // Ease-in² on orbit so it starts at near-zero angular velocity, eliminating the
        // bearing velocity discontinuity at the follow→outro transition
        const easedOutroP = outroP * outroP
        const outroBearing = (outroStartBearRef.current - easedOutroP * 100 + 360) % 360
        const outroPitch = lerp(48, 8, outroP)
        const outroZoom_val = lerp(zoomFollow, zoomOutro, outroP)
        smoothBearRef.current = lerpAngle(smoothBearRef.current, outroBearing, 0.04)
        smoothPitchRef.current = lerp(smoothPitchRef.current, outroPitch, 0.06)
        smoothZoomRef.current = lerp(smoothZoomRef.current, outroZoom_val, 0.06)
        const outroElev = mapRef.current?.queryTerrainElevation?.([pts[N-1].lon!, pts[N-1].lat!]) ?? undefined
        mapRef.current?.jumpTo({
          center: [pts[N-1].lon!, pts[N-1].lat!],
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
          // Pannello TEI (modalità Illustrativo): il "vale la pena?" occupa la prima parte del
          // finale, prima che la schermata di chiusura copra tutto. Il punteggio e le componenti
          // arrivano da activity.linkedBeautyScore (teiToBeautyScore, lib/tei.ts).
          const TEI_WINDOW = 0.42
          if (isIllustrativo && teiView && outroP < TEI_WINDOW) {
            drawTeiPanel(ctx, outW, outH, sc2, teiView, outroP / TEI_WINDOW)
          }

          // End card fades in during outro
          const FADE_START = isIllustrativo && teiView ? 0.52 : 0.35
          if (outroP > FADE_START) {
            const fa = Math.pow((outroP - FADE_START) / (1 - FADE_START), 1.2)
            if (fa < 0.82) {
              ctx.globalAlpha = fa * 0.95; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, outW, outH); ctx.globalAlpha = 1
            } else {
              ctx.globalAlpha = fa; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, outW, outH); ctx.globalAlpha = 1
              const cardAlpha = Math.min(1, (fa - 0.82) / 0.18)
              ctx.globalAlpha = cardAlpha
              ctx.fillStyle = '#22d3ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
              ctx.font = `800 ${Math.round(26*sc2)}px -apple-system,sans-serif`
              ctx.fillText('DTrek', outW/2, outH/2 - Math.round(92*sc2))
              ctx.fillStyle = 'white'; ctx.font = `700 ${Math.round(44*sc2)}px -apple-system,sans-serif`
              let et = displayTitle; while(ctx.measureText(et).width > outW - Math.round(80*sc2) && et.length > 4) et = et.slice(0,-4)+'…'
              ctx.fillText(et, outW/2, outH/2 - Math.round(30*sc2))
              const statItems:{v:string;l:string;col:string}[] = [
                {v:`${+totalKm.toFixed(1)} km`, l:'distanza', col:'white'},
                {v:`${elevGain} m`, l:'D+', col:'white'},
              ]
              const sw2 = Math.round(150*sc2), sgap = Math.round(20*sc2)
              const tw2 = statItems.length*sw2+(statItems.length-1)*sgap
              const sx0 = outW/2-tw2/2+sw2/2, sy2 = outH/2+Math.round(52*sc2)
              statItems.forEach((s,i)=>{
                const sx3 = sx0+i*(sw2+sgap)
                ctx.fillStyle = s.col; ctx.font = `800 ${Math.round(40*sc2)}px -apple-system,sans-serif`
                ctx.fillText(s.v, sx3, sy2)
                ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = `500 ${Math.round(14*sc2)}px -apple-system,sans-serif`
                ctx.fillText(s.l, sx3, sy2+Math.round(30*sc2))
              })
              ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = `400 ${Math.round(12*sc2)}px -apple-system,sans-serif`
              ctx.fillText('Tracciato con DTrek', outW/2, outH/2+Math.round(130*sc2))
              ctx.globalAlpha = 1
            }
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

      const rawIdx=p*(N-1), i0=Math.floor(rawIdx), i1=Math.min(i0+1,N-1), frac=rawIdx-i0
      // During intro p=0 → lon/lat = pts[0]; follow/outro → actual position
      const lon=pts[i0].lon!+(pts[i1].lon!-pts[i0].lon!)*frac
      const lat=pts[i0].lat!+(pts[i1].lat!-pts[i0].lat!)*frac
      const alt=(pts[i0].altitudeMeters??0)+((pts[i1].altitudeMeters??0)-(pts[i0].altitudeMeters??0))*frac

      if (introP !== undefined) {
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
        // Progressive route reveal (every 20 frames)
        if(frameIdx%20===0&&mapRef.current){
          const cov=pts.slice(0,Math.min(i0+2,N)).map(pp=>[pp.lon!,pp.lat!])
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

        // Carta d'identità del percorso, sopra l'intro aereo (modalità Illustrativo): solo numeri
        // oggettivi, quelli veri per chiunque lo cammini. Niente CTS — è tarato sulla persona e
        // descrive chi cammina, non il sentiero.
        if (isIllustrativo && introP !== undefined) {
          drawIdentikit(ctx, outW, outH, sc2, displayTitle, [
            { k: 'distanza',  v: `${totalKm.toFixed(1)} km` },
            { k: 'dislivello', v: `+${elevGain} m` },
            { k: 'quota max', v: `${Math.round(Math.max(...altitudeSeries))} m` },
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
          const trailCol = effortNow == null ? hexToRgb('#f97316') : effortRgb(effortNow)
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
        if (poiPlan && stopZoomTNow <= 0.001) {
          const active = activeCardAt(poiPlan, frameIdx)
          if (active) {
            const lead = active.card.pois[0]
            const meta = POI_META[lead.type]
            const others = active.card.pois.slice(1)
            drawPoiCard(ctx, outW, outH, sc2, {
              title: lead.name ?? meta.label,
              kind: meta.label,
              emoji: meta.emoji,
              color: meta.color,
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
            drawPeakConquered(ctx, outW/2, outH/2, outW, outH, sc2, Math.max(...altitudeSeries), el / PEAK_FRAMES)
          }
        }

        if (isCarousel) {
          // Titolo, statistiche, profilo altimetrico e grafici corpo in un'unica fascia in alto,
          // sovrapposta alla mappa con una leggera trasparenza (drawTopBand) — sfuma via mentre la
          // foto in sosta si ingrandisce (graphAlpha), per non restare addosso alla foto.
          const si=Math.min(Math.round(p*(SAMPLES-1)),SAMPLES-1)
          const hrData:GraphData|undefined=(hasHr&&videoShowBody)?{series:smoothHr,label:'BPM',icon:'♥',strokeColor:'#ef4444',fillColor:'rgba(239,68,68,0.28)',minVal:Math.max(0,hrMin-5),maxVal:hrMax+5,currentValue:smoothHr[si]}:undefined
          const speedData:GraphData|undefined=(hasSpeed&&videoShowBody)?{series:smoothSpeed,label:'km/h',icon:'⚡',strokeColor:'#60a5fa',fillColor:'rgba(96,165,250,0.28)',minVal:0,maxVal:spMax+1,currentValue:smoothSpeed[si]}:undefined
          const graphAlpha = 1 - stopZoomTNow
          if (graphAlpha > 0.01) {
            ctx.save()
            try {
              ctx.globalAlpha = graphAlpha
              drawTopBand(ctx, outW, topBandH, sc2, {
                title: displayTitle, showTitle: videoShowTitle, showStats: videoShowStats, showProgress: videoShowProgress,
                coveredKm: +(p*totalKm).toFixed(1), totalKm: +totalKm.toFixed(1), alt: Math.round(alt), elevGain, progress: p,
                altitudeSeries, peakRouteP, hrData, speedData,
                photoMarks, odometer: videoOdometerEnabled,
              })
            } finally { ctx.restore() }
          }

          // La foto in sosta si apre da pin a quasi schermo intero, poi si richiude — vedi
          // drawStopPhotoZoom e lib/videoPhotoCarousel.ts stopPhotoZoomAt per la forma temporale.
          if (stopIndex !== undefined && sortedPhotos[stopIndex]) {
            drawStopPhotoZoom(ctx, outW, outH, sc2, sortedPhotos[stopIndex].img, sortedPhotos[stopIndex].photo.caption?.trim(), sortedPhotos[stopIndex].photo.id, stopZoomTNow, stopT ?? 0)
          }
        } else {
        // Animated elevation profile (upper center, hidden during title card)
        if(altitudeSeries.length>1&&!(videoShowTitle&&displayTitle&&frameIdx<Math.round(TARGET_FPS*1.8))){
          const elW=Math.round(outW*0.36), elH=Math.round(34*sc2)
          const elX=Math.round((outW-elW)/2), elY=Math.round(18*sc2)
          drawVideoElevProfile(ctx,altitudeSeries,p,elX,elY,elW,elH,sc2)
        }

        // Peak callout: appears when camera is near the route's highest point (follow phase only)
        const peakDist=Math.abs(p-peakRouteP)
        if(peakDist<0.042&&altitudeSeries.length>0&&introP===undefined&&frameIdx>TITLE_DUR){
          const peakAlpha=Math.pow(Math.max(0,1-peakDist/0.042),0.5)*0.9
          const maxAlt=Math.round(Math.max(...altitudeSeries))
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

        // Title card (first 2.2s)
        if(videoShowTitle&&displayTitle&&frameIdx<TITLE_DUR){
          const fi=frameIdx/(TARGET_FPS*0.55), fo=frameIdx>(TITLE_DUR-TARGET_FPS*0.55)?(TITLE_DUR-frameIdx)/(TARGET_FPS*0.55):1
          const alpha=Math.min(1,Math.min(fi,fo))
          ctx.fillStyle=`rgba(0,0,0,${alpha*0.58})`; ctx.fillRect(0,0,outW,outH)
          ctx.globalAlpha=alpha
          ctx.fillStyle='rgba(255,255,255,0.52)'; ctx.font=`700 ${Math.round(20*sc2)}px -apple-system,sans-serif`
          ctx.textAlign='center'; ctx.textBaseline='bottom'
          ctx.fillText('DTrek',outW/2,outH/2-Math.round(36*sc2))
          ctx.fillStyle='white'; ctx.font=`700 ${Math.round(62*sc2)}px -apple-system,sans-serif`; ctx.textBaseline='middle'
          let tt=displayTitle; while(ctx.measureText(tt).width>outW-Math.round(120*sc2)&&tt.length>4) tt=tt.slice(0,-4)+'…'
          ctx.fillText(tt,outW/2,outH/2)
          ctx.globalAlpha=1
        }

        // HUD (skip if title card is prominent)
        const showHUD = !(videoShowTitle&&displayTitle&&frameIdx<TITLE_DUR&&frameIdx<Math.round(TARGET_FPS*1.5))
        const si=Math.min(Math.round(p*(SAMPLES-1)),SAMPLES-1)
        const hrData:GraphData|undefined=(hasHr&&videoShowBody)?{series:smoothHr,label:'BPM',icon:'♥',strokeColor:'#ef4444',fillColor:'rgba(239,68,68,0.28)',minVal:Math.max(0,hrMin-5),maxVal:hrMax+5,currentValue:smoothHr[si]}:undefined
        const speedData:GraphData|undefined=(hasSpeed&&videoShowBody)?{series:smoothSpeed,label:'km/h',icon:'⚡',strokeColor:'#60a5fa',fillColor:'rgba(96,165,250,0.28)',minVal:0,maxVal:spMax+1,currentValue:smoothSpeed[si]}:undefined
        if(showHUD){
          drawHUD(ctx,outW,outH,{showTitle:videoShowTitle,title:displayTitle,showStats:videoShowStats,coveredKm:+(p*totalKm).toFixed(1),totalKm:+totalKm.toFixed(1),alt:Math.round(alt),elevGain,showProgress:videoShowProgress,progress:p,showBody:videoShowBody,hrData,speedData,shotLabel:introP!==undefined?'Intro aereo':'Seguimento',photoMarks,odometer:videoOdometerEnabled})
        }
        }

        // Mini-mappa d'insieme: per ultima, così resta sopra a fascia/HUD. In alto a destra con lo
        // stile Classico (l'HUD sta in basso), in basso a destra col Carosello (la fascia sta in alto).
        if (videoMiniMapEnabled && miniRoute.length > 1 && introP === undefined) {
          const mmSize = Math.round(outW * 0.17)
          const mmPad = Math.round(22 * sc2)
          const mmX = outW - mmSize - mmPad
          const mmY = isCarousel ? outH - mmSize - Math.round(outH * 0.13) : Math.round(outH * 0.085)
          const mmCol = effortNow == null ? hexToRgb('#f97316') : effortRgb(effortNow)
          ctx.save()
          try {
            ctx.globalAlpha = 1 - stopZoomTNow   // sparisce mentre la polaroid si apre
            if (ctx.globalAlpha > 0.01) drawMiniMap(ctx, mmX, mmY, mmSize, sc2, miniRoute, p, mmCol)
          } finally { ctx.restore() }
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

    setVideoState('rendering')
    renderNextFrame()

    } catch (err) {
      failRendering('Errore durante la preparazione del video. Riprova con meno foto/POI o riduci la durata.')
    }
  },[videoDuration,videoFps,videoOrientation,videoShowTitle,videoShowStats,videoShowProgress,videoShowBody,title,routePhotos,videoExcludedPhotoIds,videoPreset,altitudeSeries,photoDurationSec,zoomIntro,zoomFollow,zoomOutro,pois,videoShowPois,videoPhotoStyle,videoHookFastIntro,videoHyperlapseEnabled,videoMode,videoPoiIncludeSensitive,beautyScore,videoShowUserPin,videoHeartEffectEnabled,videoPinEffortColorEnabled,videoArrivalStarsEnabled,videoMilestonesEnabled,videoTrailEnabled,videoPhotoMarksEnabled,videoOdometerEnabled,videoPeakMomentEnabled,videoSlopeShadowEnabled,videoMiniMapEnabled,cumDist,totalDistanceM])

  const cancelRendering=useCallback(()=>{
    renderAbortRef.current=true; cancelAnimationFrame(animRef.current)
    frameCountRef.current=0
    if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive'){mediaRecorderRef.current.onstop=null;mediaRecorderRef.current.stop()}
    mediaRecorderRef.current=null; compositeCanvasRef.current=null
    try { videoEncoderRef.current?.close(); videoEncoderRef.current=null } catch {}
    muxerRef.current=null; muxerTargetRef.current=null
    if (finalizeIntervalRef.current) { clearInterval(finalizeIntervalRef.current); finalizeIntervalRef.current=null }
    try { webglLostCleanupRef.current?.() } catch {}
    const mEl=markerRef.current?.getElement(); if(mEl) mEl.style.opacity='1'
    if(mapRef.current) try{cleanupRouteReveal(mapRef.current)}catch{}
    try { photoPinCleanupRef.current?.(); photoPinCleanupRef.current = null } catch {}
    try { poiPinCleanupRef.current?.(); poiPinCleanupRef.current = null } catch {}
    // Restore container size and map DPR (set at render start, normally restored by finishRecording)
    const map=mapRef.current; const cont=map?.getContainer()
    if(cont){cont.style.width='';cont.style.height=''}
    if(map){try{map.resize()}catch{};if(typeof(map as any).setPixelRatio==='function'){try{(map as any).setPixelRatio(window.devicePixelRatio)}catch{}}}
    setVideoState('idle'); setRenderProgress(0); setVideoRecordedBlob(null)
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
                const minA=Math.min(...altitudeSeries),maxA=Math.max(...altitudeSeries),range=maxA-minA||1,H=56
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
            </div>

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
                        if (opt.id==='illustrativo') { setVideoShowPois(true); setVideoShowBody(false) }
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
                        setVideoDuration(VIDEO_PRESETS[pr].duration)
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
                        setVideoDuration(VIDEO_PRESETS[pr].duration)
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

              {/* ── PASSO 2 · APERTURA ──────────────────────────────────────────── */}
              {videoStep===1&&(<>
                <div className="bg-forest-500/10 border border-forest-500/25 rounded-xl px-3.5 py-2.5">
                  <p className="text-white/70 text-[11px] leading-relaxed">
                    Quanto dura il volo aereo prima che il percorso cominci a scorrere.
                  </p>
                </div>

                <div>
                  <p className="text-white/45 text-[11px] font-semibold tracking-wider mb-2.5">RITMO D&apos;INGRESSO</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoHookFastIntro} onChange={e=>setVideoHookFastIntro(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Intro aerea più rapida</span>
                  </label>
                  <p className="text-white/30 text-[11px] mt-1 pl-6 leading-relaxed">
                    Un&apos;apertura lunga è il motivo principale per cui si scorre via: attiva, l&apos;intro si accorcia e il percorso parte prima.
                  </p>
                </div>
              </>)}

              {/* ── PASSO 3 · PERCORSO ──────────────────────────────────────────── */}
              {videoStep===2&&(<>
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
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DURATA DEL PERCORSO</p>
                  <div className="flex gap-2">
                    {[15,30,60,90].map(d=>(
                      <button key={d} onClick={()=>setVideoDuration(d)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${videoDuration===d?'bg-forest-500 text-white':'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                        {d}s
                      </button>
                    ))}
                  </div>
                  {(()=>{
                    const includedPhotoCount = routePhotos.filter(p=>!videoExcludedPhotoIds.has(p.id)).length
                    const introOutro = Math.round(Math.max(2, videoDuration*0.08) + Math.max(3, videoDuration*0.17))
                    const photoTotal = Math.round(includedPhotoCount*photoDurationSec)
                    const est = videoDuration + photoTotal + introOutro
                    const over = est > 60
                    return (
                      <div className={`mt-2 rounded-xl px-3.5 py-2.5 ${over ? 'bg-terra-500/15 border border-terra-500/35' : 'bg-white/5'}`}>
                        <p className={`text-xs font-semibold ${over ? 'text-terra-300' : 'text-white/70'}`}>
                          Percorso {videoDuration}s{includedPhotoCount>0?` + foto ${includedPhotoCount}×${photoDurationSec.toFixed(1)}s`:''} + intro/finale ~{introOutro}s = <span className="font-bold">~{est}s totali</span>
                        </p>
                        <p className="text-white/35 text-[11px] mt-1 leading-relaxed">
                          Durata indicativa: il percorso viene sempre mostrato per intero, le foto aggiungono tempo oltre a quello impostato qui.
                        </p>
                        {over && (
                          <p className="text-terra-300/80 text-[11px] mt-1 leading-relaxed">
                            Supera i 60s dei caroselli Instagram. Riduci la durata o togli qualche foto nel passo successivo.
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

              {/* ── PASSO 4 · FOTO ──────────────────────────────────────────────── */}
              {videoStep===3&&(<>
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
                                  updateActivityPhoto(photo.id,{caption}).catch(()=>{
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
                                <button onClick={()=>{
                                  const id=photo.id
                                  setRoutePhotos(prev=>prev.filter(p=>p.id!==id));photoImgsRef.current.delete(id)
                                  setVideoExcludedPhotoIds(prev=>{ if(!prev.has(id)) return prev; const next=new Set(prev); next.delete(id); return next })
                                  removeActivityPhoto(id).catch(()=>{
                                    setShareToast('Errore: eliminazione foto non riuscita'); setTimeout(()=>setShareToast(''),3000)
                                  })
                                }}
                                  className="ml-auto text-white/25 hover:text-red-400 transition-colors">
                                  <X className="w-3.5 h-3.5"/>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              </>)}

              {/* ── PASSO 5 · EFFETTI ───────────────────────────────────────────── */}
              {videoStep===4&&(<>
                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">DATI A SCHERMO</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {l:'Titolo',v:videoShowTitle,s:setVideoShowTitle,ok:true},
                      {l:'Statistiche',v:videoShowStats,s:setVideoShowStats,ok:true},
                      {l:'Progresso',v:videoShowProgress,s:setVideoShowProgress,ok:true},
                      {l:'Dati corporei',v:videoShowBody,s:setVideoShowBody,ok:hasBodyData},
                      {l:'POI',v:videoShowPois,s:setVideoShowPois,ok:(pois?.length??0)>0},
                    ].map(item=>(
                      <button key={item.l} onClick={()=>item.ok&&item.s(v=>!v)} disabled={!item.ok}
                        className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${!item.ok?'opacity-30 cursor-not-allowed bg-white/5 text-white/40':item.v?'bg-white text-stone-900':'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                        {item.l}
                        {!item.ok&&<span className="block text-[10px] font-normal opacity-60">non disponibile</span>}
                      </button>
                    ))}
                  </div>
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

                {videoMode==='illustrativo'&&(
                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">SCHEDE DEI LUOGHI</p>
                    <p className="text-white/35 text-[11px] mb-2.5 leading-relaxed">
                      I luoghi principali si presentano uno alla volta con il loro nome, in una sola casella a schermo.
                      Fontane, panchine e aree picnic restano segnaposti sulla mappa: sono troppi e troppo fitti per meritarsi una scheda.
                    </p>
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

                <div>
                  <p className="text-white/45 text-[11px] font-semibold mb-2.5 tracking-wider">MOMENTI SPECIALI</p>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoMilestonesEnabled}
                      onChange={e=>setVideoMilestonesEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Traguardi 25/50/75% del percorso</span>
                  </label>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input type="checkbox" checked={videoPeakMomentEnabled}
                      onChange={e=>setVideoPeakMomentEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Vetta conquistata nel punto più alto</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={videoArrivalStarsEnabled}
                      onChange={e=>setVideoArrivalStarsEnabled(e.target.checked)} className="w-4 h-4 accent-forest-500"/>
                    <span className="text-white text-xs font-semibold">Stelline all&apos;arrivo finale</span>
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
                    ✦ Ken Burns sulle foto &nbsp;·&nbsp; ✦ Profilo altimetrico animato &nbsp;·&nbsp; ✦ Quota di vetta &nbsp;·&nbsp; ✦ Schermata finale con statistiche &nbsp;·&nbsp; ✦ Camera fluida
                  </p>
                </div>
              </>)}

              {/* ── PASSO 6 · GENERA ────────────────────────────────────────────── */}
              {videoStep===5&&(()=>{
                const includedPhotoCount = routePhotos.filter(p=>!videoExcludedPhotoIds.has(p.id)).length
                const introOutro = Math.round(Math.max(2, videoDuration*0.08) + Math.max(3, videoDuration*0.17))
                const est = videoDuration + Math.round(includedPhotoCount*photoDurationSec) + introOutro
                const over = est > 60
                const effects = [
                  !videoShowUserPin&&'Senza pin utente',
                  videoHeartEffectEnabled&&'Cuore 3D + BPM',
                  videoPinEffortColorEnabled&&'Pin dalla fatica',
                  videoTrailEnabled&&'Scia',
                  videoSlopeShadowEnabled&&'Ombra in salita',
                  videoMilestonesEnabled&&'Traguardi %',
                  videoPeakMomentEnabled&&'Vetta',
                  videoArrivalStarsEnabled&&'Stelline',
                  videoPhotoMarksEnabled&&'Tacche foto',
                  videoOdometerEnabled&&'Numeri a rullo',
                  videoMiniMapEnabled&&'Mini-mappa',
                  videoHyperlapseEnabled&&videoPhotoStyle==='carousel'&&'Hyperlapse',
                ].filter(Boolean) as string[]
                const rows: [string,string][] = [
                  ['Modalità', videoMode==='ricordo'?'Il mio ricordo':'Descrizione del percorso'],
                  ['Formato', `${videoOrientation} · ${videoFps} fps`],
                  ['Stile foto', videoPhotoStyle==='classic'?'Classico':'Carosello'],
                  ['Foto incluse', includedPhotoCount===0?'nessuna':`${includedPhotoCount}`],
                  ['Apertura', videoHookFastIntro?'intro rapida':'intro estesa'],
                  ['Durata stimata', `~${est}s`],
                ]
                return (<>
                  <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                    {rows.map(([k,v],i)=>(
                      <div key={k} className={`flex items-center justify-between px-3.5 py-2.5 ${i>0?'border-t border-white/8':''}`}>
                        <span className="text-white/50 text-xs">{k}</span>
                        <span className="text-white text-xs font-semibold text-right ml-3">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-white/45 text-[11px] font-semibold mb-2 tracking-wider">EFFETTI ATTIVI ({effects.length})</p>
                    {effects.length===0?(
                      <p className="text-white/35 text-xs">Nessuno — il video sarà pulito e sobrio. Puoi tornare al passo <button onClick={()=>goToStep(4)} className="text-terra-400 font-semibold hover:text-terra-300">Effetti</button> per aggiungerne.</p>
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
                      <p className="text-terra-300 text-xs font-semibold">~{est}s: supera i 60s dei caroselli Instagram.</p>
                      <p className="text-white/40 text-[11px] mt-1 leading-relaxed">Puoi generarlo lo stesso — su Reels e YouTube non è un problema.</p>
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


      {/* ══ RENDERING ═══════════════════════════════════════════════════════════ */}
      {(videoState==='rendering'||videoState==='finalizing')&&(
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col">
          <div className="absolute inset-0 bg-black/35 pointer-events-auto"/>
          <div className="absolute top-4 left-4 right-4 pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${videoState==='finalizing'?'bg-amber-400':'bg-red-500'}`}/>
                  <span className="text-white text-sm font-bold tracking-wide">{videoState==='finalizing'?'ELABORAZIONE':'RENDERING'}</span>
                </div>
                {videoState==='rendering'&&<button onClick={cancelRendering} className="text-white/60 hover:text-white text-xs font-semibold px-3 py-1 bg-white/10 rounded-full">Annulla</button>}
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden mb-2">
                {videoState==='finalizing'
                  ? <div className="h-full w-2/5 rounded-full bg-amber-400 progress-indeterminate"/>
                  : <div className="h-full rounded-full bg-forest-500" style={{width:`${renderProgress*100}%`,transition:'none'}}/>
                }
              </div>
              {videoState==='finalizing'
                ? <p className="text-white/55 text-xs">Compressione in corso… ({finalizeElapsedSec}s)</p>
                : <p className="text-white/55 text-xs">Frame {renderFrame}/{renderTotal} · {Math.round(renderProgress*100)}%</p>
              }
              <p className="text-white/30 text-[10px] mt-0.5">
                {videoState==='finalizing'
                  ? 'Può richiedere fino a 20-30s con video lunghi o molte foto — non chiudere questa schermata'
                  : 'Frame-by-frame rendering — qualità cinematografica garantita'}
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
