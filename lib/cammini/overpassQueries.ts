import type { RegistryEntry } from './registry'

// Query Overpass dei cammini (solo a piedi). `out body` = tag + membri, senza geometria.

const ITALY_BBOX = '35.2,6.6,47.1,18.8'
// Tempo e memoria dichiarati decidono se Overpass accetta la query quando è carico: chiedere 300 s e 1 GB per
// una lettura per id la fa rifiutare (504 immediato). Query leggere: 60 s; geometria delle way: 180 s; mai maxsize.
const LIGHT = '[out:json][timeout:60]'
const HEAVY = '[out:json][timeout:180]'

const escapeRe = (n: string) => n.replace(/[\\"^$.*+?()[\]{}|]/g, m => `\\${m}`)

/**
 * Radici per nome, solo nel bbox Italia e con `route="hiking"` / `"foot"` esatti (indicizzati: la regex
 * `route~"^(hiking|foot)$"` su tutto il mondo andava in 504). Il bbox su una relazione richiede un membro
 * dentro il rettangolo, quindi le super-relazioni fatte solo di relazioni (es. "Via Francigena" intera)
 * si recuperano a parte risalendo dai figli trovati (`br`), sempre filtrando per nome.
 */
export function rootsQuery(entry: RegistryEntry): string {
  if (entry.osmRelationIds?.length) return `${LIGHT};\nrel(id:${entry.osmRelationIds.join(',')});\nout body;`
  const name = `["name"~"${escapeRe(entry.searchName ?? entry.name)}",i]`
  return `${HEAVY};
(
  rel["type"="route"]["route"="hiking"](${ITALY_BBOX})${name};
  rel["type"="route"]["route"="foot"](${ITALY_BBOX})${name};
)->.found;
(.found; rel(br.found)["type"="route"]${name};);
out body;`
}
export const relationsByIdQuery = (ids: number[]) => `${LIGHT};\nrel(id:${ids.join(',')});\nout body;`
export const italyQuery = (ids: number[]) => `${LIGHT};\nrel(id:${ids.join(',')})(${ITALY_BBOX});\nout ids;`
export const waysQuery = (ids: number[]) => `${HEAVY};\nway(id:${ids.join(',')});\nout geom;`

