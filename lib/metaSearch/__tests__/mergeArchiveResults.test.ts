import { describe, it, expect } from 'vitest'
import { mergeArchiveResults } from '../mergeArchiveResults'
import type { MetaSearchResultItem } from '../types'

function item(id: string, rankingScore: number, metaType: MetaSearchResultItem['metaType'] = 'borgo_citta'): MetaSearchResultItem {
  return { id, metaType, name: id, latitude: 0, longitude: 0, rankingScore, sourceCount: 1, confidence: 1 }
}

describe('mergeArchiveResults', () => {
  it('unisce più gruppi e ordina per rankingScore decrescente', () => {
    const out = mergeArchiveResults([[item('a', 1), item('b', 3)], [item('c', 2)]], new Set())
    expect(out.map(i => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('toglie una riga d\'archivio già salvata come Meta (stesso place_id) — mai due volte', () => {
    const out = mergeArchiveResults([[item('a', 1), item('b', 3)]], new Set(['b']))
    expect(out.map(i => i.id)).toEqual(['a'])
  })

  it('gruppo vuoto e nessuna Meta salvata → nessun errore, array vuoto', () => {
    expect(mergeArchiveResults([[], []], new Set())).toEqual([])
  })
})
