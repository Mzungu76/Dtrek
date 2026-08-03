'use client'
import { useRef } from 'react'
import Image from 'next/image'
import { ArrowUpDown, CalendarClock, Search, Star, X } from 'lucide-react'
import { MiniScoreRing } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import { ctsLabel } from '@/lib/trailScore'
import { GalleryMapThumb, SORT_OPTIONS_BY_MODE, type SortKey } from './BottomGallery'
import type { HubMode, RouteHubItem } from './types'

interface Props {
  mode: HubMode
  /** Stesso array (già ordinato/filtrato) passato a BottomGallery — vedi la nota su quel prop lì:
   *  elenco e carosello devono sempre concordare su cosa significa "indice N". */
  items: RouteHubItem[]
  currentId: string
  onSelect: (index: number) => void
  onClose: () => void
  sortBy: SortKey
  onSortChange: (key: SortKey) => void
  favoritesFilter?: boolean
  onToggleFavoritesFilter?: () => void
  /** Sottosezione di "Preferiti" — vedi BottomGallery.tsx e RouteHub.tsx. */
  nextOutingFilter?: boolean
  onToggleNextOutingFilter?: () => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
}

/** Vista alternativa alla galleria a striscia orizzontale, in stile Google Maps: elenco verticale
 *  a schermo intero con mappa + dati essenziali per riga invece di miniature 80×80 — utile con
 *  molti percorsi o titoli lunghi (che qui vanno a capo invece di troncarsi). Stessi controlli di
 *  ricerca/ordinamento/preferiti di BottomGallery.tsx, non duplicati con una logica propria. */
export default function ExpandedGalleryList({
  mode, items, currentId, onSelect, onClose, sortBy, onSortChange,
  favoritesFilter, onToggleFavoritesFilter, nextOutingFilter, onToggleNextOutingFilter,
  searchQuery, onSearchQueryChange,
}: Props) {
  const hasSortData = items.some(i => i.sortValues)
  const hasDistance = items.some(i => i.sortValues?.distance != null)
  const sortOptions = SORT_OPTIONS_BY_MODE[mode].filter(o => o.id !== 'distance' || hasDistance)
  // Trascina verso il basso per chiudere — stessa soglia fissa (60px) usata altrove nell'app per
  // gesti di dismissione a singolo asse (vedi PhotoLightbox.tsx, soglia 50px sull'asse orizzontale).
  const touchStartY = useRef<number | null>(null)

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1a24] flex flex-col">
      <div
        className="shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 border-b border-white/10"
        onTouchStart={e => { touchStartY.current = e.touches[0].clientY }}
        onTouchEnd={e => {
          if (touchStartY.current == null) return
          const dy = e.changedTouches[0].clientY - touchStartY.current
          touchStartY.current = null
          if (dy > 60) onClose()
        }}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-white/25 mb-3" />
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-base font-bold text-white">Tutti i percorsi</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi elenco"
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative mb-2.5">
          <Search className="w-3.5 h-3.5 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            placeholder="Cerca per titolo…"
            className="w-full pl-8 pr-8 py-2 rounded-full bg-white/10 border border-white/20 text-[13px] text-white placeholder:text-white/40 outline-none focus:border-white/40"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {(hasSortData || onToggleFavoritesFilter) && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {onToggleFavoritesFilter && (
              <button
                onClick={onToggleFavoritesFilter}
                title="Solo preferiti"
                className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full border backdrop-blur-md transition-colors ${
                  favoritesFilter ? 'bg-terra-400 border-terra-300 text-white' : 'bg-black/40 text-stone-200 border-white/20'
                }`}
              >
                <Star className="w-3 h-3" fill={favoritesFilter ? 'currentColor' : 'none'} />
              </button>
            )}
            {favoritesFilter && onToggleNextOutingFilter && (
              <button
                onClick={onToggleNextOutingFilter}
                title="Solo le uscite già programmate, in ordine di data"
                className={`shrink-0 flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full border backdrop-blur-md text-[10px] font-bold transition-colors ${
                  nextOutingFilter ? 'bg-sky-400 border-sky-300 text-white' : 'bg-black/40 text-stone-200 border-white/20'
                }`}
              >
                <CalendarClock className="w-3 h-3" /> Prossima uscita
              </button>
            )}
            {/* Vedi BottomGallery.tsx: in "Prossima uscita" l'ordine è il calendario, non `sortBy`. */}
            {hasSortData && !(favoritesFilter && nextOutingFilter) && <ArrowUpDown className="w-3 h-3 text-white/50 shrink-0" />}
            {!(favoritesFilter && nextOutingFilter) && sortOptions.map(s => (
              <button
                key={s.id}
                onClick={() => onSortChange(s.id)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md transition-colors ${
                  sortBy === s.id ? 'bg-white text-stone-800 border-white' : 'bg-black/40 text-stone-200 border-white/20'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        {items.length === 0 ? (
          <p className="text-center text-white/50 text-sm mt-10">Nessun percorso trovato.</p>
        ) : items.map((item, i) => (
          <ListRow key={item.id} item={item} mode={mode} isCurrent={item.id === currentId} onSelect={() => onSelect(i)} />
        ))}
      </div>
    </div>
  )
}

function ListRow({ item, mode, isCurrent, onSelect }: {
  item: RouteHubItem; mode: HubMode; isCurrent: boolean; onSelect: () => void
}) {
  return (
    <button onClick={onSelect} className="w-full flex items-center gap-3 py-3 text-left border-b border-white/10">
      <div className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden relative ${isCurrent ? 'ring-2 ring-sky-400' : ''}`}>
        {item.coverPhotoUrl ? (
          <>
            <Image src={item.coverPhotoUrl} alt={item.title} fill sizes="64px" className="object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          </>
        ) : (
          <GalleryMapThumb polyline={item.polyline} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-white leading-snug">{item.title}</p>
        {mode === 'guida' && item.scorePreview && item.safetyPreview && (
          <p className="text-[10px] font-semibold text-white/60 mt-0.5">
            {ctsLabel(item.scorePreview.value).label} · {item.safetyPreview.label}
          </p>
        )}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
          {item.statPills.map((p, idx) => (
            <span key={idx} className="flex items-center gap-1 text-[11px] font-medium text-white/75">
              <p.icon className="w-3 h-3 text-white/50" /> {p.label}
            </span>
          ))}
        </div>
      </div>
      {mode === 'guida' && item.scorePreview && (
        <div className="shrink-0">
          <TrailScoreGaugeBadge total={item.scorePreview.value} safety={item.safetyPreview ?? null} size={36} showLabel={false} />
        </div>
      )}
      {mode === 'resoconto' && item.scorePreview && (
        <div className="shrink-0">
          <MiniScoreRing value={item.scorePreview.value} max={item.scorePreview.max} color={item.scorePreview.color} size={28} />
        </div>
      )}
    </button>
  )
}
