import { describe, it, expect } from 'vitest'
import { buildEnrichQuery, parseEnrichRows, buildEnrichUpdate } from '../mic/enrich'

const row = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]))

describe('buildEnrichQuery', () => {
  it('costruisce un VALUES con gli IRI dei CIS richiesti', () => {
    const q = buildEnrichQuery(['101608', '105665'])
    expect(q).toContain('<http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/101608>')
    expect(q).toContain('<http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/105665>')
    expect(q).toContain('l0:description')
  })

  it('scarta gli ID non numerici (mai testo libero dentro un IRI)', () => {
    const q = buildEnrichQuery(['101608', '1> } DROP', 'abc'])
    expect(q).toContain('/101608>')
    expect(q).not.toContain('DROP')
    expect(q).not.toContain('/abc>')
  })
})

describe('parseEnrichRows', () => {
  it('raggruppa per CIS, ripulisce mailto: e tiene il primo valore non vuoto', () => {
    const map = parseEnrichRows([
      row({ cis: 'http://x/CulturalInstituteOrSite/101608', description: ' Testo ', phone: '0766', email: 'mailto:a@b.it' }),
      row({ cis: 'http://x/CulturalInstituteOrSite/101608', phone: '999', website: 'http://w.it' }),
    ])
    expect(map.get('101608')).toEqual({ description: 'Testo', phone: '0766', email: 'a@b.it', website: 'http://w.it' })
  })

  it('ignora valori vuoti', () => {
    const map = parseEnrichRows([row({ cis: 'http://x/CulturalInstituteOrSite/1', description: '   ' })])
    expect(map.get('1')).toEqual({})
  })
})

describe('buildEnrichUpdate', () => {
  const empty = { description: null, website: null, phone: null, email: null, metadata: null }
  const at = '2026-09-30T00:00:00Z'

  it('riempie i campi vuoti e registra la provenienza per campo', () => {
    const u = buildEnrichUpdate(empty, { description: 'Testo', phone: '0766' }, '101608', at)!
    expect(u.description).toBe('Testo')
    expect(u.phone).toBe('0766')
    expect(u.website).toBeUndefined()
    const prov = (u.metadata as { fieldProvenance: Record<string, { sourceUrl: string }> }).fieldProvenance
    expect(Object.keys(prov).sort()).toEqual(['description', 'phone'])
    expect(prov.description.sourceUrl).toContain('/101608')
  })

  it('non sovrascrive un campo già valorizzato e conserva la metadata esistente', () => {
    const existing = { ...empty, description: 'Già qui', metadata: { coordinatesUnreliable: true } }
    const u = buildEnrichUpdate(existing, { description: 'Nuovo', website: 'http://w.it' }, '1', at)!
    expect(u.description).toBeUndefined()
    expect(u.website).toBe('http://w.it')
    expect((u.metadata as Record<string, unknown>).coordinatesUnreliable).toBe(true)
  })

  it('null quando non c\'è nulla da scrivere', () => {
    expect(buildEnrichUpdate({ ...empty, description: 'x' }, { description: 'y' }, '1', at)).toBeNull()
    expect(buildEnrichUpdate(empty, {}, '1', at)).toBeNull()
  })
})
