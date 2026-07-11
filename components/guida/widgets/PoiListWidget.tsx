'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { fetchNearbyWiki } from '@/lib/wikipedia'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { TrackPoint } from '@/lib/tcxParser'
import { sectionHeading } from '@/components/routehub/overlayTheme'
import { ExternalLink } from 'lucide-react'
import PoiMap from '../PoiMap'

interface Props {
  pois: PoiItem[]
  poiWikiEntries: { poi: PoiItem; wiki: WikiPage }[]
  hasGps: boolean
  centerLat?: number
  centerLon?: number
  onWikiLoaded: (pages: WikiPage[]) => void
  /** Id del POI attualmente evidenziato (dalla mappa "Il percorso" o da un tap qui). */
  highlightedPoiId?: number | null
  /** Fired when a gallery card linked to a trail POI is tapped — lets the caller highlight the
   *  matching pin sulla mappa "Il percorso". */
  onItemTap?: (poi: PoiItem) => void
  trackPoints?: TrackPoint[]
  onOpenMap3D?: () => void
}

interface GalleryEntry {
  key: string
  title: string
  thumbnail: string
  url: string
  description?: string
  poiId?: number
}

function PoiCard({ entry, highlighted, onTap }: { entry: GalleryEntry; highlighted: boolean; onTap?: () => void }) {
  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onTap}
      className={`group flex flex-col shrink-0 w-40 sm:w-44 rounded-xl overflow-hidden border shadow-sm hover:shadow-md transition-all bg-white ${
        highlighted ? 'border-sky-400 ring-2 ring-sky-200' : 'border-stone-100 hover:border-stone-200'
      }`}
    >
      <div className="relative h-28 sm:h-32 overflow-hidden bg-stone-100">
        <Image
          src={entry.thumbnail}
          alt={entry.title}
          fill
          sizes="176px"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-2.5">
        <p className="font-display font-semibold text-stone-800 text-[14px] leading-tight line-clamp-1 tracking-wide">
          {entry.title}
        </p>
        {entry.description && (
          <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-1">{entry.description}</p>
        )}
        <span className="flex items-center gap-0.5 text-[10px] mt-1 text-terra-800">
          <ExternalLink className="w-2.5 h-2.5" /> Wikipedia
        </span>
      </div>
    </a>
  )
}

/** Mappa dei POI + galleria unica di tutti i luoghi con link esterno (POI del percorso con voce
 *  Wikipedia + articoli Wikipedia nei dintorni), senza ripetizioni — prima erano tre presentazioni
 *  separate (lista testuale, galleria foto, "Wikipedia nei dintorni") con dati in parte duplicati. */
export default function PoiListWidget({
  pois, poiWikiEntries, hasGps, centerLat, centerLon, onWikiLoaded, highlightedPoiId, onItemTap, trackPoints, onOpenMap3D,
}: Props) {
  const [nearbyPages, setNearbyPages] = useState<WikiPage[]>([])

  useEffect(() => {
    if (!hasGps || centerLat == null || centerLon == null) return
    let cancelled = false
    fetchNearbyWiki(centerLat, centerLon, 8000).then(pages => {
      if (cancelled) return
      setNearbyPages(pages)
      onWikiLoaded(pages)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGps, centerLat, centerLon])

  const galleryEntries = useMemo<GalleryEntry[]>(() => {
    const seen = new Set<string>()
    const out: GalleryEntry[] = []
    for (const { poi, wiki } of poiWikiEntries) {
      if (!wiki.thumbnail || seen.has(wiki.url)) continue
      seen.add(wiki.url)
      out.push({ key: `poi-${poi.id}`, title: wiki.title, thumbnail: wiki.thumbnail, url: wiki.url, description: wiki.description, poiId: poi.id })
    }
    for (const page of nearbyPages) {
      if (!page.thumbnail || seen.has(page.url)) continue
      seen.add(page.url)
      out.push({ key: `wiki-${page.pageid}`, title: page.title, thumbnail: page.thumbnail, url: page.url, description: page.description })
    }
    return out
  }, [poiWikiEntries, nearbyPages])

  return (
    <div className="space-y-3">
      <PoiMap
        trackPoints={trackPoints}
        pois={pois}
        highlightedPoiId={highlightedPoiId}
        onPoiTap={onItemTap}
        onOpenMap3D={onOpenMap3D}
      />

      <p className={`${sectionHeading} pt-1`}>Galleria</p>
      {galleryEntries.length === 0 ? (
        <p className="text-sm italic text-center py-8 text-stone-400">Nessun luogo con approfondimento trovato lungo il percorso.</p>
      ) : (
        <div data-hscroll className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {galleryEntries.map(entry => (
            <PoiCard
              key={entry.key}
              entry={entry}
              highlighted={entry.poiId != null && entry.poiId === highlightedPoiId}
              onTap={entry.poiId != null ? () => {
                const poi = pois.find(p => p.id === entry.poiId)
                if (poi) onItemTap?.(poi)
              } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
