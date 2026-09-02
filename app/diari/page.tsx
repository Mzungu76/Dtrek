'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BookSpineShadow from '@/components/libro/BookSpineShadow'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import RouteThumb from '@/components/RouteThumb'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, FONT_HAND } from '@/lib/taccuinoTokens'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import { ArrowRight, BookMarked, BookOpen, Compass, Loader2, Mountain, Pencil, Plus, Search, X } from 'lucide-react'

/**
 * Copertina di un Diario — stessa identità visiva validata nel mockup "Diario a schermo intero"
 * (artifact 2e1f7d0a-5d69-4e17-9c8b-038aa651e13b, funzione shelfCoverHtml/.bk-cover): dorso di
 * libro verticale, taglio pagine sul bordo destro, titolo/occhiello/sottotitolo centrati. Il
 * dorso lucido resta invariato dalla Fase 18 (direzione taccuino, vedi `DiariPageLibro` sotto):
 * più libri scuri appoggiati su un foglio di carta chiara è coerente con quell'estetica, solo
 * l'ombra è stata scaldata per non stonare sul nuovo sfondo chiaro.
 * Adattamento deliberato rispetto al mockup: qui è una griglia di copertine reali (link
 * cliccabili, niente drag/swipe a schermo intero) invece di un carosello a una copertina alla
 * volta — più utilizzabile su desktop, e senza reimplementare una gestura che non si può
 * verificare a schermo in questa sandbox.
 */
function DiarioCoverCard({ d, index }: { d: DiarySummary; index: number }) {
  return (
    // Non un unico <Link> come nel mockup: "Personalizza" (foto/testi di copertina, pagina a sé —
    // vedi /diari/[id]/copertina) deve restare un link a sé, non annidato nel link che apre il
    // Diario.
    <div className="flex flex-col items-center gap-3 w-full">
      <Link href={`/diari/${encodeURIComponent(d.id)}`} className="w-full flex flex-col items-center">
      <div
        className="relative w-full rounded-[6px] overflow-hidden"
        style={{ aspectRatio: '3 / 4', boxShadow: '0 16px 30px -14px rgba(61,43,31,0.4), 0 2px 0 rgba(255,255,255,0.06) inset' }}
      >
        <DiarioCoverThumb coverUrl={d.coverUrl} className="absolute inset-0" />
        {d.coverUrl && <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/60" />}
        {/* Taglio pagine — un filo di carta sul bordo destro, l'unico indizio "è un libro" utile
            visto così, di taglio. */}
        <span
          className="absolute top-[3%] bottom-[3%] -right-[2px] w-1.5 rounded-r-[3px]"
          style={{
            background: 'repeating-linear-gradient(180deg, #efe6cf 0 2px, #e2d6b8 2px 4px)',
            boxShadow: '1px 0 3px rgba(0,0,0,0.3)',
          }}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-[10%]"
          style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6 }}
        >
          <div className="absolute inset-2 rounded-[3px] pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.16)' }} />
          {d.isDefault && (
            <span
              className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 9.5, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.16)' }}
            >
              Diario di default
            </span>
          )}
          <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>
            Taccuino N° {index + 1}
          </p>
          <BookOpen className="w-8 h-8 mb-3.5" style={{ color: 'rgba(255,255,255,0.75)' }} />
          <p style={{ fontFamily: FONT.display, fontWeight: 600, color: '#fdf8ea', fontSize: 21, lineHeight: 1.2, textWrap: 'balance' as const }}>
            {d.title}
          </p>
          {d.subtitle && (
            <p style={{ fontFamily: FONT.lora, fontStyle: 'italic', fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 7, textWrap: 'balance' as const }}>
              {d.subtitle}
            </p>
          )}
          <span className="w-7 h-px my-3.5" style={{ background: 'rgba(255,255,255,0.35)' }} />
          <p style={{ fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>
            {d.reportageCount} reportage
            {d.reportageCount > 0 && ` · ${d.pubblicabile ? 'pubblicabile' : 'non pubblicabile'}`}
          </p>
        </div>
      </div>
      <span
        className="inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-full text-white"
        style={{ background: '#c05a17', fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12.5 }}
      >
        <BookOpen className="w-3.5 h-3.5" /> Apri Diario
      </span>
      </Link>
      <Link
        href={`/diari/${encodeURIComponent(d.id)}/copertina`}
        className="inline-flex items-center gap-1.5 text-[11.5px]"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        <Pencil className="w-3 h-3" /> Personalizza copertina
      </Link>
    </div>
  )
}

/**
 * "+ Nuovo Diario" — stessa tessera tratteggiata del mockup (shelfNewTileHtml), ma qui crea
 * davvero un Diario invece di un toast placeholder: POST /api/diaries, gated (vedi quella route)
 * — il Diario di default è incluso per tutti, ulteriori Diari solo per chi ha sbloccato Dtrek.
 * Titolo segnaposto ("Nuovo Diario"): l'utente lo rinomina da "Personalizza copertina" sulla
 * copertina appena creata, riusando l'editor già esistente in /pubblica invece di costruirne uno
 * per la creazione.
 */
function NewDiarioTile() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setBlockedMessage(null)
    try {
      const res = await fetch('/api/diaries', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBlockedMessage(data.message ?? 'Impossibile creare il Diario.')
        return
      }
      router.push(`/diari/${encodeURIComponent(data.id)}`)
    } catch {
      setBlockedMessage('Errore di rete. Riprova.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="relative w-full rounded-[6px] flex flex-col items-center justify-center gap-2 disabled:opacity-60"
        style={{ aspectRatio: '3 / 4', border: `2px dashed ${TACCUINO_PAPER.cardBorder}`, background: TACCUINO_PAPER.card }}
      >
        {creating
          ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#a9915f' }} />
          : <Plus className="w-6 h-6" style={{ color: '#a9915f' }} />}
        <span style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, color: '#8a7f52' }}>
          Nuovo Diario
        </span>
      </button>
      {blockedMessage && (
        <p className="text-[11.5px] text-center" style={{ color: '#8a7f52' }}>
          {blockedMessage}{' '}
          <a href="/prezzi" className="underline" style={{ color: '#c05a17' }}>Sblocca Dtrek</a>
        </p>
      )}
    </div>
  )
}

/**
 * Ricerca testuale su tutti i percorsi (Mete e Reportage), in ogni Diario — Fase 18: risultati
 * senza lasciare lo scaffale, stessa API (`/api/percorsi`, invariata: resta l'unica vista
 * trasversale non filtrata, condivisa con app/percorsi/page.tsx), un sottoinsieme (max 8) invece
 * dell'elenco intero perché qui è una scorciatoia. Ogni riga rimanda alla stessa lettura "a libro"
 * di app/percorsi/page.tsx: annidata nel Diario quando lo conosciamo già (`diaryId` presente — un
 * percorso con almeno un Reportage, che quindi appartiene già a un Diario), altrimenti nella
 * variante diary-agnostic (app/guida/[id]/[groupKey]/page.tsx — sempre il caso per una Meta, che
 * non ha ancora un Diario). Nessun link "vedi tutti" in fondo: "Tutti i Percorsi" a sé non esiste
 * più — `/percorsi` ("Mete") ora mostra solo le Mete senza Reportage, un sottoinsieme che non
 * copre questi risultati.
 */
function GlobalRouteSearch() {
  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(() => setRows([]))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !rows) return []
    return rows.filter(r => r.title.toLowerCase().includes(q) || (r.diaryTitle ?? '').toLowerCase().includes(q))
  }, [rows, query])

  const hasQuery = query.trim().length > 0

  return (
    <div className="mb-8">
      <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: '#8a7f52' }} className="mb-2">
        Cerca un percorso
      </p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#a9915f' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Titolo della meta, del reportage o del Diario…"
          className="w-full pl-8 pr-8 py-2.5 rounded-full text-[13px] outline-none"
          style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: '#3f3a22' }}
        />
        {hasQuery && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: '#a9915f' }}
            aria-label="Cancella ricerca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {hasQuery && (
        rows === null ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#a9915f' }} />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[13px] py-4" style={{ color: '#8a7f52' }}>Nessun percorso corrisponde alla ricerca.</p>
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
                    ? <RouteThumb polyline={p.routePolyline} color="#c05a17" strokeWidth={2.5} />
                    : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-4 h-4" style={{ color: '#c9b98a' }} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: '#3f3a22' }}>{p.title}</p>
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, color: '#8a7f52' }}>
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
              <p className="px-3 py-2.5 text-[12px] font-semibold text-center" style={{ color: '#8a7f52' }}>
                +{filtered.length - 8} altri risultati — affina la ricerca
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}

/**
 * "I miei Diari" in stile taccuino topografico — Fase 18 di docs/diario-a-libro-piano.md, primo
 * uso reale di lib/taccuinoTokens.tsx (finora solo fondamenta inutilizzate). Sostituisce lo sfondo
 * scuro immersivo ereditato dal mockup originale con la carta invecchiata già validata per la
 * pergamena (BookPage.tsx) — i dorsi scuri delle copertine restano lucidi e invariati, come libri
 * veri appoggiati su un tavolo di carta invece che su uno scaffale in penombra.
 *
 * Griglia verticale a 2 colonne (prima una riga scorrevole orizzontale): raggiunta ora direttamente
 * dal bottone "Diari" della barra inferiore del Sommario (BookPage.tsx, Fase 18) invece che dal
 * drawer laterale rimosso — che qui non avrebbe più senso, essendo questa stessa pagina la
 * destinazione che il drawer duplicava. La ricerca sui percorsi (GlobalRouteSearch) è la stessa
 * ragione: prima l'unico modo per ritrovare un percorso senza ricordarne il Diario era uscire da
 * qui verso "Tutti i Percorsi" — ora è disponibile senza lasciare lo scaffale. Il link sotto verso
 * `/percorsi` resta, ma ristrutturazione Diario/Mete: quella pagina ("Mete") oggi mostra solo le
 * Mete senza Reportage, non più l'elenco esaustivo di ogni percorso — vedi GlobalRouteSearch sopra
 * per ritrovare anche un Reportage già raccontato.
 *
 * Redesign menù globale (fase 1) — la Fase 19 aveva tolto `<Navbar/>` da questa pagina (il vecchio
 * chrome in alto, abbandonato qui per primo). Ora `<Navbar/>` torna, ma è lo stesso componente
 * cambiato alla radice: su mobile monta la nuova barra in fondo (Diario/Mete/Nuovo) invece della
 * vecchia in cima — coerente con "niente vecchio chrome", non un passo indietro. La barra non ha
 * più una voce "Reportage" a sé (ristrutturazione Diario/Mete): un Reportage si crea da "Nuovo",
 * si legge dentro il suo Diario. `DiariPageClassico` (la variante pre-taccuino, dietro il flag
 * beta `diarioLibroEnabled`) è stata rimossa: questa è ora l'unica implementazione di /diari.
 */
function DiariPageLibro() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div
      className={`min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}
      style={{
        // Fase 31 — le due "macchie" radiali sono state tolte dalla palette (lib/taccuinoTokens.tsx):
        // la nuova direzione vuole una carta con variazione di tonalità quasi impercettibile, non
        // macchie visibili come tali. Sfondo piatto qui (questa pagina — lo scaffale — resta fuori
        // dallo scopo di questa fase, incentrata sul Sommario) finché non le arriva la stessa texture.
        background: TACCUINO_PAPER.base,
      }}
    >
      <Navbar />
      <BookSpineShadow variant="light" />
      <div className="max-w-[900px] mx-auto px-4 sm:px-8 pb-14" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 11, color: '#8a7f52' }} className="mb-1.5">
          Diario
        </p>
        <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 34, color: '#3f3a22' }} className="mb-8">
          I miei Diari
        </h1>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Impossibile caricare i tuoi Diari: {error}
          </p>
        )}

        {diaries === null && !error ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: '#a9915f' }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
              {diaries?.map((d, i) => <DiarioCoverCard key={d.id} d={d} index={i} />)}
              <NewDiarioTile />
            </div>

            <GlobalRouteSearch />

            <Link
              href="/percorsi"
              className="inline-flex items-center gap-2 text-[13px] transition-colors"
              style={{ color: '#8a7f52' }}
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
