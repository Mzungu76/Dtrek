'use client'
import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { updatePlannedMeta, type PlannedHike, type PlannedHikeMeta } from '@/lib/plannedStore'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { formatDuration } from '@/lib/tcxParser'
import { classifyTrackShape } from '@/lib/geoUtils'
import type { StartPointInfo } from '@/lib/routeBuilder/startPointInfo'
import { getCachedGeoInfo, setCachedGeoInfo } from '@/lib/routeBuilder/geoInfoCache'
import { LS_KEYS } from '@/lib/localStore'
import type { WikiPage } from '@/lib/wikipedia'
import {
  VolumeX, Loader2,
  FileDown, BookOpen, Sparkles,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import type { PoiItem } from '@/lib/overpass'
import PhotoMosaic from '@/components/PhotoMosaic'
import { SINGLE_POINT_PHOTO_RADIUS_M, type RoutePhoto } from '@/app/lib/guide/fetchRoutePhotos'
import { extractEpochPois } from '@/lib/epochPois'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices, normalizeGuideNotices, parseNoticeSource, type GuideNotice } from '@/lib/guideNotices'
import { extractGuideSources, type GuideSource } from '@/lib/guideSources'
import { stripGuideStatus } from '@/lib/guideStatus'
import { extractGuideAiError, type GuideAiError } from '@/lib/guideAiError'
import CreditErrorModal from './CreditErrorModal'
import RouteModeDialog from './RouteModeDialog'
import { effectiveHikeMetrics, type RouteMode } from '@/lib/routeMode'
import { streamFetchText, StreamFetchError } from '@/lib/streamFetchText'
import { AlertTriangle, Link2, KeyRound, Info } from 'lucide-react'
import GuideQA from './widgets/GuideQA'
import type { ReturnOption } from '@/lib/routeBuilder/returnOptions'
import {
  GUIDE_SECTIONS, DEFAULT_BREVE_SECTIONS, GUIDE_TEXT_LENGTHS, DEFAULT_SECTION_LENGTHS,
  sanitizeSectionLengths, countMoltoApprofondita, MAX_MOLTO_APPROFONDITA_SECTIONS,
  type GuideSectionKey, type GuideTextLength, type SectionLengthMap,
} from '@/lib/guideSections'
import { parseGuideSections, mergeGuideSection } from '@/lib/guideParse'
import { guideProfileFor } from '@/lib/guideProfiles'
import { SECTION_STYLE, LEGACY_STYLE } from './sectionStyle'
import { slugifyHeading } from '@/lib/guideSlug'
import WeatherWidget from '@/components/WeatherWidget'
import RouteMapSection from '@/components/RouteMapSection'
import DatiSicurezzaTabs from './widgets/DatiSicurezzaTabs'
import PoiListWidget from './widgets/PoiListWidget'
import NaturaWidget from './widgets/NaturaWidget'
import BorgoTappeWidget from './widgets/BorgoTappeWidget'
import SiteGuideOverlay from './SiteGuideOverlay'
import SitoInfoWidget from './widgets/SitoInfoWidget'
import SitoInfoSkeleton from './widgets/SitoInfoSkeleton'
import PlaceDescriptionWidget from './widgets/PlaceDescriptionWidget'
import GuideGalleryLightbox, { type GuideGalleryItem } from './widgets/GuideGalleryLightbox'
import SitoGalleryWidget from './widgets/SitoGalleryWidget'
import ParentGuideLinkWidget from './widgets/ParentGuideLinkWidget'
import RelatedPlacesWidget from './widgets/RelatedPlacesWidget'
import OpereMuseoWidget from './widgets/OpereMuseoWidget'
import GuideHero from './GuideHero'
import GuideStatsStrip from './GuideStatsStrip'
import GuideBorgoStatsStrip from './GuideBorgoStatsStrip'
import SectionNav from '@/components/editorial/SectionNav'
import VoicePlayer from '@/components/editorial/VoicePlayer'
import SectionCard from '@/components/editorial/SectionCard'
import type { CtsProps } from '@/components/ScoreRing'
import type { SafetyScore } from '@/lib/safetyScore'
import type { PersonalSafety } from '@/lib/personalSafetyFit'
import type { HikeAssessment } from '@/lib/hikeAssessment'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { FloraResult } from '@/lib/floraTypes'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import type { PlaceDetail } from '@/app/api/places/[id]/route'
import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'
import { computeBorgoWalkFields } from '@/lib/borgoWalkPolyline'
import { borgoCardVariant, sitoCardFamily, metaEligibleForHikingScores } from '@/lib/guideCardVariant'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, inferSiteTypeFromName } from '@/lib/metaTypes'
import { Building2, Landmark } from 'lucide-react'
import SafeImg from '@/components/ui/SafeImg'

// ── Types ─────────────────────────────────────────────────────────────────────

// Stile del riquadro avviso per gravità (vedi lib/guideNotices.ts) — una chiusura reale (danger)
// deve leggersi diversamente da una nota stagionale (info), non tutte uguali in ambra.
const NOTICE_SEVERITY_STYLE: Record<GuideNotice['severity'], { box: string; icon: string; text: string; link: string }> = {
  danger:  { box: 'border-red-200 bg-red-50',       icon: 'text-red-600',    text: 'text-red-900',    link: 'bg-red-100 hover:bg-red-200 text-red-800' },
  warning: { box: 'border-amber-200 bg-amber-50',   icon: 'text-amber-600',  text: 'text-amber-900',  link: 'bg-amber-100 hover:bg-amber-200 text-amber-800' },
  info:    { box: 'border-sky-200 bg-sky-50',       icon: 'text-sky-600',    text: 'text-sky-900',    link: 'bg-sky-100 hover:bg-sky-200 text-sky-800' },
}

interface DisplaySection {
  key: GuideSectionKey | `legacy-${number}`
  guideKey: GuideSectionKey | null
  title: string
  subtitle?: string
  body?: string
  icon: ReactNode
  color: string
}

export interface ScoresBundle {
  safety: SafetyScore | null
  /** Sicurezza scomposta in Oggettiva + Idoneità per Te (lib/personalSafetyFit.ts) — quando
   *  presente, il badge disegna l'anello Sicurezza come due archi e mostra le tre etichette
   *  distinte (Oggettiva, Idoneità, Consiglio) invece della sola Sicurezza generica. */
  personalSafety?: PersonalSafety | null
  cts: CtsProps
  showAspectToggle: boolean
  showGradientToggle: boolean
  showAspect: boolean
  showGradient: boolean
  onToggleAspect: () => void
  onToggleGradient: () => void
  /** Avvisi trovati dalla ricerca web di Giulia (vedi lib/guideNotices.ts) — puramente
   *  informativi, mostrati come puntini colorati sull'anello Sicurezza del badge a doppio anello
   *  (components/TrailScoreGaugeBadge.tsx), non entrano nel calcolo del punteggio. */
  guideNotices?: GuideNotice[]
}

export interface SafetyDetailsBundle {
  assessment?: HikeAssessment
  hasGps: boolean
  osmId?: number
  polyline?: [number, number][]
  plannedId: string
  markers: ClassifiedDifficultyMarker[]
  highlightedMarkerIndex?: number | null
}

export interface PoiListBundle {
  pois: PoiItem[]
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  hasGps: boolean
  centerLat?: number
  centerLon?: number
  onWikiLoaded: (pages: WikiPage[]) => void
}

export interface NaturaBundle {
  hasGps: boolean
  flora?: FloraResult | null
  floraLoading: boolean
  onOpenFloraGallery: () => void
  onOpenAnimalGallery: () => void
}

interface Props {
  hike: PlannedHike
  /** Mirrors what's persisted (cachedGuide/cachedEpochPois/guideTier) back into the caller's own
   *  hike state, so the rest of the app (epoch POIs) sees a freshly generated guide without
   *  waiting for a refetch. */
  onHikeUpdate: (patch: Partial<PlannedHike>) => void
  /** True once every enrichment source (POI/Wikipedia, scores, sicurezza, natura) has settled (or
   *  a safety timeout fired) — gates the automatic Breve generation. */
  enrichmentReady: boolean
  /** null while the pre-flight check is in flight, then whether this account can call Claude at all. */
  hasAiAccess: boolean | null
  /** true when the check itself failed (e.g. Supabase irraggiungibile) rather than confirming the
   *  account genuinely has no key — shows a "riprova più tardi" message instead of "aggiungi la
   *  tua chiave" (which would be misleading for someone who already saved one). */
  aiUnavailable: boolean
  /** Periodo di prova scaduto (docs/navigator-dtrek-boundary.md) — quando hasAiAccess è false,
   *  distingue "la prova gratuita è finita" (il caso tipico ora che l'accesso condiviso copre
   *  tutto il periodo di prova, non solo premium/BYOK) da un generico "nessun accesso". */
  trialExpired: boolean
  /** Set by the caller (e.g. tapping the Trail Score badge) to scroll to a specific section once. */
  scrollToSectionKey?: GuideSectionKey | null
  onScrollToSectionConsumed?: () => void
  /** POI currently highlighted on the stage map (or tapped inside this guide) — kept in the
   *  parent so the persistent stage map behind the sheet can reflect it too. */
  highlightedPoiId?: number | null
  onPoiTap?: (poiId: number) => void
  weather?: { lat: number; lon: number; mode: 'planned' | 'forecast' }
  /** Distanza/durata in auto dall'indirizzo salvato nelle impostazioni fino al trailhead — vedi
   *  app/guida/useDrivingDistance.ts. Undefined finché l'indirizzo non è geocodificato o non c'è
   *  un punto di partenza noto per questo percorso. mapsUrl apre le indicazioni su Google Maps. */
  driving?: { distanceMeters: number; durationSeconds: number; mapsUrl?: string } | null
  /** Opens the fullscreen 3D map view for the route — forwarded to the "Il percorso" map section. */
  onOpenMap3D?: () => void
  /** Pendenza/esposizione overlay state — forwarded to the "Il percorso" map section (the toggle
   *  buttons themselves live in ScoresWidget, part of the "Dati e sicurezza" section below). */
  showGradient?: boolean
  showAspect?: boolean
  dtmProfile?: TrailDtmProfile
  /** Cambio di tipologia (sola andata / andata e ritorno) per un percorso lineare — vedi
   *  lib/routeMode.ts. Il chiamante persiste `routeMode` e ricalcola i punteggi che ne dipendono;
   *  questo componente si limita a leggere `hike.routeMode` come unica fonte di verità. Assente ⇒
   *  nessun toggle e nessun popup di scelta (percorso non lineare, o chiamante che non gestisce la
   *  persistenza). La Promise si risolve quando la scelta è salvata: il popup resta aperto fino ad
   *  allora, così la generazione AI non parte su cifre ancora vecchie. */
  onRouteModeChange?: (mode: RouteMode) => Promise<void> | void
  scores?: ScoresBundle
  safetyDetails?: SafetyDetailsBundle
  poiList?: PoiListBundle
  natura?: NaturaBundle
}


// ── Chunk-based TTS ───────────────────────────────────────────────────────────

interface ChunkEntry { text: string; sectionIdx: number }

function buildChunks(sections: DisplaySection[]): ChunkEntry[] {
  const chunks: ChunkEntry[] = []
  sections.forEach((s, sectionIdx) => {
    if (!s.body) return
    const lines = [`${s.title}.`, ...s.body.split(/\n+/).filter(l => l.trim().length > 3)]
    for (const line of lines) {
      if (line.length <= 220) {
        chunks.push({ text: line, sectionIdx })
      } else {
        const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean)
        let buf = ''
        for (const sentence of sentences) {
          if (buf.length + sentence.length > 220 && buf) {
            chunks.push({ text: buf.trim(), sectionIdx })
            buf = sentence
          } else {
            buf += (buf ? ' ' : '') + sentence
          }
        }
        if (buf.trim()) chunks.push({ text: buf.trim(), sectionIdx })
      }
    }
  })
  return chunks.filter(c => c.text.trim().length > 0)
}

function getItalianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang === 'it-IT' && v.localService) ??
    voices.find(v => v.lang === 'it-IT') ??
    voices.find(v => v.lang.startsWith('it')) ??
    null
  )
}

const RATES = [0.8, 1, 1.2, 1.5]

// Verifica utente: "aprendo e chiudendo la guida ha rifatto l'elaborazione almeno 3 volte" —
// GuideReader viene montato solo quando la sezione attiva è 'featured' (vedi GuidaHub.tsx),
// quindi passare ad un'altra sezione e tornare lo SMONTA e RIMONTA, azzerando lo state
// (borgoItinerary) e rifacendo da capo la POST /api/borgo-itinerary ad ogni volta — anche su un
// hit di cache lato server questo resta un giro di rete evitabile e un lampo "in caricamento"
// ingiustificato per un itinerario che il browser ha già visto in questa stessa sessione. Cache
// di modulo (non uno state, sopravvive ai remount di QUESTO componente finché la pagina resta
// caricata, mai persistita oltre: un refresh vero deve comunque poter vedere un dato aggiornato)
// indicizzata per hikeId — le personalizzazioni (overrides) dipendono da QUESTA Meta, mai dal
// solo placeId condiviso fra guide diverse sullo stesso Borgo.
const borgoItineraryMemoryCache = new Map<string, BorgoItinerary>()

// Verifica utente ("chiudendo e riaprendo la guida, la sezione 'Il borgo' mostra via via più
// contenuto — prima niente, poi le foto, poi la descrizione") — STESSA causa già diagnosticata e
// risolta sopra per borgoItinerary, mai applicata a queste due fetch: ogni chiusura/riapertura
// smonta e rimonta questo componente, e se l'utente richiude prima che fetchRoutePhotos/
// /api/places rispondano, quella singola apertura le perde del tutto (la Promise risolve dopo lo
// smontaggio, il componente rimontato non la vede mai) — servono tentativi successivi finché una
// singola apertura non dura abbastanza da vedere la risposta, il che sembra "si carica un po' di
// più ogni volta" ma è solo il caso di essere stati pazienti abbastanza quella volta. Stessa cache
// di modulo, stesso principio (mai persistita oltre la pagina caricata): un rimontaggio successivo
// trova subito il risultato di un tentativo precedente ANCHE SE quel tentativo si è concluso dopo
// che l'utente aveva già richiuso — la Promise in volo aggiorna comunque la cache al suo arrivo,
// solo non più uno state di un componente ormai smontato.
const routePhotosMemoryCache = new Map<string, RoutePhoto[]>()
const placeDetailMemoryCache = new Map<string, PlaceDetail>()
const coverPhotoMemoryCache = new Map<string, { imageUrl: string | null; imageCredit: string | null }>()

/**
 * Magazine-style tourist guide reader. The Breve tier is generated automatically (no user
 * action) once `enrichmentReady` — every widget (mappa, profilo altimetrico, punteggi, POI,
 * natura) is always rendered regardless of whether the AI wrote text for that section, so no
 * data ever becomes unreachable just because the user hasn't pressed "Approfondisci" yet.
 *
 * Layout: this is the orchestrator only — hero, stats strip, section nav, voice mini-player and
 * each section's editorial header/body live in their own components (GuideHero, GuideStatsStrip,
 * GuideSectionNav, VoicePlayer, SectionCard/MagazineBody). State, effects and handlers for TTS,
 * generation and scroll/nav all stay here and get threaded down as props.
 */
export default function GuideReader({
  hike, onHikeUpdate, enrichmentReady, hasAiAccess, aiUnavailable, trialExpired,
  scrollToSectionKey, onScrollToSectionConsumed, highlightedPoiId, onPoiTap,
  weather, onOpenMap3D, showGradient, showAspect, dtmProfile, scores, safetyDetails, poiList, natura, driving,
  onRouteModeChange,
}: Props) {
  const [guideText,    setGuideText]    = useState<string>(hike.cachedGuide ?? '')
  const [guideNotices, setGuideNotices] = useState<GuideNotice[]>(normalizeGuideNotices(hike.cachedGuideNotices))
  const [guideSources, setGuideSources] = useState<GuideSource[]>(hike.cachedGuideSources ?? [])
  const [genStatus,    setGenStatus]    = useState<string | undefined>(undefined)
  const [generating,   setGenerating]   = useState(false)
  // Sezioni in corso di generazione in QUESTA chiamata (una sola per "Approfondisci con Giulia" su
  // una sezione, più d'una per "Genera il resto della guida") — pilota lo spinner per-sezione in
  // SectionCard senza interferire con `generating`, usato solo per la primissima generazione.
  const [generatingSections, setGeneratingSections] = useState<GuideSectionKey[]>([])
  // Verifica utente 2026-09-27: un precedente meccanismo di selezione (tap = barra/spunta un
  // chip, poi un bottone separato per confermare) dava l'impressione di "nessun feedback" — un
  // tap sul chip non avviava nulla finché non si premeva anche il bottone in fondo. Rimosso: ogni
  // chip genera ora SUBITO la propria sezione al tap (vedi il banner "Genera il resto della
  // guida" e la riga "+N sezioni da generare" più sotto, entrambi su generateSections([key])),
  // stesso comportamento immediato di "Approfondisci con Giulia" su una sezione singola.
  // Espandibile sul posto: un tap la apre sulla stessa lista di chip del banner in cima, senza
  // dover scorrere altrove.
  const [emptyRowExpanded, setEmptyRowExpanded] = useState(false)
  // Lunghezza scelta per sezione — parte dal default salvato in Impostazioni (vedi l'effetto più
  // sotto), modificabile qui per sezione prima di premere "Approfondisci con Giulia" / "Genera il
  // resto della guida": è l'override "per singola guida" richiesto, non persistito altrove.
  const [sectionLengths, setSectionLengths] = useState<SectionLengthMap>(DEFAULT_SECTION_LENGTHS)
  const [error,        setError]        = useState<string | null>(null)
  // Errore AI irreversibile rilevato a metà stream (es. credito Anthropic esaurito, vedi
  // lib/guideAiError.ts) — mostrato come popup dedicato invece del banner generico `error` sopra,
  // perché richiede un'azione dell'utente (ricaricare credito o cambiare modello) e non va perso
  // di vista in fondo alla pagina.
  const [aiCreditError, setAiCreditError] = useState<GuideAiError | null>(null)
  const [routePhotos,  setRoutePhotos]  = useState<RoutePhoto[]>([])
  const [visibleSec,   setVisibleSec]   = useState(0)
  // Arricchimento dall'archivio (dtrek_places) per un Borgo/Città o Sito — foto di copertina,
  // indirizzo, orari/sito ufficiale: dati che planned_hikes non porta (vedi lib/guideCardVariant.ts
  // per come vengono usati). null per un Sentiero (mai richiesto) o finché non arriva.
  const [placeDetail,    setPlaceDetail]    = useState<PlaceDetail | null>(null)
  // True mentre il fetch di placeDetail sopra è in volo — pilota SitoInfoSkeleton (verifica utente
  // 2026-09-29, "gli elementi sembrano arrivare a cascata"): senza questo, il pannello Sito non
  // esisteva affatto finché placeDetail non arrivava (appariva di colpo, già completo) e poteva
  // perfino cambiare FAMIGLIA di scheda (scheda_pratica vs galleria_sicurezza dipende da
  // hasVisitInfo, derivato da placeDetail — vedi sitoCardFamily più sotto).
  const [placeDetailLoading, setPlaceDetailLoading] = useState(false)
  // Copertina veloce (imageUrl/imageCredit soli) per GuideHero — verifica utente: "le immagini
  // delle copertine sono lentissime da caricarsi" (stesso reclamo già risolto per la galleria in
  // app/guida/GuidaHub.tsx). placeDetail sotto resta necessario per il resto della pagina
  // (descrizione, orari, contatti, opere, luoghi correlati...) ma porta con sé tre query Supabase
  // in più e l'arricchimento Wikipedia della descrizione — lavoro che l'hero non deve aspettare
  // solo per sapere il proprio photoUrl. `?fields=cover` (app/api/places/[id]/route.ts) fa la
  // stessa cascata cache-poi-fetch (lib/placePhotoCache.ts) ma da sola, in parallelo al fetch
  // completo sotto invece che in coda ad esso.
  const [coverPhoto, setCoverPhoto] = useState<{ imageUrl: string | null; imageCredit: string | null } | null>(null)
  // Guide dei Siti già nate da questo Borgo/Città (piano §51.3/§51.4) — passate a
  // BorgoTappeWidget per sapere, tappa per tappa, se "Leggi tutto" deve aprire quella esistente o
  // crearla al volo (verifica utente 2026-09-28: un solo bottone, mai una lista visibile a parte
  // — l'utente non deve mai percepire quali tappe sono "già state promosse"). Solo per un
  // Borgo/Città, mai per un Sentiero/Sito.
  const [nestedSiteGuides, setNestedSiteGuides] = useState<PlannedHikeMeta[]>([])
  // Guida di Sito aperta nell'overlay (piano §51.4, opzione B — verifica utente 2026-09-27): mai
  // una navigazione, questa stessa Guida di Borgo resta montata sotto per tutto il tempo.
  const [openSiteGuideId, setOpenSiteGuideId] = useState<string | null>(null)
  const [borgoItinerary, setBorgoItinerary] = useState<BorgoItinerary | null>(null)
  // Verifica utente: "non vengono più generati gli itinerari" — in realtà venivano generati, solo
  // che il calcolo (geosearch Wikipedia + rete pedonale OSM + Dijkstra, vedi /api/borgo-itinerary)
  // può metterci diversi secondi, e nel frattempo la sezione "Itinerario consigliato" appariva
  // identica a una sezione genuinamente vuota (stessa riga "+N sezioni da generare"), senza alcun
  // segnale che qualcosa si stesse calcolando in background. True dall'avvio della richiesta a
  // quando si stabilizza (successo, vuoto o errore) — mai bloccante, solo pilota il messaggio sotto.
  const [borgoItineraryLoading, setBorgoItineraryLoading] = useState(false)

  // Un percorso a tratta unica (start/end lontani — non un anello, non un andata-ritorno già
  // rilevato come tale dalla geometria) si percorre in uno di due modi, e quale dei due è una
  // proprietà del percorso salvata su Supabase (planned_hikes.route_mode), non uno stato di sola
  // visualizzazione: le cifre qui sotto E i punteggi che ne derivano seguono la scelta. Vedi
  // lib/routeMode.ts per il calcolo delle cifre effettive e il perché del raddoppio semplice.
  // metaEligibleForHikingScores in AND col controllo di forma (confine esplicito di tipologia,
  // piano guide-eccellenza §Fase 4) — verifica utente: senza questo controllo, un Borgo/Città
  // "cammino urbano" o un Sito senza traccia (routePolyline sempre vuoto) risultava "lineare" per
  // accidente (classifyTrackShape su un array vuoto/corto ritorna sempre 'linear'), aprendo il
  // popup "Come percorri questo percorso" — che ha senso solo per un vero cammino a piedi
  // (Sentiero, o Borgo/Città "trekking misto" con una traccia reale) — anche per chi visita
  // semplicemente un borgo o un museo.
  const isLinearRoute = useMemo(
    () => metaEligibleForHikingScores({ metaType: hike.metaType, trackPoints: hike.trackPoints, routePolyline: hike.routePolyline })
      && classifyTrackShape(hike.routePolyline ?? []) === 'linear',
    [hike.metaType, hike.trackPoints, hike.routePolyline],
  )
  const showAsRoundTrip = isLinearRoute && hike.routeMode === 'round_trip'
  const effective = effectiveHikeMetrics(hike, isLinearRoute ? hike.routeMode : undefined)
  // Scelta mai fatta su un percorso lineare ⇒ popup bloccante. Deve arrivare PRIMA della
  // generazione automatica dei testi (vedi l'effetto che la lancia, che aspetta questa risposta):
  // il prompt riceve le cifre effettive, e un testo scritto per la sola andata non si riscrive da
  // solo se in seguito la tipologia cambia.
  const needsRouteModeChoice = isLinearRoute && hike.routeMode == null && !!onRouteModeChange
  const [savingRouteMode, setSavingRouteMode] = useState(false)

  const chooseRouteMode = async (mode: RouteMode) => {
    if (!onRouteModeChange) return
    setSavingRouteMode(true)
    try { await onRouteModeChange(mode) }
    finally { setSavingRouteMode(false) }
  }

  const parsedSections = useMemo(() => guideText ? parseGuideSections(guideText) : [], [guideText])

  // hike.siteType così com'è arriva dal negozio locale (lib/plannedStore.ts, mirror di
  // planned_hikes.site_type) — mai ricalcolato lì. 'altro' spesso viene da un tag sorgente troppo
  // generico (es. OSM tourism=attraction) anche quando il titolo dice chiaramente di cosa si
  // tratta (es. "Museo civico ...") — vedi lib/metaTypes.ts's inferSiteTypeFromName. Corretto QUI,
  // una sola volta, e riusato per badge/profilo/icona di fallback sotto invece di leggere
  // hike.siteType direttamente in più punti con risultati incoerenti tra loro.
  const siteType = hike.metaType === 'sito' ? inferSiteTypeFromName(hike.title, hike.siteType) : hike.siteType

  // lib/guideCardVariant.ts — quale variante di copertina/statistiche mostrare, e (piano
  // guide-eccellenza §Fase 3) quale profilo di sezioni: un Borgo/Città 'trekking_misto' ha una
  // traccia GPS reale (un cammino che tocca il borgo) e guadagna anche "Dati e sicurezza", proprio
  // come un Sentiero — vedi guideProfileFor. undefined per un Sentiero (mai valutato, il profilo
  // resta quello di sempre).
  const usesRealTrack = (hike.trackPoints?.length ?? 0) > 1 || (hike.routePolyline?.length ?? 0) > 1
  const borgoVariant = hike.metaType === 'borgo_citta' ? borgoCardVariant(hike) : undefined

  // Titolo di card per tipologia (lib/guideProfiles.ts, piano §29/§30) — "Il borgo"/"Le tappe del
  // borgo" per un borgo_citta, "Il museo"/"Il castello"/... per un sito con siteType noto, invece
  // del titolo generico da sentiero ("Il percorso"/"I luoghi da non perdere") che lo stesso
  // profilo istruisce Giulia a NON scrivere più per queste tipologie (vedi SECTION_BRIEF in
  // app/api/guide/route.ts, che incorpora questi stessi titoli nell'intestazione "## ..." generata).
  const guideProfile = useMemo(
    () => guideProfileFor(hike.metaType, siteType, borgoVariant, !!hike.parentMetaId),
    [hike.metaType, siteType, borgoVariant, hike.parentMetaId],
  )

  const displaySections = useMemo<DisplaySection[]>(() => {
    const byKey = new Map(parsedSections.filter(s => s.key).map(s => [s.key as GuideSectionKey, s]))
    // Una sezione fuori da guideProfile.availableSections (es. "Dati e sicurezza"/"Su misura per
    // te" per un Borgo/Sito) non va mai mostrata, nemmeno vuota: app/api/guide/route.ts la
    // rifiuterebbe comunque se richiesta ("Nessuna sezione da generare per questa tipologia"), un
    // "Approfondisci con Giulia" su una card che sembra disponibile finirebbe solo in un errore.
    // 'verificato' non è mai gestita dal profilo (resta sempre disponibile, vedi guide/route.ts).
    const fixed: DisplaySection[] = GUIDE_SECTIONS
      .filter(def => def.key === 'verificato' || guideProfile.availableSections.includes(def.key))
      .map(def => {
        const parsed = byKey.get(def.key)
        const style = SECTION_STYLE[def.key]
        const override = guideProfile.sectionOverrides?.[def.key]
        // "Il percorso" per un Sito non è mai un percorso da camminare (usesRealTrack è sempre
        // false lì, vedi il case sotto) — è la sezione "Il museo"/"Il castello"/... del mockup, quindi
        // porta l'icona di categoria del siteType invece della generica Route da sentiero.
        const SiteIcon = def.key === 'il_percorso' && hike.metaType === 'sito' && siteType ? SITE_TYPE_CONFIG[siteType].icon : null
        const icon = SiteIcon ? <SiteIcon className="w-4 h-4" /> : style.icon
        return { key: def.key, guideKey: def.key, title: override?.title ?? def.title, subtitle: def.subtitle, body: parsed?.body, icon, color: style.color }
      })
    const legacy: DisplaySection[] = parsedSections
      .filter(s => !s.key)
      .map((s, i) => ({ key: `legacy-${i}` as const, guideKey: null, title: s.title, body: s.body, icon: LEGACY_STYLE.icon, color: LEGACY_STYLE.color }))
    return [...fixed, ...legacy]
  }, [parsedSections, guideProfile, hike.metaType, siteType])

  // Voice state
  const [isPlaying,     setIsPlaying]     = useState(false)
  const [isPaused,      setIsPaused]      = useState(false)
  const [rateIdx,       setRateIdx]       = useState(1)
  const [activeSection, setActiveSection] = useState<number | null>(null)
  const [playProgress,  setPlayProgress]  = useState(0)

  const rateRef     = useRef(RATES[1])
  const chunksRef   = useRef<ChunkEntry[]>([])
  const chunkIdxRef = useRef(0)
  const iosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])
  const autoTriggeredForRef = useRef<string | null>(null)

  // Re-sync from the caller's hike whenever it changes underneath us (e.g. switching routes
  // while this tab stays open, or the cached guide arriving from elsewhere).
  useEffect(() => {
    setGuideText(hike.cachedGuide ?? '')
    setGuideNotices(normalizeGuideNotices(hike.cachedGuideNotices))
    setGuideSources(hike.cachedGuideSources ?? [])
  }, [hike.id, hike.cachedGuide, hike.cachedGuideNotices, hike.cachedGuideSources])

  // Classificazione del punto di partenza (parcheggio/strada/POI nei pressi di un parcheggio, vedi
  // lib/routeBuilder/startPointInfo.ts) — cache locale per hike (geoInfoCache.ts): senza, ogni
  // visione della stessa guida rifarebbe la stessa chiamata Overpass, un carico che cresce con le
  // pagine viste invece che con i percorsi creati.
  const [startPointInfo, setStartPointInfo] = useState<StartPointInfo | null>(null)
  useEffect(() => {
    setStartPointInfo(null)
    const fromTrack = (hike.trackPoints ?? []).find(p => p.lat != null && p.lon != null)
    const start = fromTrack
      ? { lat: fromTrack.lat!, lon: fromTrack.lon! }
      : hike.routePolyline?.[0] ? { lat: hike.routePolyline[0][0], lon: hike.routePolyline[0][1] } : null
    if (!start) return
    let cancelled = false
    const cacheKey = LS_KEYS.startPointInfo(hike.id)
    getCachedGeoInfo<StartPointInfo | null>(cacheKey).then(cached => {
      if (cached.hit) { if (!cancelled) setStartPointInfo(cached.value); return }
      fetch(`/api/route-build/start-point?lat=${start.lat}&lon=${start.lon}`)
        .then(res => res.json())
        .then(data => {
          const info: StartPointInfo | null = data.info ?? null
          if (!cancelled) setStartPointInfo(info)
          setCachedGeoInfo(cacheKey, info)
        })
        .catch(() => {})
    })
    return () => { cancelled = true }
  }, [hike.id, hike.trackPoints, hike.routePolyline])

  // Load route photos from Wikimedia Commons for the mosaic + section illustrations (the hero
  // itself is now a recolored map, not a photo — see GuideHero — so every photo slot here goes
  // to the mosaic/section illustrations instead of being reserved for the hero). Un Borgo/Città o
  // Sito senza traccia (piano guide-eccellenza §Fase 2.1) non ha un punto medio di percorso da
  // usare: cade su hike.latitude/longitude (valorizzate via placeId, piano Blocco D) con un
  // raggio stretto attorno al punto stesso — stesso raggio di SitoGalleryWidget qui sotto, che fa
  // esattamente questo per il proprio caso (SINGLE_POINT_PHOTO_RADIUS_M) — invece dei 15km pensati
  // per il punto medio di un sentiero, che per un singolo punto includerebbe foto di tutt'altro
  // luogo.
  useEffect(() => {
    const memoryCached = routePhotosMemoryCache.get(hike.id)
    if (memoryCached) { setRoutePhotos(memoryCached); return }
    const pts = (hike.trackPoints ?? []).filter((p: { lat?: number; lon?: number }) => p.lat && p.lon) as { lat: number; lon: number }[]
    const poly = pts.length > 0 ? pts : (hike.routePolyline ?? []).map((p: [number, number]) => ({ lat: p[0], lon: p[1] }))
    const mid = poly.length > 0
      ? poly[Math.floor(poly.length / 2)]
      : hike.latitude != null && hike.longitude != null ? { lat: hike.latitude, lon: hike.longitude } : null
    if (!mid) return
    const radiusM = poly.length > 0 ? 15000 : SINGLE_POINT_PHOTO_RADIUS_M
    let cancelled = false
    import('@/app/lib/guide/fetchRoutePhotos').then(({ fetchRoutePhotos, fetchPlacePhotos }) =>
      poly.length > 0
        ? fetchRoutePhotos(mid.lat, mid.lon, radiusM, 6)
        : fetchPlacePhotos(hike.title, mid.lat, mid.lon, radiusM, 6)
    ).then(photos => {
      // Scritta anche se questo montaggio è già stato chiuso (vedi il commento sopra
      // routePhotosMemoryCache) — un rimontaggio successivo la trova comunque pronta.
      routePhotosMemoryCache.set(hike.id, photos)
      if (!cancelled) setRoutePhotos(photos)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [hike.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Copertina veloce per l'hero — vedi il commento su coverPhoto sopra. In corsa col fetch
  // completo sotto, non in coda: quando placeDetail (che porta comunque il proprio imageUrl)
  // arriva già lì è ignorato (GuideHero sotto preferisce sempre placeDetail?.imageUrl quando
  // presente), qui serve solo a non far aspettare l'hero al ramo più lento. Saltato quando
  // placeDetailMemoryCache ha già il dato completo (stesso placeId riaperto in questa sessione):
  // in quel caso l'effect sotto lo trova subito, senza passare da qui.
  useEffect(() => {
    if (hike.metaType === 'sentiero' || !hike.placeId) { setCoverPhoto(null); return }
    if (placeDetailMemoryCache.has(hike.placeId)) return
    const memoryCached = coverPhotoMemoryCache.get(hike.placeId)
    if (memoryCached) { setCoverPhoto(memoryCached); return }
    let cancelled = false
    fetch(`/api/places/${hike.placeId}?fields=cover`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        const cover = { imageUrl: data.imageUrl ?? null, imageCredit: data.imageCredit ?? null }
        coverPhotoMemoryCache.set(hike.placeId!, cover)
        if (!cancelled) setCoverPhoto(cover)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hike.metaType, hike.placeId])

  // Borgo/Città e Sito: stesso endpoint già usato da app/mete/[id]/page.tsx per la scheda di
  // ricerca — nessun nuovo endpoint per la Guida. Mai richiesto per un Sentiero (planned_hikes ha
  // già tutto il necessario).
  useEffect(() => {
    if (hike.metaType === 'sentiero' || !hike.placeId) { setPlaceDetailLoading(false); return }
    // Chiave per placeId, non hikeId (a differenza di routePhotosMemoryCache/
    // borgoItineraryMemoryCache sopra): questo dato è del Borgo/Sito in sé, mai personalizzato per
    // singola Meta — due Meta diverse sullo stesso placeId condividono legittimamente la cache,
    // esattamente come l'effetto qui sopra già ricalcola solo al cambio di placeId, non di hikeId.
    const memoryCached = placeDetailMemoryCache.get(hike.placeId)
    if (memoryCached) { setPlaceDetail(memoryCached); setPlaceDetailLoading(false); return }
    setPlaceDetailLoading(true)
    let cancelled = false
    fetch(`/api/places/${hike.placeId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        const detail = data as PlaceDetail
        // Scritta anche a componente già smontato (vedi il commento su routePhotosMemoryCache
        // sopra) — un rimontaggio successivo la trova comunque pronta.
        placeDetailMemoryCache.set(hike.placeId!, detail)
        if (!cancelled) setPlaceDetail(detail)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPlaceDetailLoading(false) })
    return () => { cancelled = true }
  }, [hike.metaType, hike.placeId])

  // Guide dei Siti nate da questo Borgo/Città (piano §51.3/§51.4) — chiave hike.id: sono Guide
  // proprie di QUESTA Meta (parentMetaId = hike.id), non del placeId condiviso come placeDetail
  // sopra. Mai richiesto per un Sentiero/Sito, che non possono avere Guide figlie. Niente cache di
  // modulo qui (a differenza di placeDetail sopra): l'utente stesso le crea navigando da questa
  // stessa Guida (BorgoTappeWidget's "Crea Guida di questo Sito"), un rimontaggio al ritorno deve
  // sempre trovare l'elenco aggiornato, mai una lista cachata prima della creazione.
  useEffect(() => {
    if (hike.metaType !== 'borgo_citta') { setNestedSiteGuides([]); return }
    let cancelled = false
    fetch(`/api/planned?parentMetaId=${encodeURIComponent(hike.id)}`)
      .then(res => res.ok ? res.json() : [])
      .then((data: PlannedHikeMeta[]) => { if (!cancelled) setNestedSiteGuides(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hike.metaType, hike.id])

  // Borgo/Città: tappe principali nel raggio (lib/guideBorgoDetailStops.ts, via lo stesso
  // endpoint POST già usato da app/mete/[id]/page.tsx) — alimenta sia la timeline (case 'luoghi'
  // più sotto) sia le pillole tappe/km-a-piedi/durata di GuideBorgoStatsStrip in variante
  // "cammino urbano". Richiesto in entrambe le varianti (lib/guideCardVariant.ts): anche
  // "trekking misto" mostra la timeline delle tappe interne, solo non le sue pillole.
  useEffect(() => {
    if (hike.metaType !== 'borgo_citta' || !hike.placeId) return
    // Verifica utente ("aprendo e chiudendo la guida ha rifatto l'elaborazione almeno 3 volte") —
    // già visto in QUESTA sessione (un remount precedente di questo stesso componente, GuideReader
    // è montato solo mentre la sezione 'featured' è attiva) → nessuna nuova richiesta, mai un
    // lampo "in caricamento" per un dato che il browser ha già.
    const memoryCached = borgoItineraryMemoryCache.get(hike.id)
    if (memoryCached) { setBorgoItinerary(memoryCached); return }
    // Un borgoWalkPolyline già persistito (creato al volo dal popup di ricerca o da una guida
    // aperta in precedenza, vedi lib/useCreateMetaFromSearch.ts) significa che l'itinerario esiste
    // già: questa richiesta lo ricalcola comunque (mai la stessa istanza — vedi il commento sopra
    // sul perché — ma con dati quasi certamente identici), quindi non è la prima generazione agli
    // occhi dell'utente e non merita lo stesso messaggio "sto calcolando per la prima volta".
    const alreadyHasItinerary = (hike.borgoWalkPolyline?.length ?? 0) > 0
    let cancelled = false
    if (!alreadyHasItinerary) setBorgoItineraryLoading(true)
    fetch('/api/borgo-itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // hikeId — piano guide-eccellenza Fase 2: applica le personalizzazioni già confermate
      // dall'utente per QUESTA Meta (planned_hikes.borgo_itinerary_overrides), mai quelle di
      // un'altra Meta che punta allo stesso Borgo.
      body: JSON.stringify({ placeId: hike.placeId, hikeId: hike.id }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data) return
        const itinerary = data as BorgoItinerary
        borgoItineraryMemoryCache.set(hike.id, itinerary)
        setBorgoItinerary(itinerary)
        // Naviga (piano guide-eccellenza, verifica post-piano) — persiste l'itinerario a piedi
        // reale (legs, già calcolato qui sopra) come polyline unica riusabile dal Navigator, in un
        // campo DEDICATO (mai routePolyline/trackPoints — vedi il commento su borgoWalkPolyline in
        // lib/plannedStore.ts, che spiega perché). borgoWalkStopsHash invece di un timestamp:
        // ricalcola solo se le tappe che compongono l'itinerario sono cambiate (nuova geosearch
        // Wikipedia, nuovo import archivio), non ad ogni apertura della guida.
        const walkFields = computeBorgoWalkFields(itinerary)
        if (walkFields && walkFields.borgoWalkStopsHash !== hike.borgoWalkStopsHash) {
          updatePlannedMeta(hike.id, walkFields).catch(() => {})
          onHikeUpdate(walkFields)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBorgoItineraryLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike.metaType, hike.placeId, hike.id])

  // Scrollspy: quale sezione è "attiva" per l'evidenziazione del pin-nav — l'ultima (indice più
  // alto) il cui bordo superiore ha già superato la riga di attivazione appena sotto la barra
  // sticky in alto. Prima un IntersectionObserver marcava "attiva" ogni sezione che intersecava
  // una banda sottile vicino a quella riga, prendendo la più in basso tra quelle intersecanti in
  // quel momento (Math.max degli indici) — ma se in un dato istante NESSUNA sezione intersecava
  // quella banda (una sezione breve appena superata, quella successiva non ancora entrata), il
  // pin restava fermo sull'ultima sezione vista invece di aggiornarsi, finché lo scroll non
  // riportava una qualunque sezione dentro la banda (verifica utente 2026-09-30: il pin "Il
  // borgo" restava acceso con "Itinerario consigliato" già visibile sotto). Il confronto diretto
  // con la posizione corrente qui sotto non ha mai questo buco: c'è sempre un'ultima sezione sopra
  // la riga di attivazione, finché lo scroll non è tornato prima della primissima (in quel caso
  // resta la 0 iniziale).
  useEffect(() => {
    if (!displaySections.length) return
    const ACTIVATION_LINE_PX = 96
    let ticking = false
    function recompute() {
      ticking = false
      let active = 0
      for (let i = 0; i < sectionRefs.current.length; i++) {
        const el = sectionRefs.current[i]
        if (el && el.getBoundingClientRect().top <= ACTIVATION_LINE_PX) active = i
      }
      setVisibleSec(active)
    }
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(recompute)
    }
    recompute()
    // capture: true — la Guida non scorre mai la finestra: è montata dentro un pannello proprio
    // con overflow-y-auto (components/routehub/RoutePage.tsx, la "stage" di dettaglio; anche
    // SiteGuideOverlay.tsx ha il proprio overflow-y-auto). Un 'scroll' non fa mai bubbling fino a
    // window da un discendente con overflow — solo la fase di cattura lo raggiunge — quindi senza
    // `capture` questo listener non riceveva MAI l'evento reale: risultato, il pin restava fermo
    // sul valore calcolato una volta sola al mount (verifica utente: "i pin ora sono allineati ma
    // non si colora quello della sezione attiva", cioè il pin sbloccato al montaggio non seguiva
    // più lo scroll reale). `capture: true` intercetta lo scroll di QUALUNQUE discendente, non solo
    // di window, a prescindere da quale pannello lo ospiti.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [displaySections])

  // Rebuild chunks on section change
  useEffect(() => {
    chunksRef.current = buildChunks(displaySections)
  }, [displaySections])

  // ── Generate ──────────────────────────────────────────────────────────────

  // Genera una o più sezioni con Giulia in una sola chiamata AI — sostituisce i vecchi generate()
  // (guida intera) e generateSection() (una sola): ora è la stessa funzione sia per la
  // generazione automatica iniziale, sia per "Approfondisci con Giulia" su una sezione, sia per
  // "Genera il resto della guida" su più sezioni mancanti insieme. Due modalità, a seconda che il
  // percorso abbia già del testo:
  //  - primissima generazione (nessuna sezione scritta finora): reset completo + anteprima live
  //    man mano che lo stream arriva.
  //  - aggiunta di sezioni a una guida già esistente: nessun reset, nessuna anteprima live — solo
  //    uno spinner per-sezione (generatingSections) finché il risultato non è pronto, poi fuso nel
  //    testo già visibile con mergeGuideSection (lib/guideParse.ts), sezione per sezione.
  const generateSections = useCallback(async (sections: GuideSectionKey[]) => {
    if (generating || generatingSections.length > 0 || sections.length === 0) return
    const isInitial = guideText.trim().length <= 50
    // Istantanea del testo già esistente PRIMA di questa chiamata — usata per fondere in anteprima
    // live le sole sezioni di questa richiesta (vedi onChunk sotto), senza toccare quelle già
    // scritte. Da qui in poi lo state guideText non va più letto: verrà aggiornato progressivamente
    // dalla preview stessa.
    const baseText = isInitial ? '' : guideText

    if (isInitial) {
      setGenerating(true)
      setGuideText('')
      setGuideNotices([])
      setGuideSources([])
      setGenStatus(undefined)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
      setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
      chunkIdxRef.current = 0
    } else {
      setGeneratingSections(sections)
    }
    setError(null)

    try {
      // hikeFallback: usato dal server SOLO in modalità di emergenza (Supabase del tutto
      // irraggiungibile, nessun utente verificabile) — la copia che il browser ha già in
      // locale, per non bloccare la generazione in quei momenti. Ignorato in condizioni normali.
      // Override "per singola guida" della lunghezza — solo per le sezioni di QUESTA richiesta,
      // presa dal selettore accanto al bottone "Approfondisci"/"Genera il resto" (sectionLengths
      // state, di partenza uguale al default salvato in Impostazioni). Il server la fonde con
      // quel default per ogni altra sezione non toccata qui — vedi effectiveSectionLengths in
      // app/api/guide/route.ts.
      const sectionLengthsForCall = Object.fromEntries(sections.map(k => [k, sectionLengths[k]]))
      let acc = await streamFetchText('/api/guide', {
        hikeId: hike.id,
        sections,
        sectionLengths: sectionLengthsForCall,
        // Le stesse tappe già mostrate in BorgoTappeWidget (verifica post-piano guide-eccellenza)
        // — così il server le riusa invece di rifare una propria ricerca live indipendente, che
        // poteva restituire un insieme diverso (Giulia nominava tappe mai viste nel widget sopra
        // il suo testo). undefined quando borgoItinerary non è ancora arrivato: il server ripiega
        // sulla propria ricerca, invariata.
        borgoDetailStops: borgoItinerary?.stops,
        hikeFallback: {
          title:                hike.title,
          plannedDate:          hike.plannedDate,
          userNotes:            hike.userNotes,
          tags:                 hike.tags,
          distanceMeters:       hike.distanceMeters,
          elevationGain:        hike.elevationGain,
          elevationLoss:        hike.elevationLoss,
          altitudeMax:          hike.altitudeMax,
          altitudeMin:          hike.altitudeMin,
          estimatedTimeSeconds: hike.estimatedTimeSeconds,
          routeMode:            hike.routeMode,
          assessment:           hike.assessment,
          cachedPois:           hike.cachedPois,
          cachedPoiWiki:        hike.cachedPoiWiki,
          trackPoints:          hike.trackPoints,
        },
      }, (partial) => {
        const { lastStatus, cleanedText: displayText } = stripGuideStatus(partial)
        if (lastStatus) setGenStatus(lastStatus)
        // Stesso taglio del commento libero pre-prima-sezione applicato in anteprima live, non
        // solo a fine generazione — altrimenti per qualche istante, prima che il modello scriva il
        // primo "## ", quel testo appare come una finta sezione a sé (si "aggiusta" da solo appena
        // arriva il primo titolo vero, ma nel frattempo si vede).
        const firstHeadingIdx = displayText.search(/^## /m)
        const cleaned = firstHeadingIdx > 0 ? displayText.slice(firstHeadingIdx) : displayText
        if (isInitial) {
          setGuideText(cleaned)
        } else {
          // "Approfondisci"/"Genera il resto": fonde in anteprima live SOLO le sezioni di questa
          // richiesta dentro la guida già esistente (stesso mergeGuideSection usato per il
          // salvataggio finale più sotto), così il testo compare progressivamente al posto giusto
          // invece di restare dietro a un semplice spinner — senza toccare le sezioni già scritte
          // in precedenza (baseText, mai lo state guideText che cambierebbe sotto i piedi).
          const partialSections = parseGuideSections(cleaned)
          let preview = baseText
          for (const sec of partialSections) {
            if (!sec.key) continue
            preview = mergeGuideSection(preview, sec.key, sec.title, sec.body)
          }
          setGuideText(preview)
        }
      })
      acc = stripGuideStatus(acc).cleanedText
      setGenStatus(undefined)

      const { aiError, cleanedText: withoutAiError } = extractGuideAiError(acc)
      if (aiError) { setAiCreditError(aiError); return }
      acc = withoutAiError

      // [sottotitolo] compare solo alla primissima generazione, [avviso]/[fonti] solo quando
      // "Verificato online" è tra le sezioni richieste (vedi SYSTEM_VERIFICATO in
      // app/api/guide/route.ts) — per ogni altra combinazione questi extract tornano comunque
      // vuoti/undefined sul testo, quindi non serve altra guardia qui. Senza questa guardia legata
      // alla sezione giusta, un "Approfondisci" richiesto sulla sola "Verificato online" (senza
      // "Il percorso" nella stessa chiamata) lasciava i tag [avviso]/[fonti] grezzi nel testo,
      // poi persistiti così com'erano dal patch più sotto.
      let subtitle: string | undefined
      if (isInitial) {
        const r = extractCoverSubtitle(acc)
        subtitle = r.subtitle
        acc = r.cleanedText
      }
      let notices = guideNotices
      let sources = guideSources
      if (sections.includes('verificato')) {
        const rn = extractGuideNotices(acc)
        notices = rn.notices
        const rs = extractGuideSources(rn.cleanedText)
        sources = rs.sources
        acc = rs.cleanedText
      }

      const cachedPois = (hike.cachedPois ?? []) as PoiItem[]
      const cachedPoiWiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
      const { epochPois, cleanedText: c1 } = extractEpochPois(acc, cachedPois, cachedPoiWiki)
      acc = c1

      // Ogni tanto il modello scrive una riga di commento libero ("Ho tutte le informazioni che
      // mi servono, ora scrivo la guida...") prima del primo titolo di sezione, non racchiusa in
      // nessun tag riconosciuto — senza questo taglio diventa una finta sezione "legacy" con
      // titolo posticcio (parseGuide tratta il testo prima del primo "## " come una sezione a sé).
      const firstHeadingIdx = acc.search(/^## /m)
      if (firstHeadingIdx > 0) acc = acc.slice(firstHeadingIdx)

      const parsedNew = parseGuideSections(acc)
      if (parsedNew.every(s => !s.key)) throw new Error('Risposta non riconosciuta, riprova.')
      let merged = baseText
      for (const sec of parsedNew) {
        if (!sec.key) continue
        merged = mergeGuideSection(merged, sec.key, sec.title, sec.body)
      }

      setGuideText(merged)
      setGuideNotices(notices)
      setGuideSources(sources)

      // Le epoche esistono solo per la sezione "luoghi" — rigenerandola sostituiscono le
      // precedenti (evita duplicati sugli stessi POI), per ogni altra combinazione restano invariate.
      const mergedEpochPois = sections.includes('luoghi') ? epochPois : (hike.cachedEpochPois ?? [])

      const patch: Partial<PlannedHike> = {
        cachedGuide: merged,
        cachedGuideNotices: notices,
        cachedGuideSources: sources,
        cachedEpochPois: mergedEpochPois,
        guideTier: 'breve',
        guideGeneratedAt: new Date().toISOString(),
      }
      if (isInitial) patch.cachedGuideSubtitle = subtitle
      updatePlannedMeta(hike.id, patch).catch(() => {})
      onHikeUpdate(patch)
    } catch (e) {
      if (e instanceof StreamFetchError) {
        // message (se presente) è il testo pensato per l'utente — error è solo il codice
        // macchina (es. "ai_temporarily_unavailable"), non va mostrato direttamente.
        const j = e.body as { error?: string; message?: string }
        setError(j.message ?? j.error ?? `HTTP ${e.status}`)
      } else {
        setError(e instanceof Error ? e.message : 'Errore durante la generazione')
      }
    } finally {
      setGenerating(false)
      setGeneratingSections([])
    }
  }, [
    generating, generatingSections, guideText, guideNotices, guideSources,
    hike.id, hike.title, hike.plannedDate, hike.userNotes, hike.tags,
    hike.distanceMeters, hike.elevationGain, hike.elevationLoss, hike.altitudeMax, hike.altitudeMin, hike.routeMode,
    hike.estimatedTimeSeconds, hike.assessment, hike.cachedPois, hike.cachedPoiWiki, hike.trackPoints,
    hike.cachedEpochPois,
    onHikeUpdate, sectionLengths, borgoItinerary?.stops,
  ])

  // Sezioni Breve scelte dall'utente in Impostazioni (components/profilo/SectionGuida.tsx) — null
  // finché non si sa ancora (in caricamento), in quel caso l'effetto sotto aspetta invece di
  // generare comunque; un fallimento del fetch non deve bloccare la generazione automatica per
  // sempre, quindi in quel caso si assume il default (comportamento di prima di questa impostazione).
  const [autoGenSections, setAutoGenSections] = useState<GuideSectionKey[] | null>(null)
  useEffect(() => {
    getUserSettingsCached()
      .then(d => {
        setAutoGenSections(Array.isArray(d.guideBreveSections) ? d.guideBreveSections as GuideSectionKey[] : DEFAULT_BREVE_SECTIONS)
        if (d.guideSectionLengths) setSectionLengths(sanitizeSectionLengths(d.guideSectionLengths))
      })
      .catch(() => setAutoGenSections(DEFAULT_BREVE_SECTIONS))
  }, [])

  // Auto-generate the Breve guide the moment enrichment data has settled — no button, no user
  // action. Only fires once per hike (guarded by the ref) and only if this account can call
  // Claude at all; otherwise the "no access" card below invites the user to add a key instead.
  // Salta del tutto se l'utente ha scelto zero sezioni automatiche in Impostazioni — evita una
  // chiamata AI per una guida che non scriverebbe comunque nessun testo.
  useEffect(() => {
    if (hike.cachedGuide || generating) return
    if (!enrichmentReady || hasAiAccess !== true) return
    if (!autoGenSections || autoGenSections.length === 0) return
    // Percorso lineare la cui tipologia non è ancora stata scelta: si aspetta la risposta al popup
    // (RouteModeDialog). Il prompt riceve le cifre effettive, che raddoppiano con "andata e
    // ritorno" — generare adesso vorrebbe dire scrivere una guida su un'ipotesi, e i testi già
    // scritti non si riallineano da soli al cambio successivo.
    if (needsRouteModeChoice) return
    if (autoTriggeredForRef.current === hike.id) return
    autoTriggeredForRef.current = hike.id
    generateSections(autoGenSections)
  }, [hike.id, hike.cachedGuide, enrichmentReady, hasAiAccess, autoGenSections, needsRouteModeChoice]) // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToSection(idx: number) {
    sectionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Caller (e.g. tapping the Trail Score badge) asked to jump straight to a section.
  useEffect(() => {
    if (!scrollToSectionKey) return
    const idx = displaySections.findIndex(s => s.guideKey === scrollToSectionKey)
    if (idx >= 0) scrollToSection(idx)
    onScrollToSectionConsumed?.()
  }, [scrollToSectionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A POI pin was tapped (on the mini-map here or on the persistent stage map) — scroll to its
  // "### Nome" subheading inside "I luoghi da non perdere", if the guide got that far.
  useEffect(() => {
    if (highlightedPoiId == null || !poiList) return
    const wiki = poiList.poiWikiEntries.find(e => e.poi.id === highlightedPoiId)?.wiki
    const poi  = poiList.pois.find(p => p.id === highlightedPoiId)
    const name = wiki?.title ?? poi?.name
    if (!name) return
    document.getElementById(slugifyHeading(name))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedPoiId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice ─────────────────────────────────────────────────────────────────

  function clearIosTimer() {
    if (iosTimerRef.current) { clearInterval(iosTimerRef.current); iosTimerRef.current = null }
  }

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    clearIosTimer()
    setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(0)
    chunkIdxRef.current = 0
  }

  function startFrom(startChunk: number) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    clearIosTimer()
    chunkIdxRef.current = startChunk
    const chunks = chunksRef.current
    if (!chunks.length) return

    iosTimerRef.current = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    }, 14000)

    function playNext() {
      const idx = chunkIdxRef.current
      if (idx >= chunks.length) {
        clearIosTimer()
        setIsPlaying(false); setIsPaused(false); setActiveSection(null); setPlayProgress(1)
        return
      }
      const { text, sectionIdx } = chunks[idx]
      setActiveSection(sectionIdx)
      setPlayProgress(idx / Math.max(chunks.length - 1, 1))

      const utt   = new SpeechSynthesisUtterance(text)
      utt.lang    = 'it-IT'
      utt.rate    = rateRef.current
      utt.pitch   = 1.0
      const voice = getItalianVoice()
      if (voice) utt.voice = voice
      utt.onend = () => { chunkIdxRef.current++; playNext() }
      utt.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          clearIosTimer(); setIsPlaying(false); setIsPaused(false)
        }
      }
      window.speechSynthesis.speak(utt)
    }

    playNext()
    setIsPlaying(true); setIsPaused(false)
  }

  function togglePlayPause() {
    if (!('speechSynthesis' in window)) return
    if (!isPlaying && !isPaused) { startFrom(0); return }
    if (isPlaying) {
      window.speechSynthesis.pause()
      setIsPlaying(false); setIsPaused(true)
      return
    }
    window.speechSynthesis.resume()
    setIsPlaying(true); setIsPaused(false)
  }

  function changeRate(idx: number) {
    rateRef.current = RATES[idx]
    setRateIdx(idx)
    if (isPlaying || isPaused) {
      const resumeAt = chunkIdxRef.current
      window.speechSynthesis.cancel()
      clearIosTimer()
      setTimeout(() => startFrom(resumeAt), 80)
    }
  }

  function speakSection(idx: number) {
    const startChunk = chunksRef.current.findIndex(c => c.sectionIdx === idx)
    if (startChunk >= 0) startFrom(startChunk)
  }

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    clearIosTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── PDF export ────────────────────────────────────────────────────────────

  const [exportingPdf, setExportingPdf] = useState(false)

  async function exportPdf() {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      const { exportGuidePdf } = await import('@/utils/pdfExport')
      await exportGuidePdf(hike, guideText)
    } catch (err) {
      console.error('Export PDF guida fallito:', err)
    } finally {
      setExportingPdf(false)
    }
  }

  // ── Widgets per section ───────────────────────────────────────────────────

  function renderWidget(key: DisplaySection['key'], body?: string): ReactNode {
    switch (key) {
      case 'prima_di_partire':
        return weather
          ? <WeatherWidget mode={weather.mode} lat={weather.lat} lon={weather.lon} date={hike.plannedDate} altitudeMax={hike.altitudeMax} elevationGain={hike.elevationGain} days={7} />
          : null
      case 'il_percorso':
        // Un Borgo/Città "cammino urbano" o un Sito non hanno una traccia GPS da mostrare — mai un
        // RouteMapSection vuoto/rotto al posto del nulla (piano §48.9). "Trekking misto" ha una
        // traccia reale: resta invariato.
        if (hike.metaType !== 'sentiero' && !usesRealTrack) {
          // Verifica post-piano guide-eccellenza: "quando vengono create le schede di Borghi/Siti,
          // la scheda dovrebbe essere già popolata con le info descrittive" — prima, senza una
          // traccia, questa sezione (il titolo di card "Il borgo"/"Il museo"/...) non aveva né
          // widget né testo finché Giulia non scriveva, quindi finiva nella riga compatta "sezioni
          // da generare" (piano §Fase 1) anche appena creata la Meta. placeDetail arriva già dal
          // mount (archivio dtrek_places, con fallback Wikipedia — vedi l'effect qui sopra), quindi
          // un riassunto reale è spesso disponibile da subito. Solo finché Giulia non ha ancora
          // scritto QUESTA sezione: un riassunto enciclopedico e la sua narrazione insieme
          // sarebbero ridondanti, non complementari.
          if (body?.trim()) return null
          const description = placeDetail?.description ?? placeDetail?.wikipedia?.extract
          return description
            ? <PlaceDescriptionWidget text={description} wikipediaUrl={!placeDetail?.description ? placeDetail?.wikipedia?.url : undefined} />
            : null
        }
        return (
          <RouteMapSection
            trackPoints={hike.trackPoints}
            showPois={false}
            onOpenMap3D={onOpenMap3D}
            showGradient={showGradient}
            showAspect={showAspect}
            showAspectToggle={scores?.showAspectToggle}
            onToggleAspect={scores?.onToggleAspect}
            dtmProfile={dtmProfile}
            planned
          />
        )
      case 'dati_sicurezza':
        return <DatiSicurezzaTabs scores={scores ? { ...scores, guideNotices } : scores} safetyDetails={safetyDetails} />
      case 'luoghi':
        // Borgo/Città: tappe strutturate (numero, foto, nome) sopra il testo narrativo di Giulia,
        // che le racconta nello stesso ordine (vedi BORGO_LUOGHI_BRIEF in lib/guideProfiles.ts) —
        // mai PoiListWidget qui, è costruita per un Sentiero (mappa del tracciato, Street View,
        // POI OSM) che un Borgo/Città non ha.
        if (hike.metaType === 'borgo_citta') {
          if (borgoItinerary && borgoItinerary.tappe.length > 0 && hike.placeId) {
            return (
              <BorgoTappeWidget
                key={hike.id}
                stops={borgoItinerary.stops}
                legs={borgoItinerary.legs}
                center={{ lat: hike.latitude ?? borgoItinerary.stops[0].lat, lon: hike.longitude ?? borgoItinerary.stops[0].lon }}
                maxStopsPerTappa={borgoItinerary.maxStopsPerTappa}
                maxMinutesPerTappa={borgoItinerary.maxMinutesPerTappa}
                serverTappe={borgoItinerary.tappe}
                color={SECTION_STYLE.luoghi.color}
                placeId={hike.placeId}
                hikeId={hike.id}
                // Guide dei Siti già nate da tappe di questo Borgo (piano §51.3/§51.4, fetchate
                // una sola volta più sopra) — qui solo per decidere, al tap su "Leggi tutto", se
                // aprire quella esistente o crearla al volo (verifica utente 2026-09-28: un solo
                // bottone, l'utente non deve mai percepire la differenza).
                existingSiteGuides={nestedSiteGuides}
                onOpenSiteGuide={setOpenSiteGuideId}
                savedOverrides={hike.borgoItineraryOverrides}
                savedDayBudgetMinutes={hike.borgoDayBudgetMinutes}
                onOverridesSaved={overrides => {
                  updatePlannedMeta(hike.id, { borgoItineraryOverrides: overrides }).catch(() => {})
                  onHikeUpdate({ borgoItineraryOverrides: overrides })
                  // Invalida la cache di modulo sopra — un remount successivo di questo componente
                  // (cambio sezione e ritorno) deve ripartire dalle personalizzazioni appena
                  // salvate, mai da uno snapshot precedente al cambio.
                  borgoItineraryMemoryCache.delete(hike.id)
                }}
                onDayBudgetSaved={dayBudgetMinutes => {
                  updatePlannedMeta(hike.id, { borgoDayBudgetMinutes: dayBudgetMinutes }).catch(() => {})
                  onHikeUpdate({ borgoDayBudgetMinutes: dayBudgetMinutes })
                  borgoItineraryMemoryCache.delete(hike.id)
                }}
              />
            )
          }
          // Verifica utente: mentre l'itinerario si calcola (geosearch Wikipedia + rete pedonale
          // OSM + Dijkstra, può metterci diversi secondi) questa sezione va distinta da una
          // genuinamente vuota — altrimenti finisce anonima dentro "+N sezioni da generare", dando
          // l'impressione che l'itinerario non si stia generando affatto.
          if (borgoItineraryLoading) {
            return (
              <div className="flex items-center gap-2.5 text-stone-400 text-[12.5px]">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Sto calcolando l&apos;itinerario a piedi tra le tappe del borgo…
              </div>
            )
          }
          return null
        }
        // Un Sito è già di per sé il singolo punto di interesse: qui non c'è mai un elenco di POI
        // "lungo il percorso" (poiList arriva comunque come oggetto — con array vuoti — dal
        // genitore, quindi senza questo controllo PoiListWidget veniva renderizzata comunque,
        // mostrando "Nessun luogo trovato lungo il percorso" per una Meta senza traccia). "Cosa
        // vedere"/"I luoghi da non perdere" per un Sito resta solo testo narrativo di Giulia.
        if (hike.metaType === 'sito') return null
        return poiList
          ? (
            <PoiListWidget
              {...poiList}
              hikeId={hike.id}
              highlightedPoiId={highlightedPoiId}
              onItemTap={poi => onPoiTap?.(poi.id)}
              trackPoints={hike.trackPoints}
              onOpenMap3D={onOpenMap3D}
              returnOptions={isLinearRoute ? returnOptions : undefined}
              returnOptionsOrigin={endPoint ?? undefined}
            />
          )
          : null
      case 'natura':
        return natura ? <NaturaWidget {...natura} /> : null
      case 'verificato': {
        // Avvisi (banner colorati per gravità) + fonti consultate — prima mostrati globalmente
        // sopra tutte le sezioni, ora vivono qui: stessi dati (guideNotices/guideSources, mai
        // toccati), solo raccolti in un unico posto invece di sparsi in due blocchi separati.
        // Il disclaimer sotto compare ogni volta che la sezione ha un testo (quindi la ricerca è
        // stata davvero eseguita), non solo quando ci sono avvisi/fonti da mostrare — anche un
        // "nessuna criticità nota" è comunque un esito di una ricerca AI, non un fatto verificato
        // da una fonte umana, e va segnalato come tale.
        if (!body?.trim()) return null
        return (
          <div className="space-y-3">
            {guideNotices.length > 0 && (
              <div className="space-y-2">
                {guideNotices.map((notice, i) => {
                  const { text, url } = parseNoticeSource(notice.text)
                  const style = NOTICE_SEVERITY_STYLE[notice.severity]
                  return (
                    <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${style.box}`}>
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`} />
                      <div className="min-w-0">
                        <p className={`text-[13px] leading-relaxed ${style.text}`}>{text}</p>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full transition-colors text-[11px] ${style.link}`}
                            title={url}
                          >
                            <Link2 className={`w-3 h-3 shrink-0 ${style.icon}`} />
                            <span className="truncate">Vai alla fonte</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {guideSources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {guideSources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 transition-colors text-[11px] text-stone-600"
                    title={s.url}
                  >
                    <Link2 className="w-3 h-3 shrink-0 text-stone-400" />
                    <span className="truncate">{s.title}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-xl bg-stone-50 border border-stone-100 px-3.5 py-2.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-stone-400 mt-0.5" />
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Verifica condotta da un&apos;intelligenza artificiale tramite ricerche automatiche sul web: può contenere errori o non cogliere tutte le criticità reali. Non sostituisce la prudenza sul campo — controlla sempre le condizioni aggiornate prima di partire.
              </p>
            </div>
          </div>
        )
      }
      default:
        return null
    }
  }

  // Selettore "Essenziale/Approfondita/Molto approfondita" mostrato accanto al bottone
  // "Approfondisci con Giulia" di ogni sezione ancora senza testo (vedi SectionCard's
  // lengthSelector) — parte dal default salvato in Impostazioni (sectionLengths state) ma è solo
  // un override locale per QUESTA generazione, non persistito.
  const renderLengthSelector = (key: GuideSectionKey) => {
    const moltoCount = countMoltoApprofondita(sectionLengths)
    return (
    <div className="flex items-center gap-0.5 rounded-full border border-stone-200 p-0.5 shrink-0">
      {GUIDE_TEXT_LENGTHS.map(l => {
        const isCurrent = sectionLengths[key] === l.key
        // Stesso limite di Impostazioni (components/profilo/SectionGuida.tsx) — il tetto vale
        // sull'intera sectionLengths condivisa, non solo sulle sezioni di questa generazione,
        // perché "Genera il resto della guida" può richiederle tutte insieme in una sola chiamata.
        const atLimit = l.key === 'molto_approfondita' && !isCurrent && moltoCount >= MAX_MOLTO_APPROFONDITA_SECTIONS
        return (
          <button
            key={l.key}
            type="button"
            onClick={() => setSectionLengths(prev => ({ ...prev, [key]: l.key }))}
            disabled={atLimit}
            title={atLimit ? `Massimo ${MAX_MOLTO_APPROFONDITA_SECTIONS} sezioni in "Molto approfondita" — riduci un'altra sezione prima` : l.description}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isCurrent ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-100'
            }`}
          >
            {l.label}
          </button>
        )
      })}
    </div>
    )
  }

  const hasGuide  = guideText.trim().length > 50
  const hikeTitle = hike.title
  // Per un Borgo/Città o Sito il badge è la sua categoria (mai "Escursione", fuorviante per una
  // Meta senza traccia GPS) — per un Sito, l'etichetta del siteType quando nota è più specifica
  // del generico "Sito". Per un Sentiero, invariato.
  const categoryBadge = hike.metaType === 'borgo_citta'
    ? META_TYPE_CONFIG.borgo_citta.label.toUpperCase()
    : hike.metaType === 'sito'
      ? (siteType ? SITE_TYPE_CONFIG[siteType].label : META_TYPE_CONFIG.sito.label).toUpperCase()
      : (hike.tags?.[0] ?? hike.assessment?.difficulty ?? 'Escursione').toUpperCase()

  const hasVisitInfo = !!(placeDetail?.officialUrl || placeDetail?.website || placeDetail?.openingHours)
  const sitoFamily = hike.metaType === 'sito' ? sitoCardFamily(siteType, hasVisitInfo) : undefined
  const usesCoverPhoto = hike.metaType === 'sito' || borgoVariant === 'cammino_urbano'
  // Stessa condizione usata sotto per montare <SitoGalleryWidget> — PhotoMosaic non deve
  // duplicarla (piano guide-eccellenza §Fase 2.1).
  const showsSitoGallery = hike.metaType === 'sito' && sitoFamily !== 'scheda_pratica' && hike.latitude != null && hike.longitude != null

  // Icona di fallback per la copertina senza foto (GuideHero coverMode='photo') — Building2 per un
  // Borgo/Città, l'icona di categoria di lib/metaTypes.ts per un Sito (coerente coi chip/pin già
  // disegnati altrove nell'app, vedi lib/metaTypes.ts's META_TYPE_CONFIG/SITE_TYPE_CONFIG).
  const FallbackIconComponent = hike.metaType === 'sito' && siteType ? SITE_TYPE_CONFIG[siteType].icon : (hike.metaType === 'sito' ? Landmark : Building2)
  const coverFallbackColor = hike.metaType === 'sito' ? META_TYPE_CONFIG.sito.color : META_TYPE_CONFIG.borgo_citta.color
  // Comune/Provincia/Regione sotto il titolo in copertina — stesso formato della scheda di ricerca
  // (app/mete/[id]/page.tsx). Solo da placeDetail (mai da hike, che non porta questi campi per un
  // Borgo/Sito); assente finché placeDetail non è ancora arrivato.
  const locationLabel = [placeDetail?.municipality, placeDetail?.province, placeDetail?.region].filter(Boolean).join(', ')
  const officialLink = placeDetail?.officialUrl ?? placeDetail?.website ?? null
  // Qualunque sezione ancora senza testo AI può mostrare l'invito ad "Approfondisci con Giulia" —
  // SectionCard mostra comunque il bottone solo se !hasBody. Non dipende da hasGuide: deve
  // funzionare anche alla primissima generazione (nessuna sezione ha ancora testo, es. utente con
  // autogenerazione disattivata in Impostazioni) — i bottoni per-sezione sono l'unico modo di
  // generare la guida in quel caso, quindi devono esserci fin da subito, non solo dopo che
  // qualcos'altro ha già scritto la prima sezione.
  const showApprofondisciHint = !generating && enrichmentReady && hasAiAccess === true
  // Sezioni fisse ancora senza testo — pilota sia il bottone "Genera il resto della guida" (mostrato
  // solo se ce n'è almeno una) sia il calcolo di cosa chiedere quando viene premuto.
  const missingSectionKeys = useMemo(
    () => displaySections.filter((s): s is DisplaySection & { guideKey: GuideSectionKey } => s.guideKey != null && !s.body?.trim()).map(s => s.guideKey),
    [displaySections],
  )
  // Titolo per chiave — per i chip di selezione sotto, dove serve un'etichetta breve per ciascuna
  // sezione ancora mancante (missingSectionKeys porta solo le chiavi, non i titoli già risolti da
  // displaySections con gli override di lib/guideProfiles.ts).
  const sectionTitleByKey = useMemo(
    () => new Map(displaySections.filter((s): s is DisplaySection & { guideKey: GuideSectionKey } => s.guideKey != null).map(s => [s.guideKey, s.title])),
    [displaySections],
  )

  // NB: dichiarato QUI, prima di sectionMeta — renderWidget() (chiamato da sectionMeta.isEmpty) legge
  // returnOptions per un percorso lineare: dichiararlo più in basso lo lasciava in zona morta
  // temporale ("Cannot access 'returnOptions' before initialization") e la Guida andava in crash.
  // Punto di arrivo (ultimo punto della traccia) — da qui parte la ricerca di bus/stazioni/taxi per
  // chi non vuole tornare a piedi sui propri passi (sottosezione "Tornare al punto di partenza" in
  // "Luoghi da non perdere", vedi PoiListWidget.tsx/ReturnOptionsSection.tsx).
  const endPoint = useMemo(() => {
    const fromTrack = [...(hike.trackPoints ?? [])].reverse().find(p => p.lat != null && p.lon != null)
    if (fromTrack) return { lat: fromTrack.lat!, lon: fromTrack.lon! }
    const poly = hike.routePolyline
    if (poly && poly.length > 0) return { lat: poly[poly.length - 1][0], lon: poly[poly.length - 1][1] }
    return null
  }, [hike.trackPoints, hike.routePolyline])

  // Cache locale per hike (geoInfoCache.ts) — stesso motivo del punto di partenza sopra: senza,
  // ogni visione della stessa guida rifarebbe la stessa chiamata Overpass.
  const [returnOptions, setReturnOptions] = useState<ReturnOption[] | null>(null)
  useEffect(() => {
    setReturnOptions(null)
    if (!isLinearRoute || !endPoint) return
    let cancelled = false
    const cacheKey = LS_KEYS.returnOptions(hike.id)
    getCachedGeoInfo<ReturnOption[]>(cacheKey).then(cached => {
      if (cached.hit) { if (!cancelled) setReturnOptions(cached.value); return }
      fetch(`/api/route-build/return-options?lat=${endPoint.lat}&lon=${endPoint.lon}`)
        .then(res => res.json())
        .then(data => {
          const options: ReturnOption[] = Array.isArray(data.options) ? data.options : []
          if (!cancelled) setReturnOptions(options)
          setCachedGeoInfo(cacheKey, options)
        })
        .catch(() => { if (!cancelled) setReturnOptions([]) })
    })
    return () => { cancelled = true }
  }, [isLinearRoute, endPoint, hike.id])

  // Sezioni "vuote" (piano guide-eccellenza §Fase 1.1) — né testo AI né un widget con dati reali
  // (es. mappa/meteo): quelle NON sono "contenuto in attesa", sono un vero e proprio nulla, e
  // prima restavano N placeholder quasi identici sparsi nello scroll con lo stesso peso visivo
  // delle card piene. Una sezione con un widget ma senza testo (es. "Il percorso" con la mappa già
  // pronta) non è mai vuota in questo senso — mostra comunque contenuto reale, SectionCard la
  // rende già come "widget con footer discreto". Non ricalcolato con un useMemo dedicato: chiama
  // renderWidget(), che chiude su molto stato del componente (weather, scores, borgoItinerary,
  // poiList, natura, ...) — più semplice e sicuro ricalcolarlo ad ogni render come già fa il loop
  // di rendering sotto, piuttosto che elencare quella stessa superficie di dipendenze qui.
  const sectionMeta = displaySections.map((s, i) => ({
    section: s,
    index: i,
    // 'il_percorso' ("Il borgo"/"Il sito"/...) non entra MAI nella riga compatta "+N sezioni da
    // generare" — verifica utente: la sua descrizione "spariva" quando compariva "Le tappe del
    // borgo", perché borgoItinerary (Overpass, veloce) di norma risolve prima di placeDetail
    // (Wikipedia/Wikidata, più lento): nel frattempo 'il_percorso' restava vuota e finiva
    // anonimizzata dentro l'etichetta condivisa della riga compatta insieme alle altre sezioni
    // ancora vuote — quando 'luoghi' usciva da quell'elenco per prendersi la propria card, restava
    // solo un'etichetta ridotta e facile da perdere, mai una vera card propria. Qui resta sempre una
    // card/riga DEDICATA (widget/descrizione se pronti, altrimenti il proprio hint "Approfondisci"),
    // mai confusa con la sorte delle altre sezioni.
    isEmpty: s.guideKey != null && s.guideKey !== 'il_percorso' && !s.body?.trim() && renderWidget(s.key, s.body) == null,
  }))
  const emptySections = sectionMeta
    .filter((m): m is typeof m & { section: DisplaySection & { guideKey: GuideSectionKey } } => m.isEmpty)
    .map(m => m.section)
  const firstEmptyIndex = sectionMeta.find(m => m.isEmpty)?.index
  // SectionNav e lo scroll principale condividono questa stessa lista filtrata (invece di
  // displaySections per intero): solo la prima sezione vuota vi compare, come voce unica che
  // rappresenta tutte le altre — punta solo a ciò che è davvero presente nello scroll (piano
  // §Fase 1.3), mai a un placeholder che non esiste più come card propria.
  const navEntries = sectionMeta.filter(m => !m.isEmpty || m.index === firstEmptyIndex)

  // Galleria fotografica — fonte principale: le thumbnail degli articoli Wikipedia dei luoghi
  // lungo il percorso (già scaricate durante l'arricchimento del percorso, prima ancora che la
  // guida esista — vedi lib/wikipedia.ts's WikiPage.thumbnail), quindi disponibili a costo zero e
  // indipendenti da quante fonti la ricerca web di sicurezza cita. Deliberatamente disaccoppiata
  // da quella ricerca (max_uses:2, mirata solo a condizioni/sicurezza, vedi SYSTEM_RESEARCH in
  // app/api/guide/route.ts) — prima la galleria dipendeva SOLO dalle foto trovate tra le fonti
  // citate lì, quindi poteva restare vuota quando quella ricerca non trovava nulla da segnalare.
  const poiPhotos = useMemo(() => {
    const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
    const seen = new Set<string>()
    return wiki
      .filter(({ wiki: w }) => !!w.thumbnail && !seen.has(w.thumbnail) && seen.add(w.thumbnail))
      .slice(0, 12)
      .map(({ wiki: w }) => ({ url: w.url, imageUrl: w.thumbnail!, title: w.title }))
  }, [hike.cachedPoiWiki])

  // Verifica utente: le foto della galleria si aprivano subito come link esterno alla pagina
  // Wikipedia/fonte, mai ingrandite dentro l'app — a differenza della stessa galleria nei
  // Reportage (app/resoconto/[id]/PhotoGallery.tsx + PhotoLightbox.tsx). Elenco unico (poiPhotos +
  // guideSources con immagine) nello stesso ordine già mostrato sotto, così l'indice del tap
  // corrisponde 1:1 alla posizione nella lightbox.
  const galleryItems = useMemo<GuideGalleryItem[]>(() => [
    ...poiPhotos.map(p => ({ imageUrl: p.imageUrl, title: p.title, sourceUrl: p.url, sourceLabel: `Luogo: ${p.title}` })),
    ...guideSources.filter(s => s.imageUrl).map(s => ({ imageUrl: s.imageUrl!, title: s.title, sourceUrl: s.url, sourceLabel: `Fonte: ${s.title}` })),
  ], [poiPhotos, guideSources])
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState<number | null>(null)

  // Stesso principio del commento sopra, per il mosaico in cima (PhotoMosaic, sotto in Render):
  // verifica utente — le sue foto (museo scheda_pratica, o qualunque Meta senza SitoGalleryWidget)
  // non si aprivano affatto al tap, a differenza della "vera galleria" di SitoGalleryWidget.tsx
  // (che ha già il proprio GuideGalleryLightbox interno per le sue foto). PhotoMosaic accetta
  // `onPhotoClick` ma qui non era mai stato passato — un lightbox dedicato invece di infilare
  // routePhotos in galleryItems sopra: quello resta condizionato a `hasGuide`, questo mosaico è
  // visibile anche prima che la guida esista.
  const routePhotoGalleryItems = useMemo<GuideGalleryItem[]>(
    () => routePhotos.map(p => ({ imageUrl: p.url, title: p.title, sourceUrl: p.url, sourceLabel: p.credit })),
    [routePhotos],
  )
  const [routePhotoLightboxIndex, setRoutePhotoLightboxIndex] = useState<number | null>(null)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fdfcfa' }}>

      <GuideHero
        trackPoints={hike.trackPoints}
        routePolyline={hike.routePolyline}
        title={hikeTitle}
        categoryBadge={categoryBadge}
        plannedDate={hike.plannedDate}
        driving={driving}
        startPoint={startPointInfo}
        coverMode={usesCoverPhoto ? 'photo' : 'map'}
        photoUrl={placeDetail?.imageUrl ?? coverPhoto?.imageUrl}
        photoFallbacks={usesCoverPhoto ? [coverPhoto?.imageUrl, ...poiPhotos.map(p => p.imageUrl), ...routePhotos.map(p => p.url)] : undefined}
        photoCredit={placeDetail?.imageCredit ?? coverPhoto?.imageCredit}
        fallbackIcon={<FallbackIconComponent />}
        fallbackColor={coverFallbackColor}
        badgeIcon={usesCoverPhoto ? <FallbackIconComponent /> : undefined}
        locationLabel={usesCoverPhoto ? locationLabel : undefined}
      />

      {/* Richiamo di provenienza per una Guida Sito nested (piano §51.4/§52.5) — solo quando
          nata dentro una Guida Borgo/Città, mai per una Guida Sito autonoma. */}
      {hike.metaType === 'sito' && hike.parentMetaId && (
        <ParentGuideLinkWidget parentMetaId={hike.parentMetaId} />
      )}

      {hike.metaType === 'sito' ? (
        placeDetailLoading ? (
          <SitoInfoSkeleton />
        ) : sitoFamily === 'scheda_pratica' ? (
          <>
            <SitoInfoWidget
              openingHours={typeof placeDetail?.openingHours === 'string' ? placeDetail.openingHours : null}
              officialLink={officialLink}
              wikipediaUrl={placeDetail?.wikipedia?.url}
              address={placeDetail?.address}
              phone={placeDetail?.phone}
              email={placeDetail?.email}
              latitude={placeDetail?.latitude ?? hike.latitude}
              longitude={placeDetail?.longitude ?? hike.longitude}
            />
            {/* Solo per un museo (docs/opere-musei-wikidata.md) — silenzioso da sé se vuoto
                (OpereMuseoWidget), il caso comune per un museo locale/tematico. */}
            {siteType === 'museo' && <OpereMuseoWidget opere={placeDetail?.opere ?? []} />}
          </>
        ) : hike.latitude != null && hike.longitude != null ? (
          <div className="px-5 sm:px-8 md:px-10 py-4 border-b border-stone-200">
            <SitoGalleryWidget name={hikeTitle} lat={hike.latitude} lon={hike.longitude} siteType={siteType} />
          </div>
        ) : null
      ) : hike.metaType === 'borgo_citta' && borgoVariant === 'cammino_urbano' ? (
        <GuideBorgoStatsStrip
          stopsCount={borgoItinerary?.stops.length}
          walkDistanceKm={borgoItinerary ? borgoItinerary.totalDistanceM / 1000 : undefined}
          walkDurationLabel={borgoItinerary ? formatDuration(borgoItinerary.estimatedTimeSeconds) : undefined}
          categoryLabel={META_TYPE_CONFIG.borgo_citta.label}
        />
      ) : (
        <GuideStatsStrip
          distanceKm={effective.distanceMeters / 1000}
          elevationGain={effective.elevationGain}
          altitudeMax={hike.altitudeMax}
          durationLabel={formatDuration(effective.estimatedTimeSeconds)}
          roundTrip={isLinearRoute && onRouteModeChange ? {
            active: showAsRoundTrip,
            saving: savingRouteMode,
            onToggle: () => chooseRouteMode(showAsRoundTrip ? 'one_way' : 'round_trip'),
          } : undefined}
        />
      )}

      {/* "Vicino a te" (piano §51.6) — solo per una Guida Sito AUTONOMA (una nested ha già il
          richiamo al Borgo sopra, non le serve anche questo); silenzioso da sé se relatedPlaces
          è vuoto (dtrek_place_relations non ancora popolata). */}
      {hike.metaType === 'sito' && !hike.parentMetaId && (
        <RelatedPlacesWidget places={placeDetail?.relatedPlaces ?? []} />
      )}

      {/* SitoGalleryWidget sopra mostra già una galleria (stesso raggio, stessa fonte Commons) per
          un Sito non-scheda_pratica — evitare qui la stessa galleria due volte nello scroll
          (piano guide-eccellenza §Fase 2.1). Per ogni altro caso (Sentiero, Borgo/Città, Sito
          scheda_pratica) PhotoMosaic resta l'unica galleria e usa il fallback sul punto della
          Meta appena aggiunto sopra quando manca una traccia. */}
      {!showsSitoGallery && (
        <PhotoMosaic
          photos={routePhotos.slice(0, 4).map((p, i) => ({ id: String(i), url: p.url }))}
          onPhotoClick={id => setRoutePhotoLightboxIndex(Number(id))}
          heightClass="h-32"
        />
      )}
      {routePhotoLightboxIndex != null && (
        <GuideGalleryLightbox
          items={routePhotoGalleryItems}
          index={routePhotoLightboxIndex}
          onNavigate={setRoutePhotoLightboxIndex}
          onClose={() => setRoutePhotoLightboxIndex(null)}
        />
      )}

      {/* ── Section nav (mobile: sticky pill bar / md+: sidebar) + reading column ────────── */}
      <div className="md:px-8 md:max-w-[1180px] md:mx-auto">
        <div className="md:grid md:grid-cols-[auto_1fr] md:gap-8 md:items-start md:pt-6">
          <SectionNav
            sections={navEntries.map(m => m.index === firstEmptyIndex
              ? { key: m.section.key, title: `Altre sezioni (${emptySections.length})`, icon: LEGACY_STYLE.icon, color: LEGACY_STYLE.color, empty: true }
              : { key: m.section.key, title: m.section.title, icon: m.section.icon, color: m.section.color, empty: !m.section.body?.trim() }
            )}
            activeIndex={navEntries.findIndex(m => m.index === visibleSec)}
            onSelect={navIdx => scrollToSection(navEntries[navIdx].index)}
          />

          <div className="min-w-0 px-4 sm:px-6 md:px-0 md:max-w-3xl lg:max-w-[52rem]">

            {/* Verifica utente: cliccare "Genera il resto"/"Approfondisci" sembrava non fare
                nulla — il banner sotto (quello con la scelta delle sezioni) SPARISCE non appena
                generatingSections si valorizza, senza nulla al suo posto finché l'utente non
                scorre fino allo spinner per-sezione, facile da perdere. Questo banner prende lo
                stesso spazio quando una generazione è in corso, da QUALUNQUE bottone sia partita
                (banner qui sotto, riga "+N sezioni", o "Approfondisci" su una singola sezione già
                visibile più in basso — generatingSections è lo stesso stato condiviso). */}
            {hasGuide && generatingSections.length > 0 && (
              <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-terra-50 border border-terra-200">
                <Loader2 className="w-4 h-4 text-terra-600 shrink-0 animate-spin" />
                <p className="text-[13px] font-semibold text-stone-800">
                  Giulia sta scrivendo {generatingSections.length === 1 ? 'la sezione' : `${generatingSections.length} sezioni`}…
                </p>
              </div>
            )}

            {/* Verifica utente: un errore di generazione (es. il cooldown anti-click-ripetuto,
                lib/aiCooldown.ts, o l'AI temporaneamente non disponibile) finiva mostrato in fondo
                a TUTTE le sezioni della guida — fuori dallo schermo rispetto a dove l'utente ha
                appena cliccato "Genera il resto"/"Approfondisci" quassù, indistinguibile da "non è
                successo nulla". Spostato subito sotto il banner di caricamento, sempre visibile
                senza scorrere. */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            {/* ── Genera il resto della guida — verifica utente 2026-09-27: il vecchio meccanismo
                 (tap = seleziona/deseleziona, poi un bottone separato per generare) dava
                 l'impressione di "nessun feedback" — toccare un chip barrava solo il testo, senza
                 mai avviare nulla finché non si premeva il bottone in fondo. Ogni chip genera ora
                 SUBITO la propria sezione al tap (stesso generateSections([key]) già usato da
                 "Approfondisci con Giulia" su una sezione singola, con lo stesso banner "Giulia sta
                 scrivendo…" già cablato più sotto — questo pannello sparisce da sé non appena
                 generatingSections si valorizza, riappare quando la generazione finisce e la
                 sezione appena scritta esce da missingSectionKeys). Il bottone in fondo resta come
                 scorciatoia per generarle tutte in una sola chiamata, non più per "confermare una
                 selezione". ───────────────────────────────────────────────────────────────── */}
            {hasGuide && !generating && generatingSections.length === 0 && missingSectionKeys.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 px-4 py-3 rounded-2xl bg-terra-50 border border-terra-200">
                <div className="flex items-start gap-3 min-w-0">
                  <Sparkles className="w-4 h-4 text-terra-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-stone-800">
                      {missingSectionKeys.length === 1 ? 'Manca ancora una sezione' : `Mancano ancora ${missingSectionKeys.length} sezioni`}
                    </p>
                    <p className="text-[11.5px] text-stone-500 leading-snug">
                      Tocca una sezione per generarla subito con Giulia
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missingSectionKeys.map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => generateSections([key])}
                      className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors bg-terra-600 border-terra-600 text-white hover:bg-terra-700"
                    >
                      {sectionTitleByKey.get(key) ?? key}
                    </button>
                  ))}
                </div>
                {missingSectionKeys.length > 1 && (
                  <button
                    onClick={() => generateSections(missingSectionKeys)}
                    className="w-full sm:w-auto shrink-0 px-4 py-2 rounded-full bg-terra-600 hover:bg-terra-700 text-white text-[12.5px] font-semibold transition-colors self-start"
                  >
                    Genera tutte insieme con Giulia (AI)
                  </button>
                )}
              </div>
            )}

            {/* ── Voice mini-player ──────────────────────────────────────────── */}
            {hasGuide && (
              <div className="mt-4">
                <VoicePlayer
                  isPlaying={isPlaying}
                  isPaused={isPaused}
                  rateIdx={rateIdx}
                  onTogglePlayPause={togglePlayPause}
                  onStop={stopVoice}
                  onChangeRate={changeRate}
                />
              </div>
            )}

            {/* ── Voice progress (sticky while playing, so stop stays reachable) ─────── */}
            {(isPlaying || isPaused) && hasGuide && (
              <div className="sticky top-2 z-10 mt-3 bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3 shadow-sm" style={{ borderColor: '#dcd8cc' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-stone-600 truncate">
                    {isPlaying && activeSection !== null
                      ? `▶ ${displaySections[activeSection]?.title ?? '…'}`
                      : '⏸ In pausa'}
                  </p>
                  <div className="mt-1 h-0.5 bg-terra-100 rounded-full overflow-hidden">
                    <div className="h-full bg-terra-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(playProgress * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── AI temporaneamente non verificabile (es. blackout Supabase) ─── */}
            {!hasGuide && hasAiAccess === false && aiUnavailable && (
              <div className="flex flex-col items-center py-10 gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center shadow-inner">
                  <Loader2 className="w-6 h-6 text-terra-500" />
                </div>
                <div className="max-w-sm">
                  <h2 className="font-display text-lg font-bold text-stone-800 mb-2">
                    Racconto di Giulia temporaneamente non disponibile
                  </h2>
                  <p className="text-stone-500 text-sm leading-relaxed">
                    Non riusciamo a verificare la tua chiave AI in questo momento — riprova tra poco.
                    Intanto qui sotto trovi comunque mappa, profilo, punteggi e punti di interesse del percorso.
                  </p>
                </div>
              </div>
            )}

            {/* ── No AI access ─────────────────────────────────────────────── */}
            {!hasGuide && hasAiAccess === false && !aiUnavailable && (
              <div className="flex flex-col items-center py-10 gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center shadow-inner">
                  <KeyRound className="w-6 h-6 text-terra-500" />
                </div>
                <div className="max-w-sm">
                  <h2 className="font-display text-lg font-bold text-stone-800 mb-2">
                    {trialExpired ? 'Il periodo di prova gratuito è terminato' : 'Racconto di Giulia non disponibile'}
                  </h2>
                  <p className="text-stone-500 text-sm leading-relaxed">
                    {trialExpired
                      ? <>Giulia può ancora scrivere la guida narrata di questo percorso — <a href="/prezzi" className="text-terra-600 font-medium underline underline-offset-2">sblocca Dtrek</a> per continuare a generarla. Intanto qui sotto trovi comunque mappa, profilo, punteggi e punti di interesse del percorso.</>
                      : <>Al momento non hai accesso alla generazione AI — <a href="/prezzi" className="text-terra-600 font-medium underline underline-offset-2">sblocca Dtrek</a>. Intanto qui sotto trovi comunque mappa, profilo, punteggi e punti di interesse del percorso.</>
                    }
                  </p>
                </div>
              </div>
            )}

            {/* ── Preparing (waiting for enrichment) ──────────────────────── */}
            {!hasGuide && hasAiAccess !== false && !generating && !enrichmentReady && (
              <div className="flex items-center gap-3 py-8 justify-center text-center">
                <Loader2 className="w-5 h-5 animate-spin text-terra-500" />
                <p className="text-stone-500 text-sm">
                  {hike.metaType === 'sentiero'
                    ? 'Sto raccogliendo i dati del percorso… la guida di Giulia arriverà tra poco.'
                    : 'Sto preparando la scheda… la guida di Giulia arriverà tra poco.'}
                </p>
              </div>
            )}

            {/* ── Generating spinner (no text yet) ────────────────────────── */}
            {!hasGuide && generating && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-terra-100 flex items-center justify-center animate-pulse">
                  <BookOpen className="w-6 h-6 text-terra-500" />
                </div>
                <div>
                  <p className="font-display font-semibold text-stone-700">{genStatus ?? 'Giulia sta scrivendo…'}</p>
                  <p className="text-stone-400 text-sm mt-1">i dati qui sotto sono già consultabili nel frattempo</p>
                </div>
              </div>
            )}

            {/* ── Guide sections — always rendered (widgets), text where available ────────── */}
            <div className="mt-4">
              {navEntries.map(({ section: s, index: i }) => {
                // La prima sezione vuota (piano guide-eccellenza §Fase 1.1) diventa una riga
                // compatta unica che riassume TUTTE le sezioni vuote insieme — le altre non hanno
                // più una card propria in questo loop (navEntries le esclude già, vedi sopra),
                // invece di N placeholder quasi identici sparsi nello scroll. Verifica utente
                // 2026-09-30 ("rendi espandibile quel pulsante"): prima era solo un segnaposto di
                // stato, senza azione propria — bisognava risalire al banner "Genera il resto della
                // guida" in cima per fare qualcosa. Ora un tap la espande sul posto: ogni chip
                // genera subito la propria sezione (stesso generateSections([key]) del banner in
                // cima, 2026-09-27), solo limitata alle sezioni davvero riassunte qui (emptySections,
                // non tutte le missingSectionKeys — quelle con un widget ma senza testo hanno già la
                // propria card sopra, non vanno contate due volte).
                if (i === firstEmptyIndex) {
                  const approfondendoMerged = emptySections.some(es => generatingSections.includes(es.guideKey))
                  const emptyKeys = emptySections.map(es => es.guideKey)
                  return (
                    <article
                      key={s.key}
                      ref={el => { sectionRefs.current[i] = el }}
                      className="scroll-mt-16 border border-stone-200 rounded-xl bg-white mb-2.5 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setEmptyRowExpanded(v => !v)}
                        disabled={approfondendoMerged}
                        aria-expanded={emptyRowExpanded}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                      >
                        <span className="[&>svg]:w-4 [&>svg]:h-4 shrink-0 text-stone-400">{LEGACY_STYLE.icon}</span>
                        <span className="flex-1 min-w-0 text-[13px] font-semibold text-stone-800">
                          + {emptySections.length} {emptySections.length === 1 ? 'sezione da generare' : 'sezioni da generare'}
                        </span>
                        {approfondendoMerged ? (
                          <span className="flex items-center gap-1 text-[11.5px] font-medium text-stone-400 shrink-0">
                            <Loader2 className="w-3 h-3 animate-spin" /> Approfondimento…
                          </span>
                        ) : emptyRowExpanded ? (
                          <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />
                        )}
                      </button>
                      {emptyRowExpanded && !approfondendoMerged && (
                        <div className="flex flex-col gap-3 px-4 pb-3.5 pt-3 border-t border-stone-100">
                          <div className="flex flex-wrap gap-1.5">
                            {emptyKeys.map(key => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => generateSections([key])}
                                className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors bg-terra-600 border-terra-600 text-white hover:bg-terra-700"
                              >
                                {sectionTitleByKey.get(key) ?? key}
                              </button>
                            ))}
                          </div>
                          {emptyKeys.length > 1 && (
                            <button
                              onClick={() => generateSections(emptyKeys)}
                              className="w-full sm:w-auto shrink-0 px-4 py-2 rounded-full bg-terra-600 hover:bg-terra-700 text-white text-[12.5px] font-semibold transition-colors self-start"
                            >
                              Genera tutte insieme con Giulia (AI)
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  )
                }
                // Ogni sezione può essere approfondita singolarmente (app/api/guide/route.ts,
                // sections) — a differenza di "Genera il resto della guida" che le chiede tutte
                // insieme. Solo per le sezioni fisse (s.guideKey), non per quelle "legacy".
                const canApprofondisciSection = showApprofondisciHint && s.guideKey != null && generatingSections.length === 0
                return (
                  <SectionCard
                    key={s.key}
                    ref={el => { sectionRefs.current[i] = el }}
                    title={s.title}
                    subtitle={s.subtitle}
                    icon={s.icon}
                    color={s.color}
                    body={s.body}
                    widget={renderWidget(s.key, s.body)}
                    sectionPhoto={routePhotos[i]?.url}
                    twoColumns
                    isVoiceActive={activeSection === i && (isPlaying || isPaused)}
                    onSpeak={() => speakSection(i)}
                    showApprofondisciHint={canApprofondisciSection}
                    onApprofondisci={canApprofondisciSection ? () => generateSections([s.guideKey!]) : undefined}
                    approfondendo={generatingSections.includes(s.guideKey as GuideSectionKey)}
                    // "Verificato online" non passa mai dal meccanismo delle lunghezze (è generata
                    // da una chiamata AI dedicata alla sola ricerca web, indipendente da
                    // sectionLengths — vedi SECTION_LENGTH_BY_LEVEL in app/api/guide/route.ts):
                    // mostrare il selettore lì sarebbe un controllo che sembra fare qualcosa ma non
                    // ha alcun effetto.
                    lengthSelector={canApprofondisciSection && s.guideKey !== 'verificato' ? renderLengthSelector(s.guideKey!) : undefined}
                  />
                )
              })}

              {hasGuide && generating && (
                <div className="flex items-center gap-2 px-5 py-4 bg-white rounded-2xl shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-terra-500" />
                  <span className="text-stone-400 text-sm">Giulia sta continuando…</span>
                </div>
              )}
            </div>

            {hasGuide && !generating && galleryItems.length > 0 && (
              <div className="mt-4 mb-1">
                <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-stone-400 mb-2">
                  Galleria fotografica
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x proximity' }}>
                  {galleryItems.map((item, i) => (
                    <button
                      key={`gallery-${i}`}
                      type="button"
                      onClick={() => setGalleryLightboxIndex(i)}
                      className="shrink-0 w-52 rounded-2xl overflow-hidden border border-stone-200 group text-left"
                      style={{ scrollSnapAlign: 'start' }}
                    >
                      <SafeImg
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-52 h-36 object-cover group-hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                      <p className="px-2.5 py-1.5 text-[10px] text-stone-400 bg-stone-50 truncate">
                        {item.sourceLabel}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {galleryLightboxIndex != null && (
              <GuideGalleryLightbox
                items={galleryItems}
                index={galleryLightboxIndex}
                onNavigate={setGalleryLightboxIndex}
                onClose={() => setGalleryLightboxIndex(null)}
              />
            )}

            {hasGuide && !generating && hasAiAccess === true && (
              <GuideQA
                hikeId={hike.id}
                hikeFallback={{
                  title:                hike.title,
                  distanceMeters:       hike.distanceMeters,
                  elevationGain:        hike.elevationGain,
                  estimatedTimeSeconds: hike.estimatedTimeSeconds,
                  assessment:           hike.assessment,
                  cachedPois:           hike.cachedPois,
                  cachedPoiWiki:        hike.cachedPoiWiki,
                  cachedGuide:          guideText,
                }}
              />
            )}

            {/* ── Bottom actions ──────────────────────────────────────────── */}
            {hasGuide && !generating && (
              <div className="mt-8 mb-6 pt-5 space-y-3" style={{ borderTop: '1px solid #dcd8cc' }}>
                {!('speechSynthesis' in (typeof window !== 'undefined' ? window : {})) && (
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                    <span className="flex items-center gap-1 text-xs text-stone-400">
                      <VolumeX className="w-3.5 h-3.5" /> Voce non supportata
                    </span>
                  </div>
                )}

                {/* Azioni principali — impilate a piena larghezza su mobile, affiancate da sm in
                    su, sempre come coppia coerente invece di andare a capo l'una senza l'altra. */}
                <div className="flex flex-col sm:flex-row sm:justify-end gap-2.5">
                  <button onClick={exportPdf} disabled={exportingPdf}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white rounded-full text-sm font-semibold transition-all shadow-sm"
                  >
                    {exportingPdf
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileDown className="w-3.5 h-3.5" />}
                    {exportingPdf ? 'Genero PDF…' : 'Scarica PDF'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {needsRouteModeChoice && (
        <RouteModeDialog
          distanceMeters={hike.distanceMeters}
          elevationGain={hike.elevationGain}
          durationLabel={formatDuration(hike.estimatedTimeSeconds)}
          durationRoundTripLabel={formatDuration(hike.estimatedTimeSeconds * 2)}
          onChoose={chooseRouteMode}
          saving={savingRouteMode}
        />
      )}

      {aiCreditError && (
        <CreditErrorModal message={aiCreditError.message} onClose={() => setAiCreditError(null)} />
      )}

      {/* Guida di Sito in overlay (piano §51.4, opzione B) — sopra QUESTA Guida di Borgo/Città,
          mai al suo posto: nessuna navigazione, questo componente resta montato sotto per tutto
          il tempo in cui l'overlay è aperto. */}
      {openSiteGuideId && (
        <SiteGuideOverlay siteId={openSiteGuideId} onClose={() => setOpenSiteGuideId(null)} />
      )}
    </div>
  )
}
