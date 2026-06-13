import { format } from 'date-fns'
import { it }     from 'date-fns/locale'
import { formatDuration } from '@/lib/tcxParser'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }     from '@/lib/overpass'
import type { WikiPage }    from '@/lib/wikipedia'
import type { GuideData }   from '@/app/components/guide/GuideTemplate'
import type { POICardData } from '@/app/components/guide/GuidePOICard'

const SECTION_COLOR: Record<string, string> = {
  'prima di partire': '#d97706',
  'il percorso':      '#16a34a',
  'i luoghi':         '#7c3aed',
  'la natura':        '#0f766e',
  'sapori':           '#b45309',
  'consigli':         '#0369a1',
}

const POI_COLORS: Record<string, string> = {
  peak:          '#6346cc',
  hut:           '#166534',
  bivouac:       '#166534',
  castle:        '#7c3aed',
  archaeological:'#782d0a',
  ruins:         '#782d0a',
  waterfall:     '#0369a1',
  cave:          '#44403c',
  viewpoint:     '#0f766e',
}

const POI_LABELS: Record<string, string> = {
  peak: 'Cima', hut: 'Rifugio', bivouac: 'Bivacco', spring: 'Sorgente',
  viewpoint: 'Belvedere', cross: 'Croce', pass: 'Valico', waterfall: 'Cascata',
  cave: 'Grotta', shelter: 'Riparo', ruins: 'Rovine', archaeological: 'Sito arch.',
  castle: 'Castello', fountain: 'Fontana', chapel: 'Cappella',
  tower: 'Torre', monument: 'Monumento',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sectionColor(title: string): string {
  const lc = title.toLowerCase()
  const entries = Object.entries(SECTION_COLOR)
  for (let i = 0; i < entries.length; i++) {
    if (lc.includes(entries[i][0])) return entries[i][1]
  }
  return '#d97706'
}

/** Parse the raw markdown guide into a section map keyed by title prefix */
function parseSections(guideText: string): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const part of guideText.split(/^## /m).filter(Boolean)) {
    const nl    = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    if (title) entries.push([title.toLowerCase(), body])
  }
  return entries
}

function findSection(sections: Array<[string, string]>, key: string): string {
  const entry = sections.find(([k]) => k.includes(key))
  return entry ? entry[1] : ''
}

function distLabel(m: number): string {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(1)} km`
}

export function buildGuideContent(
  hike: PlannedHike,
  guideText: string,
  mapImage: string,
  thumbs: Map<number, string>,
  coverPhotos: string[] = [],
): GuideData {
  const sections = parseSections(guideText)

  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois   ?? []) as PoiItem[]

  // Build POI card data
  const pois: POICardData[] = [
    ...wikiEntries.map(({ poi, wiki }): POICardData => ({
      name:              wiki.title,
      type:              POI_LABELS[poi.type] ?? poi.type,
      typeColor:         POI_COLORS[poi.type] ?? '#d97706',
      distanceFromTrail: distLabel(poi.distFromTrack),
      photo:             thumbs.get(wiki.pageid),
      description:       (wiki.extract ?? '').slice(0, 300).replace(/\n/g, ' '),
    })),
    ...rawPois
      .filter(p => !wikiEntries.some(e => e.poi.id === p.id) && p.name)
      .map((p): POICardData => ({
        name:              p.name!,
        type:              POI_LABELS[p.type] ?? p.type,
        typeColor:         POI_COLORS[p.type] ?? '#d97706',
        distanceFromTrail: distLabel(p.distFromTrack),
        description:       '',
      })),
  ]

  const dateStr = hike.plannedDate
    ? format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    : undefined

  const categoryTag = (hike.tags?.[0] ?? hike.assessment?.difficulty ?? 'Escursione')
    .slice(0, 30)
    .toUpperCase()

  // First wiki thumbnail as fallback section photo
  const firstWikiThumb = wikiEntries.find(e => thumbs.has(e.wiki.pageid))
  const wikiThumbUrl = firstWikiThumb ? thumbs.get(firstWikiThumb.wiki.pageid) : undefined

  const p = coverPhotos  // shorthand: p[0]=cover, p[1..]=sections

  return {
    title:       hike.title,
    date:        dateStr,
    categoryTag,
    coverPhoto:  p[0],
    mapImage,
    stats: {
      km:         parseFloat((hike.distanceMeters / 1000).toFixed(1)),
      dplus:      Math.round(hike.elevationGain),
      duration:   formatDuration(hike.estimatedTimeSeconds),
      difficulty: hike.assessment?.difficulty ?? '',
      maxEle:     Math.round(hike.altitudeMax),
    },
    sections: {
      primadiPartire: { text: findSection(sections, 'prima di partire'), photo: p[1] },
      ilPercorso:     { text: findSection(sections, 'il percorso'),       photo: p[2] },
      iLuoghi:        findSection(sections, 'i luoghi')
        ? { text: findSection(sections, 'i luoghi'), photo: p[3] ?? wikiThumbUrl }
        : undefined,
      laNatura:       findSection(sections, 'la natura')
        ? { text: findSection(sections, 'la natura'), photo: p[4] }
        : undefined,
      sapori:         findSection(sections, 'sapori')
        ? { text: findSection(sections, 'sapori'), photo: p[5] }
        : undefined,
      consigliFinali: { text: findSection(sections, 'consigli') },
    },
    pois,
  }
}
