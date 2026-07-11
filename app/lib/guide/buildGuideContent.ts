import { format } from 'date-fns'
import { it }     from 'date-fns/locale'
import { formatDuration } from '@/lib/tcxParser'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }     from '@/lib/overpass'
import { POI_META }         from '@/lib/overpass'
import type { WikiPage }    from '@/lib/wikipedia'
import type { GuideData }   from '@/app/components/guide/GuideTemplate'
import type { POICardData } from '@/app/components/guide/GuidePOICard'

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

// 0..1 fill for the overview page's difficulty gauge — same 4 labels used
// throughout the app (components/routehub/AssessmentPanel.tsx).
const DIFFICULTY_LEVEL: Record<string, number> = {
  facile: 0.22, moderata: 0.48, impegnativa: 0.74, estrema: 0.96,
}

/** Downsampled altitude series for the "terrain band" decorative chart shown
 *  in place of a missing section photo — same idea as lib/downsamplePolyline.ts
 *  but for elevation instead of lat/lon. */
function downsampleElevation(hike: PlannedHike, maxPts = 40): number[] {
  const alts = (hike.trackPoints ?? [])
    .map(p => p.altitudeMeters)
    .filter((a): a is number => a !== undefined)
  if (alts.length === 0) return []
  if (alts.length <= maxPts) return alts
  const step = (alts.length - 1) / (maxPts - 1)
  return Array.from({ length: maxPts }, (_, i) => alts[Math.round(i * step)])
}

export function buildGuideContent(
  hike: PlannedHike,
  guideText: string,
  mapImage: string,
  thumbs: Map<number, string>,
  coverPhotos: string[] = [],
  miniMapImage?: string,
): GuideData {
  const sections = parseSections(guideText)

  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois   ?? []) as PoiItem[]

  // Build POI card data
  const pois: POICardData[] = [
    ...wikiEntries.map(({ poi, wiki }): POICardData => ({
      name:              wiki.title,
      type:              POI_META[poi.type]?.label ?? poi.type,
      typeColor:         POI_META[poi.type]?.color ?? '#978e7a',
      emoji:             POI_META[poi.type]?.emoji,
      distanceFromTrail: distLabel(poi.distFromTrack),
      photo:             thumbs.get(wiki.pageid),
      description:       (wiki.extract ?? '').slice(0, 300).replace(/\n/g, ' '),
    })),
    ...rawPois
      .filter(p => !wikiEntries.some(e => e.poi.id === p.id) && p.name)
      .map((p): POICardData => ({
        name:              p.name!,
        type:              POI_META[p.type]?.label ?? p.type,
        typeColor:         POI_META[p.type]?.color ?? '#978e7a',
        emoji:             POI_META[p.type]?.emoji,
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

  // Cover uses the route map (fit: 'cover', see usePDFExport.ts), not a Wikimedia photo —
  // same call already made for the on-screen hero (GuideHero.tsx): always the route, never
  // dependent on whether a decent nearby photo happens to exist. That frees every fetched
  // photo below for the sections/POI spotlight that actually use them.
  const p = coverPhotos  // shorthand: p[0]=prima di partire, p[1]=il percorso, p[2]=natura, p[3]=sapori

  const difficulty = hike.assessment?.difficulty ?? ''

  return {
    title:       hike.title,
    date:        dateStr,
    categoryTag,
    mapImage,
    miniMapImage,
    elevationProfile: downsampleElevation(hike),
    difficultyLevel: DIFFICULTY_LEVEL[difficulty] ?? 0.3,
    stats: {
      km:         parseFloat((hike.distanceMeters / 1000).toFixed(1)),
      dplus:      Math.round(hike.elevationGain),
      duration:   formatDuration(hike.estimatedTimeSeconds),
      difficulty,
      maxEle:     Math.round(hike.altitudeMax),
    },
    sections: {
      primadiPartire: { text: findSection(sections, 'prima di partire'), photo: p[0] },
      ilPercorso:     { text: findSection(sections, 'il percorso'),       photo: p[1] },
      iLuoghi:        findSection(sections, 'i luoghi')
        ? { text: findSection(sections, 'i luoghi') }
        : undefined,
      laNatura:       findSection(sections, 'la natura')
        ? { text: findSection(sections, 'la natura'), photo: p[2] }
        : undefined,
      sapori:         findSection(sections, 'sapori')
        ? { text: findSection(sections, 'sapori'), photo: p[3] }
        : undefined,
      consigliFinali: { text: findSection(sections, 'consigli') },
    },
    pois,
  }
}
