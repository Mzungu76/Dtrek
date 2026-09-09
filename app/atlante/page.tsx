'use client'
import { useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_RULED_TEXT_STYLE, FONT_HAND, HandDrawnFrame, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import { useCreateMetaFromSearch } from '@/lib/useCreateMetaFromSearch'
import { mergeArchiveResults } from '@/lib/metaSearch/mergeArchiveResults'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import type { MetaSearchCounts } from '@/app/api/meta-search/counts/route'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'
import {
  BookMarked, Building2, ChevronDown, ChevronRight, ChevronUp, Compass, FolderSearch, Landmark,
  Loader2, Route as RouteIcon, Search, Sparkles, Upload, X,
} from 'lucide-react'

// Debounce della ricerca d'archivio — un solo giro di /api/meta-search per pausa di digitazione,
// non uno per carattere premuto. Sotto due caratteri il campo filtra solo le Mete già salvate
// (client, gratis): una ricerca d'archivio per una singola lettera tornerebbe centinaia di righe
// poco utili.
const ARCHIVE_SEARCH_DEBOUNCE_MS = 350
const ARCHIVE_SEARCH_MIN_CHARS = 2
const ARCHIVE_SEARCH_LIMIT = 6

interface ShelfItem {
  href: string
  icon: typeof RouteIcon
  title: string
  subtitle: string
}

const SENTIERI_ITEMS: ShelfItem[] = [
  {
    href: '/upload?tab=gpx&source=build',
    icon: RouteIcon,
    title: 'Costruisci o trova un percorso',
    subtitle: 'Punto di partenza, km e dislivello — oppure lo descrivi a Giulia',
  },
  {
    href: '/percorsi-per-te',
    icon: Sparkles,
    title: 'Percorsi per te',
    subtitle: '5 proposte già pronte, aggiornate ogni settimana',
  },
  {
    href: '/upload?tab=gpx',
    icon: Upload,
    title: 'Importa',
    subtitle: 'File GPX · da un link · a mano · da un’escursione fatta',
  },
]

interface TavolaProps {
  href: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  subtitle: string
  count: number | null
}

function Tavola({ href, icon: Icon, title, subtitle, count }: TavolaProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
        <Icon className="w-4 h-4" style={{ color: TACCUINO_INK.hand }} />
      </span>
      <div className="min-w-0 flex-1">
        <p style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: TACCUINO_INK.typed }}>{title}</p>
        <p style={{ fontSize: 11, color: TACCUINO_INK.handMuted }}>{subtitle}</p>
      </div>
      {count !== null && (
        <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: TACCUINO_INK.hand }}>{count}</span>
      )}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: TACCUINO_INK.handMuted }} />
    </Link>
  )
}

function MetaTypeGlyph({ metaType, size }: { metaType: MetaType; size: number }) {
  const config = META_TYPE_CONFIG[metaType]
  const Icon = config.icon
  return (
    <span
      className="rounded-md flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `${config.color}29` }}
    >
      <Icon style={{ width: size * 0.6, height: size * 0.6, color: config.color }} />
    </span>
  )
}

function Shelf({ metaType, open, onToggle, trailingLabel, children }: {
  metaType: MetaType
  open: boolean
  onToggle: () => void
  trailingLabel?: string
  children: ReactNode
}) {
  const config = META_TYPE_CONFIG[metaType]
  return (
    <div className="rounded-[13px] overflow-hidden" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3.5 py-3" aria-expanded={open}>
        <MetaTypeGlyph metaType={metaType} size={27} />
        <span style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 21, color: TACCUINO_INK.typed }}>{config.pluralLabel}</span>
        <span className="flex-1" />
        {trailingLabel && (
          <span className="font-mono text-[10.5px]" style={{ color: TACCUINO_INK.handMuted }}>{trailingLabel}</span>
        )}
        {open ? <ChevronUp className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} /> : <ChevronDown className="w-4 h-4" style={{ color: TACCUINO_INK.handMuted }} />}
      </button>
      {open && (
        <div style={{ background: TACCUINO_PAPER.light, borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ShelfLinks({ items }: { items: ShelfItem[] }) {
  return <>{items.map(item => <ShelfLink key={item.href + item.title} {...item} />)}</>
}

function ShelfLink({ href, icon: Icon, title, subtitle, trailing }: ShelfItem & { trailing?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3.5 py-2.5"
      style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}80` }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: TACCUINO_ACCENT[600] }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold" style={{ color: TACCUINO_INK.typed }}>{title}</p>
        <p className="text-[11px]" style={{ color: TACCUINO_INK.handMuted }}>{subtitle}</p>
      </div>
      {trailing && <span className="font-mono text-[11px] shrink-0" style={{ color: TACCUINO_INK.handMuted }}>{trailing}</span>}
    </Link>
  )
}

/**
 * "Atlante" — il secondo libro della Libreria: dove potresti andare, non ciò che è già tuo
 * (docs/libreria-atlante-piano.md, Fase 2; unico hub di ricerca dopo
 * docs/allineamento-mockup-piano.md, intervento B). Un unico Atlante, sempre presente.
 *
 * Assorbe per intero l'ex pagina "Cerca una Meta" (app/percorsi/cerca/page.tsx, ora un redirect
 * qui) — il campo di ricerca vero (Mete salvate + archivio Borghi/Siti, risposta istantanea) e i
 * tre scaffali per tipologia (docs/piano-ricerca-mete.md, direzione A). "Percorsi per te" e "Le
 * mie ricerche salvate" vivono solo nello scaffale Sentieri, non anche come tavola a parte: due
 * ingressi alla stessa cosa sarebbero il doppione che questo intervento doveva togliere.
 *
 * Le tavole (docs/allineamento-mockup-piano.md, seguito richiesto dall'utente dopo l'intervento B):
 * "Cerca una meta" in cima non è una pagina a sé — porta il fuoco sul campo di ricerca già qui
 * sopra (utile quando si arriva dalle tavole senza aver notato il campo). "Salvate" resta (le Mete
 * già trovate e messe da parte — ex app/percorsi/page.tsx). "Vicino a te" è stata tolta come tavola
 * a sé (la carta geolocalizzata resta raggiungibile da dentro gli scaffali Borgo e Città/Sito, con
 * `?tipo=`) e sostituita da "Suggerite" verso /percorsi-per-te, i suggerimenti settimanali già
 * esistenti — stesso conteggio già caricato per lo scaffale Sentieri, nessuna chiamata in più.
 */
export default function AtlantePage() {
  return (
    <Suspense fallback={null}>
      <AtlantePageInner />
    </Suspense>
  )
}

function AtlantePageInner() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [openShelf, setOpenShelf] = useState<MetaType>('sentiero')
  const searchInputRef = useRef<HTMLInputElement>(null)

  function focusSearch() {
    searchInputRef.current?.focus()
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [archiveCounts, setArchiveCounts] = useState<MetaSearchCounts | null>(null)
  const [savedSearchCount, setSavedSearchCount] = useState<number | null>(null)
  const [proposteCount, setProposteCount] = useState<number | null>(null)

  const [archiveResults, setArchiveResults] = useState<MetaSearchResultItem[] | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const { creatingId, createError, createAndOpen } = useCreateMetaFromSearch()

  useEffect(() => {
    fetch('/api/percorsi').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(setRows).catch(() => setRows([]))
    fetch('/api/meta-search/counts').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(setArchiveCounts).catch(() => setArchiveCounts(null))
    fetch('/api/route-build/search-history').then(r => r.ok ? r.json() : Promise.reject()).then(d => setSavedSearchCount((d.searches ?? []).length)).catch(() => setSavedSearchCount(null))
    fetch('/api/percorsi-per-te').then(r => r.ok ? r.json() : Promise.reject()).then(d => setProposteCount((d.cards ?? []).length)).catch(() => setProposteCount(null))
  }, [])

  // "Salvata": senza Reportage e senza Diario — stessa regola della tavola omonima
  // (app/atlante/salvate/page.tsx).
  const mete = useMemo(() => (rows ?? []).filter(r => r.reportageCount === 0 && !r.diaryId), [rows])
  const salvateCount = mete.length
  const savedPlaceIds = useMemo(() => new Set(mete.map(r => r.placeId).filter((id): id is string => id != null)), [mete])

  const trimmedQuery = query.trim()
  const localMatches = useMemo(() => {
    const q = trimmedQuery.toLowerCase()
    if (!q) return []
    return mete.filter(r => r.title.toLowerCase().includes(q))
  }, [mete, trimmedQuery])

  // Ricerca d'archivio debounced con AbortController — una richiesta in volo alla volta, la
  // precedente viene sempre annullata così una risposta in ritardo non sovrascrive una più
  // recente.
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    abortRef.current?.abort()
    if (trimmedQuery.length < ARCHIVE_SEARCH_MIN_CHARS) {
      setArchiveResults(null)
      setArchiveLoading(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setArchiveLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [borghi, siti] = await Promise.all(
          (['borgo_citta', 'sito'] as const).map(metaType =>
            fetch('/api/meta-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ metaType, query: trimmedQuery, limit: ARCHIVE_SEARCH_LIMIT }),
              signal: controller.signal,
            }).then(r => r.ok ? r.json() : { items: [] }).then(d => (d.items ?? []) as MetaSearchResultItem[]),
          ),
        )
        if (controller.signal.aborted) return
        setArchiveResults(mergeArchiveResults([borghi, siti], savedPlaceIds))
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setArchiveResults([])
      } finally {
        if (!controller.signal.aborted) setArchiveLoading(false)
      }
    }, ARCHIVE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmedQuery, savedPlaceIds])

  const hasQuery = trimmedQuery.length > 0
  const showInstantResults = hasQuery && (localMatches.length > 0 || (archiveResults?.length ?? 0) > 0 || archiveLoading || trimmedQuery.length >= ARCHIVE_SEARCH_MIN_CHARS)

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      <div className="max-w-[720px] mx-auto px-5 sm:px-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }}>
          Il libro delle mete
        </p>
        <div className="flex items-center gap-2 mt-1 mb-1.5">
          <Compass className="w-6 h-6" style={{ color: TACCUINO_INK.typed }} />
          <h1 style={{ fontFamily: FONT.lora, fontWeight: 700, fontSize: 26, color: TACCUINO_INK.typed }}>Atlante</h1>
        </div>
        <p style={{ fontSize: 12.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-4 max-w-[42ch]">
          Contiene ciò che non è ancora tuo. Quando decidi di andarci, lo trascrivi in un Diario — e da lì in poi vive lì.
        </p>
      </div>

      <main className="max-w-[720px] mx-auto px-5 sm:px-8 pb-8">
        {/* Campo unico — risponde subito con le due ricerche già veloci (Mete salvate + archivio
            Borghi/Siti), unite in due gruppi sotto. I flussi lunghi restano negli scaffali più giù. */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
          <input
            ref={searchInputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca insieme fra le tue Mete e l'archivio…"
            className="w-full pl-8 pr-8 py-2.5 rounded-[3px] text-[15px] outline-none placeholder:text-[#8a9bab]"
            style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, fontFamily: FONT_HAND }}
          />
          {hasQuery && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} aria-label="Cancella ricerca">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <HandDrawnFrame stroke={TACCUINO_PAPER.cardBorder} strokeWidth={1.5} rx={4} />
        </div>

        {showInstantResults && (
          <div className="mb-6 rounded-xl overflow-hidden" style={{ background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
            {rows === null ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" style={{ color: TACCUINO_INK.handMuted }} /></div>
            ) : localMatches.length === 0 && (archiveResults?.length ?? 0) === 0 && !archiveLoading ? (
              <p className="text-[13px] text-center py-6 px-4" style={{ color: TACCUINO_INK.handMuted }}>Nessun risultato per &laquo;{trimmedQuery}&raquo;.</p>
            ) : (
              <>
                {localMatches.length > 0 && (
                  <>
                    <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: TACCUINO_INK.handMuted }}>Fra le tue Salvate</p>
                    {localMatches.slice(0, 5).map(m => (
                      <Link
                        key={m.id}
                        href={`/guida/${encodeURIComponent(m.id)}/prima_di_partire`}
                        className="flex items-center gap-2.5 px-3 py-2"
                        style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}80` }}
                      >
                        <MetaTypeGlyph metaType={m.metaType} size={22} />
                        <span className="flex-1 min-w-0 truncate text-[13.5px]" style={{ color: TACCUINO_INK.typed }}>{m.title}</span>
                      </Link>
                    ))}
                  </>
                )}
                {(archiveLoading || (archiveResults?.length ?? 0) > 0) && (
                  <>
                    <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: TACCUINO_INK.handMuted, borderTop: localMatches.length > 0 ? `1px solid ${TACCUINO_PAPER.cardBorder}` : undefined }}>
                      Borghi, Città e Siti
                      {archiveLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </p>
                    {(archiveResults ?? []).map(item => (
                      <button
                        key={item.id}
                        onClick={() => createAndOpen(item)}
                        disabled={!!creatingId}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left disabled:opacity-60"
                        style={{ borderTop: `1px solid ${TACCUINO_PAPER.cardBorder}80` }}
                      >
                        <MetaTypeGlyph metaType={item.metaType} size={22} />
                        <span className="flex-1 min-w-0 truncate text-[13.5px]" style={{ color: TACCUINO_INK.typed }}>{item.name}</span>
                        {item.region && <span className="shrink-0 text-[11px]" style={{ color: TACCUINO_INK.handMuted }}>{item.region}</span>}
                        {creatingId === item.id && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: TACCUINO_ACCENT[600] }} />}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {createError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{createError}</p>
        )}

        <p className="mb-1" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: TACCUINO_INK.hand }}>
          Le tavole
        </p>
        <div className="flex flex-col mb-6">
          {/* Non un Link: porta il fuoco sul campo di ricerca già in cima alla pagina invece di
              aprire un'altra schermata — la ricerca vera vive qui, non altrove. */}
          <button
            onClick={focusSearch}
            className="flex items-center gap-3 py-3 w-full text-left"
            style={{ borderBottom: `1px dotted ${TACCUINO_PAPER.cardBorder}` }}
          >
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              <Search className="w-4 h-4" style={{ color: TACCUINO_INK.hand }} />
            </span>
            <div className="min-w-0 flex-1">
              <p style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: TACCUINO_INK.typed }}>Cerca una meta</p>
              <p style={{ fontSize: 11, color: TACCUINO_INK.handMuted }}>Sentieri, Borghi, Città e Siti — tutti i modi in un posto solo</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: TACCUINO_INK.handMuted }} />
          </button>
          <Tavola href="/atlante/salvate" icon={BookMarked} title="Salvate" subtitle="Messe da parte mentre cercavi" count={salvateCount} />
          <Tavola href="/percorsi-per-te" icon={Sparkles} title="Suggerite" subtitle="5 proposte già pronte, aggiornate ogni settimana" count={proposteCount} />
        </div>

        {/* Tre scaffali — un solo aperto alla volta, ogni voce rimanda alla schermata esistente
            invariata (docs/piano-ricerca-mete.md, direzione A). */}
        <div className="flex flex-col gap-2.5">
          <Shelf
            metaType="sentiero"
            open={openShelf === 'sentiero'}
            onToggle={() => setOpenShelf(s => s === 'sentiero' ? 'sito' : 'sentiero')}
            trailingLabel={`${SENTIERI_ITEMS.length + 1} modi`}
          >
            <ShelfLinks items={SENTIERI_ITEMS} />
            <ShelfLink
              href="/profilo/ricerche-salvate"
              icon={FolderSearch}
              title="Le mie ricerche salvate"
              subtitle="Riapri una ricerca fatta in precedenza — stessi risultati, senza ricalcolare nulla."
              trailing={savedSearchCount != null ? `${savedSearchCount} / 5` : undefined}
            />
          </Shelf>

          <Shelf
            metaType="borgo_citta"
            open={openShelf === 'borgo_citta'}
            onToggle={() => setOpenShelf(s => s === 'borgo_citta' ? 'sentiero' : 'borgo_citta')}
            trailingLabel={archiveCounts ? `${archiveCounts.borgo_citta} in archivio` : undefined}
          >
            <ShelfLink
              href="/percorsi/cerca/luoghi?tipo=borgo_citta"
              icon={Building2}
              title="Sfoglia i Borghi e le Città"
              subtitle="Per regione, categoria o vicino a te"
            />
          </Shelf>

          <Shelf
            metaType="sito"
            open={openShelf === 'sito'}
            onToggle={() => setOpenShelf(s => s === 'sito' ? 'sentiero' : 'sito')}
            trailingLabel={archiveCounts ? `${archiveCounts.sito} in archivio` : undefined}
          >
            <ShelfLink
              href="/percorsi/cerca/luoghi?tipo=sito"
              icon={Landmark}
              title="Sfoglia i Siti"
              subtitle="Musei, castelli, aree archeologiche e naturali"
            />
            {archiveCounts?.sito === 0 && (
              <p className="px-3 pb-3 text-[11px] italic" style={{ color: TACCUINO_INK.handMuted }}>
                Nessun Sito ancora in archivio — la ricerca è pronta, i dati arrivano dopo.
              </p>
            )}
          </Shelf>
        </div>

        {proposteCount === null && rows === null && (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-4 h-4 animate-spin" /><span style={{ fontSize: 12 }}>Caricamento…</span>
          </div>
        )}
      </main>
    </div>
  )
}
