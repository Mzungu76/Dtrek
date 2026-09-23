import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'

// Calcolo condiviso tra components/guida/GuideReader.tsx (alla prima apertura della guida) e
// lib/useCreateMetaFromSearch.ts (alla creazione, piano guide-eccellenza — verifica post-piano:
// "l'algoritmo deve partire sia su 'Genera automatico' sia su 'Crea Guida'") — un solo posto che
// decide come un BorgoItinerary diventa i due campi da persistere su planned_hikes, mai due
// implementazioni che potrebbero andare fuori sincrono.

export interface BorgoWalkFields {
  borgoWalkPolyline: [number, number][]
  borgoWalkStopsHash: string
}

/** Concatenazione in ordine delle `legs[].polyline` (reali o linea d'aria di ripiego, mai un dato
 *  fabbricato qui: quello che c'è già in `legs` così com'è) + hash delle tappe da cui deriva
 *  (per capire quando ricalcolare, non un timestamp — vedi il commento su borgoWalkPolyline in
 *  lib/plannedStore.ts). null quando l'itinerario non ha tappe collegate da un cammino: nulla da
 *  persistere, mai un campo vuoto scritto per forza. */
export function computeBorgoWalkFields(itinerary: BorgoItinerary): BorgoWalkFields | null {
  if (itinerary.legs.length === 0) return null
  return {
    borgoWalkPolyline: itinerary.legs.flatMap(leg => leg.polyline),
    borgoWalkStopsHash: itinerary.stops.map(s => s.id).join(','),
  }
}
