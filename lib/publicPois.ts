// Punti di interesse per la mappa pubblica del Diario/Raccolta — SOLO dalla cache già popolata
// dall'uso privato dell'app (`poi_cache`), mai una richiesta dal vivo a Overpass/GNA/PTPR/
// Wikidata: sono le stesse quattro fonti esterne che `/api/pois` interroga per l'app privata, e un
// link pubblico può ricevere traffico anonimo imprevedibile — innescarle ad ogni apertura
// rischierebbe di esaurirne i limiti di richiesta per l'intero prodotto, non solo per questo
// Diario. Se la zona non è già in cache (nessuno l'ha mai vista in privato), la mappa pubblica
// semplicemente non mostra POI — nessun errore, nessun ritardo percepibile.
import { supabase } from './supabase'
import { computeBbox } from './geoUtils'
import type { PoiItem } from './overpass'

export interface PublicPoi {
  lat:  number
  lon:  number
  name: string
  type: string
}

/** Stessa normalizzazione di app/api/pois/route.ts: la chiave deve coincidere per trovare la
 *  cache già scritta da una richiesta privata sulla stessa zona. */
function normalizeBboxKey(bbox: string): string {
  return 'v2_' + bbox.split(',').map(v => (Math.round(parseFloat(v) * 100) / 100).toFixed(2)).join('_')
}

export async function fetchCachedPois(polyline: [number, number][]): Promise<PublicPoi[]> {
  if (polyline.length < 2) return []

  const bboxKey = normalizeBboxKey(computeBbox(polyline))
  const { data } = await supabase
    .from('poi_cache')
    .select('pois')
    .eq('bbox_key', bboxKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data?.pois) return []

  const payload = data.pois as PoiItem[] | { pois: PoiItem[] }
  const all = Array.isArray(payload) ? payload : payload.pois
  return all.filter(p => p.name).map(p => ({ lat: p.lat, lon: p.lon, name: p.name!, type: p.type }))
}
