'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BookSpineShadow from '@/components/libro/BookSpineShadow'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import RouteThumb from '@/components/RouteThumb'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, FONT_HAND } from '@/lib/taccuinoTokens'
import { ArrowRight, BookMarked, BookOpen, Compass, Loader2, Lock, LockOpen, Mountain, Pencil, Plus, Search, X } from 'lucide-react'

/**
 * "I miei Diari" — Fase 1 di docs/diario-fulcro-piano.md (sola lettura). Home del Diario: ogni
 * Diario è una raccolta di Percorsi, pubblicabile solo se almeno uno di essi ha almeno un
 * Reportage (vedi app/api/diaries/route.ts). "Il mio Diario" (di default) è sempre il primo e
 * non elencato/eliminabile da qui — quella gestione arriva in una fase successiva.
 */
function DiariPageClassico() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Diario</p>
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            I miei Diari
          </h1>
        </div>
      </div>

      <main className="max-w-[900px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare i tuoi Diari: {error}
          </p>
        )}

        {diaries === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Link
              href="/percorsi"
              className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 border border-stone-200 hover:border-forest-300 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
                <Compass className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-stone-800">Tutti i Percorsi</p>
                <p className="text-[12px] text-stone-500">Ritrova un percorso in qualunque Diario, senza doverlo ricordare</p>
              </div>
              <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
            {diaries?.map(d => (
              <Link
                key={d.id}
                href={`/diari/${encodeURIComponent(d.id)}`}
                className={`flex items-center gap-4 bg-white rounded-2xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow border ${d.isDefault ? 'border-forest-300' : 'border-stone-200'}`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${d.coverUrl ? '' : 'bg-forest-50'}`}>
                  {d.coverUrl
                    ? <img src={d.coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    : <BookMarked className="w-6 h-6 text-forest-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  {d.isDefault && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full mb-1">
                      Diario di default
                    </span>
                  )}
                  <p className="font-display text-[16px] font-bold text-stone-800 truncate">{d.title}</p>
                  <div className="flex items-center gap-2 text-[13px] text-stone-500 mt-0.5">
                    <span>{d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}</span>
                    <span className="text-stone-300">·</span>
                    {d.pubblicabile ? (
                      <span className="inline-flex items-center gap-1 text-forest-700 font-medium">
                        <LockOpen className="w-3 h-3" /> Pubblicabile
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone-400">
                        <Lock className="w-3 h-3" /> Non ancora pubblicabile
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

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
            {d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}
            {d.percorsiCount > 0 && ` · ${d.pubblicabile ? 'pubblicabile' : 'non pubblicabile'}`}
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
 * Ricerca testuale su tutti i Percorsi, in ogni Diario — Fase 18: prima l'unico modo per ritrovare
 * un percorso senza ricordare in quale Diario fosse era andare alla pagina "Tutti i Percorsi" a
 * sé (`/percorsi`, ancora raggiungibile, invariata, sotto). Qui invece i risultati compaiono senza
 * lasciare lo scaffale — stessa API (`/api/percorsi`), un sottoinsieme (max 8) invece dell'elenco
 * intero perché qui è una scorciatoia, non la vista esaustiva.
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
        Cerca un Percorso
      </p>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#a9915f' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Titolo del percorso o del Diario…"
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
                href={p.diaryId ? `/diari/${encodeURIComponent(p.diaryId)}/percorsi/${encodeURIComponent(p.id)}/guida/il_percorso` : '/diari'}
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
                    <span>{(p.distanceMeters / 1000).toFixed(1)} km</span>
                    <span>+{Math.round(p.elevationGain)} m</span>
                  </div>
                </div>
              </Link>
            ))}
            {filtered.length > 8 && (
              <Link href="/percorsi" className="px-3 py-2.5 text-[12px] font-semibold text-center" style={{ color: '#c05a17' }}>
                +{filtered.length - 8} altri risultati — apri Tutti i Percorsi
              </Link>
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
 * destinazione che il drawer duplicava. La ricerca sui Percorsi (GlobalRouteSearch) è la stessa
 * ragione: prima l'unico modo per ritrovare un percorso senza ricordarne il Diario era uscire da
 * qui verso "Tutti i Percorsi" — ora è disponibile senza lasciare lo scaffale, e quel link resta
 * sotto per la vista esaustiva.
 *
 * Fase 19 — anche `<Navbar/>` (tab Diario/Percorsi/Resoconti) è stata tolta da qui: l'utente ha
 * chiesto di abbandonare del tutto il vecchio chrome su questa pagina, non solo il drawer. Resta
 * invariata sulle pagine non ancora convertite (`/percorsi`, i Diari classici) — è una rimozione
 * per-pagina, non un cambio del componente condiviso.
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
      className="min-h-screen"
      style={{
        // Fase 31 — le due "macchie" radiali sono state tolte dalla palette (lib/taccuinoTokens.tsx):
        // la nuova direzione vuole una carta con variazione di tonalità quasi impercettibile, non
        // macchie visibili come tali. Sfondo piatto qui (questa pagina — lo scaffale — resta fuori
        // dallo scopo di questa fase, incentrata sul Sommario) finché non le arriva la stessa texture.
        background: TACCUINO_PAPER.base,
      }}
    >
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
              <Compass className="w-4 h-4" /> Tutti i Percorsi, in ogni Diario <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function DiariPage() {
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

  return libroEnabled ? <DiariPageLibro /> : <DiariPageClassico />
}
