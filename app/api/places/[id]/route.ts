import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchSourceCounts } from '@/lib/metaSearch/placeQuery'
import { searchAndFetch } from '@/lib/wikipedia'
import { haversineM } from '@/lib/geoUtils'
import type { MetaType, SiteType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'

export interface PlaceDetail {
  id: string
  metaType: MetaType
  siteType: SiteType | null
  name: string
  description: string | null
  latitude: number
  longitude: number
  region: string | null
  province: string | null
  municipality: string | null
  address: string | null
  imageUrl: string | null
  officialUrl: string | null
  website: string | null
  openingHours: unknown
  source: string
  sourceCount: number
  confidence: number
  /** true quando latitude/longitude sono il centro del Comune, non la posizione reale del Sito —
   *  vedi supabase/migrations/recover_mic_sito_duplicate_coordinates_to_municipality_centroid.sql.
   *  La UI deve dirlo esplicitamente (mai una posizione approssimata spacciata per esatta). */
  coordinatesApproximate: boolean
  /** Solo per un Sito senza descrizione propria (la fonte MiC/ArCo non ne porta mai una — vedi
   *  scripts/places/mic/README.md, "nessun campo di descrizione testuale estesa") — un
   *  arricchimento best-effort da Wikipedia, mai al posto di un dato reale già presente. null
   *  quando non trovata, non applicabile (Borgo/Città) o non abbastanza vicina da fidarsene. */
  wikipedia: { extract: string; url: string; thumbnail?: string } | null
}

const WIKIPEDIA_MAX_DISTANCE_KM = 15

/**
 * GET /api/places/:id — un singolo Borgo/Città o Sito da dtrek_places, per la scheda di dettaglio
 * (app/mete/[id]/page.tsx). Ricerca solo (lib/metaSearch) restituisce righe di risultato, mai un
 * singolo record da aprire con un link stabile — questo endpoint è quel punto mancante. Un
 * 'sentiero' non passa mai da qui: la sua scheda resta /guida/[id] su planned_hikes, invariata
 * (piano §48.3).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data, error } = await supabase
    .from('dtrek_places')
    .select('id, name, meta_type, subtype, description, latitude, longitude, region, province, municipality, address, image_url, official_url, website, opening_hours, source, confidence, metadata')
    .eq('id', params.id)
    .in('meta_type', ['borgo_citta', 'sito'])
    .maybeSingle()

  if (error) {
    console.error('[places/:id]', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const sourceCounts = await fetchSourceCounts(supabase, [data.id])

  // Solo un Sito, solo quando manca già una descrizione — mai una seconda fonte a rimpiazzare un
  // dato reale già buono. searchAndFetch valida solo la somiglianza del titolo (lib/wikipedia.ts);
  // qui in più un controllo di prossimità, perché quel controllo lì manca (a differenza di
  // fetchWikiForNamedPois/isNearPoi) — senza, un nome generico rischierebbe di agganciare la voce
  // Wikipedia di un omonimo lontano.
  let wikipedia: PlaceDetail['wikipedia'] = null
  if (data.meta_type === 'sito' && !data.description) {
    try {
      const wiki = await searchAndFetch(data.name, 'it', 'wikipedia')
      const hasCoords = wiki?.lat != null && wiki?.lon != null
      const closeEnough = !hasCoords || haversineM(data.latitude, data.longitude, wiki!.lat!, wiki!.lon!) / 1000 <= WIKIPEDIA_MAX_DISTANCE_KM
      if (wiki && closeEnough) {
        wikipedia = { extract: wiki.extract, url: wiki.url, thumbnail: wiki.thumbnail }
      }
    } catch (e) {
      console.error('[places/:id] arricchimento Wikipedia fallito', e)
    }
  }

  // dtrek_places.subtype è una colonna condivisa a significato diverso per tipologia (lib/
  // metaTypes.ts): PlaceCategory ('borgo'|'citta') per un borgo_citta, SiteType per un sito —
  // valorizzare siteType anche per un borgo_citta manderebbe SITE_TYPE_CONFIG['borgo'] (chiave
  // inesistente) in giro fino a un crash sul primo `.label` letto (era esattamente il bug
  // segnalato: "Cannot read properties of undefined (reading 'label')" aprendo una scheda Borgo).
  const detail: PlaceDetail = {
    id: data.id,
    metaType: data.meta_type as MetaType,
    siteType: data.meta_type === 'sito' ? (data.subtype ?? null) as SiteType | null : null,
    name: data.name,
    description: data.description,
    latitude: data.latitude,
    longitude: data.longitude,
    region: data.region,
    province: data.province,
    municipality: data.municipality,
    address: data.address,
    imageUrl: data.image_url,
    officialUrl: data.official_url,
    website: data.website,
    openingHours: data.opening_hours,
    source: data.source,
    sourceCount: sourceCounts.get(data.id) ?? 1,
    confidence: data.confidence,
    coordinatesApproximate: (data.metadata as Record<string, unknown> | null)?.coordinatesApproximate === true,
    wikipedia,
  }
  return NextResponse.json(detail)
}
