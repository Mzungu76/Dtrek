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
import { metaHasHikingMetrics, type MetaType } from '@/lib/metaTypes'
import { ArrowDown, ArrowUp, Building2, Clock, Landmark, Loader2, Mountain, Route, Search, Star, TrendingUp, X } from 'lucide-react'

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
const METE_SORT_OPTIONS: { id: MeteSortKey; label: string }[] = [
  { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'cts', label: 'TS' },
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
  const [sortBy, setSortBy] = useState<MeteSortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const mete = useMemo(() => (rows ?? []).filter(r => r.reportageCount === 0), [rows])

  const filtered = useMemo(() => {
    let out = mete
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
  }, [mete, favoritesOnly, query, sortBy, sortDir])

  return (
    <div className={`relative min-h-screen md:pb-0 ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #4A5A3F, #2E3A26)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(46,58,38,.15), rgba(46,58,38,.85))' }} />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          {/* Niente link "I miei Diari" qui — i Diari sono già l'icona centrale della barra di
              navigazione inferiore (components/Navbar.tsx), un secondo ingresso allo stesso posto
              sarebbe ridondante (richiesta esplicita dell'utente dopo il mockup). */}
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            Mete
          </h1>
          {rows && (
            <p className="text-white/75 text-[13px] mt-1">
              {mete.length} {mete.length === 1 ? 'meta' : 'mete'} da camminare
            </p>
          )}
        </div>
      </div>

      <main className="max-w-[720px] mx-auto px-5 sm:px-8 py-6 sm:py-8">
        {/* Borgo/Città/Sito (piano §17/§25) — l'unico punto d'ingresso, oltre a "+ Nuovo" (che
            resta /upload?tab=gpx, un sentiero), per aggiungere una Meta non escursionistica. */}
        <Link
          href="/percorsi/cerca"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[14px] font-semibold mb-5 transition-colors"
          style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
        >
          <Search className="w-4 h-4" /> Cerca un Borgo, una Città o un Sito
        </Link>

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
          </div>
        ) : (
          <>
            <div className="mb-3">
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="cerca per titolo…"
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
                {METE_SORT_OPTIONS.map(s => (
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
              <p className="text-sm text-center py-12" style={{ color: TACCUINO_INK.handMuted, ...TACCUINO_RULED_TEXT_STYLE }}>Nessuna meta corrisponde ai filtri.</p>
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
                                : (
                                  // Fondo carta esplicito (mai lasciato trasparente): senza, il nero
                                  // di .torn-filler nei layer sotto (torn-ao/torn-rim/torn-cast,
                                  // opachi per progetto — vedi app/globals.css) traspare attraverso
                                  // quest'icona centrata, che da sola non copre l'intero riquadro.
                                  // Icona per tipologia — mai la stessa Mountain per un borgo o un
                                  // sito.
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
                          {metaHasHikingMetrics(p.metaType) && (
                            <>
                              <span className="inline-flex items-center gap-1"><Route className="w-3.5 h-3.5" /> {(p.distanceMeters / 1000).toFixed(1)} km</span>
                              <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> +{Math.round(p.elevationGain)} m</span>
                              <span className="inline-flex items-center gap-1"><Mountain className="w-3.5 h-3.5" /> {Math.round(p.altitudeMax)} m</span>
                              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDuration(p.estimatedTimeSeconds)}</span>
                            </>
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
