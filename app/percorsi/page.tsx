'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { GalleryMapThumb } from '@/components/routehub/BottomGallery'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import { haversineM } from '@/lib/geoUtils'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT, TACCUINO_LIST_DIVIDER, TACCUINO_RULED_TEXT_STYLE, FONT_HAND, HandDrawnFrame, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { TornFrame, tornVariant } from '@/components/TornFrame'
import { FONT } from '@/lib/designTokens'
import { META_TYPE_CONFIG, META_TYPES, metaHasHikingMetrics, type MetaType } from '@/lib/metaTypes'
import { metaRowLocationStats } from '@/lib/metaCard'
import type { MeteMapPin } from '@/components/mete/MeteMap'
import { ArrowDown, ArrowRight, ArrowUp, Building2, ChevronDown, ChevronRight, ChevronUp, Clock, Loader2, LocateFixed, MapPin, Maximize2, Minimize2, Mountain, Route, Search, Star, Tag, TrendingUp, X } from 'lucide-react'

// Leaflet è pesante (CSS+JS) e non deve entrare nel bundle iniziale della pagina: dynamic import,
// mai un `import` statico in cima al file — così il codice della mappa si scarica solo quando
// l'utente apre davvero la carta (piano di restyling, Fase 3). `ssr: false`: Leaflet legge `window`
// al modulo, incompatibile col rendering server.
const MeteMap = dynamic(() => import('@/components/mete/MeteMap'), { ssr: false })

/**
 * "Mete" (ex "Tutti i Percorsi") — ristrutturazione Diario/Mete richiesta esplicitamente
 * dall'utente dopo il redesign menù globale: una Meta è un percorso pianificato non ancora
 * camminato (nessun Reportage collegato) — appena nasce un Reportage smette di comparire qui e
 * si raggiunge dal suo Diario (app/diari/[id]/page.tsx, che ora elenca i Reportage). Vista
 * trasversale su tutte le Mete dell'utente, indipendente da un Diario specifico: una Meta non
 * appartiene a nessun Diario finché non viene camminata (il Diario di destinazione si sceglie solo
 * alla creazione del Reportage, vedi components/upload/ActivityUploader.tsx) — ogni riga rimanda
 * quindi alla stessa lettura "a libro" già usata per un Percorso dentro un Diario, ma nella sua
 * variante diary-agnostic (app/guida/[id]/[groupKey]/page.tsx — GuidaHub, /guida/[id], resta solo
 * la "vista estesa" raggiungibile da lì, non più la destinazione diretta del click).
 *
 * L'elenco (ricerca, ordinamento, righe) allineato allo stesso layout "taccuino" del Sommario del
 * Diario (app/diari/[id]/page.tsx) — richiesta esplicita dell'utente: stessa riga a "ritaglio
 * incollato" (mappa reale, anello Trail Score, pillole dati), non più le card bianche col bordo
 * arrotondato del vecchio stile. Niente filtro di stato (qui ogni riga è già "in programma" per
 * definizione — il filtro raccontati/senza racconto del Sommario non ha un equivalente da fare).
 *
 * `/api/percorsi` resta invariata nella forma (non filtrata lato server, estesa con altitudeMax/
 * estimatedTimeSeconds/trailScore/favorite/createdAt per pareggiare DiarioReportageRow): serve
 * invariata anche a app/diari/page.tsx (GlobalRouteSearch), che deve poter ritrovare un percorso
 * indipendentemente da quante uscite ha già — il filtro "solo non ancora camminate" resta locale a
 * questa pagina.
 */
type MeteSortKey = 'date' | 'distance' | 'km' | 'dplus' | 'cts'
type MeteTypeFilter = 'all' | MetaType

// "Km"/"D+"/"TS" hanno senso solo quando l'elenco può contenere un sentiero (piano §48.9 — una
// Meta borgo_citta/sito ha queste cifre sempre a 0, ordinarci non direbbe nulla): visibili con
// 'all' o 'sentiero', nascosti con 'borgo_citta'/'sito'. "Data" resta sempre disponibile, unico
// ordinamento che vale per ogni tipologia. "Vicinanza" (Fase 3 del piano di restyling) è nascosta
// finché la posizione dell'utente non è nota — mai un ordinamento per una distanza che non esiste.
const METE_SORT_OPTIONS: { id: MeteSortKey; label: string; hikingOnly?: boolean; needsLocation?: boolean }[] = [
  { id: 'date', label: 'Data' },
  { id: 'distance', label: 'Vicinanza', needsLocation: true },
  { id: 'km', label: 'Km', hikingOnly: true },
  { id: 'dplus', label: 'D+', hikingOnly: true },
  { id: 'cts', label: 'TS', hikingOnly: true },
]

/** Rotazione stabile per meta (stesso principio di cutoutRotation in app/diari/[id]/page.tsx —
 *  derivata dall'id, non `Math.random()`, così la stessa riga si inclina sempre allo stesso modo
 *  tra un render e l'altro). */
function cutoutRotation(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(hash) % 14) / 10) - 0.7
}

/** Ingrandimento del riquadro "map" del Taccuino Botanico (87×87, app/globals.css) via
 *  `transform: scale()` invece di ricalibrare a mano nastro/ombre/strappo per una nuova taglia:
 *  uno scale uniforme riproduce lo stesso identico disegno calibrato, solo più grande — nessun
 *  rischio di disallineare il nastro o le ombre (richiesta esplicita dell'utente: "miniature
 *  leggermente più grandi" mantenendo lo stile esistente, non uno stile nuovo). */
const MAP_THUMB_BASE = 87
const MAP_THUMB_SIZE = 100
const MAP_THUMB_SCALE = MAP_THUMB_SIZE / MAP_THUMB_BASE

/** Icona di fallback quando la miniatura non ha una traccia da disegnare — stessa icona di
 *  `META_TYPE_CONFIG[metaType].icon` (i chip di filtro, i pin della carta): un solo posto decide
 *  quale icona rappresenta una tipologia, non tre copie che possono disallinearsi. Prima era
 *  piccola (20px) e color cardBorder — quasi lo stesso beige dello sfondo dietro, "soffocata" per
 *  scarso contrasto (segnalazione dell'utente su screenshot reale): ora è grande (36px) e nel
 *  colore pieno della tipologia, su una tinta leggera dello stesso colore invece del beige
 *  generico — si vede a colpo d'occhio anche prima di leggere il titolo della riga. */
function metaTypeFallbackIcon(metaType: MetaType | undefined) {
  const resolved = metaType ?? 'sentiero'
  const Icon = META_TYPE_CONFIG[resolved].icon
  return <Icon className="w-9 h-9" style={{ color: META_TYPE_CONFIG[resolved].color }} strokeWidth={1.6} />
}

/** Posizione pseudo-casuale ma stabile (derivata dall'id, stesso principio di cutoutRotation sopra
 *  — mai Math.random(), la stessa Meta deve occupare sempre lo stesso punto tra un render e
 *  l'altro) dentro un riquadro [margin, 1-margin] — mai troppo vicino al bordo, dove il pin
 *  finirebbe tagliato dalla maschera di sfumatura in fondo alla striscia. */
function hashPosition(id: string): { x: number; y: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const a = Math.abs(hash)
  const b = Math.abs((hash * 2654435761) | 0)
  const margin = 0.12
  return { x: margin + (a % 1000) / 1000 * (1 - 2 * margin), y: margin + (b % 1000) / 1000 * (1 - 2 * margin) }
}

/** Chip di tipologia — usata sia nel corpo della pagina sia nella carta a tutto schermo (stesso
 *  `typeFilter`, mai due filtri indipendenti che possono disallinearsi tra elenco e carta). */
function TypeFilterChips({ typeFilter, onChange, counts, total, className }: {
  typeFilter: MeteTypeFilter
  onChange: (t: MeteTypeFilter) => void
  counts: Record<MetaType, number>
  total: number
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto pb-0.5 ${className ?? ''}`}>
      <button
        onClick={() => onChange('all')}
        className="relative shrink-0 px-3 py-1 rounded-full text-[13px] transition-colors"
        style={typeFilter === 'all'
          ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
          : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
      >
        {typeFilter === 'all' && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
        Tutte <span className="opacity-70">{total}</span>
      </button>
      {META_TYPES.map(t => {
        const Icon = META_TYPE_CONFIG[t].icon
        const on = typeFilter === t
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="relative shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] transition-colors"
            style={on
              ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
              : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
          >
            {on && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
            <Icon className="w-3 h-3" /> {META_TYPE_CONFIG[t].pluralLabel} <span className="opacity-70">{counts[t]}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Sotto il km, la distanza si legge meglio in metri tondi (es. "450 m") che come "0,5 km". */
function formatDistanceKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`
}

/**
 * Anteprima statica della carta chiusa (piano di restyling, Fase 3) — MAI Leaflet: solo un
 * riquadro decorativo con linee di livello e un pin per Meta (stessa forma/colore della carta
 * vera), posizionati in modo deterministico ma non geografico. Costa zero JS di libreria mappa al
 * caricamento della pagina; la carta vera si monta solo quando l'utente la apre (MeteMap, import
 * dinamico in cima al file).
 */
function MapStripPreview({ pins }: { pins: MeteMapPin[] }) {
  return (
    <svg viewBox="0 0 358 70" style={{ width: '100%', height: 70, display: 'block', background: '#E7E3D2' }} aria-hidden="true">
      <g fill="none" stroke="#C8B99F" strokeWidth={1} opacity={0.9}>
        <path d="M-10 16 C 60 4, 130 32, 210 16 S 330 -6, 370 12" />
        <path d="M-10 34 C 62 22, 134 50, 214 34 S 330 12, 370 30" />
        <path d="M-10 54 C 64 42, 138 70, 218 54 S 330 32, 370 50" />
      </g>
      {pins.map(p => {
        const { x, y } = hashPosition(p.id)
        return <circle key={p.id} cx={x * 358} cy={y * 70} r={4} fill={META_TYPE_CONFIG[p.metaType].color} stroke="#F5EDDD" strokeWidth={1.3} />
      })}
    </svg>
  )
}

export default function MetePage() {
  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [typeFilter, setTypeFilter] = useState<MeteTypeFilter>('all')
  const [sortBy, setSortBy] = useState<MeteSortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // Carta chiusa a ogni ingresso in pagina (mai persistita — decisione esplicita dopo il mockup):
  // si riapre solo al tocco. userLocation resta null finché l'utente non apre la carta almeno una
  // volta — il permesso di geolocalizzazione non si chiede mai al solo caricamento della pagina.
  const [mapOpen, setMapOpen] = useState(false)
  // A tutto schermo (richiesta esplicita dopo il primo giro di revisione): resta sempre un
  // sotto-stato di "aperta" — non ha senso a mappa chiusa, e chiudere la carta chiude anche il
  // pieno schermo (vedi handleToggleMap).
  const [mapFullscreen, setMapFullscreen] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [geoDenied, setGeoDenied] = useState(false)
  const autoDistanceSortApplied = useRef(false)

  // A tutto schermo la pagina dietro non deve scorrere insieme alla mappa (stesso principio di un
  // qualunque overlay a piena pagina: lo scroll del contenuto sotto è solo confusione).
  useEffect(() => {
    if (!mapFullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mapFullscreen])

  function requestLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoDenied(true); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGeoDenied(false) },
      // Negato o non disponibile: geoDenied evita di richiedere il permesso di nuovo da sola a ogni
      // apertura/chiusura della carta nella stessa sessione — resta un pulsante esplicito
      // ("Vicino a me") per ritentare. La carta resta comunque pienamente utilizzabile senza,
      // semplicemente senza ordinamento per vicinanza (mai un valore fabbricato al suo posto).
      () => setGeoDenied(true),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }

  function handleToggleMap() {
    setMapOpen(open => {
      const next = !open
      if (!next) setMapFullscreen(false) // chiudere la carta chiude anche il pieno schermo
      if (next && userLocation == null && !geoDenied) requestLocation()
      return next
    })
  }

  // La prima volta che la posizione arriva, se l'utente non ha già scelto un altro ordinamento
  // (sortBy è ancora il default "Data"), passa a "Vicinanza" — coerente col mockup approvato ("con
  // la carta aperta l'elenco si ordina per distanza da te"), ma solo una volta e mai sopra una
  // scelta esplicita dell'utente.
  useEffect(() => {
    if (userLocation && !autoDistanceSortApplied.current && sortBy === 'date') {
      autoDistanceSortApplied.current = true
      setSortBy('distance')
    }
  }, [userLocation, sortBy])

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const mete = useMemo(() => (rows ?? []).filter(r => r.reportageCount === 0), [rows])

  // Conteggio per tipologia sul totale delle Mete (non sul filtrato) — sono le etichette dei chip,
  // devono restare stabili mentre l'utente cambia filtro/ricerca, non ricalcolarsi su se stesse.
  const countsByType = useMemo(() => {
    const counts: Record<MetaType, number> = { sentiero: 0, borgo_citta: 0, sito: 0 }
    for (const m of mete) counts[m.metaType]++
    return counts
  }, [mete])

  // Un ordinamento "hiking-only" (Km/D+/TS) nascosto dal filtro attivo torna a "Data" invece di
  // restare selezionato ma invisibile — mai un chip attivo che l'utente non vede più.
  const hikingSortAllowed = typeFilter === 'all' || typeFilter === 'sentiero'
  useEffect(() => {
    if (!hikingSortAllowed && sortBy !== 'date') setSortBy('date')
  }, [hikingSortAllowed, sortBy])

  // Metri dall'utente, quando nota — mai fabbricata: Infinity per una riga senza lat/lon nota o
  // senza userLocation, così finisce in fondo all'ordinamento per vicinanza invece di sparire o
  // di fingersi "a 0 km". useCallback (non una funzione semplice) perché il memo dell'elenco qui
  // sotto la usa nel proprio ordinamento e deve poterla dichiarare come dipendenza reale, non
  // ricrearla identica a ogni render con un `eslint-disable` a coprire la differenza.
  const distanceFromUserM = useCallback((row: AllPercorsiRow): number => {
    if (!userLocation || row.latitude == null || row.longitude == null) return Infinity
    return haversineM(userLocation.lat, userLocation.lon, row.latitude, row.longitude)
  }, [userLocation])

  const filtered = useMemo(() => {
    let out = mete
    if (typeFilter !== 'all') out = out.filter(r => r.metaType === typeFilter)
    if (favoritesOnly) out = out.filter(r => r.favorite)
    const q = query.trim().toLowerCase()
    if (q) out = out.filter(r => r.title.toLowerCase().includes(q))
    if (sortBy !== 'date') {
      out = [...out].sort((a, b) => {
        if (sortBy === 'km') return b.distanceMeters - a.distanceMeters
        if (sortBy === 'dplus') return b.elevationGain - a.elevationGain
        if (sortBy === 'distance') return distanceFromUserM(a) - distanceFromUserM(b)
        return (b.trailScore ?? 0) - (a.trailScore ?? 0)
      })
    }
    // "Data" arriva già in ordine created_at desc dall'API: invertire l'intero elenco (qui, non
    // dentro il sort sopra) copre anche quel caso senza bisogno di un comparatore per data.
    if (sortDir === 'asc') out = [...out].reverse()
    return out
  }, [mete, typeFilter, favoritesOnly, query, sortBy, sortDir, distanceFromUserM])

  // Query non vuota ma nessuna Meta già salvata corrisponde: propone l'unico altro posto dove
  // cercare (piano — "un solo ingresso di ricerca", non due bottoni sovrapposti come prima).
  const trimmedQuery = query.trim()
  const showSearchElsewhere = trimmedQuery.length > 0 && filtered.length === 0 && mete.length > 0

  // Pin della carta (Fase 3): le stesse Mete già filtrate dall'elenco (tipologia/ricerca/
  // preferiti — "i chip filtrano insieme i pin e l'elenco", mockup approvato), solo quelle con una
  // posizione nota (vedi Fase 1: lat/lon sempre presenti per un sentiero con traccia, presenti per
  // borgo_citta/sito solo se la Meta li porta con sé).
  const mapPins: MeteMapPin[] = useMemo(() => filtered
    .filter((r): r is AllPercorsiRow & { latitude: number; longitude: number } => r.latitude != null && r.longitude != null)
    .map(r => ({
      id: r.id,
      metaType: r.metaType,
      title: r.title,
      latitude: r.latitude,
      longitude: r.longitude,
      href: `/guida/${encodeURIComponent(r.id)}/prima_di_partire`,
    })),
  [filtered])

  return (
    <div className={`relative min-h-screen md:pb-0 ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      {/* Intestazione su carta — non più il banner verde a piena larghezza (200px, un quarto
          dello schermo su mobile solo per titolo e conteggio): stesso trattamento tipografico
          del resto della pagina, "Mete" resta l'unico titolo scritto a mano di tutta la vista. */}
      <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8">
        <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 34, color: TACCUINO_INK.typed, ...TACCUINO_RULED_TEXT_STYLE }}>
          Mete
        </h1>
        {rows && (
          <p className="mt-0.5" style={{ fontFamily: FONT.lora, fontSize: 13, color: TACCUINO_INK.handMuted }}>
            {countsByType.sentiero} {countsByType.sentiero === 1 ? 'sentiero' : 'sentieri'} &middot; {countsByType.borgo_citta} {countsByType.borgo_citta === 1 ? 'borgo/città' : 'borghi/città'} &middot; {countsByType.sito} {countsByType.sito === 1 ? 'sito' : 'siti'}
          </p>
        )}
      </div>

      <main className="max-w-[720px] mx-auto px-5 sm:px-8 pt-4 pb-6 sm:pb-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare le mete: {error}
          </p>
        )}

        {rows === null && !error ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : mete.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              <Mountain className="w-10 h-10" style={{ color: TACCUINO_ACCENT[600] }} />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-2" style={{ color: TACCUINO_INK.typed, ...TACCUINO_RULED_TEXT_STYLE }}>Nessuna meta ancora</h2>
            <p className="text-sm max-w-sm px-4" style={{ color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }}>
              I percorsi che pianifichi compariranno qui, finché non li cammini — a quel punto diventano un Reportage nel Diario che scegli.
            </p>
            {/* Unico ingresso di ricerca non-sentiero anche a elenco vuoto — prima era un secondo
                bottone identico al campo di ricerca sopra, quando l'elenco aveva righe. */}
            <Link
              href="/percorsi/cerca"
              className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl text-[14px] font-semibold transition-colors"
              style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
            >
              <Search className="w-4 h-4" /> Cerca un Borgo, una Città o un Sito
            </Link>
          </div>
        ) : (
          <>
            {/* La carta delle Mete (piano di restyling, Fase 3) — chiusa di default a ogni
                ingresso in pagina: una striscia decorativa statica (nessun Leaflet montato) con la
                legenda dei conteggi per tipologia; si apre al tocco, e solo allora scarica e monta
                la mappa reale (import dinamico in cima al file, mai nel bundle iniziale). */}
            <div className="relative w-full rounded-xl overflow-hidden mb-3" style={{ border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              {mapOpen ? (
                <div className="relative">
                  {/* Mai due mappe montate insieme: a schermo intero l'unica istanza vive
                      nell'overlay qui sotto (stessi mapPins/userLocation) — questa card resta
                      solo come sfondo/anteprima dietro l'overlay, senza avviare un secondo
                      caricamento di Leaflet. */}
                  {mapFullscreen ? (
                    <div style={{ height: 260 }} />
                  ) : mapPins.length > 0 ? (
                    <MeteMap pins={mapPins} height="260px" userLocation={userLocation} />
                  ) : (
                    <div className="flex items-center justify-center py-10 text-sm" style={{ background: '#E7E3D2', color: TACCUINO_INK.handMuted, fontFamily: FONT.lora }}>
                      Nessuna Meta con una posizione nota da mostrare qui.
                    </div>
                  )}
                  {/* A tutto schermo (punto 2 della richiesta dopo il primo giro di revisione) —
                      la carta inline resta comunque utilizzabile per un'occhiata rapida, questo
                      apre la stessa mappa (stessi pin, stesso userLocation) come overlay a piena
                      pagina, coi filtri di tipologia raggiungibili anche lì (vedi sotto). */}
                  <button
                    onClick={() => setMapFullscreen(true)}
                    title="Schermo intero"
                    aria-label="Apri la carta a schermo intero"
                    className="absolute left-2 top-2 flex items-center justify-center w-8 h-8 rounded-full shadow-sm"
                    style={{ background: 'rgba(245,237,221,.95)', color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  {geoDenied && (
                    <button
                      onClick={requestLocation}
                      className="absolute right-2 top-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold shadow-sm"
                      style={{ background: 'rgba(245,237,221,.95)', color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
                    >
                      <LocateFixed className="w-3 h-3" /> Vicino a me
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={handleToggleMap} className="block w-full text-left">
                  <MapStripPreview pins={mapPins} />
                </button>
              )}
              <button
                onClick={handleToggleMap}
                className="flex items-center gap-2 px-3 py-2 w-full text-left"
                style={{ background: 'linear-gradient(to top, rgba(245,237,221,.97), rgba(245,237,221,.8))', borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
                aria-expanded={mapOpen}
              >
                <MapPin className="w-3.5 h-3.5" style={{ color: TACCUINO_INK.handMuted }} />
                <span className="text-[11.5px] font-semibold" style={{ color: TACCUINO_INK.typed }}>
                  {mapOpen ? 'Chiudi la carta' : `${mapPins.length} ${mapPins.length === 1 ? 'meta' : 'mete'} sulla carta`}
                </span>
                {geoDenied && (
                  <span className="text-[10.5px]" style={{ color: TACCUINO_INK.handMuted, fontFamily: FONT.lora }}>
                    — posizione non disponibile
                  </span>
                )}
                {mapOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" style={{ color: TACCUINO_INK.handMuted }} /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: TACCUINO_INK.handMuted }} />}
              </button>
            </div>

            {/* Carta a schermo intero — `fixed`, quindi indipendente da dove vive nell'albero:
                stessi `mapPins`/`userLocation` della carta inline (stesso array filtrato, punto 3
                della richiesta — "i filtri devono ripercuotersi immediatamente nella mappa e
                devono essere selezionabili anche nella mappa espansa"), gli stessi chip di
                tipologia (TypeFilterChips, lo stesso componente della lista sotto, non una copia
                che potrebbe disallinearsi). */}
            {mapFullscreen && (
              <div className="fixed inset-0 z-50 flex flex-col" style={{ background: TACCUINO_PAPER.base }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                  <button
                    onClick={() => setMapFullscreen(false)}
                    aria-label="Riduci la carta"
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{ color: TACCUINO_INK.handMuted }}
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                  <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 19, color: TACCUINO_INK.typed }}>
                    La carta delle Mete
                  </span>
                  {geoDenied && (
                    <button
                      onClick={requestLocation}
                      className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold"
                      style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
                    >
                      <LocateFixed className="w-3 h-3" /> Vicino a me
                    </button>
                  )}
                  <button
                    onClick={() => { setMapFullscreen(false); setMapOpen(false) }}
                    aria-label="Chiudi la carta"
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${geoDenied ? '' : 'ml-auto'}`}
                    style={{ color: TACCUINO_INK.handMuted }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <TypeFilterChips
                  typeFilter={typeFilter}
                  onChange={setTypeFilter}
                  counts={countsByType}
                  total={mete.length}
                  className="px-4 py-2"
                />
                <div className="flex-1 relative">
                  {mapPins.length > 0 ? (
                    <MeteMap pins={mapPins} height="100%" userLocation={userLocation} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm px-6 text-center" style={{ color: TACCUINO_INK.handMuted, fontFamily: FONT.lora }}>
                      Nessuna Meta con una posizione nota per questo filtro.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ingresso all'hub di ricerca (docs/piano-ricerca-mete.md, Fase 3) — sostituisce il
                bottone a icona che stava accanto al campo qui sotto: quel bottone era l'unico
                modo di raggiungere una Meta nuova (Sentiero/Borgo/Città/Sito), ora assorbito da
                questa card per non tornare a due ingressi sovrapposti. Il campo sotto resta
                dov'era e filtra solo le Mete già salvate. */}
            <Link
              href="/percorsi/cerca"
              className="relative flex items-center gap-3 mb-3 px-3.5 py-3 rounded-xl"
              style={{ background: TACCUINO_ACCENT_TINT, border: `1.5px solid ${TACCUINO_ACCENT[600]}80` }}
            >
              <span className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: TACCUINO_ACCENT[600] }}>
                <Search className="w-4.5 h-4.5" style={{ color: TACCUINO_PAPER.light }} />
              </span>
              <div className="flex-1 min-w-0">
                <p style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 19, color: TACCUINO_INK.typed, lineHeight: 1.1 }}>Cerca una Meta</p>
                <p className="text-[11px] mt-0.5" style={{ color: TACCUINO_INK.hand, fontFamily: FONT.lora }}>
                  Sentieri, Borghi, Città e Siti — tutti i modi in un posto solo
                </p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: TACCUINO_ACCENT[600] }} />
            </Link>

            <div className="mb-3">
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="cerca fra le tue Mete…"
                  className="w-full pl-8 pr-8 py-2 rounded-[3px] text-[14px] outline-none placeholder:text-[#8a9bab]"
                  style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, fontFamily: FONT_HAND }}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: TACCUINO_INK.handMuted }}
                    aria-label="Cancella ricerca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <HandDrawnFrame stroke={TACCUINO_PAPER.cardBorder} strokeWidth={1.5} rx={4} />
              </div>

              {/* Chip di tipologia — il filtro primario (piano Fase 2), stesso componente riusato
                  identico nella carta a tutto schermo (punto 3 della richiesta dopo il primo giro
                  di revisione): un solo filtro condiviso, mai due stati indipendenti che possono
                  disallinearsi. */}
              <TypeFilterChips
                typeFilter={typeFilter}
                onChange={setTypeFilter}
                counts={countsByType}
                total={mete.length}
                className="mb-2"
              />

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setFavoritesOnly(f => !f)}
                  title="Solo preferiti"
                  className="relative shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors"
                  style={favoritesOnly ? { color: TACCUINO_ACCENT[600] } : { color: TACCUINO_INK.handMuted }}
                >
                  {favoritesOnly && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                  <Star className="w-3 h-3" fill={favoritesOnly ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                  title={sortDir === 'desc' ? 'Ordine decrescente — tocca per invertire' : 'Ordine crescente — tocca per invertire'}
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors"
                  style={{ background: 'transparent', color: TACCUINO_INK.handMuted }}
                >
                  {sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                </button>
                {METE_SORT_OPTIONS.filter(s => !s.hikingOnly || hikingSortAllowed).map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSortBy(s.id)}
                    className="relative shrink-0 px-3 py-1 rounded-full text-[13px] transition-colors"
                    style={sortBy === s.id
                      ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
                      : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
                  >
                    {sortBy === s.id && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p style={{ color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }} className="text-sm">
                  Nessuna meta corrisponde ai filtri.
                </p>
                {/* Unico ingresso di ricerca: se il testo non trova nulla fra le Mete già salvate,
                    l'unica alternativa è cercare fra Borghi/Città/Siti — non un secondo campo di
                    ricerca sempre visibile sopra come prima, solo quando serve davvero. */}
                {showSearchElsewhere && (
                  <Link
                    href={`/percorsi/cerca?q=${encodeURIComponent(trimmedQuery)}`}
                    className="inline-flex items-center gap-1.5 mt-3 text-[13.5px] font-semibold"
                    style={{ fontFamily: FONT_HAND, color: TACCUINO_ACCENT[600] }}
                  >
                    Cerca &laquo;{trimmedQuery}&raquo; fra Borghi, Città e Siti <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {filtered.map(p => {
                  const scoreLabel = p.trailScore != null ? ctsLabel(p.trailScore).label : null
                  return (
                    <Link
                      key={p.id}
                      href={`/guida/${encodeURIComponent(p.id)}/prima_di_partire`}
                      // items-start (non più items-center): un titolo lungo ora va a capo libero
                      // su più righe (vedi sotto) e non deve ricentrare l'intera riga sulla sua
                      // altezza — la miniatura resta ancorata in alto, come nel Sommario del
                      // Diario (app/diari/[id]/page.tsx, stessa scelta e stessa ragione).
                      className="flex items-start gap-3.5 py-5 px-2 -mx-2"
                      style={{ borderBottom: TACCUINO_LIST_DIVIDER }}
                    >
                      {/* Colonna miniatura: il riquadro nastro-e-strappo, con il badge Trail Score
                          incollato sotto invece che in una sua colonna a destra — libera larghezza
                          per il titolo, che a sua volta deve restare sempre leggibile per intero
                          (richiesta esplicita dell'utente, stesso principio già in vigore su
                          app/diari/[id]/page.tsx: "il titolo deve leggersi sempre per intero, non
                          tagliato con '...'"). */}
                      <div className="flex flex-col items-center shrink-0" style={{ width: MAP_THUMB_SIZE }}>
                        <div style={{ width: MAP_THUMB_SIZE, height: MAP_THUMB_SIZE }}>
                          {/* Nastro washi + bordo strappato (Taccuino Botanico) al posto del vecchio
                              bordo bianco spesso + ombra "da card" — calibrato in un mockup dedicato
                              prima di questo porting, stessa tecnica di
                              app/resoconto/[id]/PhotoGallery.tsx sul riquadro 87x87 nativo, qui
                              ingrandito via scale() (vedi MAP_THUMB_SCALE) senza toccare quella
                              calibrazione. cutoutRotation(p.id) resta l'inclinazione dell'intero
                              riquadro; tornVariant(p.id) sceglie indipendentemente taglio e
                              posizione del nastro. */}
                          <div style={{ width: MAP_THUMB_BASE, height: MAP_THUMB_BASE, transform: `scale(${MAP_THUMB_SCALE})`, transformOrigin: 'top left' }}>
                            <TornFrame size="map" variant={tornVariant(p.id)} rotate={cutoutRotation(p.id)}>
                              {p.routePolyline && p.routePolyline.length > 1
                                ? (
                                  <GalleryMapThumb
                                    polyline={p.routePolyline}
                                    lineColor={TACCUINO_INK.typed}
                                    lineWeight={2}
                                    dashArray="3 2.5"
                                    showEndpoints
                                    dimTiles={false}
                                  />
                                )
                                : p.imageUrl
                                  ? (
                                    // Immagine reale del catalogo (dtrek_places.image_url, piano §11)
                                    // quando c'è — oggi 0 righe su 425 la valorizzano (vedi docs/
                                    // mockup-mete-redesign/README.md §2), ma il ramo non deve restare
                                    // morto quando l'arricchimento Wikidata/Commons (Fase 4 del piano
                                    // di restyling) la popolerà.
                                    // eslint-disable-next-line @next/next/no-img-element -- riquadro 87x87 di TornFrame, non un'immagine editoriale
                                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                                  )
                                  : (
                                    // Fondo carta esplicito (mai lasciato trasparente): senza, il
                                    // nero di .torn-filler nei layer sotto (torn-ao/torn-rim/torn-
                                    // cast, opachi per progetto — vedi app/globals.css) traspare
                                    // attraverso quest'icona centrata, che da sola non copre l'intero
                                    // riquadro. Icona per tipologia — mai la stessa Mountain per un
                                    // borgo o un sito.
                                    // Fondo carta OPACO (mai un colore con alpha): i tre layer
                                    // sotto (torn-ao/torn-rim/torn-cast) restano riempiti di nero
                                    // per progetto — un fondo semi-trasparente qui lascerebbe
                                    // trasparire quel nero esattamente come il bug originale delle
                                    // miniature (vedi il commit che l'ha corretto).
                                    <div className="w-full h-full flex items-center justify-center" style={{ background: TACCUINO_PAPER.card }}>
                                      {metaTypeFallbackIcon(p.metaType)}
                                    </div>
                                  )}
                            </TornFrame>
                          </div>
                        </div>
                        {p.trailScore != null && (
                          // mt-2.5, non mt-1: l'ombra "sollevata" del riquadro (torn-cast-map)
                          // sfioccia visibilmente sotto il suo bordo inferiore — senza questo
                          // margine il badge la tagliava a metà.
                          <div className="mt-2.5">
                            {/* safety (non più null): l'anello esterno del badge prende colore
                                dalla Sicurezza Oggettiva cachata (planned_hikes.cached_safety_score,
                                vedi toSafetyPreview in app/api/percorsi/route.ts) — null solo se
                                quella Meta non ha ancora una Sicurezza calcolata, mai un colore
                                fabbricato. */}
                            <TrailScoreGaugeBadge total={p.trailScore} safety={p.safety} size={34} showLabel={false} dark={false} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        {/* Mai `truncate`/`line-clamp`: va a capo libero su quante righe servono,
                            stessa regola già in vigore sul Sommario del Diario. */}
                        <p style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 19.5, color: TACCUINO_INK.typed, ...TACCUINO_RULED_TEXT_STYLE }}>
                          {p.title}
                        </p>
                        {scoreLabel && (
                          <p className="truncate" style={{ fontFamily: FONT_HAND, fontSize: 15.5, fontWeight: 600, color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }}>
                            {scoreLabel}
                          </p>
                        )}
                        {/* Corpo minimo 13px, non più 11: sotto quella soglia il testo "glanceable"
                            (etichette/didascalie, non paragrafo) smette di essere confortevole su
                            schermo mobile — indicazione comune a Material Design (12sp è il limite
                            per le sole "overline") e Apple HIG (footnote 13pt come corpo minimo
                            leggibile, caption 11pt riservato a testo non primario). Icone allineate
                            a w-3.5/h-3.5 (14px) per restare in proporzione col nuovo corpo. */}
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5" style={{ fontFamily: FONT.lora, fontSize: 13, color: TACCUINO_INK.handMuted }}>
                          {/* Solo per un sentiero (piano §48.9) — una Meta borgo_citta/sito ha
                              sempre queste cifre a 0: mostrarle produrrebbe "0.0 km", non un dato
                              in meno. */}
                          {metaHasHikingMetrics(p.metaType) ? (
                            <>
                              <span className="inline-flex items-center gap-1"><Route className="w-3.5 h-3.5" /> {(p.distanceMeters / 1000).toFixed(1)} km</span>
                              <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> +{Math.round(p.elevationGain)} m</span>
                              <span className="inline-flex items-center gap-1"><Mountain className="w-3.5 h-3.5" /> {Math.round(p.altitudeMax)} m</span>
                              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDuration(p.estimatedTimeSeconds)}</span>
                            </>
                          ) : (
                            // Slot metriche adattivo per Borgo/Città/Sito (piano Fase 2) — prima
                            // questo spazio restava sempre vuoto per qualunque Meta non-sentiero.
                            // Comune/regione e (per un Sito) la categoria sono gli unici dati che
                            // planned_hikes porta sempre con sé oggi per queste due tipologie
                            // (lib/metaCard.ts's metaRowLocationStats — mai un valore fabbricato:
                            // una Meta senza comune/regione noti non mostra semplicemente nulla qui).
                            metaRowLocationStats(p).map(s => (
                              <span key={s.key} className="inline-flex items-center gap-1">
                                {s.key === 'category' ? <Tag className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                                {s.value}
                              </span>
                            ))
                          )}
                          {/* Distanza da te (Fase 3) — solo quando la posizione è nota (la carta è
                              stata aperta almeno una volta) e questa Meta ha una posizione propria;
                              mai un valore fabbricato altrimenti, il chip semplicemente non compare. */}
                          {userLocation && p.latitude != null && p.longitude != null && (
                            <span className="inline-flex items-center gap-1">
                              <LocateFixed className="w-3.5 h-3.5" />
                              {formatDistanceKm(distanceFromUserM(p))}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
