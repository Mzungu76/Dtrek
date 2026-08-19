import { describe, it, expect } from 'vitest'
import { mapOsmSacScale } from '../sacScale'

describe('mapOsmSacScale', () => {
  it('mappa ogni valore standard OSM alla sigla T1-T6 corretta', () => {
    expect(mapOsmSacScale('hiking')).toBe('T1')
    expect(mapOsmSacScale('mountain_hiking')).toBe('T2')
    expect(mapOsmSacScale('demanding_mountain_hiking')).toBe('T3')
    expect(mapOsmSacScale('alpine_hiking')).toBe('T4')
    expect(mapOsmSacScale('demanding_alpine_hiking')).toBe('T5')
    expect(mapOsmSacScale('difficult_alpine_hiking')).toBe('T6')
  })

  it('non riconosce le sigle T1-T6 grezze come se fossero già il valore OSM (il bug corretto da questo fix)', () => {
    expect(mapOsmSacScale('T5')).toBeNull()
  })

  it('ritorna null per un valore sconosciuto', () => {
    expect(mapOsmSacScale('qualcosa_di_inventato')).toBeNull()
  })

  it('ritorna null per undefined/stringa vuota', () => {
    expect(mapOsmSacScale(undefined)).toBeNull()
    expect(mapOsmSacScale('')).toBeNull()
  })
})
