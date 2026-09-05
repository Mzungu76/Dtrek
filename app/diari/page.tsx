'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BookSpineShadow from '@/components/libro/BookSpineShadow'
import RouteThumb from '@/components/RouteThumb'
import { FasiRail } from '@/components/diari/FasiRail'
import { ProssimaUscitaCard } from '@/components/diari/ProssimaUscitaCard'
import { RegistroRow } from '@/components/diari/RegistroRow'
import { GruppoCollassato } from '@/components/diari/GruppoCollassato'
import { IndiceChips, FILTRO_TUTTI, FILTRO_ARCHIVIO } from '@/components/diari/IndiceChips'
import { NuovoDiarioRow } from '@/components/diari/NuovoDiarioRow'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'
import { raggruppaDiari } from '@/lib/diari/raggruppaDiari'
import { selezionaProssimaUscita } from '@/lib/diari/prossimaUscita'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_RULED_TEXT_STYLE, FONT_HAND, INK_ABSORB_STYLE, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import { ArrowRight, Compass, Loader2, Mountain, Search, X } from 'lucide-react'

/**
 * Ricerca testuale su tutti i percorsi (Mete e Reportage), in ogni Diario — Fase 18: risultati
 * senza lasciare lo scaffale. Non fa più il proprio fetch: le righe arrivano dal genitore
 * (`DiariPageLibro`), che le carica comunque per il rail delle fasi e la card "prossima uscita"
 * (docs/diari-restyling-piano.md, Fase 1) — un solo GET /api/percorsi per l'intera pagina invece
 * di due identici. Ogni riga rimanda alla stessa lettura "a libro" di app/percorsi/page.tsx:
 * annidata nel Diario quando lo conosciamo già (`diaryId` presente — un percorso con almeno un
 * Reportage, che quindi appartiene già a un Diario), altrimenti nella variante diary-agnostic
 * (app/guida/[id]/[groupKey]/page.tsx — sempre il caso per una Meta, che non ha ancora un Diario).
 */
function GlobalRouteSearch({ rows, error }: { rows: AllPercorsiRow[] | null; error: string | null }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !rows) return []
    return rows.filter(r => r.title.toLowerCase().includes(q) || (r.diaryTitle ?? '').toLowerCase().includes(q))
  }, [rows, query])

  const hasQuery = query.trim().length > 0

  return (
    <div className="mb-8">
      <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-2">
        Cerca un percorso
      </p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Titolo della meta, del reportage o del Diario…"
          className="w-full pl-8 pr-8 py-2.5 rounded-full text-[13px] outline-none"
          style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
        />
        {hasQuery && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: TACCUINO_INK.handMuted }}
            aria-label="Cancella ricerca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {hasQuery && (
        rows === null && !error ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: TACCUINO_INK.handMuted }} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[13px] py-4" style={{ color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }}>Nessun percorso corrisponde alla ricerca.</p>
        ) : (
          <div className="mt-2 flex flex-col rounded-2xl overflow-hidden" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
            {filtered.slice(0, 8).map(p => (
              <Link
                key={p.id}
                href={p.diaryId
                  ? `/diari/${encodeURIComponent(p.diaryId)}/percorsi/${encodeURIComponent(p.id)}/guida/prima_di_partire`
                  : `/guida/${encodeURIComponent(p.id)}/prima_di_partire`}
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ borderBottom: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}
              >
                <div className="w-11 h-11 rounded-lg shrink-0 overflow-hidden relative" style={{ background: TACCUINO_PAPER.base }}>
                  {p.routePolyline && p.routePolyline.length > 1
                    ? <RouteThumb polyline={p.routePolyline} color={TACCUINO_ACCENT[600]} strokeWidth={2.5} />
                    : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-4 h-4" style={{ color: '#c9b98a' }} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: TACCUINO_INK.typed }}>{p.title}</p>
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, color: TACCUINO_INK.hand }}>
                    {p.diaryTitle && <span className="truncate">{p.diaryTitle}</span>}
                    {metaHasHikingMetrics(p.metaType) && (
                      <>
                        <span>{(p.distanceMeters / 1000).toFixed(1)} km</span>
                        <span>+{Math.round(p.elevationGain)} m</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {filtered.length > 8 && (
              <p className="px-3 py-2.5 text-[12px] font-semibold text-center" style={{ color: TACCUINO_INK.hand }}>
                +{filtered.length - 8} altri risultati — affina la ricerca
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}

/** Soglia sotto la quale l'indice a chip è solo rumore — l'elenco intero ci sta già in una
 *  schermata (docs/diari-restyling-piano.md, Fase 1). */
const SOGLIA_INDICE = 6

/**
 * "I miei Diari", versione A ("Plancia di campo") del restyling — docs/diari-restyling-piano.md.
 * Sostituisce lo scaffale di copertine con: il rail delle tre fasi (Pianifica/Naviga/Registra, con
 * lo stato reale dell'utente), un'unica azione primaria (la prossima uscita) e un registro a righe
 * che raggruppa i Diari per stagione invece di impilarli tutti in una griglia — la parte pensata
 * per reggere la crescita del numero di Diari senza introdurre cartelle (vedi il confronto in
 * docs/mockup-diari-redesign/README.md).
 *
 * Un solo fetch di /api/percorsi per l'intera pagina (rail, card, ricerca) — vedi il commento su
 * GlobalRouteSearch sopra.
 */
function DiariPageLibro() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [diariesError, setDiariesError] = useState<string | null>(null)
  const [percorsi, setPercorsi] = useState<AllPercorsiRow[] | null>(null)
  const [percorsiError, setPercorsiError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>(FILTRO_TUTTI)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setDiariesError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setPercorsi)
      .catch(e => setPercorsiError(e instanceof Error ? e.message : String(e)))
  }, [])

  const metePronteCount = useMemo(() => percorsi?.filter(r => r.reportageCount === 0).length ?? 0, [percorsi])
  const percorsiConTracciaCount = useMemo(
    () => percorsi?.filter(r => (r.routePolyline?.length ?? 0) > 1).length ?? 0,
    [percorsi],
  )
  const reportageTotali = useMemo(() => diaries?.reduce((s, d) => s + d.reportageCount, 0) ?? 0, [diaries])
  const prossimaUscita = useMemo(() => percorsi ? selezionaProssimaUscita(percorsi) : null, [percorsi])

  const etichetteUniche = useMemo(() => {
    const conteggi = new Map<string, number>()
    for (const d of diaries ?? []) {
      if (d.archivedAt) continue
      for (const etichetta of d.labels) conteggi.set(etichetta, (conteggi.get(etichetta) ?? 0) + 1)
    }
    return Array.from(conteggi.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([valore, conteggio]) => ({ valore, conteggio }))
  }, [diaries])

  const archiviatiCount = useMemo(() => diaries?.filter(d => d.archivedAt).length ?? 0, [diaries])

  const diariFiltrati = useMemo(() => {
    if (!diaries) return []
    if (filtro === FILTRO_TUTTI) return diaries
    if (filtro === FILTRO_ARCHIVIO) return diaries.filter(d => d.archivedAt)
    return diaries.filter(d => !d.archivedAt && d.labels.includes(filtro))
  }, [diaries, filtro])

  const gruppi = useMemo(() => raggruppaDiari(diariFiltrati), [diariFiltrati])
  // Un solo gruppo (un account nuovo, o un filtro che riduce l'elenco a una sola stagione/
  // all'archivio) va mostrato espanso: un fold sarebbe un click in più per vedere l'unica cosa che
  // c'è, e per l'Archivio filtrato esplicitamente l'utente vuole proprio guardarci dentro.
  const espandiTutti = gruppi.length <= 1

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />
      <BookSpineShadow variant="light" />
      <div className="max-w-[900px] mx-auto px-4 sm:px-8 pb-14" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 11, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-1.5">
          Diario
        </p>
        <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 34, ...INK_ABSORB_STYLE, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-1.5">
          I miei Diari
        </h1>
        <p style={{ fontFamily: FONT.lora, fontSize: 12.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-6 max-w-[46ch]">
          Pianifichi il percorso, lo cammini con il navigatore, l&rsquo;uscita finisce qui — misurata, non raccontata.
        </p>

        {(diariesError || percorsiError) && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Impossibile caricare i tuoi Diari: {diariesError ?? percorsiError}
          </p>
        )}

        {diaries === null && !diariesError ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span style={TACCUINO_RULED_TEXT_STYLE}>Caricamento…</span>
          </div>
        ) : (
          <>
            <FasiRail
              metePronteCount={metePronteCount}
              percorsiConTracciaCount={percorsiConTracciaCount}
              reportageTotali={reportageTotali}
            />

            <div className="mt-4 mb-6">
              <ProssimaUscitaCard candidata={prossimaUscita} />
            </div>

            {(diaries?.length ?? 0) > SOGLIA_INDICE && (
              <div className="mb-3">
                <IndiceChips
                  etichette={etichetteUniche}
                  totale={diaries?.length ?? 0}
                  archiviati={archiviatiCount}
                  selezionato={filtro}
                  onSelect={setFiltro}
                />
              </div>
            )}

            <div className="flex flex-col gap-2 mb-3">
              {gruppi.map(gruppo => (
                espandiTutti || gruppo.tipo === 'stagione_corrente'
                  ? gruppo.diari.map((diario, i) => <RegistroRow key={diario.id} diario={diario} indiceColore={i} />)
                  : <GruppoCollassato key={gruppo.chiave} gruppo={gruppo} />
              ))}
            </div>

            <div className="mb-8">
              <NuovoDiarioRow />
            </div>

            <GlobalRouteSearch rows={percorsi} error={percorsiError} />

            <Link
              href="/percorsi"
              className="inline-flex items-center gap-2 text-[13px] transition-colors"
              style={{ color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }}
            >
              <Compass className="w-4 h-4" /> Tutte le Mete <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function DiariPage() {
  return <DiariPageLibro />
}
