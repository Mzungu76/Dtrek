'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { fetchNearbyWiki, isSpecificName } from '@/lib/wikipedia'
import type { PoiItem, PoiType } from '@/lib/overpass'
import { POI_META } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { TrackPoint } from '@/lib/tcxParser'
import { sectionHeading } from '@/components/routehub/overlayTheme'
import { ExternalLink } from 'lucide-react'
import { POI_ICON } from '@/components/poiIcons'
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

type OtherEntry =
  | { kind: 'named'; poi: PoiItem }
  | { kind: 'group'; type: PoiType; pois: PoiItem[] }

function otherEntryDist(entry: OtherEntry): number {
  return entry.kind === 'named' ? entry.poi.distFromTrack : Math.min(...entry.pois.map(p => p.distFromTrack))
}

function NamedPoiIcon({ poi, highlighted, onTap }: { poi: PoiItem; highlighted: boolean; onTap?: () => void }) {
  const Icon = POI_ICON[poi.type]
  const meta = POI_META[poi.type]
  return (
    <button
      onClick={onTap}
      className="flex flex-col shrink-0 self-start items-center w-16 gap-1.5 group"
    >
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-full shadow-sm shrink-0 transition-transform group-hover:scale-105"
        style={{ backgroundColor: meta.color, boxShadow: highlighted ? '0 0 0 3px #7dd3fc' : undefined }}
      >
        <Icon width={16} height={16} color="#fff" strokeWidth={2.25} />
      </span>
      <span className="text-[10px] leading-tight text-center text-stone-700 font-semibold line-clamp-2">
        {poi.name}
      </span>
    </button>
  )
}

function GroupPoiBadge({
  type, pois, onTap,
}: { type: PoiType; pois: PoiItem[]; onTap: () => void }) {
  const Icon = POI_ICON[type]
  const meta = POI_META[type]
  return (
    <button onClick={onTap} title={`${meta.label} × ${pois.length}`} className="relative self-start shrink-0 w-[38px] h-[38px] transition-transform active:scale-95">
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-full shadow-sm"
        style={{ backgroundColor: meta.color }}
      >
        <Icon width={16} height={16} color="#fff" strokeWidth={2.25} />
      </span>
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-forest-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
        {pois.length}
      </span>
    </button>
  )
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
  const [focusPoints, setFocusPoints] = useState<{ lat: number; lon: number }[] | null>(null)
  const [focusSignal, setFocusSignal] = useState(0)

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

  // POI senza foto Wikipedia in Galleria (compresi quelli con voce Wikipedia ma senza thumbnail) —
  // mostrati comunque come icone: singole con nome se hanno un nome specifico, raggruppate per
  // tipo con contatore se hanno solo il nome generico della categoria (o nessun nome). Nessun POI
  // viene nascosto: quelli qui restano comunque visibili come pin sulla mappa qui sopra.
  const otherEntries = useMemo<OtherEntry[]>(() => {
    const shownIds = new Set(galleryEntries.filter(e => e.poiId != null).map(e => e.poiId))
    const rest = pois.filter(p => !shownIds.has(p.id))
    const named: OtherEntry[] = []
    const groups = new Map<PoiType, PoiItem[]>()
    for (const poi of rest) {
      if (poi.name && isSpecificName(poi.name)) {
        named.push({ kind: 'named', poi })
      } else {
        const arr = groups.get(poi.type)
        if (arr) arr.push(poi)
        else groups.set(poi.type, [poi])
      }
    }
    const out: OtherEntry[] = [...named]
    for (const [type, poisOfType] of Array.from(groups)) out.push({ kind: 'group', type, pois: poisOfType })
    return out.sort((a, b) => otherEntryDist(a) - otherEntryDist(b))
  }, [pois, galleryEntries])

  const focusOnGroup = (groupPois: PoiItem[]) => {
    setFocusPoints(groupPois.map(p => ({ lat: p.lat, lon: p.lon })))
    setFocusSignal(s => s + 1)
  }

  return (
    <div className="space-y-3">
      <PoiMap
        trackPoints={trackPoints}
        pois={pois}
        highlightedPoiId={highlightedPoiId}
        onPoiTap={onItemTap}
        onOpenMap3D={onOpenMap3D}
        focusPoints={focusPoints}
        focusSignal={focusSignal}
      />

      <p className={`${sectionHeading} pt-1`}>Galleria</p>

      {otherEntries.length > 0 && (
        <div data-hscroll className="flex gap-2.5 overflow-x-auto pt-2 pb-1 -mx-1 -mt-2 px-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {otherEntries.map(entry => entry.kind === 'named' ? (
            <NamedPoiIcon
              key={`named-${entry.poi.id}`}
              poi={entry.poi}
              highlighted={entry.poi.id === highlightedPoiId}
              onTap={() => onItemTap?.(entry.poi)}
            />
          ) : (
            <GroupPoiBadge
              key={`group-${entry.type}`}
              type={entry.type}
              pois={entry.pois}
              onTap={() => focusOnGroup(entry.pois)}
            />
          ))}
        </div>
      )}

      {galleryEntries.length === 0 ? (
        otherEntries.length === 0 && (
          <p className="text-sm italic text-center py-8 text-stone-400">Nessun luogo trovato lungo il percorso.</p>
        )
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
