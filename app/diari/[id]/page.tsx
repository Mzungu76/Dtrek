'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import RouteThumb from '@/components/RouteThumb'
import { GalleryMapThumb } from '@/components/routehub/BottomGallery'
import SectionEyebrow from '@/components/bacheca/SectionEyebrow'
import RecoSuggestedRow from '@/components/bacheca/RecoSuggestedRow'
import BookPage from '@/components/libro/BookPage'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { formatDuration } from '@/lib/tcxParser'
import type { DiarioDetail } from '@/app/api/diaries/[id]/route'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, FONT_HAND, TaccuinoPaperTexture, HandDrawnFrame } from '@/lib/taccuinoTokens'
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, ChevronRight, Clock, Loader2, Lock, LockOpen, Mountain,
  Plus, Route, Search, Share2, Sparkles, Star, Trash2, TrendingUp, X,
} from 'lucide-react'

/**
 * Eliminazione del Diario — Fase 6 di docs/diario-fulcro-piano.md. Mai un default silenzioso:
 * l'utente sceglie esplicitamente se spostare i Percorsi nel Diario di default (che resta intatto
 * insieme ai loro Reportage) o eliminare tutto (Percorsi e Reportage — foto, video, racconti
 * inclusi). Il Diario di default non espone mai questa sezione (vedi il chiamante). Stesso pattern
 * di conferma inline già usato altrove nell'app (es. "Elimina guida" in app/guida/GuidaHub.tsx) —
 * qui con due scelte esplicite invece di una sola conferma, perché non ce n'è una "di default".
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
          <p className="text-sm text-red-800 font-medium">Cosa succede ai Percorsi di questo Diario?</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => run('migrate')}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-200 hover:border-red-300 rounded-xl text-sm font-medium text-stone-700 transition-colors disabled:opacity-60"
            >
              {busy === 'migrate' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Sposta i Percorsi nel Diario di default, poi elimina questo Diario
            </button>
            <button
              onClick={() => run('deleteAll')}
              disabled={busy !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
            >
              {busy === 'deleteAll' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Elimina tutto — Percorsi e Reportage inclusi (foto, video, racconti)
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

/**
 * "Percorsi per te" come intermezzo dentro un Diario — Fase 5 di docs/diario-fulcro-piano.md.
 * Stesso motore e stessa card di app/bacheca/page.tsx (generateRecommendations.ts via
 * /api/percorsi-per-te?peek=1, mai una generazione al volo qui): un Diario senza ancora molti
 * Percorsi propri riceve comunque un suggerimento concreto, invece di restare solo un elenco vuoto.
 */
function PercorsiPerTe() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty_no_location' | 'error' | 'pending'>('loading')
  const [cards, setCards] = useState<RecommendationCard[]>([])

  useEffect(() => {
    fetch('/api/percorsi-per-te?peek=1')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setStatus(data.status); setCards(data.cards ?? []) })
      .catch(() => setStatus('error'))
  }, [])

  if (status !== 'ok' || cards.length === 0) return null
  return (
    <div className="mb-6">
      <SectionEyebrow icon={Sparkles} color="#d97220" className="mb-2">Percorsi per te</SectionEyebrow>
      <RecoSuggestedRow cards={cards} />
    </div>
  )
}

/**
 * "Dentro un Diario" — Fase 1-2 di docs/diario-fulcro-piano.md (sola lettura) + Fase 3 (composer).
 * Elenco dei Percorsi di questo Diario, con stato (in programma / N Reportage) e idoneità alla
 * pubblicazione. Ogni riga rimanda a /diari/[id]/percorsi/[percorsoId] (Fase 2): la Guida
 * oggettiva (GuidaHub, invariata) più l'elenco dei Reportage collegati.
 *
 * Il composer a due corsie ("Già fatta" / "Da pianificare") non riscrive gli import esistenti —
 * porta dentro /upload (già ActivityUploader/GpxUploader/ManualImportChoice/FromActivityUploader,
 * invariati) con `diaryId` in query, così il Percorso creato entra in questo Diario invece che in
 * quello di default. Vedi app/upload/page.tsx.
 */
function Composer({ diaryId }: { diaryId: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <Link
        href={`/upload?tab=activity&diaryId=${encodeURIComponent(diaryId)}`}
        className="flex items-center gap-3 bg-white rounded-2xl px-4 py-4 border border-forest-200 hover:border-forest-400 hover:shadow-sm transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-stone-800">Già fatta</p>
          <p className="text-[12px] text-stone-500">Importa un&apos;escursione conclusa — GPS, orologio o traccia libera</p>
        </div>
      </Link>
      <Link
        href={`/upload?tab=gpx&diaryId=${encodeURIComponent(diaryId)}`}
        className="flex items-center gap-3 bg-white rounded-2xl px-4 py-4 border border-sky-200 hover:border-sky-400 hover:shadow-sm transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <Route className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-stone-800">Da pianificare</p>
          <p className="text-[12px] text-stone-500">Trova o costruisci un percorso, importa un file o un link</p>
        </div>
      </Link>
    </div>
  )
}

function DiarioDetailPageClassico() {
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<DiarioDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/diaries/${encodeURIComponent(params.id)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDetail)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [params.id])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href="/diari" className="inline-flex items-center gap-1.5 text-forest-300 text-[13px] font-semibold mb-1.5 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> I miei Diari
            </Link>
            <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
              {detail?.title ?? ' '}
            </h1>
            {detail && (
              <p className="text-forest-200 text-[13px] mt-1">
                {detail.percorsi.length} {detail.percorsi.length === 1 ? 'percorso' : 'percorsi'}
              </p>
            )}
          </div>
          {detail && (
            <Link
              href={`/diari/${encodeURIComponent(params.id)}/pubblica`}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[12px] font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Pubblica
            </Link>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare questo Diario: {error}
          </p>
        )}

        {detail === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : detail && detail.percorsi.length === 0 ? (
          <>
            <Composer diaryId={params.id} />
            <PercorsiPerTe />
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center mb-6">
                <Mountain className="w-10 h-10 text-forest-400" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-stone-700 mb-2">Nessun percorso ancora</h2>
              <p className="text-stone-400 text-sm max-w-sm px-4">
                I percorsi che pianifichi o le uscite che importi in questo Diario compariranno qui.
              </p>
            </div>
          </>
        ) : detail && (
          <>
          <Composer diaryId={params.id} />
          <PercorsiPerTe />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {detail.percorsi.map(p => (
              <Link
                key={p.id}
                href={`/diari/${encodeURIComponent(params.id)}/percorsi/${encodeURIComponent(p.id)}`}
                className="block bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-stone-200"
              >
                <div className="relative h-[140px] bg-gradient-to-b from-forest-50 to-stone-50">
                  {p.routePolyline && p.routePolyline.length > 1 ? (
                    <div className="absolute inset-3">
                      <RouteThumb polyline={p.routePolyline} color="#2d7a3d" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mountain className="w-10 h-10 text-forest-200" />
                    </div>
                  )}
                  <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm ${p.reportageCount > 0 ? 'bg-forest-600 text-white' : 'bg-white/92 text-stone-500'}`}>
                    {p.reportageCount === 0 ? 'In programma' : `${p.reportageCount} ${p.reportageCount === 1 ? 'uscita' : 'uscite'}`}
                  </span>
                </div>
                <div className="px-[18px] pt-4 pb-[18px]">
                  <p className="text-[16px] font-bold text-stone-800 mb-2 truncate">{p.title}</p>
                  <div className="flex items-center gap-3 text-[13px] text-stone-500 flex-wrap">
                    <span>{(p.distanceMeters / 1000).toFixed(1)} km</span>
                    <span>{Math.round(p.elevationGain)} m D+</span>
                    {p.pubblicabile ? (
                      <span className="inline-flex items-center gap-1 text-forest-700 font-medium">
                        <LockOpen className="w-3 h-3" /> Pubblicabile
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone-400">
                        <Lock className="w-3 h-3" /> Non pubblicabile
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          </>
        )}

        {detail && !detail.isDefault && <DeleteDiarioSection diaryId={params.id} />}
      </main>
    </div>
  )
}

/**
 * "Sommario" — indice del Diario come pagina del libro (docs/diario-a-libro-piano.md), stessa
 * identità visiva validata nel mockup "Diario a schermo intero" (funzione renderIndexPage,
 * classi .bk-index-*): occhiello "Sommario", titolo, elenco Percorsi con un'anteprima del
 * tracciato, pagina di destinazione con un tap.
 *
 * Fase 20 — seconda pagina reale in stile taccuino dopo lo scaffale (Fase 18): `<BookPage
 * theme="taccuino">` invece del default "pergamena" (il guscio, header/barra inferiore, non
 * cambia struttura — solo palette), e i toni pergamena locali a questo file sostituiti dai token
 * di `lib/taccuinoTokens.tsx`.
 *
 * Fase 21 — la Fase 20 si è fermata alla palette (a schermo sembrava "solo il font del titolo
 * cambiato", segnalato dall'utente col mockup alla mano): qui arriva il resto validato in
 * `taccuino-canvas/SommarioTaccuino.dc.html` (non nel repo) — texture di carta e piega a mano
 * (`BookPage.tsx`, tema "taccuino"), copertina come tassello incollato (bordo + ombra sfalsata +
 * rotazione), titolo/sottotitolo/pulsante/chip/righe sul font a mano (`FONT_HAND`, non solo il
 * titolo), spunta disegnata per i percorsi con un Reportage. Le rotazioni
 * (`transform: rotate(...)`) restano solo su titolo/pulsante/copertina — applicarle anche a ogni
 * riga dell'elenco avrebbe reso una lista densa illeggibile invece che "artigianale".
 *
 * Fase 21 aveva anche sostituito la miniatura di ogni riga con `RouteThumb` (traccia ricalcata a
 * mano, tratteggiata, con un filtro SVG `feDisplacementMap` condiviso) al posto della vera mappa
 * `GalleryMapThumb` — segnalato a schermo insieme a un difetto separato (titolo/statistiche di
 * ogni riga invisibili, pur presenti nel DOM): la causa più verosimile è un bug di compositing
 * GPU noto su Android/Chromium con filtri SVG dentro contenitori `overflow:hidden` adiacenti a
 * testo. **Fase 22** ripristina `GalleryMapThumb` (mappa OSM reale, invariata) — l'utente ha
 * anche chiesto esplicitamente di tenere la mappa vera invece di un disegno astratto — con un
 * `filter` CSS (non SVG) sul contenitore per scaldarne i toni verso la palette taccuino: stesso
 * meccanismo di ricolorazione, nessun filtro SVG sospetto vicino al testo della riga.
 *
 * Adattamento deliberato: qui e nella pagina di riepilogo del Percorso non c'è un "Apri in
 * modalità classica" a cui rimandare come per Guida/Reportage (/guida/[id], /resoconto/[id]
 * esistono come route a sé; questo indice invece condivide la STESSA URL della versione classica,
 * scelta solo dal flag) — funzioni più pesanti (il composer a due corsie, "Percorsi per te")
 * restano quindi raggiungibili solo spegnendo il flag. L'eliminazione del Diario (distruttiva,
 * rara) resta invece raggiungibile anche qui, sotto la pagina, non rimandata a un'altra modalità
 * che qui non esiste.
 */
type SommarioSortKey = 'date' | 'km' | 'dplus' | 'cts'
const SOMMARIO_SORT_OPTIONS: { id: SommarioSortKey; label: string }[] = [
  { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'cts', label: 'TS' },
]

/** Stato del Percorso — filtro richiesto in aggiunta a ricerca/preferiti/ordinamento (Fase 9). */
type SommarioStatusFilter = 'all' | 'programmate' | 'con_uscita'
const SOMMARIO_STATUS_OPTIONS: { id: SommarioStatusFilter; label: string }[] = [
  { id: 'all', label: 'Tutti' }, { id: 'programmate', label: 'In programma' }, { id: 'con_uscita', label: 'Con uscita' },
]

/** Rotazione stabile per percorso (Fase 29, "ritaglio incollato") — derivata dall'id, non
 *  `Math.random()`: la stessa riga deve inclinarsi sempre allo stesso modo tra un render e
 *  l'altro (un valore casuale ricalcolato salterebbe a ogni aggiornamento della lista). */
function cutoutRotation(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(hash) % 50) / 10) - 2.5
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
  // Sommario). "Data" è l'ordine con cui l'API restituisce già i percorsi (created_at desc), non
  // serve un secondo ordinamento per quello.
  const visiblePercorsi = useMemo(() => {
    let rows = detail?.percorsi ?? []
    if (favoritesOnly) rows = rows.filter(p => p.favorite)
    if (statusFilter === 'programmate') rows = rows.filter(p => p.reportageCount === 0)
    else if (statusFilter === 'con_uscita') rows = rows.filter(p => p.reportageCount > 0)
    const q = searchQuery.trim().toLowerCase()
    if (q) rows = rows.filter(p => p.title.toLowerCase().includes(q))
    if (sortBy !== 'date') {
      rows = [...rows].sort((a, b) => {
        if (sortBy === 'km') return b.distanceMeters - a.distanceMeters
        if (sortBy === 'dplus') return b.elevationGain - a.elevationGain
        return (b.trailScore ?? 0) - (a.trailScore ?? 0)
      })
    }
    // "Data" arriva già in ordine created_at desc dall'API: invertire l'intero elenco (qui, non
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
              {detail.subtitle ? `"${detail.subtitle}" — ` : ''}{detail.percorsi.length} {detail.percorsi.length === 1 ? 'percorso' : 'percorsi'}
            </p>
          </div>
        </div>

        <Link
          href={`/upload?diaryId=${encodeURIComponent(diaryId)}`}
          className="relative flex items-center gap-2 mb-3 px-3.5 py-2.5 rounded"
          style={{
            color: TACCUINO_ACCENT[600], fontFamily: FONT_HAND, fontWeight: 700, fontSize: 15,
            transform: 'rotate(-0.3deg)',
          }}
        >
          <HandDrawnFrame stroke={TACCUINO_PAPER.contourLine} strokeWidth={2} rx={6} dashed />
          <Plus className="w-4 h-4" /> nuovo percorso
        </Link>

        {detail.percorsi.length > 0 && (
          <div className="mb-3">
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="cerca per titolo…"
                className="w-full pl-8 pr-8 py-2 rounded-[3px] text-[14px] outline-none"
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
                  ? { background: TACCUINO_PAPER.card, color: TACCUINO_ACCENT[600] }
                  : { background: 'transparent', color: TACCUINO_INK.handMuted }}
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
                    ? { fontFamily: FONT_HAND, fontWeight: 700, background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed }
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
                    ? { fontFamily: FONT_HAND, fontWeight: 700, background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed }
                    : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted }}
                >
                  {statusFilter === s.id && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
                  {s.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {detail.percorsi.length === 0 ? (
          <p style={{ fontFamily: FONT.body, fontSize: 13, color: TACCUINO_INK.handMuted }}>Nessun percorso ancora — comincia da qui.</p>
        ) : visiblePercorsi.length === 0 ? (
          <p style={{ fontFamily: FONT.body, fontSize: 13, color: TACCUINO_INK.handMuted }}>Nessun percorso corrisponde ai filtri.</p>
        ) : (
          <div className="flex flex-col">
            {visiblePercorsi.map(p => {
              const percorsoPath = `/diari/${encodeURIComponent(diaryId)}/percorsi/${encodeURIComponent(p.id)}`
              const scoreLabel = p.trailScore != null ? ctsLabel(p.trailScore).label : null
              const haOgniUscita = p.reportageCount > 0
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3.5 py-3.5 px-2 -mx-2"
                  style={{
                    borderBottom: `1px dashed ${TACCUINO_PAPER.cardBorder}`,
                    // "Passata di evidenziatore" per i percorsi con almeno un'uscita —
                    // riconoscibili a colpo d'occhio senza dover leggere l'etichetta a destra.
                    // Colore ripreso dal mockup (`#e9d4ae66`), non il tinteggio arancio-accento di
                    // prima: doveva leggersi come evidenziatore su carta, non come uno stato "attivo".
                    background: haOgniUscita ? `${TACCUINO_PAPER.highlight}66` : 'transparent',
                  }}
                >
                  {/* Stessa riga di components/routehub/ExpandedGalleryList.tsx (mappa reale,
                      etichetta idoneità/sicurezza, pillole dati, anello Trail Score) — qui
                      ricolorata per il taccuino invece dello sfondo scuro di quella lista.
                      Un solo Link per l'intera riga (prima ce n'erano due, scomodo): va sempre
                      alla Guida, l'indicazione dei Reportage è solo informativa, non un secondo
                      collegamento — la pagina dell'elenco Reportage a sé non esiste più (Fase 15),
                      quell'elenco vive ora dentro la Guida stessa. Anello TS e stato a destra
                      hanno una larghezza fissa (non "shrink-to-content") così restano allineati in
                      verticale da una riga all'altra, indipendentemente da quanto testo hanno le
                      righe vicine. */}
                  <Link href={`${percorsoPath}/guida/il_percorso`} className="flex items-center gap-3.5 flex-1 min-w-0">
                    {/* Vera mappa (GalleryMapThumb, invariata nel componente — stessa usata dalla
                        galleria Guida/Resoconto), non un disegno astratto — ma non più lo stile
                        "app di navigazione" di CartoDB: Fase 29 aveva tolto il `filter` CSS
                        (seppia poi verde, mai i "colori originali" voluti) restituendo però una
                        mappa ancora "troppo digitale" (verde acceso, POI commerciali, testi da
                        app). Fase 30 — cambiato il *tile provider* invece di ripiegare su un altro
                        filtro: `tileStyle="topo"` (OpenTopoMap, curve di livello e cartografia
                        escursionistica reale, vedi `app/api/tile/route.ts`) è cartografia pensata
                        per il trekking, non una mappa stradale ricolorata via CSS. Il "ritaglio
                        incollato" (bordo bianco spesso + ombra sfalsata + lieve rotazione stabile
                        per percorso, stesso principio della copertina in `DiarioCoverThumb`)
                        sostituisce `HandDrawnFrame` qui — coerente con "una foto incollata sulla
                        pagina". Il tracciato (`lineColor`/`dashArray` di Leaflet, nativi — non un
                        filtro SVG dentro Leaflet, la stessa combinazione già scartata in Fase 21)
                        resta china nera tratteggiata (validata a schermo: "funziona sorprendente-
                        mente bene"), `showEndpoints` aggiunge partenza/arrivo, rimpiccioliti in
                        Fase 30 (sembravano "marker di Leaflet"): la precisione del percorso resta
                        intatta, sono gli stessi punti GPS, solo lo stile del tratto cambia.
                        `dimTiles={false}` toglie il velo scuro pensato per la galleria a sfondo
                        nero (qui contro i "colori originali" richiesti). */}
                    <div
                      className="w-[87px] h-[87px] shrink-0 overflow-hidden relative"
                      style={{
                        background: TACCUINO_PAPER.card,
                        border: '3px solid #fbf8f1',
                        boxShadow: `2px 3px 4px rgba(0,0,0,0.22)`,
                        transform: `rotate(${cutoutRotation(p.id)}deg)`,
                      }}
                    >
                      {p.routePolyline && p.routePolyline.length > 1
                        ? (
                          <GalleryMapThumb
                            polyline={p.routePolyline}
                            lineColor={TACCUINO_INK.typed}
                            lineWeight={2}
                            dashArray="3 2.5"
                            showEndpoints
                            dimTiles={false}
                            tileStyle="topo"
                          />
                        )
                        : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-5 h-5" style={{ color: TACCUINO_PAPER.cardBorder }} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 19.5, color: TACCUINO_INK.typed }}>{p.title}</p>
                      {(scoreLabel || p.safety) && (
                        <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: TACCUINO_INK.handMuted, marginTop: 1 }}>
                          {[scoreLabel, p.safety?.label].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {/* Fase 30 — peso visivo ridotto rispetto al titolo su richiesta esplicita
                          dell'utente ("nel concetto Diario farei emergere molto di più nome +
                          giudizio + fotografia... lasciando i numeri come annotazioni secondarie"):
                          font più piccolo, stesso grigio-marrone tenue delle icone invece del
                          marrone più scuro di prima, icone rimpicciolite — restano leggibili ma
                          non competono più col titolo per attenzione. */}
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5" style={{ fontFamily: FONT.lora, fontSize: 11, color: TACCUINO_INK.handMuted }}>
                        <span className="inline-flex items-center gap-1"><Route className="w-3 h-3" /> {(p.distanceMeters / 1000).toFixed(1)} km</span>
                        <span className="inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +{Math.round(p.elevationGain)} m</span>
                        <span className="inline-flex items-center gap-1"><Mountain className="w-3 h-3" /> {Math.round(p.altitudeMax)} m</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(p.estimatedTimeSeconds)}</span>
                      </div>
                    </div>
                    <div className="relative shrink-0 w-11 h-11 flex items-center justify-center">
                      {p.trailScore != null && (
                        <>
                          {/* Anello a tremore intorno al badge — non tocca `TrailScoreGaugeBadge`
                              stesso (condiviso con Guida/Resoconto/gallerie, su sfondi scuri:
                              un ritocco lì si vedrebbe ovunque, non solo qui). Un'aggiunta esterna,
                              scoperta e contenuta, dà solo a questa riga un accenno "cerchiato a
                              penna" invece del cerchio perfetto del componente. */}
                          <HandDrawnFrame stroke={TACCUINO_INK.mapContour} strokeWidth={1} rx={50} seed={7} className="scale-110" />
                          <TrailScoreGaugeBadge total={p.trailScore} safety={p.safety} size={46} showLabel={false} dark={false} />
                        </>
                      )}
                    </div>
                    <div
                      className="shrink-0 flex items-center justify-end gap-1"
                      style={{ width: 94, fontFamily: FONT_HAND, fontSize: 15, color: haOgniUscita ? TACCUINO_ACCENT[600] : TACCUINO_INK.handMuted, fontWeight: haOgniUscita ? 700 : 400 }}
                    >
                      {haOgniUscita && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />}
                      {haOgniUscita ? `${p.reportageCount} reportage` : 'in programma'}
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
  const [libroEnabled, setLibroEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    getUserSettingsCached()
      .then(d => setLibroEnabled(d.diarioLibroEnabled === true))
      .catch(() => setLibroEnabled(false))
  }, [])

  if (libroEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return libroEnabled ? <DiarioIndexLibro diaryId={params.id} /> : <DiarioDetailPageClassico />
}
