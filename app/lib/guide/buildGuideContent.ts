import { format } from 'date-fns'
import { it }     from 'date-fns/locale'
import { formatDuration } from '@/lib/tcxParser'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }     from '@/lib/overpass'
import { POI_META }         from '@/lib/overpass'
import type { WikiPage }    from '@/lib/wikipedia'
import type { GuideData }   from '@/app/components/guide/GuideTemplate'
import type { GuideSectionPhoto } from '@/app/components/guide/GuideSection'
import type { POICardData } from '@/app/components/guide/GuidePOICard'
import { normalizeGuideNotices } from '@/lib/guideNotices'
import { downsampleSeries } from '@/lib/elevationSvgPath'

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
  return downsampleSeries(alts, maxPts)
}

export function buildGuideContent(
  hike: PlannedHike,
  guideText: string,
  mapImage: string,
  thumbs: Map<number, string>,
  coverPhotos: GuideSectionPhoto[] = [],
  miniMapImage?: string,
  /** Cache condivisa per-POI (lib/poiNotes.ts) — quando presente per un POI, sostituisce il
   *  semplice estratto Wikipedia con il racconto più ricco già scritto dalla sezione "I luoghi da
   *  non perdere" (decisione 1/2, artifact "La Guida IA"). Facoltativo e vuoto di default: i
   *  chiamanti che non prefetchano nulla (nessuno oggi, a parte usePDFExport.ts) si comportano
   *  esattamente come prima. */
  poiNotes: Map<number, string> = new Map(),
): GuideData {
  const sections = parseSections(guideText)

  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois   ?? []) as PoiItem[]

  // Testo più lungo di un estratto Wikipedia (fino a ~200 parole/luogo vs 300 caratteri): margine
  // più ampio solo quando la fonte è la nota IA per-POI, non quella Wikipedia troncata sotto.
  const MAX_NOTE_DESC_CHARS = 500

  // Build POI card data
  const pois: POICardData[] = [
    ...wikiEntries.map(({ poi, wiki }): POICardData => {
      const note = poiNotes.get(poi.id)
      return {
        name:              wiki.title,
        type:              POI_META[poi.type]?.label ?? poi.type,
        typeColor:         POI_META[poi.type]?.color ?? '#978e7a',
        emoji:             POI_META[poi.type]?.emoji,
        distanceFromTrail: distLabel(poi.distFromTrack),
        photo:             thumbs.get(wiki.pageid),
        description:       note
          ? note.slice(0, MAX_NOTE_DESC_CHARS)
          : (wiki.extract ?? '').slice(0, 300).replace(/\n/g, ' '),
      }
    }),
    ...rawPois
      .filter(p => !wikiEntries.some(e => e.poi.id === p.id) && p.name)
      .map((p): POICardData => ({
        name:              p.name!,
        type:              POI_META[p.type]?.label ?? p.type,
        typeColor:         POI_META[p.type]?.color ?? '#978e7a',
        emoji:             POI_META[p.type]?.emoji,
        distanceFromTrail: distLabel(p.distFromTrack),
        description:       (poiNotes.get(p.id) ?? '').slice(0, MAX_NOTE_DESC_CHARS),
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
      // Tre sezioni prima assenti dal PDF (B14): mappate solo a schermo (components/guida/
      // GuideReader.tsx, via lib/guideSections.ts), mai qui — il PDF si fermava alle prime 6
      // chiavi su 9. "Verificato online" è testo puro come le altre: notices/sources vengono
      // aggiunti a parte, sotto, perché sono dati strutturati (hike.cachedGuideNotices/
      // cachedGuideSources), non testo dentro guideText.
      verificato:     findSection(sections, 'verificato')
        ? { text: findSection(sections, 'verificato') }
        : undefined,
      datiSicurezza:  findSection(sections, 'sicurezza')
        ? { text: findSection(sections, 'sicurezza') }
        : undefined,
      suMisura:       findSection(sections, 'su misura')
        ? { text: findSection(sections, 'su misura') }
        : undefined,
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
    notices: normalizeGuideNotices(hike.cachedGuideNotices),
    sources: (hike.cachedGuideSources ?? []).map(s => ({ title: s.title })),
    assessment: hike.assessment,
    pois,
  }
}
