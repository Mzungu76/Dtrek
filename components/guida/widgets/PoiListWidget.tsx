'use client'
import Image from 'next/image'
import WikiCards from '@/components/WikiCards'
import { type PoiItem, POI_META } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { glassTile, glassTileHover, textMuted, textPrimary, sectionHeading } from '@/components/routehub/overlayTheme'

interface Props {
  pois: PoiItem[]
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  hasGps: boolean
  centerLat?: number
  centerLon?: number
  onWikiLoaded: (pages: WikiPage[]) => void
  highlightedIndex?: number | null
  itemRef?: (i: number) => (el: HTMLElement | null) => void
  /** Fired when a POI card is tapped — lets the caller highlight the matching pin on the map. */
  onItemTap?: (poi: PoiItem) => void
}

/** Card dei punti di interesse sul percorso + Wikipedia nei dintorni — spostati dalla vecchia
 *  tab "Punti di interesse" nella sezione "I luoghi da non perdere" della guida magazine. */
export default function PoiListWidget({
  pois, poiWikiEntries, hasGps, centerLat, centerLon, onWikiLoaded, highlightedIndex, itemRef, onItemTap,
}: Props) {
  return (
    <div className="space-y-3">
      <p className={sectionHeading}>Sul percorso</p>
      {pois.length === 0 && (
        <p className={`text-sm italic text-center py-8 ${textMuted}`}>Nessun punto di interesse trovato lungo il tracciato.</p>
      )}
      {pois.map((poi, i) => {
        const meta = POI_META[poi.type]
        const wiki = poiWikiEntries.find(e => e.poi.id === poi.id)?.wiki
        const highlighted = i === highlightedIndex
        const cardClass = `${glassTile} p-4 flex gap-3 transition-colors ${highlighted ? 'bg-sky-400/15 border-sky-400/40' : ''} ${wiki ? glassTileHover : ''}`
        const cardContent = (
          <>
            {wiki?.thumbnail
              ? <Image src={wiki.thumbnail} alt={wiki.title} width={64} height={64} className="w-16 h-16 object-cover rounded-xl shrink-0" />
              : <span className="w-16 h-16 rounded-xl bg-stone-100 flex items-center justify-center text-2xl shrink-0">{meta.emoji}</span>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1"><span className="text-base leading-none">{meta.emoji}</span><span className={`text-[10px] font-semibold uppercase tracking-wide ${textMuted}`}>{meta.label}</span>
                <span className="text-[10px] text-stone-400/50 ml-auto shrink-0">{poi.distFromTrack === 0 ? 'sul tracciato' : `${poi.distFromTrack} m`}</span>
              </div>
              <p className={`text-sm font-semibold leading-tight mb-1 ${textPrimary}`}>{wiki?.title ?? poi.name ?? meta.label}</p>
              {wiki && <p className={`text-xs leading-relaxed line-clamp-3 ${textMuted}`}>{wiki.extract.slice(0, 160)}{wiki.extract.length > 160 ? '…' : ''}</p>}
            </div>
          </>
        )
        return wiki ? (
          <a key={poi.id} ref={itemRef?.(i)} href={wiki.url} target="_blank" rel="noopener noreferrer" className={cardClass} onClick={() => onItemTap?.(poi)}>
            {cardContent}
          </a>
        ) : (
          <div key={poi.id} ref={itemRef?.(i)} className={cardClass} onClick={() => onItemTap?.(poi)}>
            {cardContent}
          </div>
        )
      })}
      {hasGps && centerLat != null && centerLon != null && (
        <>
          <p className={`${sectionHeading} pt-2`}>Wikipedia nei dintorni</p>
          <WikiCards lat={centerLat} lon={centerLon} onLoaded={onWikiLoaded} />
        </>
      )}
    </div>
  )
}
