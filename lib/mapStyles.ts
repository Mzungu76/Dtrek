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

export function maptilerStyleUrl(id: MapTilerStyleId): string {
  return (MAPTILER_STYLES.find((s) => s.id === id) ?? MAPTILER_STYLES[0]).url()
}
