import type { Bbox } from '../../../lib/cammini/geometry'

// Cammini importabili dalla pipeline (docs/piano-cammini.md, Fase 2). Ogni voce è un tratto
// regionale di un cammino: il catalogo non contiene cammini interi di mille chilometri ma tratti
// che Dtrek sa descrivere bene, uno alla volta. Solo cammini a piedi (route=hiking|foot): quelli
// ciclabili sono esclusi per decisione di prodotto (piano §0.3) già nella query Overpass.

export interface CamminoConfig {
  /** Identificatore stabile — entra nel source_id (`cammino/<id>`), quindi NON va rinominato. */
  id: string
  name: string
  /** Nome della relazione OSM (case-insensitive). */
  nameRegex: string
  /** Relazioni da scartare pur avendo il nome giusto (es. altri cammini con lo stesso prefisso). */
  excludeNameRegex?: string
  region: string
  /** Ritaglio del tratto: [sud, ovest, nord, est]. */
  bbox: Bbox
  /** Da che parte inizia il tratto (orienta la linea) e dove finisce. */
  /** `anchorName`: nome del borgo/città in dtrek_places a cui agganciare l'estremo, quando il suo
   *  centroide non cade vicino alla linea (es. Roma: il centroide è a ~3 km da San Pietro). */
  start: { name: string; lat: number; lon: number; anchorName?: string }
  end: { name: string; lat: number; lon: number; anchorName?: string }
  description?: string
  theme: 'religioso' | 'storico' | 'naturalistico'
}

export const CAMMINI: CamminoConfig[] = [
  {
    id: 'via-francigena-lazio',
    name: 'Via Francigena nel Lazio',
    nameRegex: 'Francigena',
    // Il tratto verso Sud parte da Roma: fuori dal ritaglio per latitudine (min 41.88) e dal nome.
    excludeNameRegex: 'del Sud|Sud\\b|Sigerico',
    region: 'Lazio',
    // Corridoio Acquapendente → Roma: abbastanza stretto da non catturare il resto della Toscana
    // (Radicofani è a 42.90N), abbastanza largo per le varianti. È un'approssimazione per bbox, non
    // il confine amministrativo: la prima esecuzione in dry-run ne mostra i limiti.
    bbox: [41.88, 11.78, 42.80, 12.62],
    start: { name: 'Acquapendente', lat: 42.7425, lon: 11.8647, anchorName: 'Acquapendente' },
    end: { name: 'Roma (San Pietro)', lat: 41.9022, lon: 12.4539, anchorName: 'Roma' },
    description: 'Il tratto laziale della Via Francigena, da Acquapendente a San Pietro a Roma.',
    theme: 'religioso',
  },
]
