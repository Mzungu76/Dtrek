'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { GalleryMapThumb } from '@/components/routehub/BottomGallery'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_LIST_DIVIDER, TACCUINO_RULED_TEXT_STYLE, FONT_HAND, HandDrawnFrame, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { TornFrame, tornVariant } from '@/components/TornFrame'
import { FONT } from '@/lib/designTokens'
import { META_TYPE_CONFIG, META_TYPES, metaHasHikingMetrics, type MetaType } from '@/lib/metaTypes'
import { metaRowLocationStats } from '@/lib/metaCard'
import { ArrowDown, ArrowRight, ArrowUp, Building2, Clock, Landmark, Loader2, MapPin, Mountain, Route, Search, Star, Tag, TrendingUp, X } from 'lucide-react'

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
type MeteSortKey = 'date' | 'km' | 'dplus' | 'cts'
type MeteTypeFilter = 'all' | MetaType

// "Km"/"D+"/"TS" hanno senso solo quando l'elenco può contenere un sentiero (piano §48.9 — una
// Meta borgo_citta/sito ha queste cifre sempre a 0, ordinarci non direbbe nulla): visibili con
// 'all' o 'sentiero', nascosti con 'borgo_citta'/'sito'. "Data" resta sempre disponibile, unico
// ordinamento che vale per ogni tipologia.
const METE_SORT_OPTIONS: { id: MeteSortKey; label: string; hikingOnly?: boolean }[] = [
  { id: 'date', label: 'Data' },
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

/** Icona di fallback quando la miniatura non ha una traccia da disegnare — una per tipologia
 *  (mai la stessa Mountain per un borgo o un sito, la Fase 2 del piano la sostituirà con un
 *  emblema disegnato; questo resta un tappabuchi minimo ma già type-aware). */
function metaTypeFallbackIcon(metaType: MetaType | undefined) {
  const color = TACCUINO_PAPER.cardBorder
  switch (metaType) {
    case 'borgo_citta': return <Building2 className="w-5 h-5" style={{ color }} />
    case 'sito':        return <Landmark className="w-5 h-5" style={{ color }} />
    default:             return <Mountain className="w-5 h-5" style={{ color }} />
  }
}

export default function MetePage() {
  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [typeFilter, setTypeFilter] = useState<MeteTypeFilter>('all')
  const [sortBy, setSortBy] = useState<MeteSortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
        return (b.trailScore ?? 0) - (a.trailScore ?? 0)
      })
    }
    // "Data" arriva già in ordine created_at desc dall'API: invertire l'intero elenco (qui, non
    // dentro il sort sopra) copre anche quel caso senza bisogno di un comparatore per data.
    if (sortDir === 'asc') out = [...out].reverse()
    return out
  }, [mete, typeFilter, favoritesOnly, query, sortBy, sortDir])

  // Query non vuota ma nessuna Meta già salvata corrisponde: propone l'unico altro posto dove
  // cercare (piano — "un solo ingresso di ricerca", non due bottoni sovrapposti come prima).
  const trimmedQuery = query.trim()
  const showSearchElsewhere = trimmedQuery.length > 0 && filtered.length === 0 && mete.length > 0

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
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1 min-w-0">
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
                {/* Unico altro ingresso di ricerca, non più un secondo campo identico al primo
                    (piano — "due ricerche sovrapposte"): un bottone compatto, sempre raggiungibile
                    anche quando l'elenco locale non è vuoto — resta l'unico modo di aggiungere un
                    Borgo/Città/Sito, non solo il ripiego di una ricerca senza risultati. */}
                <Link
                  href="/percorsi/cerca"
                  title="Cerca un Borgo, una Città o un Sito"
                  aria-label="Cerca un Borgo, una Città o un Sito"
                  className="relative shrink-0 flex items-center justify-center w-9 h-9 rounded-[3px]"
                  style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.handMuted }}
                >
                  <Building2 className="w-4 h-4" />
                  <HandDrawnFrame stroke={TACCUINO_PAPER.cardBorder} strokeWidth={1.5} rx={4} />
                </Link>
              </div>

              {/* Chip di tipologia — il filtro primario (piano Fase 2): "Tutte" più una per
                  metaType, ciascuna col proprio conteggio reale. Un ordinamento hiking-only attivo
                  torna a "Data" quando il filtro esclude i sentieri (vedi l'effect sopra). */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 mb-2">
                <button
                  onClick={() => setTypeFilter('all')}
                  className="relative shrink-0 px-3 py-1 rounded-full text-[13px] transition-colors"
                  style={typeFilter === 'all'
                    ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
                    : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
                >
                  {typeFilter === 'all' && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                  Tutte <span className="opacity-70">{mete.length}</span>
                </button>
                {META_TYPES.map(t => {
                  const Icon = META_TYPE_CONFIG[t].icon
                  const on = typeFilter === t
                  return (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className="relative shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] transition-colors"
                      style={on
                        ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
                        : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
                    >
                      {on && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                      <Icon className="w-3 h-3" /> {META_TYPE_CONFIG[t].pluralLabel} <span className="opacity-70">{countsByType[t]}</span>
                    </button>
                  )
                })}
              </div>

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
