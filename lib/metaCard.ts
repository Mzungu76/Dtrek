import { formatDurationSecs } from './trailStats'
import { SITE_TYPE_CONFIG, type MetaType, type SiteType } from './metaTypes'
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

// Stessa idea di metaCardStats() sopra ma per una Meta già salvata (AllPercorsiRow, app/api/
// percorsi/route.ts — non importato qui per non far dipendere lib/ da app/api/, vedi la firma
// strutturale sotto) invece di un risultato di ricerca (MetaSearchResultItem): la pagina Mete
// (app/percorsi/page.tsx) aveva uno slot metriche vuoto per ogni riga non-sentiero (piano
// meta-multitype-audit.md §1, "mai 0 km per un museo" ma anche mai un vuoto senza alternativa) —
// comune/regione e categoria (per un Sito) sono gli unici dati che una Meta borgo_citta/sito porta
// sempre con sé oggi (municipality/region/siteType, piano §25/§26), quindi sono ciò che va al
// posto delle pillole escursionistiche. Le metriche di un sentiero restano a carico del chiamante
// (già rese con le proprie icone in app/percorsi/page.tsx) — qui solo il ramo non-sentiero, che
// prima non esisteva affatto.
export interface MetaRowLocation {
  metaType: MetaType
  siteType: SiteType | null
  municipality: string | null
  region: string | null
}

export function metaRowLocationStats(row: MetaRowLocation): CardStat[] {
  if (row.metaType === 'sentiero') return []
  const stats: CardStat[] = []
  if (row.metaType === 'sito' && row.siteType) {
    stats.push({ key: 'category', label: 'Categoria', value: SITE_TYPE_CONFIG[row.siteType].label })
  }
  const place = [row.municipality, row.region].filter(Boolean).join(', ')
  if (place) stats.push({ key: 'location', label: 'Luogo', value: place })
  return stats
}
