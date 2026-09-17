import { describe, it, expect } from 'vitest'
import { parsePopulationCsv, classifySubtype } from '../istat/population'

describe('parsePopulationCsv', () => {
  it('fa il padding a 6 cifre di pro_com_t (il CSV non lo zero-padda, municipality_istat_code sì)', () => {
    const map = parsePopulationCsv('pro_com_t,pop_res_21\n1001,2548\n58089,1234')
    expect(map.get('001001')).toBe(2548)
    expect(map.get('058089')).toBe(1234)
  })

  it('un codice già a 6 cifre resta invariato', () => {
    const map = parsePopulationCsv('pro_com_t,pop_res_21\n058089,1234')
    expect(map.get('058089')).toBe(1234)
  })

  it('ignora righe senza popolazione valida', () => {
    const map = parsePopulationCsv('pro_com_t,pop_res_21\n1001,\n1002,abc\n1003,500')
    expect(map.size).toBe(1)
    expect(map.get('001003')).toBe(500)
  })

  it('colonne in ordine diverso o mancanti → mappa vuota invece di un errore', () => {
    expect(parsePopulationCsv('altro,ancora\n1,2').size).toBe(0)
  })

  it('solo intestazione, nessuna riga dati → mappa vuota', () => {
    expect(parsePopulationCsv('pro_com_t,pop_res_21').size).toBe(0)
  })
})

describe('classifySubtype', () => {
  it('sopra la soglia → citta', () => {
    expect(classifySubtype(50000, 15000)).toBe('citta')
    expect(classifySubtype(15000, 15000)).toBe('citta')
  })

  it('sotto la soglia → borgo', () => {
    expect(classifySubtype(14999, 15000)).toBe('borgo')
    expect(classifySubtype(80, 15000)).toBe('borgo')
  })

  it('soglia personalizzata', () => {
    expect(classifySubtype(6000, 5000)).toBe('citta')
    expect(classifySubtype(4000, 5000)).toBe('borgo')
  })
})
