import type { MetaType, SiteType, PlaceCategory } from '../../lib/metaTypes'

export type { PlaceCategory }

// Sorgenti supportate dalla pipeline (piano §41). Ogni fonte deve avere `source`/`source_id`
// (piano §48.12) — mai un candidato senza provenienza ricostruibile.
export type PlaceSource = 'istat' | 'ptpr_lazio' | 'mic' | 'osm' | 'wikidata'

// Output normalizzato di un singolo fetcher di sorgente (scripts/places/<fonte>/), prima di
// deduplicazione/import — il "modello comune" richiesto dal piano §41 ("l'importer finale deve
// produrre dati nel modello comune", indipendentemente da come ogni fonte è strutturata a monte).
export interface PlaceCandidate {
  name: string
  metaType: MetaType
  // SiteType quando metaType === 'sito'; PlaceCategory quando metaType === 'borgo_citta'; assente
  // per 'sentiero' (non popolato da questa pipeline, piano §18).
  subtype?: SiteType | PlaceCategory

  description?: string

  latitude: number
  longitude: number
  // GeoJSON — un poligono per un centro storico (piano §7), altrimenti assente (solo punto).
  geometry?: GeoJSON.Geometry

  region?: string
  province?: string
  municipality?: string
  municipalityIstatCode?: string
  address?: string

  imageUrl?: string
  officialUrl?: string
  website?: string
  openingHours?: unknown

  source: PlaceSource
  sourceId: string
  sourceUrl?: string
  // Tipologia grezza così come riportata dalla fonte (es. tag OSM `historic=castle`, o la
  // colonna TIPO_OGG di un PTPR) — persistita in dtrek_place_sources.raw_type per audit/debug,
  // mai usata per decidere metaType/subtype al posto della classificazione esplicita sopra.
  rawType?: string

  wikidataId?: string

  // Confidenza della CLASSIFICAZIONE di questo candidato (non del match con altre fonti, quello è
  // calcolato da deduplicate.ts) — 1.0 per una fonte strutturata (MiC, ISTAT), più bassa per una
  // classificazione euristica (es. OSM tag ambiguo).
  confidence: number

  // Metadati grezzi della fonte, per debug e per non perdere informazione che il modello comune
  // non cattura esplicitamente — MAI usati per decisioni di ranking/dedup.
  metadata?: Record<string, unknown>
}

// Riga esistente in dtrek_places, così come letta da Supabase — usata da deduplicate.ts per
// confrontare un nuovo PlaceCandidate con ciò che è già nel catalogo.
export interface ExistingPlace {
  id: string
  name: string
  metaType: MetaType
  subtype?: string | null
  latitude: number
  longitude: number
  municipality?: string | null
  municipalityIstatCode?: string | null
  wikidataId?: string | null
}
