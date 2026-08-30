'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { GalleryMapThumb } from '@/components/routehub/BottomGallery'
import BookPage from '@/components/libro/BookPage'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import type { DiarioDetail } from '@/app/api/diaries/[id]/route'
import { updateUserSettings } from '@/lib/sync/userSettingsStore'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, FONT_HAND, TaccuinoPaperTexture, HandDrawnFrame } from '@/lib/taccuinoTokens'
import {
  ArrowDown, ArrowLeft, ArrowUp, BookOpen, ChevronRight, Clock, Loader2, Mountain,
  Plus, Route, Search, Share2, Star, Trash2, TrendingUp, X,
} from 'lucide-react'

/**
 * Eliminazione del Diario — Fase 6 di docs/diario-fulcro-piano.md, aggiornata per la
 * ristrutturazione Diario/Mete: un Diario contiene solo Reportage, quindi la scelta ora riguarda
 * loro (non più le Mete, che restano invariate — un Diario non "possiede" una Meta finché non
 * viene camminata). Mai un default silenzioso: l'utente sceglie esplicitamente se spostare i
 * Reportage nel Diario di default o eliminare tutto (foto, video, racconti inclusi). Il Diario di
 * default non espone mai questa sezione (vedi il chiamante). Stesso pattern di conferma inline già
 * usato altrove nell'app (es. "Elimina guida" in app/guida/GuidaHub.tsx) — qui con due scelte
 * esplicite invece di una sola conferma, perché non ce n'è una "di default".
 */
function DeleteDiarioSection({ diaryId }: { diaryId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'migrate' | 'deleteAll' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'migrate' | 'deleteAll') {
    setBusy(action); setError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}?action=${action}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Eliminazione non riuscita (${res.status})`)
      }
      router.push('/diari')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  return (
    <div className="mt-10 pt-6 border-t border-stone-200">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
        >
          <Trash2 className="w-4 h-4" /> Elimina questo Diario
        </button>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 max-w-lg space-y-3">
          <p className="text-sm text-red-800 font-medium">Cosa succede ai Reportage di questo Diario?</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => run('migrate')}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:border-red-300 rounded-xl text-sm font-medium text-stone-700 transition-colors disabled:opacity-60"
            >
              {busy === 'migrate' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Sposta i Reportage nel Diario di default, poi elimina questo Diario
            </button>
            <button
              onClick={() => run('deleteAll')}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
            >
              {busy === 'deleteAll' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Elimina tutto — Reportage inclusi (foto, video, racconti)
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={busy !== null}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type SommarioSortKey = 'date' | 'km' | 'dplus' | 'cts'
const SOMMARIO_SORT_OPTIONS: { id: SommarioSortKey; label: string }[] = [
  { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'cts', label: 'TS' },
]

/** Stato del Reportage — filtro richiesto in aggiunta a ricerca/preferiti/ordinamento (Fase 9),
 *  aggiornato per la ristrutturazione Diario/Mete: ogni riga del Sommario è già un Reportage (non
 *  più una Meta "in programma" o "con uscita"), quindi lo stato distingue se ha già un racconto
 *  scritto (hike_reports) oppure no. */
type SommarioStatusFilter = 'all' | 'raccontati' | 'senza_racconto'
const SOMMARIO_STATUS_OPTIONS: { id: SommarioStatusFilter; label: string }[] = [
  { id: 'all', label: 'Tutti' }, { id: 'raccontati', label: 'Raccontati' }, { id: 'senza_racconto', label: 'Senza racconto' },
]

/** Rotazione stabile per reportage (Fase 29, "ritaglio incollato") — derivata dall'id, non
 *  `Math.random()`: la stessa riga deve inclinarsi sempre allo stesso modo tra un render e
 *  l'altro (un valore casuale ricalcolato salterebbe a ogni aggiornamento della lista). Ampiezza
 *  ridotta in Fase 31 a ±0.7° (era ±2.5°) — "NON usare rotazioni troppo evidenti", una miniatura
 *  appoggiata sulla pagina, non uno scrapbook. */
function cutoutRotation(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(hash) % 14) / 10) - 0.7
}

function DiarioIndexLibro({ diaryId }: { diaryId: string }) {
  const [detail, setDetail] = useState<DiarioDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<SommarioStatusFilter>('all')
  const [sortBy, setSortBy] = useState<SommarioSortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch(`/api/diaries/${encodeURIComponent(diaryId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDetail)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [diaryId])

  // Ultimo Diario aperto, Fase 11 — app/page.tsx (home) lo legge per decidere dove aprire l'app.
  // Scritto solo dopo un caricamento riuscito (non dall'URL grezzo): un id non valido o non più
  // accessibile non deve mai diventare il prossimo punto di apertura.
  useEffect(() => {
    if (detail) updateUserSettings({ lastDiaryId: diaryId })
  }, [detail, diaryId])

  // Stessi filtri/ricerca/ordinamento di components/routehub/ExpandedGalleryList.tsx ("Tutti i
  // percorsi") — qui senza "Distanza" (richiede l'indirizzo di partenza + una chiamata Google
  // Maps per percorso, non praticabile per un intero elenco insieme, vedi Fase 7) e senza la
  // sotto-sezione "Prossima uscita" dei preferiti (specifica del carosello che si swipa, non del
  // Sommario). "Data" è l'ordine con cui l'API restituisce già i reportage (start_time desc), non
  // serve un secondo ordinamento per quello.
  const visibleReportage = useMemo(() => {
    let rows = detail?.reportage ?? []
    if (favoritesOnly) rows = rows.filter(r => r.favorite)
    if (statusFilter === 'raccontati') rows = rows.filter(r => r.hasWrittenReport)
    else if (statusFilter === 'senza_racconto') rows = rows.filter(r => !r.hasWrittenReport)
    const q = searchQuery.trim().toLowerCase()
    if (q) rows = rows.filter(r => r.title.toLowerCase().includes(q))
    if (sortBy !== 'date') {
      rows = [...rows].sort((a, b) => {
        if (sortBy === 'km') return b.distanceMeters - a.distanceMeters
        if (sortBy === 'dplus') return b.elevationGain - a.elevationGain
        return (b.trailScore ?? 0) - (a.trailScore ?? 0)
      })
    }
    // "Data" arriva già in ordine start_time desc dall'API: invertire l'intero elenco (qui, non
    // dentro il sort sopra) copre anche quel caso senza bisogno di un comparatore per data.
    if (sortDir === 'asc') rows = [...rows].reverse()
    return rows
  }, [detail, favoritesOnly, statusFilter, searchQuery, sortBy, sortDir])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm px-6 text-center" style={{ background: TACCUINO_PAPER.base, color: '#b3413a', fontFamily: FONT.body }}>
        <TaccuinoPaperTexture />
        Impossibile caricare questo Diario: {error}
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: TACCUINO_PAPER.base }}>
        <TaccuinoPaperTexture />
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: TACCUINO_INK.handMuted }} />
      </div>
    )
  }

  return (
    <>
      <BookPage
        // Il titolo in testata non è più cliccabile da nessuna pagina del libro (Fase 17): mostra
        // di nuovo il nome di QUESTO Diario (non più la label statica "I miei Diari") — "torna
        // allo scaffale" vive ora nel bottone "Diari" della barra inferiore (Fase 18: naviga
        // direttamente allo scaffale ridisegnato, niente più drawer laterale).
        diarioTitle={detail.title}
        indexHref="/diari"
        indexLabel="Diari"
        sectionLabel="Indice"
        theme="taccuino"
      >
        <div className="flex items-start gap-3 mb-3">
          {/* Riproduzione in piccolo dell'effettiva copertina del Diario (foto/gradiente + testi),
              stessa DiarioCoverThumb con `width` del drawer — non un'immagine a sé. Cornice "tassello
              incollato" (bordo + ombra sfalsata + rotazione) verificata nel mockup — prima era solo
              un angolo arrotondato con ombra generica, non assomigliava a nulla di "incollato". */}
          <div
            className="shrink-0"
            style={{ border: `1.5px solid ${TACCUINO_INK.mapContour}`, boxShadow: `2px 3px 0 ${TACCUINO_PAPER.cardBorder}`, transform: 'rotate(-2deg)' }}
          >
            <DiarioCoverThumb
              coverUrl={detail.coverUrl}
              width={52}
              title={detail.title}
              subtitle={detail.subtitle}
              author={detail.author}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, color: TACCUINO_INK.handMuted, margin: '0 0 3px' }}>
              Sommario
            </p>
            <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 27, color: TACCUINO_INK.typed, margin: 0, transform: 'rotate(-0.5deg)' }}>
              {detail.title}
            </h1>
            <p style={{ fontFamily: FONT_HAND, fontSize: 14, color: TACCUINO_INK.handMuted, margin: '3px 0 0' }}>
              {detail.subtitle ? `"${detail.subtitle}" — ` : ''}{detail.reportage.length} reportage
            </p>
          </div>
        </div>

        <Link
          href={`/upload?tab=activity&diaryId=${encodeURIComponent(diaryId)}`}
          className="relative flex items-center gap-2 mb-3 px-3.5 py-2.5 rounded"
          style={{
            color: TACCUINO_ACCENT[600], fontFamily: FONT_HAND, fontWeight: 700, fontSize: 15,
            transform: 'rotate(-0.3deg)',
          }}
        >
          <HandDrawnFrame stroke={TACCUINO_PAPER.contourLine} strokeWidth={2} rx={6} dashed />
          <Plus className="w-4 h-4" /> nuovo reportage
        </Link>

        {detail.reportage.length > 0 && (
          <div className="mb-3">
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="cerca per titolo…"
                className="w-full pl-8 pr-8 py-2 rounded-[3px] text-[14px] outline-none placeholder:text-[#8a9bab]"
                style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, fontFamily: FONT_HAND }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: TACCUINO_INK.handMuted }}
                  aria-label="Cancella ricerca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <HandDrawnFrame stroke={TACCUINO_PAPER.cardBorder} strokeWidth={1.5} rx={4} />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 mb-1.5">
              <button
                onClick={() => setFavoritesOnly(f => !f)}
                title="Solo preferiti"
                className="relative shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors"
                style={favoritesOnly
                  ? { color: TACCUINO_ACCENT[600] }
                  : { color: TACCUINO_INK.handMuted }}
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
              {SOMMARIO_SORT_OPTIONS.map(s => (
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
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {SOMMARIO_STATUS_OPTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStatusFilter(s.id)}
                  className="relative shrink-0 px-3 py-1 rounded-full text-[13px] transition-colors"
                  style={statusFilter === s.id
                    ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
                    : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
                >
                  {statusFilter === s.id && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                  {s.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {detail.reportage.length === 0 ? (
          <p style={{ fontFamily: FONT.body, fontSize: 13, color: TACCUINO_INK.handMuted }}>Nessun reportage ancora — comincia da qui.</p>
        ) : visibleReportage.length === 0 ? (
          <p style={{ fontFamily: FONT.body, fontSize: 13, color: TACCUINO_INK.handMuted }}>Nessun reportage corrisponde ai filtri.</p>
        ) : (
          <div className="flex flex-col">
            {visibleReportage.map(r => {
              // Ogni riga rimanda a /resoconto/[id] (ResocontoHub → ReportReader.tsx) — richiesta
              // esplicita dell'utente: generazione AI, editor testuale assistito e racconto
              // guidato a domande vivono lì, non in una pagina di riepilogo intermedia dentro il
              // Diario (eliminata). Da lì, se il Reportage ha già contenuto, un link porta alla
              // lettura "a libro" a pagine (.../reportage/[activityId]/sezione/1), invariata.
              const reportagePath = `/resoconto/${encodeURIComponent(r.id)}`
              const scoreLabel = r.trailScore != null ? ctsLabel(r.trailScore).label : null
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3.5 py-3.5 px-2 -mx-2"
                  style={{
                    // Fase 31 — separatore con opacità (non più il colore pieno di `cardBorder`):
                    // "linee tratteggiate stampate, colore molto tenue, opacità 0.4-0.6", non un
                    // bordo pieno come una card. `80` = ~50% alpha.
                    borderBottom: `1px dashed ${TACCUINO_PAPER.cardBorder}80`,
                    // "Passata di evidenziatore" per i reportage già raccontati — riconoscibili a
                    // colpo d'occhio senza dover leggere l'etichetta a destra. Colore ripreso dal
                    // mockup (`#e9d4ae66`), non il tinteggio arancio-accento di prima: doveva
                    // leggersi come evidenziatore su carta, non come uno stato "attivo".
                    background: r.hasWrittenReport ? `${TACCUINO_PAPER.highlight}66` : 'transparent',
                  }}
                >
                  {/* Stessa riga di components/routehub/ExpandedGalleryList.tsx (mappa reale,
                      pillole dati, anello Trail Score) — qui ricolorata per il taccuino invece
                      dello sfondo scuro di quella lista. Un solo Link per l'intera riga. Anello TS
                      e stato a destra hanno una larghezza fissa (non "shrink-to-content") così
                      restano allineati in verticale da una riga all'altra, indipendentemente da
                      quanto testo hanno le righe vicine. */}
                  <Link href={reportagePath} className="flex items-center gap-3.5 flex-1 min-w-0">
                    {/* Vera mappa (GalleryMapThumb) del tracciato registrato (activities.route_polyline),
                        non quello pianificato — "ritaglio incollato" (bordo bianco spesso + ombra
                        sfalsata + lieve rotazione stabile per reportage, stesso principio della
                        copertina in `DiarioCoverThumb`). */}
                    <div
                      className="w-[87px] h-[87px] shrink-0 overflow-hidden relative"
                      style={{
                        background: TACCUINO_PAPER.card,
                        border: `3px solid ${TACCUINO_PAPER.light}`,
                        boxShadow: `0 4px 10px rgba(41,35,30,0.15)`,
                        transform: `rotate(${cutoutRotation(r.id)}deg)`,
                      }}
                    >
                      {r.routePolyline && r.routePolyline.length > 1
                        ? (
                          <GalleryMapThumb
                            polyline={r.routePolyline}
                            lineColor={TACCUINO_INK.typed}
                            lineWeight={2}
                            dashArray="3 2.5"
                            showEndpoints
                            dimTiles={false}
                          />
                        )
                        : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-5 h-5" style={{ color: TACCUINO_PAPER.cardBorder }} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Fase 32 — non più `truncate` (richiesta esplicita: il titolo deve leggersi
                          sempre per intero, non tagliato con "..."): va a capo libero invece di
                          troncare su una riga sola. */}
                      <p style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 19.5, color: TACCUINO_INK.typed, lineHeight: 1.15 }}>{r.title}</p>
                      {scoreLabel && (
                        // Fase 31 — font a mano anche qui ("sottotitoli personali" nella specifica
                        // tipografica, non più il sans di default): resta comunque un gradino sotto
                        // il titolo (corpo più piccolo, stesso tono tenue di prima).
                        <p className="truncate" style={{ fontFamily: FONT_HAND, fontSize: 14, fontWeight: 600, color: TACCUINO_INK.handMuted, marginTop: 1 }}>
                          {scoreLabel}
                        </p>
                      )}
                      {/* Fase 30 — peso visivo ridotto rispetto al titolo: font più piccolo, stesso
                          grigio-marrone tenue delle icone invece del marrone più scuro di prima,
                          icone rimpicciolite — restano leggibili ma non competono col titolo per
                          attenzione. */}
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5" style={{ fontFamily: FONT.lora, fontSize: 11, color: TACCUINO_INK.handMuted }}>
                        <span className="inline-flex items-center gap-1"><Route className="w-3 h-3" /> {(r.distanceMeters / 1000).toFixed(1)} km</span>
                        <span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +{Math.round(r.elevationGain)} m</span>
                        <span className="inline-flex items-center gap-1"><Mountain className="w-3 h-3" /> {Math.round(r.altitudeMax)} m</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(r.totalTimeSeconds)}</span>
                        {r.userRating != null && (
                          <span className="inline-flex items-center gap-1"><Star className="w-3 h-3" fill="currentColor" /> {r.userRating}/10</span>
                        )}
                      </div>
                    </div>
                    <div className="relative shrink-0 w-11 h-11 flex items-center justify-center">
                      {/* Fase 31 — tolto l'anello a tremore aggiunto in Fase 28: la nuova specifica
                          dice esplicitamente il contrario ("il Trail Score è uno degli elementi più
                          moderni, non trasformarlo in vintage — il contrasto tra diario/mappa e
                          score/dati è voluto, crea il carattere di Dtrek"). Resta tecnico e pulito,
                          non toccato. */}
                      {r.trailScore != null && (
                        <TrailScoreGaugeBadge total={r.trailScore} safety={null} size={46} showLabel={false} dark={false} />
                      )}
                    </div>
                    <div
                      className="shrink-0 flex items-center justify-end gap-1"
                      style={{ width: 94, fontFamily: FONT_HAND, fontSize: 15, color: r.hasWrittenReport ? TACCUINO_ACCENT[600] : TACCUINO_INK.handMuted, fontWeight: r.hasWrittenReport ? 700 : 400 }}
                    >
                      {r.hasWrittenReport
                        ? <><BookOpen className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} /> raccontato</>
                        : 'senza racconto'}
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col mt-2 pt-1" style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
          <Link
            href={`/diari/${encodeURIComponent(diaryId)}/pubblica`}
            className="flex items-center justify-between gap-2 py-2.5"
            style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11.5, color: TACCUINO_INK.hand }}
          >
            <span className="inline-flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Pubblicazione</span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: TACCUINO_INK.handMuted }} />
          </Link>
        </div>
      </BookPage>
      {!detail.isDefault && (
        <div className="max-w-[640px] mx-auto px-5 sm:px-8" style={{ background: TACCUINO_PAPER.base }}>
          <DeleteDiarioSection diaryId={diaryId} />
        </div>
      )}
    </>
  )
}

export default function DiarioDetailPage() {
  const params = useParams<{ id: string }>()
  return <DiarioIndexLibro diaryId={params.id} />
}
