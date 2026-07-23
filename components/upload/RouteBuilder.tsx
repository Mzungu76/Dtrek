'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronDown, ChevronUp, Loader2, TrendingUp, CheckCircle, Search as SearchIcon, RefreshCw, X as XIcon,
  Sparkles, Route, MapPin, ExternalLink, AlertTriangle, Check,
} from 'lucide-react'
import LocationPickerMap from '@/components/LocationPickerMap'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { NamedPoiIcon, GroupPoiBadge } from '@/components/PoiIconChip'
import GiuliaSearchPanel from './GiuliaSearchPanel'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { downsamplePolyline } from '@/lib/downsamplePolyline'
import { fetchPoisNearTrack } from '@/lib/poisProxy'
import { fetchWikiForNamedPois, isSpecificName } from '@/lib/wikipedia'
import { computeCtsForHike, computeCtsCore } from '@/lib/computeCtsForHike'
import { computeSafetyForHike, computeSafetyCore } from '@/lib/computeSafetyForHike'
import { computeTrailScoreV2 } from '@/lib/trailScoreV2'
import { HIKER_ENVIRONMENT_PREFS, type HikerEnvironmentPrefKey } from '@/lib/hikerProfile'
import { POI_META, type PoiItem, type PoiType } from '@/lib/overpass'
import { defaultPendingExpiresAt } from './sharedHelpers'
import type { ScoredCandidate as BuiltCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { RouteType } from '@/lib/routeBuilder/loopBuilder'
import type { SearchResultCandidate } from '@/app/api/route-search/route'
import type { FoundRouteResult } from '@/app/api/route-build/search/route'
import type { TrackPoint } from '@/lib/tcxParser'
import { classifyTrackShape } from '@/lib/geoUtils'

type Step = 'start' | 'results' | 'confirm'

// Etichetta breve per i tre RouteType — usata sia nel titolo di default alla scelta di un
// candidato "costruito" sia nella tile "Tipo" della conferma.
function routeTypeLabel(t: RouteType): string {
  if (t === 'anello') return 'Anello'
  if (t === 'solo_andata') return 'Solo andata'
  return 'Andata e ritorno'
}

// Un percorso "trovato" (ricerca non-AI/AI) non porta con sé un tipo anello/andata-ritorno/solo
// andata — le relazioni OSM non hanno un tag affidabile per distinguerli — quindi si classifica
// dalla geometria stessa (classifyTrackShape, vedi lib/geoUtils.ts): un anello e un
// andata-ritorno tornano entrambi al punto di partenza, la differenza è se il ritorno ripercorre
// lo stesso tratto o no. Per un percorso lineare non si distingue andata-ritorno da solo andata
// dalla sola geometria (la differenza è se si torna sugli stessi passi, non deducibile da una
// traccia sola): un lineare soddisfa quindi entrambe le selezioni.
function foundRouteMatchesTypes(routePolyline: [number, number][], selectedTypes: RouteType[]): boolean {
  const shape = classifyTrackShape(routePolyline)
  if (shape === 'loop') return selectedTypes.includes('anello')
  if (shape === 'out_and_back') return selectedTypes.includes('andata_ritorno')
  return selectedTypes.includes('andata_ritorno') || selectedTypes.includes('solo_andata')
}

const MIN_KM = 1
// Deve coincidere con MAX_TARGET_DISTANCE_KM di app/api/route-build/route.ts — uno slider che
// arriva più in alto di quanto il server accetti produce una richiesta di costruzione respinta
// (400) ogni volta che l'utente sposta la lunghezza oltre questo limite, un errore che restava
// silenzioso finché c'erano comunque percorsi "trovati" da mostrare (vedi runSearch).
const MAX_KM = 15
// Tagli del filtro "raggio di ricerca" — condiviso da ricerca base e avanzata (stesso stato, vedi
// searchRadiusKm), visibile in mappa come cerchio attorno al punto/luogo cercato. Deve coincidere
// con ALLOWED_RADIUS_KM di app/api/route-build/search/route.ts e app/api/route-build/route.ts.
const RADIUS_OPTIONS_KM = [5, 10, 20, 50, 100] as const
// Cap sui candidati "trovati" dalla chat di Giulia (Livello 2) da tentare di risolvere con una
// traccia reale prima di mostrarli — stesso principio del cap lato server per i livelli 0/1 (vedi
// app/api/route-build/search/route.ts), qui applicato lato client perché la chat è conversazionale.
const MAX_GIULIA_RESOLVE = 3

// Sottoinsieme curato di PoiType proposto nel wizard come "tipo di luogo desiderato" — non tutti i
// tipi hanno senso come obiettivo di una ricerca (es. 'bridge'/'bench' sono troppo comuni/banali
// per essere un criterio utile).
const DESIRABLE_POI_TYPES: PoiType[] = ['waterfall', 'viewpoint', 'spring', 'cave', 'peak', 'pass', 'ruins', 'castle']

interface CandidateScorePreview {
  total: number | null
  safety: { overall: number; color: string; label: string } | null
  vetoed: boolean
  loading: boolean
}

// Traccia reale garantita di un percorso "trovato" — mai mostrata finché non risolta (vedi §2 del
// piano). Stessa forma dei campi restituiti da /api/route-search/resolve (lib/routeBuilder/resolveTrack.ts),
// letta qui via JSON e non importata come tipo server (quel modulo importa librerie server-only).
interface ResolvedTrack {
  trackPoints: TrackPoint[]
  routePolyline: [number, number][]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

// Un percorso "trovato" normalizzato — sia che venga dalla ricerca non-AI (Livello 0/1,
// app/api/route-build/search/route.ts) sia dalla chat AI di Giulia (Livello 2) — con una traccia
// reale SEMPRE presente: un candidato che non risolve una traccia non diventa mai un FoundRouteItem
// (vedi handleFound/runSearch), quindi questa forma non ha bisogno di un ramo "senza traccia".
interface FoundRouteItem {
  name: string
  zone?: string
  difficulty?: string
  description?: string
  sourceUrl?: string
  comfortVerdict?: SearchResultCandidate['comfortVerdict']
  comfortNote?: string
  osmId?: number
  track: ResolvedTrack
}

// Un percorso "costruito" (algoritmo, cammina la rete OSM reale) o "trovato" (ricerca non-AI o AI
// di un percorso già documentato altrove) — fusi nella stessa lista risultati, distinti da un tag,
// invece di un bivio esclusivo (vedi commento sopra il componente). Entrambi hanno sempre una
// traccia reale su mappa.
type ResultItem =
  | { kind: 'built'; data: BuiltCandidate }
  | { kind: 'found'; data: FoundRouteItem }

function verdictStyle(v: string) {
  if (v === 'adatto') return { badge: 'bg-forest-50 text-forest-700 border-forest-200', Icon: Check, label: 'Adatto a te' }
  if (v === 'sconsigliato') return { badge: 'bg-red-50 text-red-700 border-red-200', Icon: XIcon, label: 'Sconsigliato per te' }
  return { badge: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertTriangle, label: 'Da valutare' }
}

function PoiPreviewRow({ pois }: { pois: PoiItem[] }) {
  if (pois.length === 0) return null
  const named: PoiItem[] = []
  const groups = new Map<PoiType, PoiItem[]>()
  for (const poi of pois) {
    if (poi.name && isSpecificName(poi.name)) named.push(poi)
    else {
      const arr = groups.get(poi.type)
      if (arr) arr.push(poi)
      else groups.set(poi.type, [poi])
    }
  }
  return (
    <div data-hscroll className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
      {named.map(poi => <NamedPoiIcon key={poi.id} poi={poi} highlighted={false} />)}
      {Array.from(groups.entries()).map(([type, ps]) => <GroupPoiBadge key={type} type={type} pois={ps} />)}
    </div>
  )
}

function buildHikeFromBuilt(data: BuiltCandidate, title: string, date: string, pendingExpiresAt: string): PlannedHike {
  return {
    id: 'routebuild_' + Date.now().toString(36),
    title: title.trim() || 'Percorso costruito',
    plannedDate: date || undefined,
    createdAt: new Date().toISOString(),
    distanceMeters: data.distanceMeters,
    elevationGain: data.elevationGain,
    elevationLoss: data.elevationLoss,
    altitudeMax: data.altitudeMax,
    altitudeMin: data.altitudeMin,
    estimatedTimeSeconds: data.estimatedTimeSeconds,
    trackPoints: data.trackPoints,
    routePolyline: downsamplePolyline(data.trackPoints),
    pendingExpiresAt,
  }
}

function buildHikeFromFound(data: FoundRouteItem, title: string, date: string, pendingExpiresAt: string): PlannedHike {
  const track = data.track
  return {
    id: 'aisearch_' + Date.now().toString(36),
    title: title.trim() || data.name,
    plannedDate: date || undefined,
    userNotes: data.description,
    createdAt: new Date().toISOString(),
    distanceMeters: track.distanceMeters,
    elevationGain: track.elevationGain,
    elevationLoss: track.elevationLoss,
    altitudeMax: track.altitudeMax,
    altitudeMin: track.altitudeMin,
    estimatedTimeSeconds: track.estimatedTimeSeconds,
    osmId: data.osmId,
    trackPoints: track.trackPoints.length ? track.trackPoints : undefined,
    routePolyline: track.routePolyline,
    pendingExpiresAt,
    // Metadati che sopravvivono solo per un percorso "trovato" — vedi lib/plannedStore.ts.
    sourceUrl: data.sourceUrl,
    comfortVerdict: data.comfortVerdict,
    comfortNote: data.comfortNote,
    zone: data.zone,
    difficulty: data.difficulty,
  }
}

/** Arricchisce in place con POI/Wikipedia lungo la traccia — condiviso tra i due rami di
 *  salvataggio (percorso costruito o trovato), stesso blocco che prima era duplicato in
 *  RouteBuilder.tsx e AiRouteSearch.tsx. */
async function enrichWithPois(hike: PlannedHike): Promise<void> {
  const gps = hike.trackPoints?.filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number, number]) ?? []
  if (gps.length < 2) return
  try {
    const deadline = new Promise<null>(r => setTimeout(() => r(null), 7000))
    const pois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline])
    if (pois?.length) {
      hike.cachedPois = pois
      const poiWiki = await Promise.race([fetchWikiForNamedPois(pois), deadline])
      if (poiWiki?.length) hike.cachedPoiWiki = poiWiki
    }
  } catch {}
}

/**
 * Wizard "Costruisci o trova un percorso": due motori, scelti esplicitamente dall'utente PRIMA di
 * cercare (searchMode), non più eseguiti sempre insieme. "Esistenti" trova un percorso GIÀ
 * documentato altrove, a livelli crescenti di costo (app/api/route-build/search/route.ts): prima
 * senza AI (Nominatim/Overpass), poi — solo se necessario e con l'interruttore AI attivo — un
 * livello economico che interpreta la richiesta e ripassa il risultato allo stesso livello senza
 * AI, infine la chat di Giulia con ricerca web come ultima risorsa; mai una costruzione automatica
 * di riserva, quella è l'altra modalità. "Su misura" cammina la rete OSM reale attorno a un punto
 * di partenza (toccato sulla mappa, o risolto per nome senza cercare percorsi esistenti) per
 * generare un percorso NUOVO su misura di lunghezza/dislivello/preferenze (lib/routeBuilder/*,
 * app/api/route-build/route.ts) — nessuna chiamata AI, puro calcolo su grafo + arricchimento
 * DTM/POI. I risultati delle due modalità si accumulano in `results`, mostrati in due tab separati
 * ("Esistenti" / "Su misura") — e ogni risultato mostrato ha sempre una traccia reale su mappa,
 * mai solo statistiche testuali.
 */
export default function RouteBuilder({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('start')
  // Tab dello step "Risultati": percorsi già esistenti (trovati) vs generati su misura
  // (costruiti) — non più mescolati in un'unica lista, per non confondere le due categorie
  // (un percorso "esistente" ha una storia/fonte/community dietro, uno "su misura" è generato
  // apposta per i criteri di questa ricerca). Sincronizzato all'ingresso nello step (vedi
  // l'effetto dedicato) con quello che ha risultati, non fissato a priori.
  const [resultsTab, setResultsTab] = useState<'esistenti' | 'su_misura'>('esistenti')

  const [lat, setLat] = useState<number | null>(null)
  const [lon, setLon] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  // Due modalità di ricerca distinte, scelte esplicitamente dall'utente PRIMA di cercare — non più
  // un'unica ricerca che le combina entrambe. Stesso motore di prima (Livello 0/1/2 per "Esistenti",
  // algoritmo di generazione per "Su misura"), solo diviso invece che sempre eseguito insieme.
  const [searchMode, setSearchMode] = useState<'esistenti' | 'su_misura'>('esistenti')
  // Solo per "Su misura": il luogo/POI digitato è il punto di partenza esatto, o solo un centro
  // d'interesse nei cui dintorni cercare il miglior aggancio alla rete percorribile (utile per un
  // luogo generico come una città, o un POI senza sentieri esattamente addosso, es. "Cascata del
  // Picchio") — vedi startMode in app/api/route-build/route.ts.
  const [startMode, setStartMode] = useState<'esatto' | 'dintorni'>('esatto')
  // Rivelato automaticamente solo quando i livelli 0/1 (gratuito/economico) non trovano nulla — mai
  // un'apertura manuale che implicherebbe di dover scegliere a priori se "cercare con l'AI".
  const [showGiulia, setShowGiulia] = useState(false)
  const [giuliaSeed, setGiuliaSeed] = useState('')
  // Ricerca avanzata (tipo di percorso, destinazione, lunghezza, dislivello, preferenze) —
  // raggiungibile fin dal primo schermo invece di essere nascosta dietro un "Continua" dopo la
  // ricerca: chiusa di default per non sovraccaricare lo schermo, ma mai un passo separato del
  // wizard.
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Raggio di ricerca — visibile nella ricerca base (non nascosto nella sezione avanzata), si
  // applica a entrambe: al motore "trovati" (raggio attorno al luogo risolto) e a quello
  // "costruiti" (come tetto aggiuntivo, mai per allargare oltre il limite di sicurezza esistente
  // — vedi app/api/route-build/route.ts). Mostrato anche come cerchio sulla mappa.
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(20)

  // Selezione multipla, non esclusiva: l'utente può cercare/costruire più tipi di percorso insieme
  // (es. sia Anello che Andata e ritorno), risultati mescolati nella stessa lista — vedi
  // toggleRouteType e runBuildForTypes. Sempre almeno un tipo selezionato.
  const [routeTypes, setRouteTypes] = useState<RouteType[]>(['anello'])
  const [targetDistanceKm, setTargetDistanceKm] = useState(8)
  const [targetElevationM, setTargetElevationM] = useState('')
  const [environmentPrefs, setEnvironmentPrefs] = useState<HikerEnvironmentPrefKey[]>([])
  const [desiredPoiTypes, setDesiredPoiTypes] = useState<PoiType[]>([])
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  // Interruttore AI unico, condiviso da più usi: (1) terzo livello di risoluzione di un luogo noto
  // per nome nel campo destinazione (lib/routeBuilder/resolvePlace.ts), (2) livello 1 economico
  // (interpretazione della richiesta) e (3) livello 2 (chat di Giulia con ricerca web) della
  // ricerca unificata qui sotto — se OFF, i livelli 1/2 non partono proprio: nessuna domanda,
  // nessuna classificazione nascosta. Parte dal default salvato in profilo (Profilo → AI,
  // components/profilo/SectionAiPrivacy.tsx) ma resta modificabile per questa singola ricerca,
  // finché il default non arriva viene assunto acceso.
  const [useAi, setUseAi] = useState(true)

  const [generating, setGenerating] = useState(false)
  // Lista unica: candidati "costruiti" (da Genera percorsi) e "trovati" (dalla ricerca unificata,
  // popolati anche mentre si è ancora sullo step "Partenza") convivono qui, ciascuno taggato per
  // tipo e sempre con una traccia reale.
  const [results, setResults] = useState<ResultItem[]>([])
  const [resultsMessage, setResultsMessage] = useState('')
  // Parallelo a `results` (stessa lunghezza/indice) — calcolato per ogni candidato, costruito o
  // trovato, non appena arriva (vedi effetto sotto) — riusato anche in "Conferma" via
  // `selectedIndex`, nessun ricalcolo separato lì.
  const [scores, setScores] = useState<(CandidateScorePreview | null)[]>([])

  const [selected, setSelected] = useState<ResultItem | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const [errorMsg, setErrorMsg] = useState('')

  // Precompila lunghezza/dislivello/preferenze/interruttore AI dallo storico e dal profilo
  // dell'utente (stesso segnale usato da Giulia in route-search) — solo un suggerimento, l'utente
  // resta libero di cambiarlo per questa singola ricerca. Caricato subito al mount (non più solo al
  // primo ingresso nello step dei parametri) perché l'interruttore AI serve già nello step "start".
  useEffect(() => {
    if (defaultsLoaded) return
    setDefaultsLoaded(true)
    fetch('/api/route-build')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.suggestedDistanceKm) setTargetDistanceKm(Math.min(MAX_KM, Math.max(MIN_KM, data.suggestedDistanceKm)))
        if (data?.suggestedElevationM) setTargetElevationM(String(data.suggestedElevationM))
        if (Array.isArray(data?.environmentPrefs)) setEnvironmentPrefs(data.environmentPrefs)
        if (typeof data?.routeBuildAiPlaceSearch === 'boolean') setUseAi(data.routeBuildAiPlaceSearch)
      })
      .catch(() => {})
  }, [defaultsLoaded])

  // Calcola Trail Score + Sicurezza per ogni candidato, costruito o trovato, non appena arrivano i
  // risultati — stessa pipeline usata per un percorso già salvato (computeCtsCore/computeSafetyCore,
  // vedi lib/computeCtsForHike.ts e lib/computeSafetyForHike.ts). Un candidato "trovato" ha sempre
  // una traccia reale già risolta (vedi FoundRouteItem) prima di finire in questa lista, quindi il
  // calcolo può partire subito qui, senza dover attendere la selezione — stesso indice di `results`,
  // riusato anche nello step "Conferma" invece di un calcolo separato lì.
  useEffect(() => {
    if (results.length === 0) { setScores([]); return }
    setScores(results.map(() => ({ total: null, safety: null, vetoed: false, loading: true })))
    results.forEach((r, i) => {
      const hikeForScore = r.kind === 'built' ? r.data : r.data.track
      Promise.all([
        computeCtsCore(hikeForScore).catch(() => null),
        computeSafetyCore(hikeForScore).catch(() => null),
      ]).then(([cts, safety]) => {
        const v2 = computeTrailScoreV2({ cts: cts?.ts ?? null, safety: safety?.overall ?? null })
        setScores(prev => {
          if (prev.length !== results.length) return prev
          const next = [...prev]
          next[i] = {
            total: v2?.score ?? null,
            safety: safety ? { overall: safety.overall, color: safety.color, label: safety.label } : null,
            vetoed: v2?.breakdown.vetoed ?? false,
            loading: false,
          }
          return next
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  // All'ingresso nello step "Risultati", apre il tab che ha davvero qualcosa da mostrare invece di
  // aprire sempre "Esistenti" anche quando è vuoto — solo al cambio di step, non ad ogni
  // aggiornamento di `results`, per non scavalcare una scelta manuale dell'utente nel frattempo.
  useEffect(() => {
    if (step !== 'results') return
    const hasEsistenti = results.some(r => r.kind === 'found')
    const hasSuMisura = results.some(r => r.kind === 'built')
    if (!hasEsistenti && hasSuMisura) setResultsTab('su_misura')
    else if (hasEsistenti) setResultsTab('esistenti')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Anteprima immediata (con debounce) del luogo digitato in "Su misura": aggiorna solo
  // lat/lon (mai il testo, per non correggere quello che l'utente sta ancora scrivendo) così la
  // mappa e il cerchio del raggio di ricerca si spostano subito, prima ancora di premere il
  // pulsante — sempre senza AI (risoluzione economica, chiamata a ogni pausa nella digitazione:
  // usare qui il livello AI sarebbe uno spreco). La risoluzione "ufficiale" (che rispetta
  // l'interruttore AI e aggiorna anche il testo con il nome risolto) resta quella di runSuMisura,
  // eseguita solo alla conferma.
  useEffect(() => {
    if (searchMode !== 'su_misura' || !query.trim()) return
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/route-build/resolve-place?q=${encodeURIComponent(query.trim())}&useAi=false`)
        const data = await res.json()
        if (data?.place) { setLat(data.place.lat); setLon(data.place.lon) }
      } catch {}
    }, 600)
    return () => clearTimeout(handle)
  }, [query, searchMode])

  // Selezione multipla dei tipi di percorso — sempre almeno un tipo attivo, non si può deselezionare
  // l'ultimo rimasto.
  function toggleRouteType(t: RouteType) {
    setRouteTypes(prev => {
      if (prev.includes(t)) return prev.length > 1 ? prev.filter(x => x !== t) : prev
      return [...prev, t]
    })
  }

  function toggleEnvironmentPref(key: HikerEnvironmentPrefKey) {
    setEnvironmentPrefs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function toggleDesiredPoiType(type: PoiType) {
    setDesiredPoiTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  // Ricerca unica per lo step "Partenza": Livello 0 (sempre, gratuito) → Livello 1 (economico, solo
  // se necessario e con AI attiva) lato server (app/api/route-build/search/route.ts). Se nessuno
  // dei due trova nulla, rivela la chat di Giulia (Livello 2) pre-innescata con la stessa query.
  async function runSearch() {
    if (!query.trim() || searching) return
    setSearching(true)
    setErrorMsg('')
    setShowGiulia(false)
    try {
      const res = await fetch('/api/route-build/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), useAi, radiusKm: searchRadiusKm }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.message || data.error || 'Ricerca non riuscita, riprova.')
        return
      }

      if (data.place) {
        setLat(data.place.lat)
        setLon(data.place.lon)
        setQuery(data.place.displayName)
      }
      // Valori effettivi da usare SUBITO (per il filtro sui trovati qui sotto): non si può leggere
      // lo stato appena impostato con le setXxx sopra/sotto, gli aggiornamenti sono asincroni e non
      // ancora rispecchiati nelle variabili di chiusura di questa stessa chiamata.
      const effectiveRouteTypes: RouteType[] = data.prefill?.routeType ? [data.prefill.routeType] : routeTypes
      const effectiveDistanceKm = typeof data.prefill?.targetDistanceKm === 'number'
        ? Math.min(MAX_KM, Math.max(MIN_KM, data.prefill.targetDistanceKm)) : targetDistanceKm

      if (data.prefill) {
        if (data.prefill.routeType) setRouteTypes([data.prefill.routeType])
        if (typeof data.prefill.targetDistanceKm === 'number') setTargetDistanceKm(effectiveDistanceKm)
        if (typeof data.prefill.targetElevationM === 'number') setTargetElevationM(String(data.prefill.targetElevationM))
        if (Array.isArray(data.prefill.desiredPoiTypes)) setDesiredPoiTypes(data.prefill.desiredPoiTypes)
        if (Array.isArray(data.prefill.environmentPrefs)) setEnvironmentPrefs(data.prefill.environmentPrefs)
      }
      // Solo i percorsi trovati compatibili col tipo selezionato (vedi foundRouteMatchesTypes) —
      // altrimenti selezionare "Anello" nella ricerca avanzata non aveva alcun effetto sui
      // percorsi trovati, che passavano tutti indipendentemente dal tipo.
      const found = ((data.foundRoutes ?? []) as FoundRouteResult[])
        .filter(r => foundRouteMatchesTypes(r.routePolyline, effectiveRouteTypes))
      if (found.length > 0) {
        const items: ResultItem[] = found.map(r => ({
          kind: 'found',
          data: {
            name: r.name, osmId: r.id,
            track: {
              trackPoints: r.trackPoints, routePolyline: r.routePolyline, distanceMeters: r.distanceMeters,
              elevationGain: r.elevationGain, elevationLoss: r.elevationLoss, altitudeMax: r.altitudeMax,
              altitudeMin: r.altitudeMin, estimatedTimeSeconds: r.estimatedTimeSeconds, hasElevation: r.hasElevation,
            },
          },
        }))
        setResults(prev => [...prev.filter(x => x.kind !== 'found'), ...items])
      }

      if (data.escalateToAi && useAi) {
        // La chat di Giulia (Livello 2) resta da mostrare — non si naviga via dallo step "Partenza"
        // finché è ancora in attesa, altrimenti sparirebbe.
        setErrorMsg('')
        setGiuliaSeed(query.trim())
        setShowGiulia(true)
      } else if (found.length === 0) {
        // Ricerca "Esistenti" pura: nessuna costruzione automatica di riserva (quella è l'azione
        // "Su misura", un motore distinto scelto esplicitamente dall'utente, non un ripiego
        // silenzioso qui) — se non si trova nulla, il messaggio invita a provare l'altra modalità.
        setErrorMsg('Nessun percorso esistente trovato — prova a scrivere diversamente, tocca la mappa, o prova "Su misura" per generarne uno.')
      } else {
        setErrorMsg('')
        setStep('results')
      }
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSearching(false)
    }
  }

  // Popolato dalla chat di Giulia (Livello 2) quando trova percorsi già documentati. A differenza
  // dei livelli 0/1 (già garantiti con traccia reale dal server), qui la risoluzione avviene lato
  // client: per ciascun candidato (cap MAX_GIULIA_RESOLVE) prova a risolvere una traccia reale — se
  // fallisce, il candidato non diventa mai una card senza traccia (vedi §2 del piano): il suo
  // luogo (searchName/searchArea) viene comunque provato come punto di partenza per costruire,
  // così la ricerca non resta a mani vuote.
  async function handleFound(found: SearchResultCandidate[]) {
    const resolvedItems: ResultItem[] = []
    let fallbackPlace: { lat: number; lon: number; displayName: string } | null = null

    for (const c of found.slice(0, MAX_GIULIA_RESOLVE)) {
      let track: ResolvedTrack | null = null
      if (c.hasGpsTrack && (c.osmId != null || c.gpxUrl)) {
        try {
          const res = await fetch('/api/route-search/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ osmId: c.osmId, gpxUrl: c.gpxUrl }),
          })
          const data = await res.json()
          if (data.ok) track = data
        } catch {}
      }
      // Stesso filtro per tipo dei livelli 0/1 (vedi foundRouteMatchesTypes in runSearch) — un
      // candidato di Giulia con un tipo incompatibile con quello selezionato viene scartato qui,
      // non solo omesso dalla lista: altrimenti "Anello" non avrebbe effetto nemmeno sui risultati
      // della chat.
      if (track && foundRouteMatchesTypes(track.routePolyline, routeTypes)) {
        resolvedItems.push({
          kind: 'found',
          data: {
            name: c.name, zone: c.zone, difficulty: c.difficulty, description: c.description,
            sourceUrl: c.sourceUrl ?? undefined, comfortVerdict: c.comfortVerdict, comfortNote: c.comfortNote,
            osmId: c.osmId ?? undefined, track,
          },
        })
        continue
      }
      if (!fallbackPlace && lat == null) {
        const q = [c.searchName, c.searchArea].filter(Boolean).join(', ')
        if (q.trim()) {
          try {
            const r = await fetch(`/api/route-build/resolve-place?q=${encodeURIComponent(q)}&useAi=false`)
            const d = await r.json()
            if (d?.place) fallbackPlace = d.place
          } catch {}
        }
      }
    }

    if (resolvedItems.length > 0) {
      setResults(prev => [...prev.filter(r => r.kind !== 'found'), ...resolvedItems])
    }
    if (fallbackPlace && lat == null) {
      setLat(fallbackPlace.lat)
      setLon(fallbackPlace.lon)
      setQuery(fallbackPlace.displayName)
    }
  }

  interface BuildParamsCommon {
    lat: number
    lon: number
    targetDistanceKm: number
    targetElevationM: number | null
    environmentPrefs: HikerEnvironmentPrefKey[]
    desiredPoiTypes: PoiType[]
    startMode: 'esatto' | 'dintorni'
  }

  /** Nucleo condiviso della costruzione algoritmica — usato dalla modalità "Su misura" (generate/
   *  runSuMisura). Un tipo di percorso selezionato è una richiesta indipendente all'endpoint
   *  (l'algoritmo di generazione è strutturalmente diverso per anello/andata-ritorno/solo andata)
   *  — con più tipi selezionati, gira una richiesta per tipo in parallelo e i risultati si
   *  fondono in un'unica lista, ciascuno già etichettato col proprio tipo (vedi ScoredCandidate.type).
   *  Non tocca `errorMsg` direttamente — ritorna il numero totale di percorsi ottenuti e un eventuale
   *  messaggio, lasciando al chiamante decidere se mostrarlo. */
  async function runBuildForTypes(types: RouteType[], common: BuildParamsCommon): Promise<{ count: number; message: string | null }> {
    setGenerating(true)
    setResultsMessage('')
    try {
      const outcomes = await Promise.all(types.map(async routeType => {
        try {
          const res = await fetch('/api/route-build', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...common, routeType, radiusKm: searchRadiusKm, destinationLat: null, destinationLon: null }),
          })
          const data = await res.json()
          if (!res.ok) return { candidates: [] as BuiltCandidate[], message: data.message || data.error || 'Generazione non riuscita, riprova.' }
          return { candidates: (data.candidates ?? []) as BuiltCandidate[], message: (data.message ?? null) as string | null }
        } catch {
          return { candidates: [] as BuiltCandidate[], message: 'Errore di rete, riprova.' }
        }
      }))
      const allBuilt = outcomes.flatMap(o => o.candidates)
      setResults(prev => [...prev.filter(r => r.kind !== 'built'), ...allBuilt.map(d => ({ kind: 'built' as const, data: d }))])
      const firstEmptyMessage = outcomes.find(o => o.candidates.length === 0)?.message ?? null
      setResultsMessage(allBuilt.length === 0 ? (firstEmptyMessage ?? '') : '')
      return { count: allBuilt.length, message: allBuilt.length === 0 ? firstEmptyMessage : null }
    } finally {
      setGenerating(false)
    }
  }

  // Accetta un lat/lon esplicito (usato da runSuMisura subito dopo aver risolto un luogo digitato
  // — leggere lo stato lat/lon appena impostato darebbe un valore ancora vecchio, aggiornamenti
  // asincroni) — senza argomento usa lo stato corrente, come chiamato dal pulsante "Genera".
  async function generate(overrideLatLon?: { lat: number; lon: number }) {
    const buildLat = overrideLatLon?.lat ?? lat
    const buildLon = overrideLatLon?.lon ?? lon
    if (buildLat == null || buildLon == null || generating) return
    setErrorMsg('')
    const { count, message } = await runBuildForTypes(routeTypes, {
      lat: buildLat, lon: buildLon, targetDistanceKm,
      targetElevationM: targetElevationM.trim() ? Number(targetElevationM) : null,
      environmentPrefs,
      desiredPoiTypes,
      startMode,
    })
    if (count > 0) setStep('results')
    else if (message) setErrorMsg(message)
  }

  // Azione della modalità "Su misura": se c'è un testo, lo risolve come luogo di partenza (stesso
  // motore di risoluzione nome→coordinata già usato altrove, NON la ricerca di percorsi esistenti
  // — qui non si cerca mai un percorso già documentato), poi genera sempre con l'algoritmo.
  async function runSuMisura() {
    if (searching || generating) return
    setErrorMsg('')
    if (!query.trim()) {
      await generate()
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/route-build/resolve-place?q=${encodeURIComponent(query.trim())}&useAi=${useAi}`)
      const data = await res.json()
      if (!data?.place) {
        setErrorMsg('Luogo non trovato — prova a scrivere diversamente o tocca la mappa.')
        return
      }
      setLat(data.place.lat)
      setLon(data.place.lon)
      setQuery(data.place.displayName)
      await generate({ lat: data.place.lat, lon: data.place.lon })
    } catch {
      setErrorMsg('Errore di rete, riprova.')
    } finally {
      setSearching(false)
    }
  }

  // Azione primaria dello step "Partenza" — quale motore parte dipende dalla modalità scelta
  // dall'utente (searchMode): "Esistenti" cerca solo percorsi già documentati altrove, "Su misura"
  // genera sempre con l'algoritmo. Stesso motore di prima, solo diviso in due invece che combinato.
  async function handlePrimaryAction() {
    if (searchMode === 'esistenti') {
      if (query.trim()) await runSearch()
    } else {
      await runSuMisura()
    }
  }

  function chooseCandidate(item: ResultItem, i: number) {
    setSelected(item)
    setSelectedIndex(i)
    setErrorMsg('')
    setDate('')
    setTitle(item.kind === 'built' ? `${routeTypeLabel(item.data.type)} costruito ${i + 1}` : item.data.name)
    setStep('confirm')
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = selected.kind === 'built'
        ? buildHikeFromBuilt(selected.data, title, date, pendingExpiresAt)
        : buildHikeFromFound(selected.data, title, date, pendingExpiresAt)

      await enrichWithPois(hike)

      await savePlanned(hike)
      computeCtsForHike(hike).catch(() => {})
      computeSafetyForHike(hike).catch(() => {})
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  // Card di un percorso "trovato" — riusata sia nell'anteprima inline dello step "Partenza" sia
  // nello step "Risultati" fuso. La traccia è sempre reale (vedi FoundRouteItem), quindi mostra
  // sempre una mappa, mai solo statistiche testuali.
  function renderFoundCard(data: FoundRouteItem, i: number) {
    const vs = data.comfortVerdict ? verdictStyle(data.comfortVerdict) : null
    const track = data.track
    const scorePreview = scores[i]
    return (
      <div key={`found-${i}`} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <TrailPreviewMap polyline={track.routePolyline} height="180px" />
        <div className="p-4 space-y-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-terra-50 text-terra-700">
            <Sparkles className="w-3 h-3" /> Percorso trovato
          </span>

          <div>
            <h4 className="font-display text-base font-semibold text-stone-800">{data.name}</h4>
            {data.zone && <p className="text-xs text-stone-400 mt-0.5">{data.zone}</p>}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-semibold text-stone-800">{(track.distanceMeters / 1000).toFixed(1)} km</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
              </div>
              <div>
                <span className="font-semibold text-stone-800 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />{track.hasElevation ? `${Math.round(track.elevationGain)} m` : '—'}
                </span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello</p>
              </div>
              <div>
                <span className="font-semibold text-stone-800">
                  {{ loop: 'Anello', out_and_back: 'Andata e ritorno', linear: 'Lineare' }[classifyTrackShape(track.routePolyline)]}
                </span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
              </div>
              {data.difficulty && (
                <div>
                  <span className="font-semibold text-stone-800 capitalize">{data.difficulty}</span>
                  <p className="text-[10px] uppercase tracking-wide text-stone-400">Difficoltà</p>
                </div>
              )}
            </div>
            <div className="shrink-0 bg-stone-800 rounded-xl p-1.5">
              <TrailScoreGaugeBadge
                total={scorePreview?.total ?? null}
                safety={scorePreview?.safety ?? null}
                loading={scorePreview?.loading ?? true}
                vetoed={scorePreview?.vetoed}
                size={52}
                showLabel={false}
              />
            </div>
          </div>

          {vs && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${vs.badge}`}>
              <vs.Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{vs.label}</p>
                {data.comfortNote && <p className="mt-0.5 opacity-90">{data.comfortNote}</p>}
              </div>
            </div>
          )}

          {data.description && <p className="text-sm text-stone-600 leading-relaxed">{data.description}</p>}

          <div className="flex items-center justify-between pt-1">
            {data.sourceUrl ? (
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
                <ExternalLink className="w-3 h-3" /> Fonte
              </a>
            ) : <span />}
            <button onClick={() => chooseCandidate({ kind: 'found', data }, i)}
              className="px-4 py-2 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors">
              Scegli questo percorso
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Card di un percorso "su misura" (generato dall'algoritmo) — riusata sia nello step "Risultati"
  // (tab "Su misura") sia, potenzialmente, altrove: stesso pattern di renderFoundCard sopra.
  function renderBuiltCard(c: BuiltCandidate, i: number) {
    const scorePreview = scores[i]
    return (
      <div key={`built-${i}`} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <TrailPreviewMap polyline={c.routePolyline} height="180px" />
        <div className="p-4 space-y-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-forest-50 text-forest-700">
            <Route className="w-3 h-3" /> Su misura per te
          </span>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-semibold text-stone-800">{(c.distanceMeters / 1000).toFixed(1)} km</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Distanza</p>
              </div>
              <div>
                <span className="font-semibold text-stone-800 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{Math.round(c.elevationGain)} m</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Dislivello</p>
              </div>
              <div>
                <span className="font-semibold text-stone-800">{routeTypeLabel(c.type)}</span>
                <p className="text-[10px] uppercase tracking-wide text-stone-400">Tipo</p>
              </div>
            </div>
            <div className="shrink-0 bg-stone-800 rounded-xl p-1.5">
              <TrailScoreGaugeBadge
                total={scorePreview?.total ?? null}
                safety={scorePreview?.safety ?? null}
                loading={scorePreview?.loading ?? true}
                vetoed={scorePreview?.vetoed}
                size={52}
                showLabel={false}
              />
            </div>
          </div>

          <PoiPreviewRow pois={c.pois ?? []} />

          {c.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{c.matchNote}</p>}

          {c.hasSteepSections && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Presenta tratti ripidi</p>
          )}

          <button onClick={() => chooseCandidate({ kind: 'built', data: c }, i)}
            className="w-full py-2.5 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-xs font-semibold uppercase tracking-wide transition-colors">
            Scegli questo percorso
          </button>
        </div>
      </div>
    )
  }

  // ── Punto di partenza (ricerca + ricerca avanzata, mappa a pieno schermo) ───────────────────
  // Un solo schermo invece di due: la ricerca avanzata (tipo di percorso, destinazione, lunghezza,
  // dislivello, preferenze) è raggiungibile fin da subito in una sezione a comparsa, non più dietro
  // un "Continua" separato — vedi showAdvanced. La mappa riempie tutto lo schermo (createPortal su
  // document.body: altrimenti l'elemento "fixed" resterebbe intrappolato dentro il contenitore
  // della pagina, che ha una propria animazione con transform e diventerebbe il suo contenitore di
  // posizionamento, vanificando l'effetto a pieno schermo), con la ricerca in un pannello sovrapposto.
  if (step === 'start') {
    const canGo = searchMode === 'esistenti'
      ? !searching && query.trim() !== ''
      : !searching && !generating && (query.trim() !== '' || (lat != null && lon != null))

    return createPortal(
      <div className="fixed inset-0 z-[60] bg-stone-100 flex flex-col">
        <div className="absolute inset-0">
          <LocationPickerMap
            lat={lat ?? undefined} lon={lon ?? undefined}
            onPick={(pLat, pLon) => { setLat(pLat); setLon(pLon) }}
            height="100%" rounded={false}
            radiusKm={lat != null && lon != null ? searchRadiusKm : undefined}
          />
        </div>

        <div className="relative z-10 flex items-center gap-2.5 p-3 pointer-events-none">
          <button onClick={onBack}
            className="pointer-events-auto w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-xl px-3 py-1.5 shadow-md">
            <p className="text-sm font-semibold text-stone-800">Costruisci o trova un percorso</p>
            <p className="text-[11px] text-stone-400">Tocca la mappa o scrivi cosa cerchi</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-h-[75vh] overflow-y-auto bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.15)] p-4 space-y-3">
          <div className="flex bg-stone-100 rounded-xl p-1">
            <button type="button" onClick={() => setSearchMode('esistenti')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode === 'esistenti' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
              Cerca esistenti
            </button>
            <button type="button" onClick={() => setSearchMode('su_misura')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode === 'su_misura' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
              Cerca su misura
            </button>
          </div>
          <p className="text-xs text-stone-400 -mt-1.5">
            {searchMode === 'esistenti'
              ? 'Cerca un percorso già documentato altrove, per nome o descrizione.'
              : 'Genera un percorso nuovo, su misura per i criteri scelti qui sotto.'}
          </p>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePrimaryAction() }}
              placeholder={searchMode === 'esistenti'
                ? 'Es. Gole del Biedano, Blera — o descrivi un percorso che conosci'
                : 'Luogo di partenza (opzionale se tocchi la mappa)'}
              className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white"
            />
            <button onClick={handlePrimaryAction} disabled={!canGo}
              className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-600 flex items-center justify-center shrink-0 transition-colors">
              {(searching || generating) ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setUseAi(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              useAi ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-500'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> Usa l&apos;AI se non trovo nulla
          </button>

          {searchMode === 'su_misura' && (
            <div>
              <p className="text-xs font-medium text-stone-600 mb-1.5">Il luogo digitato è...</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setStartMode('esatto')}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    startMode === 'esatto' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                  }`}>
                  Il punto di partenza
                </button>
                <button type="button" onClick={() => setStartMode('dintorni')}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    startMode === 'dintorni' ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                  }`}>
                  Un centro d&apos;interesse nei dintorni
                </button>
              </div>
              {startMode === 'dintorni' && (
                <p className="text-xs text-stone-400 mt-1.5">
                  Utile per un luogo generico (es. una città) o un punto d&apos;interesse senza sentieri esattamente addosso (es. una cascata) — cerca il miglior punto di partenza entro il raggio scelto qui sotto, invece di richiedere che sia già lì.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-stone-600 mb-1.5">Raggio di ricerca dal punto/luogo</p>
            <div className="grid grid-cols-5 gap-1.5">
              {RADIUS_OPTIONS_KM.map(km => (
                <button key={km} type="button" onClick={() => setSearchRadiusKm(km)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    searchRadiusKm === km ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                  }`}>
                  {km} km
                </button>
              ))}
            </div>
            {searchMode === 'su_misura' && startMode === 'esatto' && (
              <p className="text-xs text-stone-400 mt-1.5">
                Con &quot;Il punto di partenza&quot; il raggio si applica solo come tetto di sicurezza, non allarga la ricerca — passa a &quot;Un centro d&apos;interesse nei dintorni&quot; per usarlo davvero.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span>Ricerca avanzata — tipo, lunghezza, dislivello, preferenze</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-1 border-t border-stone-100">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">Tipo di percorso</label>
                <p className="text-xs text-stone-400 mb-2">Puoi selezionarne più di uno insieme.</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => toggleRouteType('anello')}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('anello') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                    Anello
                  </button>
                  <button onClick={() => toggleRouteType('andata_ritorno')}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('andata_ritorno') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                    Andata e ritorno
                  </button>
                  <button onClick={() => toggleRouteType('solo_andata')}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${routeTypes.includes('solo_andata') ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'}`}>
                    Solo andata
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-stone-600">Lunghezza target</label>
                  <span className="text-sm font-semibold text-stone-800">{targetDistanceKm.toFixed(1)} km</span>
                </div>
                <input type="range" min={MIN_KM} max={MAX_KM} step={0.5} value={targetDistanceKm}
                  onChange={e => setTargetDistanceKm(Number(e.target.value))}
                  className="w-full accent-terra-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">
                  Dislivello target <span className="font-normal text-stone-400">(opzionale, in metri)</span>
                </label>
                <input type="number" min={0} value={targetElevationM} onChange={e => setTargetElevationM(e.target.value)}
                  placeholder="es. 300"
                  className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2">Preferenze ambientali</label>
                <div className="flex flex-wrap gap-2">
                  {HIKER_ENVIRONMENT_PREFS.map(p => (
                    <button key={p.key} onClick={() => toggleEnvironmentPref(p.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        environmentPrefs.includes(p.key) ? 'bg-forest-500 border-forest-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-600 mb-2">
                  Vorrei incontrare <span className="font-normal text-stone-400">(opzionale)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {DESIRABLE_POI_TYPES.map(type => (
                    <button key={type} onClick={() => toggleDesiredPoiType(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        desiredPoiTypes.includes(type) ? 'bg-terra-500 border-terra-500 text-white' : 'bg-white border-stone-300 text-stone-600'
                      }`}>
                      {POI_META[type].emoji} {POI_META[type].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showGiulia && useAi && (
            <div className="space-y-2">
              <p className="text-xs text-terra-700 bg-terra-50 border border-terra-200 rounded-xl px-3 py-2">
                ✨ Nessun risultato senza AI — provo a cercarlo con Giulia.
              </p>
              <GiuliaSearchPanel onFound={handleFound} initialQuery={giuliaSeed} />
            </div>
          )}

          {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}

          <button onClick={handlePrimaryAction} disabled={!canGo}
            className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
            {(searching || generating)
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : searchMode === 'esistenti' ? <SearchIcon className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
            {searching
              ? (searchMode === 'esistenti' ? 'Cerco…' : 'Risolvo il luogo…')
              : generating ? 'Genero il percorso…'
              : searchMode === 'esistenti' ? 'Cerca percorsi esistenti' : 'Genera percorso su misura'}
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  // ── Risultati ───────────────────────────────────────────────────────────────
  // Due tab invece di un'unica lista mescolata: "Esistenti" (percorsi già documentati altrove,
  // con una loro storia/fonte) e "Su misura" (generati apposta per i criteri di questa ricerca) —
  // due categorie diverse per natura, non solo per etichetta, quindi separate invece che intrecciate.

  if (step === 'results') {
    const entries = results.map((item, i) => ({ item, i }))
    const esistentiEntries = entries.filter((e): e is { item: Extract<ResultItem, { kind: 'found' }>; i: number } => e.item.kind === 'found')
    const suMisuraEntries = entries.filter((e): e is { item: Extract<ResultItem, { kind: 'built' }>; i: number } => e.item.kind === 'built')
    const activeEntries = resultsTab === 'esistenti' ? esistentiEntries : suMisuraEntries

    return (
      <div className="space-y-3">
        <button onClick={() => setStep('start')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Cambia ricerca
        </button>

        <div className="flex bg-stone-100 rounded-xl p-1">
          <button onClick={() => setResultsTab('esistenti')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${resultsTab === 'esistenti' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
            Esistenti{esistentiEntries.length > 0 && ` (${esistentiEntries.length})`}
          </button>
          <button onClick={() => setResultsTab('su_misura')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${resultsTab === 'su_misura' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
            Su misura{suMisuraEntries.length > 0 && ` (${suMisuraEntries.length})`}
          </button>
        </div>

        {activeEntries.length === 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 text-sm text-stone-600">
            {resultsTab === 'esistenti'
              ? 'Nessun percorso già esistente trovato per questi criteri.'
              : (resultsMessage || 'Nessun percorso generato per questi criteri — prova una lunghezza diversa o un altro punto di partenza.')}
          </div>
        )}

        {activeEntries.map(({ item, i }) => item.kind === 'found' ? renderFoundCard(item.data, i) : renderBuiltCard(item.data, i))}
      </div>
    )
  }

  // ── Conferma ────────────────────────────────────────────────────────────────

  if (step === 'confirm' && selected) {
    const foundData = selected.kind === 'found' ? selected.data : null
    const builtData = selected.kind === 'built' ? selected.data : null
    const vs = foundData?.comfortVerdict ? verdictStyle(foundData.comfortVerdict) : null
    const selectedScore = selectedIndex != null ? scores[selectedIndex] : null

    return (
      <div className="space-y-4">
        <button onClick={() => setStep('results')} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Torna ai risultati
        </button>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Data <span className="font-normal text-stone-400">(opzionale)</span></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-terra-400 focus:bg-white" />
          </div>

          {builtData && (
            <>
              <TrailPreviewMap polyline={builtData.routePolyline} />
              <div className="flex items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                  {[
                    { label: 'Distanza', val: `${(builtData.distanceMeters / 1000).toFixed(1)} km` },
                    { label: 'Dislivello +', val: `${Math.round(builtData.elevationGain)} m` },
                    { label: 'Quota max', val: `${Math.round(builtData.altitudeMax)} m` },
                    { label: 'Tipo', val: routeTypeLabel(builtData.type) },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
                      <p className="text-[10px] text-stone-400">{s.label}</p>
                      <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 bg-stone-800 rounded-xl p-1.5">
                  <TrailScoreGaugeBadge
                    total={selectedScore?.total ?? null}
                    safety={selectedScore?.safety ?? null}
                    loading={selectedScore?.loading ?? true}
                    vetoed={selectedScore?.vetoed}
                    size={52}
                    showLabel={false}
                  />
                </div>
              </div>

              <PoiPreviewRow pois={builtData.pois ?? []} />

              {builtData.matchNote && <p className="text-sm text-stone-600 leading-relaxed">{builtData.matchNote}</p>}
            </>
          )}

          {foundData && (
            <>
              <TrailPreviewMap polyline={foundData.track.routePolyline} />
              <div className="flex items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                  {[
                    { label: 'Distanza', val: `${(foundData.track.distanceMeters / 1000).toFixed(1)} km` },
                    { label: 'Dislivello +', val: foundData.track.hasElevation ? `${Math.round(foundData.track.elevationGain)} m` : '—' },
                    { label: 'Quota max', val: foundData.track.hasElevation ? `${Math.round(foundData.track.altitudeMax)} m` : '—' },
                    { label: 'Difficoltà', val: foundData.difficulty ?? '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-stone-50 rounded-xl border border-stone-150 p-3">
                      <p className="text-[10px] text-stone-400">{s.label}</p>
                      <p className="text-sm font-semibold text-stone-800">{s.val}</p>
                    </div>
                  ))}
                </div>
                <div className="shrink-0 bg-stone-800 rounded-xl p-1.5">
                  <TrailScoreGaugeBadge
                    total={selectedScore?.total ?? null}
                    safety={selectedScore?.safety ?? null}
                    loading={selectedScore?.loading ?? true}
                    vetoed={selectedScore?.vetoed}
                    size={52}
                    showLabel={false}
                  />
                </div>
              </div>

              {vs && (
                <div className={`flex items-start gap-2 px-3.5 py-3 rounded-xl border text-sm ${vs.badge}`}>
                  <vs.Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{vs.label}</p>
                    {foundData.comfortNote && <p className="mt-0.5 text-xs opacity-90">{foundData.comfortNote}</p>}
                  </div>
                </div>
              )}

              {!foundData.track.hasElevation && (
                <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl bg-sky-50 border border-sky-100 text-xs text-sky-800">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>Percorso senza copertura del modello altimetrico: la mappa è reale, il profilo altimetrico no.</p>
                </div>
              )}
            </>
          )}
        </div>

        {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-terra-500 hover:bg-terra-600 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
          Salva e apri la guida
        </button>
      </div>
    )
  }

  return null
}
