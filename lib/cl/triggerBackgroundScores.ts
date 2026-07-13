'use client'
// Innesca il calcolo di CL ("Livello di affidabilità") e Ombra&Acqua subito all'import — stesso
// principio già usato per CTS/Sicurezza (lib/computeCtsForHike.ts, lib/computeSafetyForHike.ts):
// senza questo, la pipeline pesante (query Overpass, storico attività) partiva da zero solo alla
// prima apertura della pagina guida, sul percorso critico della UI — con budget stretti (timeout,
// maxDuration) più a rischio di saltare proprio in quel momento. I risultati vengono persistiti
// server-side (planned_hikes.si_*/s2_*), quindi la UI li ritrova già pronti (o quasi, se una
// parte è ancora in corso) quando l'utente apre il percorso, invece di dover aspettare lì.
import { refreshTsForHike } from '@/lib/computeTsForHike'
import type { Sentinel2Data } from '@/lib/cl/types'

// Fire-and-forget dal punto di vista del chiamante (non viene mai atteso), ma internamente
// aspetta la risposta di /api/trails/sentinel2 per innescare un ricalcolo del Trail Score
// aggregato (lib/computeTsForHike.ts) appena Ombra&Acqua è pronto — Trail Score v2 non dipende
// più da CL, quindi quella fetch resta puramente fire-and-forget (serve solo al badge
// Affidabilità indipendente, non al punteggio). Nessuna gestione d'errore visibile al chiamante —
// se una delle due fallisce qui, resta comunque il fallback "calcola alla prima apertura" già
// esistente in lib/cl/useCL.ts, solo senza il vantaggio di essere già pronto.
export function triggerBackgroundScores(hike: { id: string; routePolyline?: [number, number][]; osmId?: number }) {
  const hasPolyline = (hike.routePolyline?.length ?? 0) >= 2
  if (hike.osmId == null && !hasPolyline) return

  const plannedSuffix = `&planned_id=${encodeURIComponent(hike.id)}`
  const qs = hike.osmId != null
    ? `osm_relation_id=${hike.osmId}${plannedSuffix}`
    : `polyline=${encodeURIComponent(JSON.stringify(hike.routePolyline))}${plannedSuffix}`

  fetch(`/api/trails/cl?${qs}`).catch(() => {})
  fetch(`/api/trails/sentinel2?${qs}`)
    .then(r => r.json())
    .then((d: Sentinel2Data | { matched: false } | { error: string }) => {
      if ('available' in d && d.available) refreshTsForHike(hike.id).catch(() => {})
    })
    .catch(() => {})
}
