'use client'

export interface SpeciesIdentification {
  scientificName: string
  commonName: string | null
  iconicTaxon: string | null
  score: number
}

/** fetch() stesso lancia solo per un fallimento di rete (DNS/connessione assente) — mai per una
 *  risposta del server, anche se non-ok. È il segnale più affidabile che manca davvero la
 *  connessione, distinto da SpeciesIdentifyServiceError qui sotto (risposta arrivata, ma il
 *  servizio ha rifiutato/fallito). Il chiamante usa questa distinzione per decidere se mettere la
 *  richiesta in coda per un nuovo tentativo automatico, o mostrare un errore vero e proprio. */
export class SpeciesIdentifyOfflineError extends Error {}
/** La richiesta è arrivata al server ma il servizio di riconoscimento ha risposto con un errore
 *  (vedi app/api/flora-fauna-identify/route.ts — l'endpoint iNaturalist usato richiede
 *  un'autenticazione OAuth che questa app non ha ancora, quindi può rifiutare anche con una
 *  connessione perfettamente funzionante). Non va mai confusa con "sei offline". */
export class SpeciesIdentifyServiceError extends Error {}

/** Chiama /api/flora-fauna-identify, che fa da proxy verso l'API di computer vision di
 *  iNaturalist (vedi quella route per la nota nota sul limite di autenticazione). */
export async function identifySpeciesFromPhoto(imageDataUrl: string, lat?: number, lon?: number): Promise<SpeciesIdentification[]> {
  let res: Response
  try {
    res = await fetch('/api/flora-fauna-identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, lat, lon }),
    })
  } catch {
    throw new SpeciesIdentifyOfflineError('offline')
  }
  if (!res.ok) throw new SpeciesIdentifyServiceError('servizio non disponibile')
  const data = await res.json() as { results: SpeciesIdentification[] }
  return data.results
}
