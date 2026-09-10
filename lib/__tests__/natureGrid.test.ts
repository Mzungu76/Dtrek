import { describe, it, expect } from 'vitest'
import { cellsForBounds, CELL_SIZE_DEG, MAX_CELLS_PER_QUERY } from '@/lib/natureGrid'

// cellsForBounds è la sola parte pura del refactor "cache per cella invece che per bbox
// dell'intero percorso" — il resto (lettura/scrittura Supabase, fetch GBIF/iNaturalist) richiede
// rete/DB reali, non riproducibili qui. Questa è la parte più a rischio di bug silenziosi
// (off-by-one sui bordi, campionamento che salta un'estremità del percorso).
describe('cellsForBounds', () => {
  it('un punto singolo ricade in una sola cella', () => {
    const cells = cellsForBounds({ minLat: 42.1, maxLat: 42.1, minLon: 12.2, maxLon: 12.2 })
    expect(cells).toHaveLength(1)
  })

  it('un percorso corto (sotto una cella di lato) tocca 1-4 celle, mai di più', () => {
    const cells = cellsForBounds({ minLat: 42.10, maxLat: 42.12, minLon: 12.20, maxLon: 12.22 })
    expect(cells.length).toBeGreaterThanOrEqual(1)
    expect(cells.length).toBeLessThanOrEqual(4)
  })

  it('due bbox diversi che cadono nella stessa cella producono la stessa chiave', () => {
    // Stessa cella (0.05° di lato): due percorsi di forma diversa che passano nella stessa zona
    // devono condividere la cache — è il punto centrale del refactor.
    const a = cellsForBounds({ minLat: 42.101, maxLat: 42.101, minLon: 12.201, maxLon: 12.201 })
    const b = cellsForBounds({ minLat: 42.109, maxLat: 42.109, minLon: 12.209, maxLon: 12.209 })
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0].key).toBe(b[0].key)
  })

  it('un punto appena oltre il bordo di una cella cade nella cella successiva', () => {
    const inCell = cellsForBounds({ minLat: 42.10, maxLat: 42.10, minLon: 12.20, maxLon: 12.20 })
    const nextCell = cellsForBounds({ minLat: 42.10 + CELL_SIZE_DEG, maxLat: 42.10 + CELL_SIZE_DEG, minLon: 12.20, maxLon: 12.20 })
    expect(inCell[0].key).not.toBe(nextCell[0].key)
  })

  it('un percorso molto lungo resta sotto MAX_CELLS_PER_QUERY grazie al campionamento', () => {
    // ~50 km di lato — molto oltre la copertura naturale di un'escursione, pensato per
    // stressare il ramo di campionamento.
    const cells = cellsForBounds({ minLat: 42.0, maxLat: 42.5, minLon: 11.0, maxLon: 11.5 })
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_QUERY)
    expect(cells.length).toBeGreaterThan(0)
  })

  it('il campionamento di un percorso lungo copre comunque entrambe le estremità', () => {
    const bounds = { minLat: 42.0, maxLat: 42.5, minLon: 11.0, maxLon: 11.5 }
    const cells = cellsForBounds(bounds)
    const lats = cells.map(c => c.bounds.minLat)
    const lons = cells.map(c => c.bounds.minLon)
    // L'estremità in basso/sinistra (minLat/minLon) è sempre il primo indice della griglia,
    // quindi sempre inclusa — il rischio reale è perdere quella in alto/destra per via dello
    // step di campionamento, che è quello che questo test verifica davvero.
    const maxCellLat = Math.floor(bounds.maxLat / CELL_SIZE_DEG) * CELL_SIZE_DEG
    const maxCellLon = Math.floor(bounds.maxLon / CELL_SIZE_DEG) * CELL_SIZE_DEG
    expect(Math.max(...lats)).toBeCloseTo(maxCellLat, 5)
    expect(Math.max(...lons)).toBeCloseTo(maxCellLon, 5)
  })

  it('le chiavi di cella sono stabili e leggibili', () => {
    const cells = cellsForBounds({ minLat: 42.13, maxLat: 42.13, minLon: 12.27, maxLon: 12.27 })
    expect(cells[0].key).toMatch(/^-?\d+\.\d{2}_-?\d+\.\d{2}$/)
  })
})
