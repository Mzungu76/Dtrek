import type { RegistryEntry } from './registry'

// Query Overpass dei cammini (solo a piedi). `out body` = tag + membri, senza geometria.

const ITALY_BBOX = '35.2,6.6,47.1,18.8'
const TUNING = '[out:json][timeout:300][maxsize:1073741824]'
const ROUTE = '["route"~"^(hiking|foot)$"]'

const escapeRe = (n: string) => n.replace(/[\\"^$.*+?()[\]{}|]/g, m => `\\${m}`)

export function rootsQuery(entry: RegistryEntry): string {
  return `${TUNING};
rel["type"="route"]${ROUTE}["name"~"${escapeRe(entry.searchName ?? entry.name)}",i];
out body;`
}
export const relationsByIdQuery = (ids: number[]) => `${TUNING};\nrel(id:${ids.join(',')});\nout body;`
export const italyQuery = (ids: number[]) => `${TUNING};\nrel(id:${ids.join(',')})(${ITALY_BBOX});\nout ids;`
export const waysQuery = (ids: number[]) => `${TUNING};\nway(id:${ids.join(',')});\nout geom;`

