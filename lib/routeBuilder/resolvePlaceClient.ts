// Risoluzione nome→coordinata lato client per il route builder — stesso schema già usato in
// components/profilo/SectionIndirizzo.tsx per l'indirizzo di partenza: prova PRIMA una chiamata
// diretta dal browser a Nominatim, e solo se fallisce ripiega sull'endpoint server
// (/api/route-build/resolve-place). Motivo: la policy di Nominatim throttla/blocca molti IP
// server/cloud (Vercel compreso), mentre le richieste dirette dal browser di ogni singolo utente
// restano sotto la soglia (1 richiesta/secondo per IP) per costruzione — lo stesso limite pesa
// oggi su TUTTI gli utenti insieme quando la chiamata parte dal server, invece che su ciascuno
// singolarmente. Non sostituisce l'endpoint server (che resta necessario per i livelli Overpass-
// per-nome e AI, mai disponibili dal browser) — lo scavalca solo quando basta Nominatim da solo,
// il caso più frequente in assoluto (l'anteprima dal vivo mentre si digita).
export interface ClientResolvedPlace {
  lat: number
  lon: number
  displayName: string
}

async function resolveViaNominatimBrowser(query: string): Promise<ClientResolvedPlace | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'json', limit: '1', countrycodes: 'it' })}`,
      { headers: { 'Accept': 'application/json' } },
    )
    if (!res.ok) return null
    const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    const hit = results[0]
    if (!hit) return null
    return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), displayName: hit.display_name }
  } catch {
    return null
  }
}

/**
 * Risolve un luogo per il route builder: prova prima Nominatim direttamente dal browser, poi
 * ripiega su /api/route-build/resolve-place (che a sua volta prova ancora Nominatim lato server,
 * poi Overpass per nome, poi — se richiesto e disponibile — l'AI). `useAi` si applica solo al
 * ripiego server, mai al tentativo diretto (Nominatim da solo non ha un livello AI).
 */
export async function resolvePlaceClientFirst(query: string, useAi: boolean): Promise<ClientResolvedPlace | null> {
  const direct = await resolveViaNominatimBrowser(query)
  if (direct) return direct

  try {
    const res = await fetch(`/api/route-build/resolve-place?q=${encodeURIComponent(query)}&useAi=${useAi}`)
    const data = await res.json()
    return data?.place ?? null
  } catch {
    return null
  }
}
