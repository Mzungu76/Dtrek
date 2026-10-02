import { describe, it, expect } from 'vitest'
import { REGISTRY } from '../cammini/registry'
import { isMultiSelector, normalizeKey, resolveRegistryEntry, selectEntries } from '../cammini/registrySelect'
import { exitCodeFor, summaryMarkdown, type RunRow } from '../cammini/runSummary'
import { backoffMs, chunk, endpointOrder, missingIds } from '../cammini/overpassPlan'

describe('resolveRegistryEntry', () => {
  it('accetta id, nome e searchName senza maiuscole/accenti e con - o spazi', () => {
    expect(resolveRegistryEntry('via-francigena')).toMatchObject({ ok: true, entry: { id: 'via-francigena' } })
    expect(resolveRegistryEntry('Via Francigena')).toMatchObject({ ok: true, entry: { id: 'via-francigena' } })
    expect(resolveRegistryEntry('  VIA   francigena ')).toMatchObject({ ok: true, entry: { id: 'via-francigena' } })
    expect(resolveRegistryEntry("Cammino di Sant'Antonio")).toMatchObject({ ok: true, entry: { id: 'cammino-sant-antonio' } })
    expect(resolveRegistryEntry('cammino di san benedetto')).toMatchObject({ ok: true, entry: { id: 'cammino-san-benedetto' } })
    expect(resolveRegistryEntry('Francesco')).toMatchObject({ ok: true, entry: { id: 'via-di-francesco' } })
  })
  it('se non trova nulla elenca gli id validi', () => {
    const r = resolveRegistryEntry('via inesistente')
    expect(r.ok).toBe(false)
    if (!r.ok) for (const e of REGISTRY) expect(r.error).toContain(e.id)
  })
  it('normalizeKey toglie accenti e punteggiatura', () => {
    expect(normalizeKey('Città  dell\'Acqua!')).toBe('citta-dell-acqua')
  })
})

describe('selectEntries', () => {
  const sel = (s: string) => { const r = selectEntries(s); if ('error' in r) throw new Error(r.error); return r }
  it('tutti: niente rifugi e niente doppioni per overlapsWith', () => {
    const { selected, skipped } = sel('tutti')
    const ids = selected.map(e => e.id)
    expect(selected.every(e => e.anchors === 'borghi')).toBe(true)
    expect(ids).toContain('via-romea')
    expect(ids).not.toContain('romea-strata')
    expect(ids).toContain('via-francigena')
    expect(skipped.map(s => s.entry.id)).toEqual(expect.arrayContaining(['gta', 'sentiero-italia', 'via-alpina', 'romea-strata', 'alta-via-1-dolomiti']))
    expect(selected.length + skipped.length).toBe(REGISTRY.length)
  })
  it('ondata-N filtra per ondata e lascia fuori comunque i doppioni', () => {
    expect(sel('ondata-1').selected.every(e => e.wave === 1)).toBe(true)
    expect(sel('ondata-3').selected).toEqual([])
    expect(sel('Ondata 2').selected.map(e => e.id)).toContain('via-romea')
  })
  it('selettori non validi', () => {
    expect('error' in selectEntries('ondata-9')).toBe(true)
    expect(isMultiSelector('Tutti')).toBe(true)
    expect(isMultiSelector('via-francigena')).toBe(false)
  })
})

describe('riepilogo ed exit code', () => {
  const row = (outcome: RunRow['outcome']): RunRow => ({ id: 'x', name: 'X | Y', outcome, km: 10, tappe: 3, durationS: 90, detail: 'a|b' })
  it('exit 0 con "da rivedere" e "saltato", 1 con errori o cammini rimandati', () => {
    expect(exitCodeFor([row('scritto'), row('da_rivedere'), row('saltato'), row('pronto')])).toBe(0)
    expect(exitCodeFor([row('scritto'), row('errore')])).toBe(1)
    expect(exitCodeFor([row('rimandato')])).toBe(1)
  })
  it('tabella con una riga per cammino, pipe protette', () => {
    const md = summaryMarkdown([row('scritto'), row('errore')], 'T')
    expect(md).toContain('### T')
    expect(md.split('\n').filter(l => l.startsWith('| X')).length).toBe(2)
    expect(md).toContain('X \\| Y')
    expect(md).toContain('1.5 min')
  })
})

describe('piano Overpass', () => {
  it('chunk spezza in blocchi', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
  it('missingIds toglie duplicati e id già in cache', () => {
    expect(missingIds([1, 2, 2, 3, 4], id => id === 3)).toEqual([1, 2, 4])
  })
  it('endpointOrder ruota a ogni giro e per offset', () => {
    expect(endpointOrder(['a', 'b', 'c'], 1)).toEqual(['a', 'b', 'c'])
    expect(endpointOrder(['a', 'b', 'c'], 2)).toEqual(['b', 'c', 'a'])
    expect(endpointOrder(['a', 'b', 'c'], 1, 2)).toEqual(['c', 'a', 'b'])
  })
  it('backoffMs cresce col giro, con jitter ±25%', () => {
    expect(backoffMs(1, 0.5)).toBe(60_000)
    expect(backoffMs(2, 0.5)).toBe(120_000)
    expect(backoffMs(1, 0)).toBe(45_000)
    expect(backoffMs(1, 0.999)).toBeLessThan(75_000)
    expect(backoffMs(20, 0.5)).toBe(300_000) // tetto a 5 minuti
  })
})

describe('query di download', () => {
  it('usa solo modi di output validi (niente "out tags members")', async () => {
    const { rootsQuery, relationsByIdQuery, italyQuery, waysQuery } = await import('../cammini/overpassQueries')
    const e = REGISTRY.find(x => x.id === 'via-francigena')!
    for (const q of [rootsQuery(e), relationsByIdQuery([1, 2]), italyQuery([1]), waysQuery([1])]) {
      expect(q).not.toMatch(/out [a-z ]*members/)
      expect(q).toMatch(/\nout (body|ids|geom);$/)
    }
  })
})

describe('radici per id', () => {
  it('la Francigena parte dalla superroute italiana per id, senza ricerca per nome', async () => {
    const { rootsQuery } = await import('../cammini/overpassQueries')
    const q = rootsQuery(REGISTRY.find(x => x.id === 'via-francigena')!)
    expect(q).toContain('rel(id:955907)')
    expect(q).not.toContain('name')
  })
})

describe('parametri delle query', () => {
  it('niente maxsize e timeout contenuti (Overpass rifiuta le query che chiedono molto)', async () => {
    const { rootsQuery, relationsByIdQuery, italyQuery, waysQuery } = await import('../cammini/overpassQueries')
    const e = REGISTRY.find(x => x.id === 'via-francigena')!
    for (const q of [rootsQuery(e), relationsByIdQuery([1]), italyQuery([1]), waysQuery([1])]) {
      expect(q).not.toContain('maxsize')
      expect(Number(/timeout:(\d+)/.exec(q)![1])).toBeLessThanOrEqual(180)
    }
  })
})
