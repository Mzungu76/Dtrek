import { haversineM } from '../geoUtils'

// Distanza dal punto noto più vicino, con una griglia a celle di ~0,25° invece di confrontare ogni
// candidato con tutti i ~8000 comuni (migliaia di relazioni × migliaia di comuni = lento e inutile).
// Usata dalla scoperta dei cammini per capire se il centro di una relazione è in Italia.

export interface GeoPoint { lat: number; lon: number }

const CELL = 0.25

function cellKey(lat: number, lon: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`
}

export function buildNearestFinder(points: GeoPoint[]): (lat: number, lon: number) => number {
  const grid = new Map<string, GeoPoint[]>()
  for (const p of points) {
    const k = cellKey(p.lat, p.lon)
    const cell = grid.get(k)
    if (cell) cell.push(p); else grid.set(k, [p])
  }
  return (lat, lon) => {
    const cx = Math.floor(lat / CELL), cy = Math.floor(lon / CELL)
    // Anelli di celle via via più larghi finché si trova qualcosa (o si supera il raggio utile).
    let best = Infinity
    for (let ring = 0; ring <= 8; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          for (const p of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
            const d = haversineM(lat, lon, p.lat, p.lon)
            if (d < best) best = d
          }
        }
      }
      // Un anello più largo non può contenere un punto più vicino di ~ring*CELL gradi (>= 20 km a ring 1).
      if (best < Infinity && best / 1000 <= ring * 20) break
    }
    return best === Infinity ? 9999 : best / 1000
  }
}
