import type { MetaSearchResultItem } from './metaSearch/types'
import type { PlannedHike } from './plannedStore'
import type { ItineraryStop } from '@/app/api/borgo-itinerary/route'

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

// Piano mete multi-tipologia §51.3 — "promozione" di una tappa dell'itinerario di un Borgo/Città
// alla propria Guida, annidata in quella da cui nasce (parentMetaId). Solo una tappa
// `source: 'archivio'` ha un vero id dtrek_places (lib/guideBorgoDetailStops.ts) da usare come
// placeId: una tappa `source: 'wikipedia'` non è ancora una riga di catalogo, quindi non è
// promuovibile da qui (il chiamante deve filtrarla prima, mai un placeId fabbricato).
export function itineraryStopToNestedSitePlannedHike(stop: ItineraryStop, parentMetaId: string): PlannedHike {
  if (stop.source !== 'archivio') {
    throw new Error('itineraryStopToNestedSitePlannedHike: solo una tappa "archivio" ha un dtrek_places.id reale da usare come placeId')
  }

  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: stop.name,
    userNotes: stop.description,
    createdAt: now,
    distanceMeters: 0,
    elevationGain: 0,
    elevationLoss: 0,
    altitudeMax: 0,
    altitudeMin: 0,
    estimatedTimeSeconds: 0,
    metaType: 'sito',
    siteType: stop.siteType,
    placeId: stop.id,
    latitude: stop.lat,
    longitude: stop.lon,
    parentMetaId,
  }
}
