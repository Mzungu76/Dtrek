'use client'

export interface SpeciesIdentification {
  scientificName: string
  commonName: string | null
  iconicTaxon: string | null
  score: number
}

/** Online-only: calls /api/flora-fauna-identify, which proxies to iNaturalist's computer
 * vision API (see that route's comments for the known auth-requirement caveat). Throws with
 * a user-facing-safe message on any failure — the caller shows it as "servizio non disponibile". */
export async function identifySpeciesFromPhoto(imageDataUrl: string, lat?: number, lon?: number): Promise<SpeciesIdentification[]> {
  const res = await fetch('/api/flora-fauna-identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, lat, lon }),
  })
  if (!res.ok) throw new Error('Servizio di riconoscimento non disponibile')
  const data = await res.json() as { results: SpeciesIdentification[] }
  return data.results
}
