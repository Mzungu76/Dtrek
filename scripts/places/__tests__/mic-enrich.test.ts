import { describe, it, expect } from 'vitest'
import { buildEnrichQuery, parseEnrichRows, buildEnrichUpdate, formatOpeningHours } from '../mic/enrich'

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
  const empty = { description: null, website: null, phone: null, email: null, opening_hours: null, metadata: null }
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

describe('formatOpeningHours', () => {
  it('raggruppa i giorni consecutivi con le stesse fasce (Biblioteca nazionale centrale di Roma)', () => {
    const r = formatOpeningHours(
      'Lunedì (08:30,19:00)|Martedì (08:30,19:00)|Mercoledì (08:30,19:00)|Giovedì (08:30,19:00)|Venerdì (08:30,14:30)',
      'Sabato|Domenica',
    )
    expect(r.text).toBe('Lun–Gio 08:30–19:00; Ven 08:30–14:30; Sab–Dom chiuso')
    expect(r.closedAllDays).toBe(false)
  })

  it('gestisce più fasce nello stesso giorno e un giorno isolato', () => {
    const r = formatOpeningHours('Sabato (09:00,13:00) (15:00,18:00)', undefined)
    expect(r.text).toBe('Sab 09:00–13:00, 15:00–18:00')
  })

  it('"Chiusura" su tutti e 7 i giorni senza orari → nessun testo, closedAllDays (Tolfa/Canepina)', () => {
    const r = formatOpeningHours(undefined, 'Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica')
    expect(r.text).toBeUndefined()
    expect(r.closedAllDays).toBe(true)
  })

  it('solo alcuni giorni di chiusura senza orari → nessun testo, non "chiuso sempre"', () => {
    const r = formatOpeningHours(undefined, 'Sabato|Domenica')
    expect(r).toEqual({ closedAllDays: false })
  })

  it('testo non riconosciuto → nessun orario inventato', () => {
    expect(formatOpeningHours('su prenotazione', undefined)).toEqual({ closedAllDays: false })
  })
})

describe('orari in parseEnrichRows / buildEnrichUpdate', () => {
  const at = '2026-09-30T00:00:00Z'
  const empty = { description: null, website: null, phone: null, email: null, opening_hours: null, metadata: null }

  it('parseEnrichRows calcola il testo orari una sola volta per CIS', () => {
    const map = parseEnrichRows([
      row({ cis: 'http://x/CulturalInstituteOrSite/9', openingText: 'Lunedì (09:00,17:00)', phone: '1' }),
      row({ cis: 'http://x/CulturalInstituteOrSite/9', openingText: 'Lunedì (09:00,17:00)', phone: '2' }),
    ])
    expect(map.get('9')?.openingHours).toBe('Lun 09:00–17:00')
  })

  it('scrive opening_hours solo se vuoto', () => {
    const u = buildEnrichUpdate(empty, { openingHours: 'Lun 09:00–17:00' }, '9', at)!
    expect(u.opening_hours).toBe('Lun 09:00–17:00')
    expect(buildEnrichUpdate({ ...empty, opening_hours: 'Mo-Fr 09:00-18:00' }, { openingHours: 'Lun 09:00–17:00' }, '9', at)).toBeNull()
  })

  it('closedAllDays: nessun opening_hours, solo provenienza a bassa confidenza, una volta sola', () => {
    const u = buildEnrichUpdate(empty, { closedAllDays: true }, '101608', at)!
    expect(u.opening_hours).toBeUndefined()
    const prov = (u.metadata as { fieldProvenance: Record<string, { confidence: string; status: string }> }).fieldProvenance
    expect(prov.openingHours).toMatchObject({ confidence: 'low', status: 'stale' })
    const again = buildEnrichUpdate({ ...empty, metadata: u.metadata as Record<string, unknown> }, { closedAllDays: true }, '101608', at)
    expect(again).toBeNull()
  })
})
