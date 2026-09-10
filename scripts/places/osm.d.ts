// Dichiarazione minima per `osm-pbf-parser` (nessun tipo pubblicato) — la forma esatta degli
// oggetti restituiti è stata VERIFICATA installando il pacchetto reale in questa sessione e
// leggendo `readme.markdown`/`example/file.js` dal codice sorgente pubblicato su npm (non
// documentazione di terze parti) — vedi i commenti in scripts/places/osm/fetch.ts.
declare module 'osm-pbf-parser' {
  import type { Transform } from 'stream'

  export interface OsmInfo {
    version?: number
    timestamp?: number
    changeset?: number
    uid?: number
    user?: string
  }

  export interface OsmNode {
    type: 'node'
    id: number
    lat: number
    lon: number
    tags: Record<string, string>
    info?: OsmInfo
  }

  export interface OsmWay {
    type: 'way'
    id: number
    tags: Record<string, string>
    refs: number[]
    info?: OsmInfo
  }

  export interface OsmRelationMember {
    type: 'node' | 'way' | 'relation'
    id: number
    role: string
  }

  export interface OsmRelation {
    type: 'relation'
    id: number
    tags: Record<string, string>
    members: OsmRelationMember[]
    info?: OsmInfo
  }

  export type OsmElement = OsmNode | OsmWay | OsmRelation

  // Stream transform in objectMode: ogni `data` è un ARRAY di OsmElement (vedi readme.markdown —
  // `items.forEach(...)` nell'esempio ufficiale), non un singolo elemento per evento.
  export default function parseOSM(): Transform
}
