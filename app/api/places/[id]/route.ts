import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchSourceCounts } from '@/lib/metaSearch/placeQuery'
import { fetchRelatedPlaces, type RelatedPlace } from '@/lib/metaSearch/placeRelations'
import { searchAndFetch, fetchExtendedExtract } from '@/lib/wikipedia'
import { fetchPlaceCoverPhoto } from '@/lib/placePhotoCache'
import { getMuseumOpere, type MuseumOpera } from '@/lib/museumOpere'
import { haversineM } from '@/lib/geoUtils'
import { inferSiteTypeFromName, type MetaType, type SiteType } from '@/lib/metaTypes'

// L'importer PTPR (scripts/import-ptpr.ts) compone `description` da campi tipologici del
// shapefile (spesso solo un codice numerico, es. "Tipo: 76") più questa attribuzione obbligatoria
// — MAI vuota, quindi un Sito da PTPR ha sempre un `description` non-null anche senza un solo
// carattere di prosa reale. Trattarla come "descrizione già buona" (il criterio originale, prima
// di questo controllo) blocca l'arricchimento Wikipedia per ogni Sito PTPR, sempre — non un caso
// raro, la norma. Nessun modo affidabile di riconoscere un vero campo NOTE_ testuale da un codice
// senza un campo dedicato nell'import (fuori scopo qui); il controllo minimo e sicuro è escludere
// il caso più comune e più povero, quando restano meno di 15 caratteri dopo aver tolto
// l'attribuzione.
const PTPR_ATTRIBUTION = 'PTPR Regione Lazio — Tavola B (CC BY 4.0)'
const MIN_SUBSTANTIVE_DESCRIPTION_CHARS = 15

function isSubstantiveDescription(description: string | null): boolean {
  if (!description) return false
  const withoutAttribution = description.replace(PTPR_ATTRIBUTION, '').replace(/·\s*$/, '').trim()
  return withoutAttribution.length >= MIN_SUBSTANTIVE_DESCRIPTION_CHARS
}

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
  /** Attribuzione da mostrare accanto a imageUrl quando viene da Wikimedia Commons (quasi sempre
   *  CC BY-SA) — vedi lib/placePhotoCache.ts. */
  imageCredit: string | null
  officialUrl: string | null
  website: string | null
  // supabase/migrations/add_places_contacts.sql (MIC_DATA_SOURCES.md §12) — letti con una query
  // separata, MAI aggiunti alla select principale sopra: finché quella migration non è applicata
  // sul progetto Supabase in uso, selezionare una colonna inesistente lì farebbe fallire con un 500
  // la scheda di OGNI Meta, non solo quelle senza contatti — stesso rischio già documentato per
  // image_credit/image_checked_at. null finché la migration non è applicata, o quando la fonte non
  // li fornisce.
  phone: string | null
  email: string | null
  openingHours: unknown
  source: string
  sourceCount: number
  confidence: number
  /** true quando latitude/longitude sono il centro del Comune, non la posizione reale del Sito —
   *  vedi supabase/migrations/recover_mic_sito_duplicate_coordinates_to_municipality_centroid.sql.
   *  La UI deve dirlo esplicitamente (mai una posizione approssimata spacciata per esatta). */
  coordinatesApproximate: boolean
  /** Popolato quando manca una foto propria o una descrizione propria SOSTANZIALE (Borgo/Città non
   *  ha mai una foto dall'import ISTAT; un Sito da PTPR ha sempre una `description` ma spesso solo
   *  un codice tipologico + attribuzione, vedi
   *  isSubstantiveDescription) — un arricchimento best-effort da Wikipedia, mai al posto di un dato
   *  reale già presente: `thumbnail` colma solo `imageUrl` assente, `extract` colma solo
   *  `description` assente/non sostanziale (qui `description` riflette già quel giudizio — vedi
   *  sotto). null quando non trovata, o non abbastanza vicina da fidarsene. */
  wikipedia: { extract: string; url: string; thumbnail?: string } | null
  /** "Vicino a te"/"Fa parte di" (piano §51.6) — da dtrek_place_relations, oggi quasi sempre
   *  vuoto finché quei dati non vengono importati (vedi lib/metaSearch/placeRelations.ts). */
  relatedPlaces: RelatedPlace[]
  /** "Opere di questo museo" (docs/opere-musei-wikidata.md) — solo per siteType 'museo', da
   *  Wikidata (P195/P276), con cache su dtrek_places (lib/museumOpere.ts). Quasi sempre [] per un
   *  museo locale/tematico (atteso, non un errore: "opere d'arte catalogate" non è pertinente per
   *  la maggioranza dei musei già in Dtrek) — mai un blocco vuoto o un errore, solo un array vuoto
   *  che la UI nasconde silenziosamente (stesso principio di relatedPlaces). Sempre [] per
   *  qualunque Meta che non sia un museo. */
  opere: MuseumOpera[]
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
    // image_credit/image_checked_at (supabase/migrations/add_place_photo_cache_columns.sql) NON
    // vanno qui: questa query gira per OGNI Meta aperta, prima ancora di sapere se serve una foto
    // — se la migration non è ancora stata applicata sul progetto Supabase in uso, selezionare una
    // colonna inesistente fa fallire l'intera query con un 500 ("Errore interno" su qualunque pin,
    // visto dal vivo su una preview Vercel senza la migration). image_credit resta letto SOLO
    // dentro lib/placePhotoCache.ts, che gestisce già la sua assenza senza propagare l'errore qui.
    .select('id, name, meta_type, subtype, description, latitude, longitude, region, province, municipality, address, image_url, official_url, website, opening_hours, source, confidence, metadata, wikidata_id')
    .eq('id', params.id)
    .in('meta_type', ['borgo_citta', 'sito'])
    .maybeSingle()

  if (error) {
    console.error('[places/:id]', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  // Risposta leggera per la galleria (app/guida/GuidaHub.tsx, riempimento in background di
  // copertina/orario per OGNI Meta Borgo/Città o Sito) — quella chiamata legge solo imageUrl/
  // openingHours, mai contatti/sourceCounts/relatedPlaces né l'arricchimento Wikipedia della
  // DESCRIZIONE sotto (tre query Supabase + una ricerca Wikipedia in più, lavoro reale ma
  // sprecato per una copertina — verifica utente: "le immagini delle copertine sono lentissime da
  // caricarsi"). Stessa cascata foto di sotto (fetchPlaceCoverPhoto, con la sua cache su
  // dtrek_places.image_url — da qui in poi anche questo resta una singola SELECT), il resto
  // saltato del tutto.
  if (req.nextUrl.searchParams.get('fields') === 'cover') {
    let coverPhoto: { url: string; credit: string | null } | null = null
    if (!data.image_url) {
      coverPhoto = await fetchPlaceCoverPhoto({
        id: data.id, name: data.name, lat: data.latitude, lon: data.longitude, wikidataId: data.wikidata_id,
      })
    }
    return NextResponse.json({
      imageUrl: data.image_url ?? coverPhoto?.url ?? null,
      openingHours: data.opening_hours,
    })
  }

  // Query separata e best-effort per phone/email (vedi il commento su PlaceDetail.phone sopra) —
  // se add_places_contacts.sql non è ancora applicata sul progetto Supabase in uso, `error` è
  // valorizzato (colonna inesistente) e si prosegue con `null`, mai propagando un 500 alla scheda
  // dell'intera Meta.
  const { data: contacts, error: contactsError } = await supabase
    .from('dtrek_places')
    .select('phone, email')
    .eq('id', data.id)
    .maybeSingle()
  if (contactsError) console.error('[places/:id] phone/email non disponibili (migration applicata?)', contactsError)

  const sourceCounts = await fetchSourceCounts(supabase, [data.id])

  // Solo per un museo — docs/opere-musei-wikidata.md. getMuseumOpere gestisce già cache/errori al
  // suo interno (mai un'eccezione propagata qui), gated qui solo per non pagare il costo di una
  // ricerca Wikidata dal vivo per QUALUNQUE altro tipo di Sito/Borgo.
  const opere = data.subtype === 'museo'
    ? await getMuseumOpere(supabase, { id: data.id, name: data.name, latitude: data.latitude, longitude: data.longitude, wikidataId: data.wikidata_id })
    : []

  // Best-effort, mai un 500 sull'intera scheda se dtrek_place_relations avesse un problema —
  // stesso principio di contacts/wikipedia sopra e sotto.
  let relatedPlaces: RelatedPlace[] = []
  try {
    relatedPlaces = await fetchRelatedPlaces(supabase, data.id)
  } catch (e) {
    console.error('[places/:id] relatedPlaces non disponibili', e)
  }

  const hasRealDescription = isSubstantiveDescription(data.description)

  // Borgo/Città e Sito, quando manca una foto propria o una descrizione propria (vera, non solo
  // fonte/attribuzione — vedi isSubstantiveDescription) — mai una seconda fonte a RIMPIAZZARE un
  // dato reale già buono (un `description` sostanziale resta quello mostrato, vedi
  // PlaceDetail.wikipedia's uso lato client: l'estratto Wikipedia serve solo come ripiego quando
  // manca), solo a colmare quello che manca. L'import ISTAT dei Borghi/Città non porta mai
  // un'immagine propria (scripts/places/istat/fetch.ts non ha un campo foto) — senza questo, ogni
  // Borgo/Città restava senza copertina. searchAndFetch valida solo la somiglianza del titolo
  // (lib/wikipedia.ts); qui in più un controllo di prossimità, perché quel controllo lì manca (a
  // differenza di fetchWikiForNamedPois/isNearPoi) — senza, un nome generico rischierebbe di
  // agganciare la voce Wikipedia di un omonimo lontano.
  let wikipedia: PlaceDetail['wikipedia'] = null
  if (!data.image_url || !hasRealDescription) {
    try {
      const wiki = await searchAndFetch(data.name, 'it', 'wikipedia')
      const hasCoords = wiki?.lat != null && wiki?.lon != null
      const closeEnough = !hasCoords || haversineM(data.latitude, data.longitude, wiki!.lat!, wiki!.lon!) / 1000 <= WIKIPEDIA_MAX_DISTANCE_KM
      if (wiki && closeEnough) {
        // L'estratto della REST /page/summary/ (wiki.extract) è sempre solo il primo paragrafo,
        // spesso poche righe — quando serve davvero (nessuna descrizione propria sostanziale), un
        // secondo fetch mirato sullo stesso titolo già validato prende più testo (fino al tetto
        // dell'API MediaWiki), mai una ricerca propria che rischi un match diverso.
        let extract = wiki.extract
        if (!hasRealDescription) {
          const longer = await fetchExtendedExtract(wiki.title, 'it')
          if (longer && longer.length > extract.length) extract = longer
        }
        wikipedia = { extract, url: wiki.url, thumbnail: wiki.thumbnail }
      }
    } catch (e) {
      console.error('[places/:id] arricchimento Wikipedia fallito', e)
    }
  }

  // Foto di copertina con cache (lib/placePhotoCache.ts) — cascata Wikidata P18 → Wikipedia (match
  // sul nome, più precisa del semplice searchAndFetch sopra) → geosearch Commons. Solo quando
  // manca già un image_url proprio: mai a rimpiazzare un dato reale già buono, stesso principio
  // già applicato sopra per la descrizione.
  let coverPhoto: { url: string; credit: string | null } | null = null
  if (!data.image_url) {
    coverPhoto = await fetchPlaceCoverPhoto({
      id: data.id, name: data.name, lat: data.latitude, lon: data.longitude, wikidataId: data.wikidata_id,
    })
  }

  // dtrek_places.subtype è una colonna condivisa a significato diverso per tipologia (lib/
  // metaTypes.ts): PlaceCategory ('borgo'|'citta') per un borgo_citta, SiteType per un sito —
  // valorizzare siteType anche per un borgo_citta manderebbe SITE_TYPE_CONFIG['borgo'] (chiave
  // inesistente) in giro fino a un crash sul primo `.label` letto (era esattamente il bug
  // segnalato: "Cannot read properties of undefined (reading 'label')" aprendo una scheda Borgo).
  const detail: PlaceDetail = {
    id: data.id,
    metaType: data.meta_type as MetaType,
    // inferSiteTypeFromName: 'altro' spesso viene da un tag sorgente troppo generico (es. OSM
    // tourism=attraction) anche quando il nome dice chiaramente di cosa si tratta — vedi
    // lib/metaTypes.ts.
    siteType: data.meta_type === 'sito' ? (inferSiteTypeFromName(data.name, (data.subtype ?? null) as SiteType | null) ?? null) : null,
    name: data.name,
    // Solo se sostanziale (vedi isSubstantiveDescription) — il testo composto dall'importer PTPR
    // (solo un codice tipologico + attribuzione, mai vuoto) non è una descrizione da mostrare come
    // tale: l'attribuzione resta comunque rintracciabile da `source`/`sourceCount` e da
    // /fonti-e-crediti, non persa, solo non spacciata per prosa descrittiva.
    description: hasRealDescription ? data.description : null,
    latitude: data.latitude,
    longitude: data.longitude,
    region: data.region,
    province: data.province,
    municipality: data.municipality,
    address: data.address,
    imageUrl: data.image_url ?? coverPhoto?.url ?? null,
    // Solo dalla ricerca appena fatta (coverPhoto) — mai da data.image_credit: quella colonna non
    // è nella select principale sopra apposta (vedi il commento lì), e un image_url già presente
    // in questa riga oggi non può comunque venire da lì (nessuna fonte della pipeline lo popola
    // ancora, vedi supabase/migrations/add_place_photo_cache_columns.sql).
    imageCredit: coverPhoto?.credit ?? null,
    officialUrl: data.official_url,
    website: data.website,
    phone: contacts?.phone ?? null,
    email: contacts?.email ?? null,
    openingHours: data.opening_hours,
    source: data.source,
    sourceCount: sourceCounts.get(data.id) ?? 1,
    confidence: data.confidence,
    coordinatesApproximate: (data.metadata as Record<string, unknown> | null)?.coordinatesApproximate === true,
    wikipedia,
    relatedPlaces,
    opere,
  }
  return NextResponse.json(detail)
}
