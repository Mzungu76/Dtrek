import { describe, it, expect } from 'vitest'
import { navStorageKey } from '../navKey'

describe('navStorageKey', () => {
  it('lascia invariato l\'id per un percorso senza tappa', () => {
    expect(navStorageKey('abc')).toBe('abc')
    expect(navStorageKey('abc', null)).toBe('abc')
  })
  it('separa i dati di ogni tappa dello stesso cammino', () => {
    expect(navStorageKey('abc', 1)).not.toBe(navStorageKey('abc', 2))
    expect(navStorageKey('abc', 0)).toBe('abc#t0')
  })
})
