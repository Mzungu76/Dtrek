// Soglie condivise dalla pipeline "Su misura", sia lato server (app/api/route-build/route.ts,
// lib/routeBuilder/buildSteps.ts, i tre endpoint app/api/route-build/step/*) sia lato client
// (components/upload/RouteBuilder.tsx, che orchestra i tre step e deve applicare esattamente le
// stesse soglie di ritentativo) — deliberatamente SENZA nessun import server-only (niente
// lib/supabase, niente 'next/server'): questo file finisce anche nel bundle del browser, un
// import sbagliato qui rischierebbe di trascinarci dentro la service_role key di Supabase (vedi
// l'avvertimento in lib/supabase.ts).
export const MIN_TARGET_DISTANCE_KM = 1
// Abbassato da 20 a 15: un target più alto allarga il bbox interrogato via Overpass fino a superare,
// in aree con rete fitta, il tempo disponibile prima che la funzione venga terminata dalla
// piattaforma (504 osservato in produzione) — vedi anche il restringimento dei tag highway in
// lib/routeBuilder/osmGraph.ts, la causa principale dello stesso problema.
export const MAX_TARGET_DISTANCE_KM = 15

// Tagli ammessi per il filtro "raggio di ricerca" del wizard (visibile in mappa, condiviso da
// ricerca base e avanzata — vedi components/upload/RouteBuilder.tsx).
export const ALLOWED_RADIUS_KM = [5, 10, 20, 50, 100]
export const DEFAULT_RADIUS_KM = 20

// Quanti candidati grezzi arricchire davvero (DTM + POI) per passata — i generatori li restituiscono
// già ordinati dal più vicino al target di lunghezza (vedi loopBuilder.ts), quindi tagliare qui
// tiene i migliori.
export const ENRICH_CAP = 8

// Sotto questa soglia di percorsi costruiti algoritmicamente (senza destinazione), il client ritenta
// con lunghezze leggermente diverse (vedi RETRY_DISTANCE_FACTORS): in una rete di sentieri rada
// attorno al punto di partenza, un'unica lunghezza target può lasciare sopravvivere pochi candidati
// realmente distinti, mentre lunghezze leggermente diverse seguono spesso percorsi geometricamente
// diversi.
export const MIN_BUILT_RESULTS = 8
// Fattori di lunghezza alternativi provati in caso di scarsità (es. per un obiettivo di 8 km: un
// tentativo a ~6 km e uno a ~10 km) — comunque clampati entro MIN/MAX_TARGET_DISTANCE_KM.
export const RETRY_DISTANCE_FACTORS = [0.75, 1.25]
export const MAX_BUILT_RESULTS = 14

// Firma approssimata di un candidato (bucket di lunghezza + punto vicino alla partenza) usata per
// non ripetere nel merge lo stesso tragitto emerso da due tentativi con lunghezza diversa — non
// serve un'identità esatta, solo evitare doppioni palesi. Pura (nessun I/O), quindi utilizzabile
// sia lato server (retry della pipeline monolitica) sia lato client (retry a step).
export function candidateSignature(c: { distanceMeters: number; routePolyline: [number, number][] }): string {
  const distBucket = Math.round(c.distanceMeters / 100)
  const p = c.routePolyline[Math.min(3, c.routePolyline.length - 1)]
  const dirKey = p ? `${p[0].toFixed(3)},${p[1].toFixed(3)}` : ''
  return `${distBucket}_${dirKey}`
}
