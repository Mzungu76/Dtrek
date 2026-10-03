// Cammini importati da tracce GPX/KML fornite dagli enti (non da OpenStreetMap): per ognuno, quali
// file/tracce sono le tappe e come si chiamano i capi. I percorsi sono relativi alla cartella --src
// (gli zip ricevuti, scompattati). Un cammino con `structure: 'rete'` raccoglie varianti o percorsi
// alternativi: l'utente ne sceglie uno, non li cammina in sequenza.

export interface TappaSpec {
  /** File (GPX/KML) relativo alla cartella sorgente. */
  file: string
  /** Se il file contiene più tracce: espressione sul nome della traccia (decodificato). Senza: tutte, concatenate. */
  track?: string
  /** Nome mostrato; default `Tappa <ordinale>`. */
  name?: string
  from?: string
  to?: string
}

export interface CamminoSpec {
  /** Entra nel source_id (`cammino/<id>`): non rinominare dopo l'import. */
  id: string
  name: string
  region: string
  theme: 'religioso' | 'storico' | 'naturalistico'
  structure: 'cammino' | 'rete'
  tappe: TappaSpec[]
  /** Cammino a traccia unica senza tappe: si calcolano tagliando la linea sui borghi del catalogo (anchors/<id>.json). */
  computeTappe?: boolean
  /** Opzioni di taglio per le tappe calcolate (default: DEFAULT_SPLIT_OPTIONS). */
  split?: Partial<import('../../../../lib/cammini/tappe').SplitOptions>
  /** Se presente, forza "da rivedere" (le tracce non bastano a ricostruire una sequenza affidabile). */
  reviewReason?: string
  notes?: string
  /** Ordinali dopo i quali un salto fra tappe è atteso (traghetto, trasferimento) e non va segnalato. */
  allowGapsAfter?: number[]
}

