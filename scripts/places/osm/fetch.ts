/**
 * OpenStreetMap — estratto regionale offline (.osm.pbf) → dtrek_places
 *
 * Il piano (§9, §21, §48.7) è esplicito: MAI Overpass live come motore principale della ricerca.
 * Questo script legge un estratto scaricato UNA VOLTA (non per-ricerca-utente) e lo importa nel
 * catalogo — `lib/pois/overpassSource.ts` resta il fetcher live per i Sentieri (piano §18, "non
 * toccare"), non duplicato qui.
 *
 * ── Fonte (verificata via WebSearch/WebFetch in questa sessione, 2026-08-30) ────────────────────
 *
 * Geofabrik (https://download.geofabrik.de/europe/italy.html) NON pubblica un estratto per singola
 * regione italiana — solo 5 macro-aree (Nord-Ovest/Nord-Est/Centro/Sud/Isole), il Lazio è dentro
 * "Centro" insieme a Toscana/Umbria/Marche/Abruzzo/Molise (troppo per un pilota regionale, piano
 * §42). Provider alternativo verificato con un estratto per-regione reale:
 *
 *     http://download.openstreetmap.fr/extracts/europe/italy/lazio-latest.osm.pbf   (~120 MB)
 *
 * (mirror comunitario OSM France, https://download.openstreetmap.fr/ — directory `extracts/`
 * confermata contenere `lazio-latest.osm.pbf`/`lazio.osm.pbf`/`lazio.state.txt` da un fetch reale
 * della pagina indice in questa sessione). Licenza: ODbL 1.0 — © OpenStreetMap contributors (piano
 * §44), attribuzione richiesta ovunque i dati vengano mostrati.
 *
 * Libreria di parsing: `osm-pbf-parser` (MIT/LGPL, pura JS, nessun binario nativo — installata
 * come devDependency in questa sessione). La forma degli oggetti restituiti (vedi
 * `scripts/places/osm.d.ts`) è verificata leggendo il sorgente pubblicato del pacchetto, non
 * documentazione di terze parti.
 *
 * ── Categorie (piano §9, stesse del README di questa cartella) ──────────────────────────────────
 * tourism=museum/gallery/attraction, historic=castle/archaeological_site/monument/ruins,
 * natural=waterfall/cave_entrance/peak/viewpoint/spring, amenity=place_of_worship.
 *
 * Il mapping verso SiteType riusa lo STILE di `HISTORIC_TYPE_MAP` in `lib/pois/overpassSource.ts`
 * (indicato come riferimento dal README di questa cartella) ma non i suoi valori — quel file mira
 * a `PoiType` (icone POI dei Sentieri), qui serve `SiteType` (piano `lib/metaTypes.ts`), un
 * vocabolario diverso; alcune categorie (peak, spring, ruins) non hanno un SiteType 1:1 — vedi i
 * commenti nella mappa sotto per la scelta fatta in ciascun caso.
 *
 * ── Nota tecnica: geometria way ────────────────────────────────────────────────────────────────
 * Un file .pbf garantisce l'ordine node→way→relation (stesso ordine dell'XML OSM che rappresenta),
 * quindi un singolo passaggio streaming può risolvere il centroide di una `way` tenendo in memoria
 * le coordinate dei nodi già visti. Per un estratto regionale (non l'Italia intera) questo è
 * accettabile; tiene in memoria un Map<node_id, [lat,lon]> per l'intero file — centinaia di MB per
 * un estratto da ~100MB, non testato in questa sessione (nessun accesso al file reale, vedi sotto).
 *
 * Usage:
 *   npx tsx scripts/places/osm/fetch.ts [--dry-run]
 *
 * File atteso in data/osm/ (gitignored, stesso pattern di data/ptpr/):
 *   lazio-latest.osm.pbf
 */
import fs from 'fs'
import path from 'path'
import parseOSM from 'osm-pbf-parser'
import type { OsmElement, OsmNode, OsmWay } from 'osm-pbf-parser'
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'
import type { SiteType } from '../../../lib/metaTypes'

const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright'
const SOURCE_FILE_URL = 'http://download.openstreetmap.fr/extracts/europe/italy/lazio-latest.osm.pbf'

// ── Tag OSM (chiave=valore ESATTO, non sottostringa — diverso da ISTAT/MiC perché qui la fonte
// usa un vocabolario di tag chiuso, non testo libero) → SiteType ───────────────────────────────
// Ogni riga commenta la scelta quando non esiste un SiteType 1:1.
const OSM_TAG_TO_SITE_TYPE: Record<string, SiteType> = {
  'tourism=museum':              'museo',
  'tourism=gallery':             'museo',       // nessun SiteType "galleria d'arte" separato
  'tourism=attraction':          'altro',       // troppo generico per una categoria specifica
  'historic=castle':             'castello',
  'historic=archaeological_site':'sito_archeologico',
  'historic=monument':           'monumento',
  'historic=ruins':              'altro',       // "ruderi" copre casi troppo eterogenei per un SiteType specifico
  'natural=waterfall':           'cascata',
  'natural=cave_entrance':       'grotta',
  'natural=peak':                'area_naturale', // nessun SiteType "vetta/cima" — piano non lo elenca
  'natural=viewpoint':           'belvedere',
  'natural=spring':              'area_naturale', // nessun SiteType "sorgente"
  'amenity=place_of_worship':    'chiesa',      // include anche luoghi di culto non cristiani — approssimazione dichiarata
}

function tagsToSiteType(tags: Record<string, string>): SiteType | null {
  for (const [pair, siteType] of Object.entries(OSM_TAG_TO_SITE_TYPE)) {
    const [key, value] = pair.split('=')
    if (tags[key] === value) return siteType
  }
  return null
}

function rawTypeOf(tags: Record<string, string>): string | undefined {
  for (const pair of Object.keys(OSM_TAG_TO_SITE_TYPE)) {
    const [key, value] = pair.split('=')
    if (tags[key] === value) return pair
  }
  return undefined
}

// ── Elemento OSM (con coordinate già risolte per una way) → PlaceCandidate ──────────────────────
// Pura, testabile senza rete/filesystem.
export function osmElementToPlaceCandidate(
  el: { type: 'node' | 'way'; id: number; tags: Record<string, string> },
  coords: { lat: number; lon: number } | null,
): PlaceCandidate | null {
  if (!coords) return null
  const siteType = tagsToSiteType(el.tags)
  if (!siteType) return null

  const name = el.tags.name || el.tags['name:it']
  if (!name) return null // scartiamo elementi senza nome — piano §24 "non mostrare dati senza significato"

  return {
    name,
    metaType: 'sito',
    subtype: siteType,
    latitude: coords.lat,
    longitude: coords.lon,
    region: 'Lazio',
    source: 'osm',
    // node/way + id numerico — univoco solo includendo il tipo di elemento (README della cartella).
    sourceId: `${el.type}/${el.id}`,
    sourceUrl: ATTRIBUTION_URL,
    rawType: rawTypeOf(el.tags),
    // Più basso di ISTAT/PTPR: un tag OSM è una mappatura diretta ma la fonte stessa è
    // crowdsourced, non un'anagrafe ufficiale (piano §14 lascia il confidence per-fonte a
    // discrezione del fetcher).
    confidence: 0.7,
    metadata: {
      osmType: el.type,
      osmId: el.id,
      wikidataTag: el.tags.wikidata,
    },
  }
}

// ── I/O: parsing streaming del .pbf (singolo passaggio, vedi nota di memoria in cima) ───────────
async function readCandidatesFromPbf(pbfPath: string): Promise<PlaceCandidate[]> {
  const nodeCoords = new Map<number, [number, number]>()
  const candidates: PlaceCandidate[] = []
  let nodesSeen = 0, waysSeen = 0

  const osm = parseOSM()

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(pbfPath)
      .pipe(osm)
      .on('data', (items: OsmElement[]) => {
        for (const item of items) {
          if (item.type === 'node') {
            const node = item as OsmNode
            nodeCoords.set(node.id, [node.lat, node.lon])
            nodesSeen++
            if (Object.keys(node.tags ?? {}).length > 0) {
              const c = osmElementToPlaceCandidate({ type: 'node', id: node.id, tags: node.tags }, { lat: node.lat, lon: node.lon })
              if (c) candidates.push(c)
            }
          } else if (item.type === 'way') {
            const way = item as OsmWay
            waysSeen++
            if (Object.keys(way.tags ?? {}).length === 0) continue
            const resolved = way.refs.map(r => nodeCoords.get(r)).filter((c): c is [number, number] => !!c)
            if (resolved.length === 0) continue
            const lat = resolved.reduce((s, c) => s + c[0], 0) / resolved.length
            const lon = resolved.reduce((s, c) => s + c[1], 0) / resolved.length
            const c = osmElementToPlaceCandidate({ type: 'way', id: way.id, tags: way.tags }, { lat, lon })
            if (c) candidates.push(c)
          }
          // Le relation non sono lette — nessuna delle categorie del piano §9 è tipicamente
          // taggata su una relation (vedi anche lib/pois/overpassSource.ts, stesso perimetro).
        }
      })
      .on('end', () => {
        console.log(`Letti ${nodesSeen} nodi, ${waysSeen} way.`)
        resolve()
      })
      .on('error', reject)
  })

  return candidates
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')

  const pbfPath = path.join(process.cwd(), 'data', 'osm', 'lazio-latest.osm.pbf')
  if (!fs.existsSync(pbfPath)) {
    console.error(`File non trovato: ${pbfPath}. Vedi data/osm/README.md — scaricare da ${SOURCE_FILE_URL}`)
    process.exit(1)
  }

  console.log(`Lettura ${pbfPath}…`)
  const candidates = await readCandidatesFromPbf(pbfPath)
  console.log(`${candidates.length} candidati con nome e categoria riconosciuta.`)

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
    return
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars, oppure usa --dry-run.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const stats = await importPlaceCandidates(supabase, candidates)
  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('osm')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
