'use client'
import { useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, FONT_HAND, HandDrawnFrame } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import { useCreateMetaFromSearch } from '@/lib/useCreateMetaFromSearch'
import { mergeArchiveResults } from '@/lib/metaSearch/mergeArchiveResults'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import type { MetaSearchCounts } from '@/app/api/meta-search/counts/route'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'
import {
  Building2, ChevronDown, ChevronUp, FolderSearch, Landmark, Loader2,
  Route as RouteIcon, Search, Sparkles, Upload, X,
} from 'lucide-react'

// Debounce della ricerca d'archivio (Fase 2 — un solo giro di /api/meta-search per pausa di
// digitazione, non uno per carattere premuto). Sotto due caratteri il campo filtra solo le Mete
// già salvate (client, gratis): una ricerca d'archivio per una singola lettera tornerebbe
// centinaia di righe poco utili.
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
    // `source=build` entra dritto nel wizard (components/upload/RouteBuilder.tsx via
    // ManualImportChoice's `initialMode`), non sul suo stesso menu di scelta — chi tocca questa
    // voce ha già deciso, non deve rivederla un'altra volta.
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
    // File traccia è il tab di default di /upload?tab=gpx (nessun `source`): entra dritto nel
    // caricamento, mai sul menu "Manuale".
    href: '/upload?tab=gpx',
    icon: Upload,
    title: 'Importa',
    subtitle: 'File GPX · da un link · a mano · da un’escursione fatta',
  },
]

/**
 * Pagina unica di ricerca delle Mete — docs/piano-ricerca-mete.md, direzione A ("tre scaffali a
 * fisarmonica") scelta dopo i mockup (docs/mockup-ricerca-mete/, canvas
 * https://claude.ai/code/artifact/4fac632b-b9a7-451c-b1ae-c40228d3550d). Sostituisce il vecchio
 * form Borghi/Siti che viveva qui: quel form si è spostato, invariato, su
 * app/percorsi/cerca/luoghi/page.tsx, ora raggiunto dallo scaffale "Borghi e Città"/"Siti".
 *
 * Architettura ibrida (vincolo fissato con l'utente): il campo unico in cima risponde subito con
 * le due ricerche già veloci (Mete salvate, filtro client su /api/percorsi; archivio Borghi/Siti,
 * /api/meta-search) — i flussi lunghi (wizard, Giulia, import, Percorsi per te) restano le
 * schermate esistenti invariate, raggiunte dagli scaffali sotto.
 *
 * `useSearchParams` (per `?q=`, arrivo dal campo di ricerca di app/percorsi/page.tsx quando non
 * trova nulla fra le Mete salvate) richiede un confine Suspense — stesso pattern di
 * app/upload/page.tsx.
 */
export default function CercaMetaHubPage() {
  return (
    <Suspense fallback={null}>
      <CercaMetaHubPageInner />
    </Suspense>
  )
}

function CercaMetaHubPageInner() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Sentieri aperto di default a ogni ingresso (decisione esplicita — è la tipologia con più vie e
  // con dati reali oggi): mai persistito, un solo scaffale aperto alla volta.
  const [openShelf, setOpenShelf] = useState<MetaType>('sentiero')

  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [archiveCounts, setArchiveCounts] = useState<MetaSearchCounts | null>(null)
  const [savedSearchCount, setSavedSearchCount] = useState<number | null>(null)

  const [archiveResults, setArchiveResults] = useState<MetaSearchResultItem[] | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const { creatingId, createError, createAndOpen } = useCreateMetaFromSearch()

  useEffect(() => {
    fetch('/api/percorsi').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(setRows).catch(() => setRows([]))
    fetch('/api/meta-search/counts').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(setArchiveCounts).catch(() => setArchiveCounts(null))
    // Best-effort: se non autenticata o la tabella non esiste ancora, il conteggio resta assente
    // (mai un numero fabbricato al suo posto — la riga "Ricerche salvate" lo omette).
    fetch('/api/route-build/search-history').then(r => r.ok ? r.json() : Promise.reject()).then(d => setSavedSearchCount((d.searches ?? []).length)).catch(() => setSavedSearchCount(null))
  }, [])

  const mete = useMemo(() => (rows ?? []).filter(r => r.reportageCount === 0), [rows])
  const savedPlaceIds = useMemo(() => new Set(mete.map(r => r.placeId).filter((id): id is string => id != null)), [mete])

  const trimmedQuery = query.trim()
  const localMatches = useMemo(() => {
    const q = trimmedQuery.toLowerCase()
    if (!q) return []
    return mete.filter(r => r.title.toLowerCase().includes(q))
  }, [mete, trimmedQuery])

  // Ricerca d'archivio debounced con AbortController — una richiesta in volo alla volta, la
  // precedente viene sempre annullata così una risposta in ritardo non sovrascrive una più
  // recente (stessa insidia di ogni campo di ricerca live).
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
    <div className={`min-h-screen md:pb-0 ${MOBILE_BOTTOMBAR_SPACER}`} style={{ background: TACCUINO_PAPER.base }}>
      <Navbar />

      <div className="max-w-[720px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8">
        <BackLink label="Mete" fallbackHref="/percorsi" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-2" />
        <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 32, color: TACCUINO_INK.typed }}>Cerca una Meta</h1>
        <p className="mt-0.5 mb-4" style={{ fontFamily: FONT.lora, fontSize: 12.5, color: TACCUINO_INK.handMuted }}>
          Tutti i modi per trovarne una nuova, e per ritrovare le tue.
        </p>
      </div>

      <main className="max-w-[720px] mx-auto px-5 sm:px-8 pb-8">
        {/* Campo unico — Fase 2: risponde subito con le due ricerche già veloci (Mete salvate +
            archivio Borghi/Siti), unite in due gruppi sotto. I flussi lunghi restano negli
            scaffali più giù, non in questo campo. */}
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
          <input
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
                    <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: TACCUINO_INK.handMuted }}>Fra le tue Mete</p>
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

        {/* Tre scaffali — un solo aperto alla volta, ogni voce rimanda alla schermata esistente
            invariata (piano Fase 1): nessun flusso riscritto qui, solo l'indice che mancava. */}
        <div className="flex flex-col gap-2.5">
          <Shelf
            metaType="sentiero"
            open={openShelf === 'sentiero'}
            onToggle={() => setOpenShelf(s => s === 'sentiero' ? 'sito' : 'sentiero')}
            trailingLabel={`${SENTIERI_ITEMS.length} modi`}
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
      </main>
    </div>
  )
}

// ── Scaffale ─────────────────────────────────────────────────────────────────

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
