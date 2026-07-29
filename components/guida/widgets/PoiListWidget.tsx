'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { fetchNearbyWiki, isSpecificName } from '@/lib/wikipedia'
import type { PoiItem, PoiType } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { TrackPoint } from '@/lib/tcxParser'
import { sectionHeading } from '@/components/routehub/overlayTheme'
import { ExternalLink, Navigation } from 'lucide-react'
import { streetViewUrl } from '@/lib/overpass'
import { NamedPoiIcon, GroupPoiBadge } from '@/components/PoiIconChip'
import PoiMap from '../PoiMap'
import ReturnOptionsSection from './ReturnOptionsSection'
import { buildReturnOptionMapsUrl, type ReturnOption } from '@/lib/routeBuilder/returnOptions'

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
  /** Percorso a sola andata — servizi di trasporto trovati entro 1 km dal punto di arrivo (vedi
   *  lib/routeBuilder/returnOptions.ts) — null mentre in caricamento, array vuoto se nessuno
   *  trovato, undefined quando il percorso non è a sola andata (nessuna sottosezione). */
  returnOptions?: ReturnOption[] | null
  /** Punto di arrivo del percorso — origine dei link "indicazioni" verso ciascun servizio. Presente
   *  sempre insieme a `returnOptions` (entrambi da GuideReader.tsx). */
  returnOptionsOrigin?: { lat: number; lon: number }
  /** Data impostata per il percorso (hike.plannedDate) — se presente, ReturnOptionsSection avvisa
   *  che Maps mostra gli orari di "adesso" e va cambiata a mano per quel giorno. */
  plannedDate?: string
}

interface GalleryEntry {
  key: string
  title: string
  thumbnail: string
  url: string
  description?: string
  poiId?: number
  /** Assente per un articolo Wikipedia nei dintorni senza coordinate proprie — niente link Street
   *  View in quel caso, non c'è un punto preciso a cui puntarlo. */
  lat?: number
  lon?: number
}

type OtherEntry =
  | { kind: 'named'; poi: PoiItem }
  | { kind: 'group'; type: PoiType; pois: PoiItem[] }

function otherEntryDist(entry: OtherEntry): number {
  return entry.kind === 'named' ? entry.poi.distFromTrack : Math.min(...entry.pois.map(p => p.distFromTrack))
}

function PoiCard({ entry, highlighted, dimmed, onTap }: { entry: GalleryEntry; highlighted: boolean; dimmed?: boolean; onTap?: () => void }) {
  return (
    <div
      className={`group relative flex flex-col shrink-0 w-40 sm:w-44 rounded-xl overflow-hidden border shadow-sm hover:shadow-md transition-all bg-white ${
        highlighted ? 'border-sky-400 ring-2 ring-sky-200' : 'border-stone-100 hover:border-stone-200'
      } ${dimmed ? 'opacity-35 grayscale' : ''}`}
    >
      <a href={entry.url} target="_blank" rel="noopener noreferrer" onClick={onTap}>
        <div className="relative h-28 sm:h-32 overflow-hidden bg-stone-100">
          <Image
            src={entry.thumbnail}
            alt={entry.title}
            fill
            sizes="176px"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="p-2.5 pb-1">
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
      {entry.lat != null && entry.lon != null && (
        <a
          href={streetViewUrl(entry.lat, entry.lon)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 mx-2.5 mb-2 mt-0.5 text-[10px] text-sky-700 hover:text-sky-800 w-fit"
        >
          <Navigation className="w-2.5 h-2.5" /> Street View
        </a>
      )}
    </div>
  )
}

/** Mappa dei POI + galleria unica di tutti i luoghi con link esterno (POI del percorso con voce
 *  Wikipedia + articoli Wikipedia nei dintorni), senza ripetizioni — prima erano tre presentazioni
 *  separate (lista testuale, galleria foto, "Wikipedia nei dintorni") con dati in parte duplicati. */
export default function PoiListWidget({
  pois, poiWikiEntries, hasGps, centerLat, centerLon, onWikiLoaded, highlightedPoiId, onItemTap, trackPoints, onOpenMap3D,
  returnOptions, returnOptionsOrigin, plannedDate,
}: Props) {
  const [nearbyPages, setNearbyPages] = useState<WikiPage[]>([])
  const [focusPoints, setFocusPoints] = useState<{ lat: number; lon: number }[] | null>(null)
  const [focusSignal, setFocusSignal] = useState(0)
  // Selezione di un gruppo (badge con contatore, es. "Rifugio ×3") — locale, a differenza di
  // highlightedPoiId (proprietà del genitore, serve anche per scrollare al paragrafo giusto in
  // GuideReader): un gruppo non ha un singolo POI a cui scrollare, quindi non serve farlo salire.
  // Ha priorità sul singolo POI evidenziato dal genitore mentre è attivo, così un click su un
  // badge sostituisce visivamente qualunque evidenziazione precedente.
  const [selectedGroupType, setSelectedGroupType] = useState<PoiType | null>(null)

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
      out.push({ key: `poi-${poi.id}`, title: wiki.title, thumbnail: wiki.thumbnail, url: wiki.url, description: wiki.description, poiId: poi.id, lat: poi.lat, lon: poi.lon })
    }
    for (const page of nearbyPages) {
      if (!page.thumbnail || seen.has(page.url)) continue
      seen.add(page.url)
      out.push({ key: `wiki-${page.pageid}`, title: page.title, thumbnail: page.thumbnail, url: page.url, description: page.description, lat: page.lat, lon: page.lon })
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

  // Un tap su un POI singolo (icona con nome, card galleria o pin mappa) annulla sempre la
  // selezione di gruppo corrente, così le due selezioni non restano attive insieme.
  const handleSingleTap = (poi: PoiItem) => {
    setSelectedGroupType(null)
    onItemTap?.(poi)
  }

  const handleGroupTap = (type: PoiType, groupPois: PoiItem[]) => {
    focusOnGroup(groupPois)
    setSelectedGroupType(prev => prev === type ? null : type)
  }

  const selectedGroup = selectedGroupType != null
    ? otherEntries.find((e): e is Extract<OtherEntry, { kind: 'group' }> => e.kind === 'group' && e.type === selectedGroupType)
    : undefined
  // Il gruppo selezionato ha priorità sul singolo POI evidenziato dal genitore — appena si
  // sceglie un gruppo, activeIds riflette SOLO i suoi membri finché non lo si deseleziona o non
  // si tocca un altro POI singolo (che a sua volta azzera selectedGroupType, vedi handleSingleTap).
  const activeIds = useMemo<Set<number> | null>(() => {
    if (selectedGroup) return new Set(selectedGroup.pois.map(p => p.id))
    if (highlightedPoiId != null) return new Set([highlightedPoiId])
    return null
  }, [selectedGroup, highlightedPoiId])

  // Pin dei servizi di trasporto per il ritorno sulla stessa mappa dei POI — un layer a parte
  // (returnMarkers, mai in `pois`) apposta per non influenzare il fit della mappa: questi punti
  // possono cadere ben fuori dal percorso, vedi il commento in components/MapView.tsx.
  const returnMarkers = useMemo(
    () => returnOptionsOrigin
      ? (returnOptions ?? []).map(opt => ({
          lat: opt.lat, lon: opt.lon, kind: opt.kind, label: opt.name || opt.label,
          mapsUrl: buildReturnOptionMapsUrl(returnOptionsOrigin, opt),
        }))
      : [],
    [returnOptions, returnOptionsOrigin],
  )

  return (
    <div className="space-y-3">
      <PoiMap
        trackPoints={trackPoints}
        pois={pois}
        highlightedPoiIds={activeIds}
        onPoiTap={handleSingleTap}
        onOpenMap3D={onOpenMap3D}
        focusPoints={focusPoints}
        focusSignal={focusSignal}
        returnMarkers={returnMarkers}
      />

      <p className={`${sectionHeading} pt-1`}>Galleria</p>

      {otherEntries.length > 0 && (
        <div data-hscroll className="flex gap-2.5 overflow-x-auto pt-2 pb-1 -mx-1 -mt-2 px-1">
          {otherEntries.map(entry => entry.kind === 'named' ? (
            <NamedPoiIcon
              key={`named-${entry.poi.id}`}
              poi={entry.poi}
              highlighted={!!activeIds?.has(entry.poi.id)}
              dimmed={activeIds != null && !activeIds.has(entry.poi.id)}
              onTap={() => handleSingleTap(entry.poi)}
            />
          ) : (
            <GroupPoiBadge
              key={`group-${entry.type}`}
              type={entry.type}
              pois={entry.pois}
              highlighted={selectedGroupType === entry.type}
              dimmed={activeIds != null && !entry.pois.some(p => activeIds!.has(p.id))}
              onTap={() => handleGroupTap(entry.type, entry.pois)}
            />
          ))}
        </div>
      )}

      {galleryEntries.length === 0 ? (
        otherEntries.length === 0 && (
          <p className="text-sm italic text-center py-8 text-stone-400">Nessun luogo trovato lungo il percorso.</p>
        )
      ) : (
        <div data-hscroll className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {galleryEntries.map(entry => (
            <PoiCard
              key={entry.key}
              entry={entry}
              highlighted={entry.poiId != null && !!activeIds?.has(entry.poiId)}
              dimmed={activeIds != null && (entry.poiId == null || !activeIds.has(entry.poiId))}
              onTap={entry.poiId != null ? () => {
                const poi = pois.find(p => p.id === entry.poiId)
                if (poi) handleSingleTap(poi)
              } : undefined}
            />
          ))}
        </div>
      )}

      {returnOptions !== undefined && returnOptionsOrigin && (
        <ReturnOptionsSection options={returnOptions} origin={returnOptionsOrigin} plannedDate={plannedDate} />
      )}
    </div>
  )
}
