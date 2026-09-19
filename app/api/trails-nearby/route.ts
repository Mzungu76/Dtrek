import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { findCachedTrailsNearPoint } from '@/lib/trailsCache'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 60

export interface TrailNearbyItem {
  id: number
  name: string
  distanceKm: number | null
  elevationGain: number | null
  // Campi in più rispetto a quanto serve solo per disegnare il tracciato (elevationLoss,
  // estimatedTimeMin, dataQuality) — servono a CreaGuidaMapSearch.tsx per costruire un
  // FoundRouteItem completo (vedi lib/routeBuilder/foundRoute.ts's foundRouteItemFromCachedTrail)
  // quando l'utente tocca "Crea guida" su un pin Sentiero, senza una seconda chiamata di rete.
  elevationLoss: number | null
  estimatedTimeMin: number | null
  dataQuality: string
  difficulty: string | null
  routeType: string
  geometry: [number, number][]
  // Campi puramente descrittivi (mai usati per costruire il FoundRouteItem) — per la scheda del
  // pin su CreaGuidaMapSearch.tsx (tab "Dettagli"/"Descrizione"), assenti per la maggior parte
  // delle righe importate da OSM (nessun fallback fabbricato: la UI nasconde ciò che manca).
  description: string | null
  fromLabel: string | null
  toLabel: string | null
  ref: string | null
  caiScale: string | null
  operator: string | null
  network: string | null
}

/**
 * POST /api/trails-nearby — sentieri già presenti nella cache `trails` (import OSM nazionale,
 * lib/trailsCache.ts) vicino a un punto, per il layer "Percorsi" della mappa di test
 * (components/mete/MeteSearchMap.tsx). Stessa fonte dati e stessa funzione di lettura
 * (findCachedTrailsNearPoint) già usata dalla ricerca "Esistenti" del wizard Costruisci-o-trova
 * (lib/routeBuilder/searchSteps.ts) — qui solo un elenco per l'area visibile, senza risoluzione
 * POI/punteggio provvisorio (quella pipeline resta dietro /api/route-build/search, invariata).
 * Un risultato qui non è ancora una Meta salvata: nessun link "Apri", solo anteprima sulla mappa.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let lat: number, lon: number, radiusKm: number
  try {
    const body = await req.json()
    lat = Number(body.lat)
    lon = Number(body.lon)
    radiusKm = Number(body.radiusKm)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new Error('parametri non validi')
    }
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  try {
    const rows = await findCachedTrailsNearPoint(lat, lon, radiusKm, MAX_LIMIT)
    const items: TrailNearbyItem[] = rows.map(r => ({
      id: r.osmRelationId,
      name: r.name,
      distanceKm: r.distanceKm,
      elevationGain: r.elevationGain,
      elevationLoss: r.elevationLoss,
      estimatedTimeMin: r.estimatedTimeMin,
      dataQuality: r.dataQuality,
      difficulty: r.difficulty ?? null,
      routeType: r.routeType,
      geometry: r.geometrySimplified,
      description: r.description ?? null,
      fromLabel: r.fromLabel ?? null,
      toLabel: r.toLabel ?? null,
      ref: r.ref ?? null,
      caiScale: r.caiScale ?? null,
      operator: r.operator ?? null,
      network: r.network ?? null,
    }))
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[trails-nearby]', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
