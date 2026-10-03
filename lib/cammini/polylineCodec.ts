import type { LatLon } from './geometry'

// Codifica "encoded polyline" (precisione 1e-5, ~1 m) per trasportare le tappe in uno script SQL
// compatto: il database la decodifica con una funzione temporanea (vedi scripts/places/cammini/import-tracks.ts).

function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1
  let out = ''
  while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5 }
  return out + String.fromCharCode(n + 63)
}

export function encodePolyline(line: LatLon[]): string {
  let pLat = 0, pLon = 0, out = ''
  for (const [lat, lon] of line) {
    const la = Math.round(lat * 1e5), lo = Math.round(lon * 1e5)
    out += encodeValue(la - pLat) + encodeValue(lo - pLon)
    pLat = la; pLon = lo
  }
  return out
}

export function decodePolyline(s: string): LatLon[] {
  const out: LatLon[] = []
  let i = 0, lat = 0, lon = 0
  const next = () => {
    let shift = 0, result = 0, b: number
    do { b = s.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < s.length) { lat += next(); lon += next(); out.push([lat / 1e5, lon / 1e5]) }
  return out
}
