'use client'
import Image from 'next/image'
import WikiCards from '@/components/WikiCards'
import { type PoiItem, POI_META } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { glassTile, glassTileHover, textMuted, textPrimary, sectionHeading } from '@/components/routehub/overlayTheme'
import { ExternalLink } from 'lucide-react'

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

function PoiCard({ title, thumbnail, url, description }: { title: string; thumbnail: string; url: string; description?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl overflow-hidden border border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-md transition-all bg-white"
    >
      <div className="relative h-40 overflow-hidden bg-stone-100">
        <Image
          src={thumbnail}
          alt={title}
          fill
          sizes="(max-width: 640px) 100vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-3">
        <p className="font-display font-semibold text-stone-800 text-[16px] leading-tight line-clamp-1 tracking-wide">
          {title}
        </p>
        {description && (
          <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">{description}</p>
        )}
        <span className="flex items-center gap-0.5 text-[10px] mt-1.5 text-terra-800">
          <ExternalLink className="w-2.5 h-2.5" /> Wikipedia
        </span>
      </div>
    </a>
  )
}

/** Card dei punti di interesse sul percorso + Wikipedia nei dintorni + galleria fotografica —
 *  la galleria riusa lo stesso `poiWikiEntries` già mostrato nella lista sopra (stessa fonte
 *  dati, due presentazioni: testo-forward e foto-forward) invece di essere una seconda card
 *  separata con dati in parte duplicati altrove nella guida. */
export default function PoiListWidget({
  pois, poiWikiEntries, hasGps, centerLat, centerLon, onWikiLoaded, highlightedIndex, itemRef, onItemTap,
}: Props) {
  const galleryEntries = poiWikiEntries.filter(e => e.wiki?.thumbnail)

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

      {galleryEntries.length > 0 && (
        <>
          <p className={`${sectionHeading} pt-2`}>Galleria fotografica</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {galleryEntries.map(({ poi, wiki }) => (
              <PoiCard key={poi.id} title={wiki.title} thumbnail={wiki.thumbnail!} url={wiki.url} description={wiki.description} />
            ))}
          </div>
        </>
      )}

      {hasGps && centerLat != null && centerLon != null && (
        <>
          <p className={`${sectionHeading} pt-2`}>Wikipedia nei dintorni</p>
          <WikiCards lat={centerLat} lon={centerLon} onLoaded={onWikiLoaded} />
        </>
      )}
    </div>
  )
}
