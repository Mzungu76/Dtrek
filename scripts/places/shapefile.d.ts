// Dichiarazione minima per il pacchetto `shapefile` (nessun @types/shapefile pubblicato) — copre
// solo la superficie usata da questa pipeline (open/read), stesso pattern già in uso "de facto"
// (con `any` implicito) in scripts/import-ptpr.ts, reso esplicito qui per poter tenere
// scripts/places sotto `strict: true` in un tsconfig dedicato (vedi tsconfig.scripts.json,
// temporaneo/non commesso — questa dichiarazione invece resta, è codice, non configurazione).
declare module 'shapefile' {
  export interface ShapefileFeature {
    type: 'Feature'
    geometry: GeoJSON.Geometry | null
    properties: Record<string, unknown>
  }

  export interface ShapefileSource {
    read(): Promise<{ done: true; value?: undefined } | { done: false; value: ShapefileFeature }>
  }

  export function open(
    shp: string,
    dbf?: string,
    options?: { encoding?: string },
  ): Promise<ShapefileSource>
}
