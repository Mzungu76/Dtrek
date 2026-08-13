/**
 * Le 20 regioni italiane — riferimento statico per il percorso omaggio (docs/navigator-dtrek-
 * boundary.md): abbina la posizione geolocalizzata di un nuovo utente alla regione più vicina (per
 * clonargli il campione di quella regione, lib/giftRoute.ts) e alimenta il picker manuale quando la
 * geolocalizzazione è negata o fallisce. Coordinate del centroide — precisione da "regione più
 * vicina", non da confine catastale: normale un piccolo errore vicino a un confine regionale.
 */
export interface ItalianRegion {
  slug: string
  name: string
  lat: number
  lon: number
}

export const ITALIAN_REGIONS: ItalianRegion[] = [
  { slug: 'abruzzo',               name: 'Abruzzo',               lat: 42.35, lon: 13.75 },
  { slug: 'basilicata',            name: 'Basilicata',            lat: 40.60, lon: 16.05 },
  { slug: 'calabria',              name: 'Calabria',              lat: 39.05, lon: 16.35 },
  { slug: 'campania',              name: 'Campania',              lat: 40.90, lon: 14.75 },
  { slug: 'emilia-romagna',        name: 'Emilia-Romagna',        lat: 44.55, lon: 11.20 },
  { slug: 'friuli-venezia-giulia', name: 'Friuli-Venezia Giulia', lat: 46.10, lon: 13.20 },
  { slug: 'lazio',                 name: 'Lazio',                 lat: 41.90, lon: 12.60 },
  { slug: 'liguria',               name: 'Liguria',               lat: 44.40, lon: 8.95 },
  { slug: 'lombardia',             name: 'Lombardia',             lat: 45.55, lon: 9.75 },
  { slug: 'marche',                name: 'Marche',                lat: 43.35, lon: 13.10 },
  { slug: 'molise',                name: 'Molise',                lat: 41.65, lon: 14.55 },
  { slug: 'piemonte',              name: 'Piemonte',              lat: 45.15, lon: 7.85 },
  { slug: 'puglia',                name: 'Puglia',                lat: 41.05, lon: 16.60 },
  { slug: 'sardegna',              name: 'Sardegna',              lat: 40.10, lon: 9.10 },
  { slug: 'sicilia',               name: 'Sicilia',               lat: 37.55, lon: 14.10 },
  { slug: 'toscana',               name: 'Toscana',               lat: 43.55, lon: 11.10 },
  { slug: 'trentino-alto-adige',   name: 'Trentino-Alto Adige',   lat: 46.45, lon: 11.20 },
  { slug: 'umbria',                name: 'Umbria',                lat: 42.95, lon: 12.65 },
  { slug: 'valle-daosta',          name: "Valle d'Aosta",         lat: 45.75, lon: 7.35 },
  { slug: 'veneto',                name: 'Veneto',                lat: 45.55, lon: 11.95 },
]

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Regione con il centroide più vicino alle coordinate date — sempre una risposta (Italia intera
 *  coperta), il chiamante decide cosa fare se quella regione non ha ancora un campione pronto. */
export function nearestItalianRegion(lat: number, lon: number): ItalianRegion {
  return ITALIAN_REGIONS.reduce((best, r) =>
    haversineKm(lat, lon, r.lat, r.lon) < haversineKm(lat, lon, best.lat, best.lon) ? r : best,
  ITALIAN_REGIONS[0])
}

export function isItalianRegionSlug(v: unknown): v is string {
  return typeof v === 'string' && ITALIAN_REGIONS.some(r => r.slug === v)
}
