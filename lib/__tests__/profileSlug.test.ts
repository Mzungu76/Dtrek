import { describe, expect, it } from 'vitest'
import { normalizeSlug, validateSlug } from '../profileSlug'

describe('normalizeSlug', () => {
  it('taglia gli spazi e minuscolizza', () => {
    expect(normalizeSlug('  Marco-Rossi  ')).toBe('marco-rossi')
  })
})

describe('validateSlug', () => {
  it('accetta uno slug valido', () => {
    expect(validateSlug('marco-rossi')).toBeNull()
    expect(validateSlug('marco123')).toBeNull()
  })

  it('rifiuta troppo corto', () => {
    expect(validateSlug('ab')).not.toBeNull()
  })

  it('rifiuta troppo lungo', () => {
    expect(validateSlug('a'.repeat(31))).not.toBeNull()
  })

  it('accetta esattamente ai limiti di lunghezza', () => {
    expect(validateSlug('abc')).toBeNull()
    expect(validateSlug('a'.repeat(30))).toBeNull()
  })

  it('accetta le maiuscole normalizzandole (non è un motivo di rifiuto da solo)', () => {
    expect(validateSlug('Marco-Rossi')).toBeNull()
    expect(validateSlug('MARCO')).toBeNull()
  })

  it('rifiuta spazi e caratteri non ammessi', () => {
    expect(validateSlug('marco rossi')).not.toBeNull()
    expect(validateSlug('marco_rossi')).not.toBeNull()
    expect(validateSlug('marco.rossi')).not.toBeNull()
    expect(validateSlug('marcò')).not.toBeNull()
  })

  it('rifiuta trattini iniziali, finali o doppi', () => {
    expect(validateSlug('-marco')).not.toBeNull()
    expect(validateSlug('marco-')).not.toBeNull()
    expect(validateSlug('marco--rossi')).not.toBeNull()
  })

  it('rifiuta le parole riservate, case-insensitive', () => {
    expect(validateSlug('admin')).not.toBeNull()
    expect(validateSlug('ADMIN')).not.toBeNull()
  })
})
