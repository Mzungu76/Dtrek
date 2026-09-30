import { describe, it, expect } from 'vitest'
import { findGuideTextForPoi } from '../poiGuideText'

const GUIDE = `## Il percorso
Si parte dal parcheggio e si segue la strada bianca per un chilometro abbondante fino al bivio.

## I luoghi da non perdere
### Santuario di Demetra
Il santuario di Demetra a Macchia Grande è un sito arcaico frequentato dal VI secolo a.C., con un'area sacra ancora leggibile nelle fondazioni.
[curiosita]Le offerte votive erano spesso spighe di grano.[/curiosita]

### Fontana vecchia
Una fontana di pietra alimentata da una sorgente che non si secca mai, punto acqua affidabile.

## Consigli
Portare acqua a sufficienza e scarponi con buona suola per il fondo sconnesso.`

describe('findGuideTextForPoi', () => {
  it('trova la sezione con il titolo del luogo e toglie il markup', () => {
    const t = findGuideTextForPoi(GUIDE, 'Santuario di Demetra a Macchia Grande')
    expect(t).toContain('sito arcaico')
    expect(t).not.toContain('[curiosita]')
  })
  it('ricade sui paragrafi che citano il luogo', () => {
    const t = findGuideTextForPoi(GUIDE, 'Fontana')
    expect(t).toContain('sorgente')
  })
  it('ritorna null se la guida non ne parla', () => {
    expect(findGuideTextForPoi(GUIDE, 'Castello di Vetralla')).toBeNull()
    expect(findGuideTextForPoi('', 'Fontana')).toBeNull()
    expect(findGuideTextForPoi(GUIDE, undefined)).toBeNull()
  })
})
