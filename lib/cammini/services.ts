// Servizi lungo la tappa di un cammino (docs/piano-cammini.md, Fase E): acqua, cibo, negozi, alloggi, trasporti,
// farmacie. Sono i luoghi che chi cammina cerca per necessità, distinti dai luoghi di interesse (lib/overpass.ts).
// Fonte OpenStreetMap: dice DOVE sta qualcosa, non SE è aperto adesso — l'affidabilità che si dichiara qui lo riflette.
// Parte pura: classificazione dei tag, query e lettura della risposta. Il fetch lato server sta in servicesServer.ts.
import { minDistToTrack } from '../geoUtils'
import { bboxBufferMeters } from '../geo/bufferUtils'

export type ServiceCategory = 'water' | 'food' | 'shop' | 'lodging' | 'transport' | 'pharmacy'

export const SERVICE_META: Record<ServiceCategory, { label: string; plural: string }> = {
  water: { label: 'Acqua', plural: 'punti acqua' },
  food: { label: 'Cibo', plural: 'locali' },
  shop: { label: 'Negozio', plural: 'negozi' },
  lodging: { label: 'Alloggio', plural: 'alloggi' },
  transport: { label: 'Trasporto', plural: 'fermate' },
  pharmacy: { label: 'Farmacia', plural: 'farmacie' },
}

/** Quanto ci si può fidare del dato: 'alta' = dettagli recenti (orari, contatti, data di controllo); 'bassa' = solo un punto mappato. */
export type ServiceConfidence = 'alta' | 'media' | 'bassa'

export interface ServiceItem {
  id: string
  category: ServiceCategory
  /** Tipo OSM leggibile (es. "Fontanella", "Ostello", "Stazione"). */
  kind: string
  name?: string
  lat: number
  lon: number
  /** Distanza dalla traccia della tappa, metri (la calcola il server). */
  distFromTrack?: number
  openingHours?: string
  phone?: string
  website?: string
  /** Data dell'ultimo controllo su OSM (check_date / survey:date), se c'è. */
  checkDate?: string
  confidence: ServiceConfidence
}

type Tags = Record<string, string>

const FOOD = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'food_court', 'biergarten'])
const SHOP = new Set(['supermarket', 'convenience', 'bakery', 'greengrocer', 'butcher', 'general', 'deli', 'farm', 'cheese', 'pastry'])
const LODGING_TOURISM: Record<string, string> = {
  hotel: 'Hotel', hostel: 'Ostello', guest_house: 'Affittacamere', apartment: 'Appartamento', chalet: 'Chalet',
  motel: 'Motel', camp_site: 'Campeggio', alpine_hut: 'Rifugio', wilderness_hut: 'Bivacco', caravan_site: 'Area camper',
}
const FOOD_LABEL: Record<string, string> = {
  restaurant: 'Ristorante', cafe: 'Bar/caffè', bar: 'Bar', pub: 'Pub', fast_food: 'Fast food', ice_cream: 'Gelateria', food_court: 'Food court', biergarten: 'Birreria',
}

/** Categoria e tipo di un elemento OSM dai suoi tag; null se non è un servizio che ci interessa. */
export function classifyService(tags: Tags): { category: ServiceCategory; kind: string } | null {
  const amenity = tags.amenity, tourism = tags.tourism, shop = tags.shop
  if (amenity === 'drinking_water' || (tags.man_made === 'water_tap' && tags.drinking_water !== 'no')) return { category: 'water', kind: 'Acqua potabile' }
  if (amenity === 'fountain' && tags.drinking_water === 'yes') return { category: 'water', kind: 'Fontana' }
  if (tags.natural === 'spring' && tags.drinking_water === 'yes') return { category: 'water', kind: 'Sorgente' }
  if (amenity === 'pharmacy') return { category: 'pharmacy', kind: 'Farmacia' }
  if (amenity && FOOD.has(amenity)) return { category: 'food', kind: FOOD_LABEL[amenity] ?? 'Locale' }
  if (shop && SHOP.has(shop)) return { category: 'shop', kind: shop === 'supermarket' ? 'Supermercato' : shop === 'bakery' ? 'Panetteria' : 'Alimentari' }
  if (tourism && LODGING_TOURISM[tourism]) return { category: 'lodging', kind: tags.hostel === 'pilgrim' ? 'Ostello del pellegrino' : LODGING_TOURISM[tourism] }
  if (amenity === 'shelter' && tags.shelter_type === 'basic_hut') return { category: 'lodging', kind: 'Bivacco' }
  if (tags.railway === 'station' || tags.railway === 'halt' || tags.public_transport === 'station') return { category: 'transport', kind: 'Stazione' }
  if (tags.highway === 'bus_stop' || (tags.public_transport === 'platform' && tags.bus === 'yes')) return { category: 'transport', kind: 'Fermata bus' }
  return null
}

function confidenceOf(c: { category: ServiceCategory }, tags: Tags): ServiceConfidence {
  const checkDate = tags.check_date ?? tags['survey:date']
  const details = [tags.opening_hours, tags.phone ?? tags['contact:phone'], tags.website ?? tags['contact:website']].filter(Boolean).length
  if (checkDate && /^\d{4}/.test(checkDate) && new Date().getFullYear() - Number(checkDate.slice(0, 4)) <= 2) return 'alta'
  if (c.category === 'transport') return tags.name ? 'media' : 'bassa'
  if (c.category === 'water') return 'bassa'
  return details >= 2 && tags.name ? 'media' : 'bassa'
}

/** Elementi della risposta Overpass → servizi (nodi o way/relation con `center`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseServices(elements: any[]): ServiceItem[] {
  const out: ServiceItem[] = []
  for (const el of elements) {
    const lat = el.type === 'node' ? el.lat : el.center?.lat
    const lon = el.type === 'node' ? el.lon : el.center?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number' || !el.tags) continue
    const tags = el.tags as Tags
    const c = classifyService(tags)
    if (!c) continue
    const checkDate = tags.check_date ?? tags['survey:date']
    out.push({
      id: `${el.type}/${el.id}`,
      category: c.category,
      kind: c.kind,
      ...(tags.name ? { name: tags.name } : {}),
      lat, lon,
      ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}),
      ...((tags.phone ?? tags['contact:phone']) ? { phone: tags.phone ?? tags['contact:phone'] } : {}),
      ...((tags.website ?? tags['contact:website']) ? { website: tags.website ?? tags['contact:website'] } : {}),
      ...(checkDate ? { checkDate } : {}),
      confidence: confidenceOf(c, tags),
    })
  }
  return out
}

/** Query Overpass per i servizi in un riquadro "s,w,n,e". */
export function buildServicesQuery(bbox: string): string {
  const b = `(${bbox})`
  return `[out:json][timeout:25];
(
  node["amenity"~"^(drinking_water|fountain|pharmacy|restaurant|cafe|bar|pub|fast_food|ice_cream|shelter)$"]${b};
  node["man_made"="water_tap"]${b};
  node["natural"="spring"]["drinking_water"="yes"]${b};
  node["shop"~"^(supermarket|convenience|bakery|greengrocer|butcher|general|deli|farm|cheese|pastry)$"]${b};
  nwr["tourism"~"^(hotel|hostel|guest_house|apartment|chalet|motel|camp_site|alpine_hut|wilderness_hut|caravan_site)$"]${b};
  node["railway"~"^(station|halt)$"]${b};
  node["highway"="bus_stop"]["name"]${b};
);
out body center;`
}

/** Riquadro "s,w,n,e" attorno alla traccia, per la query. */
export function servicesBbox(track: [number, number][], radiusM: number): string {
  return bboxBufferMeters(track, radiusM)
}

/** Risposta Overpass → servizi entro `radiusM` dalla traccia, con la distanza, dal più vicino. Usata dal server e dallo script di precaricamento. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function servicesAlongTrack(elements: any[], track: [number, number][], radiusM: number): ServiceItem[] {
  return parseServices(elements)
    .map(s => ({ ...s, distFromTrack: Math.round(minDistToTrack(s.lat, s.lon, track)) }))
    .filter(s => (s.distFromTrack ?? 0) <= radiusM)
    .sort((a, b) => (a.distFromTrack ?? 0) - (b.distFromTrack ?? 0))
}
