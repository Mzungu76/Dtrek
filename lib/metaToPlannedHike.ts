import type { MetaSearchResultItem } from './metaSearch/types'
import type { PlannedHike } from './plannedStore'

// Ponte tra un risultato di ricerca (Blocco C, lib/metaSearch) e una Meta salvabile (piano Blocco
// D §25/§26/§27) — senza questo, searchMeta() restituisce dati inerti che l'utente non può mai
// aggiungere ai suoi Percorsi. Un solo caso: 'sentiero' non passa mai di qui (searchSentieri già
// restituisce righe compatibili col flusso esistente di creazione percorso, che questo bridge non
// deve toccare — piano §48.3).
//
// Le metriche escursionistiche restano assenti (mai 0 fabbricato: 0 km/0 m D+ sarebbe un dato
// falso, non "nessun dato" — piano §48.9) per una Meta non-sentiero: hikingMetrics=false la fa
// omettere dalla card (lib/metaCard.ts) e dall'assessment (app/api/planned/route.ts).
export function metaSearchResultToPlannedHike(item: MetaSearchResultItem): PlannedHike {
  if (item.metaType === 'sentiero') {
    throw new Error('metaSearchResultToPlannedHike: un risultato "sentiero" non passa da qui, vedi searchSentieri.ts')
  }

  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: item.name,
    userNotes: item.description,
    createdAt: now,
    distanceMeters: 0,
    elevationGain: 0,
    elevationLoss: 0,
    altitudeMax: 0,
    altitudeMin: 0,
    estimatedTimeSeconds: 0,
    metaType: item.metaType,
    siteType: item.siteType,
    placeId: item.id,
    latitude: item.latitude,
    longitude: item.longitude,
    zone: item.municipality ?? item.province ?? item.region,
  }
}
