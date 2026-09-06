import type { MetaSearchResultItem } from './types'

/**
 * Unisce i risultati di searchBorghi/searchSiti (due chiamate parallele a /api/meta-search, una
 * per tipologia — quell'endpoint accetta un solo `metaType` alla volta) ordinandoli per
 * `rankingScore` decrescente, e toglie una Meta che l'utente ha già salvato: `savedPlaceIds` sono
 * gli `AllPercorsiRow.placeId` delle Mete già in /api/percorsi, `item.id` è lo stesso id di
 * dtrek_places (piano §25/§26) — un match vuol dire "questa riga d'archivio è già una Meta",
 * quindi appare solo nel gruppo "Fra le tue Mete" dell'hub di ricerca (docs/piano-ricerca-mete.md,
 * Fase 2), mai due volte con due azioni diverse (Apri / Aggiungi).
 */
export function mergeArchiveResults(
  groups: MetaSearchResultItem[][],
  savedPlaceIds: ReadonlySet<string>,
): MetaSearchResultItem[] {
  return groups
    .flat()
    .filter(item => !savedPlaceIds.has(item.id))
    .sort((a, b) => b.rankingScore - a.rankingScore)
}
