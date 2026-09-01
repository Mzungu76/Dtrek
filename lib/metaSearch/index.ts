import type { SupabaseClient } from '@supabase/supabase-js'
import type { MetaSearchParams, MetaSearchResult } from './types'
import { searchBorghi } from './searchBorghi'
import { searchSiti } from './searchSiti'
import { searchSentieri, type FetchHikeCandidates } from './searchSentieri'

export type {
  MetaSearchParams, MetaSearchResult, MetaSearchResultItem, MetaSearchOrigin,
  BorghiSearchParams, SitiSearchParams, SentieriSearchParams,
  BorgoInterest, ExperienceType, TimeBudget,
} from './types'
export type { ExistingHikeCandidate, FetchHikeCandidates } from './searchSentieri'

export interface SearchMetaDeps {
  supabase: SupabaseClient
  // Richiesto solo per metaType: 'sentiero' — vedi searchSentieri.ts per il perché non è
  // opzionale-con-fallback (il motore Sentieri non viene mai reimplementato qui).
  fetchHikeCandidates?: FetchHikeCandidates
}

// Unico punto d'ingresso richiesto dal piano §17 ("La UI non deve conoscere i dettagli delle
// fonti") — dispatcha a searchSentieri()/searchBorghi()/searchSiti() in base a metaType, mai
// all'AI (piano §21: "L'AI NON deve decidere quali Mete esistono").
export async function searchMeta(params: MetaSearchParams, deps: SearchMetaDeps): Promise<MetaSearchResult> {
  switch (params.metaType) {
    case 'borgo_citta':
      return searchBorghi(deps.supabase, params)
    case 'sito':
      return searchSiti(deps.supabase, params)
    case 'sentiero':
      if (!deps.fetchHikeCandidates) {
        throw new Error(
          'searchMeta: fetchHikeCandidates è richiesto per metaType "sentiero" — il motore esistente ' +
          '(app/api/route-build) resta dietro il proprio endpoint, non reimplementato qui (piano §18).',
        )
      }
      return searchSentieri(params, deps.fetchHikeCandidates)
  }
}
