import { formatDurationSecs } from './trailStats'
import { SITE_TYPE_CONFIG } from './metaTypes'
import type { MetaSearchResultItem } from './metaSearch/types'

// Scheda type-aware (piano §24) — ogni tipologia mostra solo le proprie metriche significative,
// mai un placeholder per un dato che non esiste (piano §24: "NON mostrare dati senza significato.
// Mai: 0 km / 0 m D+ per un museo"). Un campo `undefined` in MetaSearchResultItem produce
// semplicemente l'assenza della relativa riga qui, mai uno zero fabbricato.
export interface CardStat {
  key: string
  label: string
  value: string
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

function hikeCardStats(item: MetaSearchResultItem): CardStat[] {
  const h = item.hikeStats
  const stats: CardStat[] = []
  if (h?.distanceMeters != null) stats.push({ key: 'distance', label: 'Distanza', value: formatKm(h.distanceMeters) })
  if (h?.elevationGain != null) stats.push({ key: 'elevation', label: 'D+', value: `${Math.round(h.elevationGain)} m` })
  if (h?.estimatedTimeSeconds != null) stats.push({ key: 'duration', label: 'Durata', value: formatDurationSecs(h.estimatedTimeSeconds) })
  if (h?.trailScore != null) stats.push({ key: 'trailScore', label: 'Trail Score', value: String(Math.round(h.trailScore)) })
  return stats
}

function borgoCardStats(): CardStat[] {
  // tempo consigliato / numero tappe / numero POI / distanza itinerario (piano §24) richiedono un
  // itinerario generato (dtrek_place_relations popolato, Blocco D — non ancora fatto) — nessuno di
  // questi campi esiste oggi su MetaSearchResultItem, quindi non c'è nulla da mostrare invece di
  // un valore fabbricato. Aggiungere qui quando quei dati esisteranno davvero.
  return []
}

function sitoCardStats(item: MetaSearchResultItem): CardStat[] {
  const stats: CardStat[] = []
  if (item.siteType) stats.push({ key: 'category', label: 'Categoria', value: SITE_TYPE_CONFIG[item.siteType].label })
  // durata consigliata / percorso / distanza (piano §24) — stessa assenza di dati di borgoCardStats.
  return stats
}

// Punto d'ingresso unico — la UI chiama solo questa funzione, mai un `if (metaType === ...)`
// sparso nei componenti (piano §48.17: "preferire configurazione centralizzata rispetto a
// condizioni sparse"). Un metaType 'sentiero' con hikeStats assente (es. un candidato Sentieri non
// ancora arricchito) produce semplicemente un array vuoto, mai un errore.
export function metaCardStats(item: MetaSearchResultItem): CardStat[] {
  switch (item.metaType) {
    case 'sentiero':    return hikeCardStats(item)
    case 'borgo_citta': return borgoCardStats()
    case 'sito':        return sitoCardStats(item)
  }
}
