'use client'
// Innesca il calcolo di CL ("Livello di affidabilità") e Sentinel2 ("Acqua e ombra") subito
// all'import — stesso principio già usato per CTS/Sicurezza (lib/computeCtsForHike.ts,
// lib/computeSafetyForHike.ts): senza questo, la pipeline pesante (query Overpass, storico
// attività, raster satellitari multi-banda da Planetary Computer) partiva da zero solo alla prima
// apertura della pagina guida, sul percorso critico della UI — con budget stretti (timeout,
// maxDuration) più a rischio di saltare proprio in quel momento. I risultati vengono persistiti
// server-side (planned_hikes.si_*/s2_*), quindi la UI li ritrova già pronti (o quasi, se una
// parte è ancora in corso) quando l'utente apre il percorso, invece di dover aspettare lì.
//
// Fire-and-forget puro: nessun await del chiamante, nessuna gestione d'errore lato client — se
// fallisce qui, resta comunque il fallback "calcola alla prima apertura" già esistente in
// lib/cl/useCL.ts, solo senza il vantaggio di essere già pronto.
export function triggerBackgroundScores(hike: { id: string; routePolyline?: [number, number][]; osmId?: number }) {
  const hasPolyline = (hike.routePolyline?.length ?? 0) >= 2
  if (hike.osmId == null && !hasPolyline) return

  const plannedSuffix = `&planned_id=${encodeURIComponent(hike.id)}`
  const qs = hike.osmId != null
    ? `osm_relation_id=${hike.osmId}${plannedSuffix}`
    : `polyline=${encodeURIComponent(JSON.stringify(hike.routePolyline))}${plannedSuffix}`

  fetch(`/api/trails/cl?${qs}`).catch(() => {})
  fetch(`/api/trails/sentinel2?${qs}`).catch(() => {})
}
