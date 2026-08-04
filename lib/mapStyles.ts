/** Shared MapTiler vector style catalogue — used by RouteMap3D's flythrough and by the live 3D navigation map. */
export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''

export type MapTilerStyleId = 'outdoor' | 'satellite' | 'winter'

export interface MapTilerStyleOption {
  id: MapTilerStyleId
  label: string
  url: () => string
}

export const MAPTILER_STYLES: MapTilerStyleOption[] = [
  { id: 'outdoor',   label: 'Outdoor',   url: () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}` },
  { id: 'satellite', label: 'Satellite', url: () => `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}` },
  { id: 'winter',    label: 'Winter',    url: () => `https://api.maptiler.com/maps/winter-v2/style.json?key=${MAPTILER_KEY}` },
]

/**
 * Tile RASTER già renderizzate di uno stile MapTiler, da sovrapporre a un altro basemap.
 *
 * Diverso da maptilerStyleUrl, che restituisce lo style.json vettoriale: quello si può solo
 * APPLICARE con setStyle(), che smonta e ricostruisce tutti i layer della mappa — inaccettabile a
 * metà registrazione di un video, dove significa fotogrammi incompleti. Queste invece sono un
 * semplice layer raster in più, con la propria opacità animabile: è così che lo stacco "Visione"
 * fa affiorare la topografia sopra il satellitare senza toccare nient'altro.
 */
export function maptilerRasterTileUrl(id: MapTilerStyleId): string {
  const styleName = id === 'satellite' ? 'hybrid' : `${id}-v2`
  return `https://api.maptiler.com/maps/${styleName}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
}

export function maptilerStyleUrl(id: MapTilerStyleId): string {
  return (MAPTILER_STYLES.find((s) => s.id === id) ?? MAPTILER_STYLES[0]).url()
}
