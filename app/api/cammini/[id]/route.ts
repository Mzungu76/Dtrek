import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { camminoStatsFromMetadata } from '@/lib/metaSearch/searchCammini'
import type { CamminoStats } from '@/lib/metaSearch/types'

export const dynamic = 'force-dynamic'

export interface CamminoTappaDetail {
  ordinal: number
  name: string
  fromName: string | null
  toName: string | null
  lengthM: number
  source: 'official' | 'computed'
  /** false: la tappa si chiude in aperta campagna, non in un paese (tappe calcolate). */
  endsAtAnchor: boolean | null
  /** Null finché il dislivello non è calcolato dal DTM (OpenStreetMap non porta le quote). */
  elevationGainM: number | null
  elevationLossM: number | null
  polyline: [number, number][]
}

export interface CamminoDetail {
  id: string
  name: string
  description: string | null
  officialUrl: string | null
  region: string | null
  stats: CamminoStats
  tappe: CamminoTappaDetail[]
}

// Scheda di un Cammino del catalogo con le sue tappe (docs/piano-cammini.md, Fase 3). Solo cammini
// "pronti": quelli da rivedere non sono visibili agli utenti.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data: place, error } = await supabase
    .from('dtrek_places')
    .select('id, name, description, region, official_url, metadata')
    .eq('id', params.id)
    .eq('meta_type', 'cammino')
    .maybeSingle()
  if (error) {
    console.error('[cammini/:id]', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  const stats = place ? camminoStatsFromMetadata(place.metadata as Record<string, unknown> | null) : null
  if (!place || !stats || stats.quality !== 'pronto') return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const { data: rows, error: tappeError } = await supabase
    .from('dtrek_cammino_tappe')
    .select('ordinal, name, from_name, to_name, length_m, source, ends_at_anchor, elevation_gain_m, elevation_loss_m, polyline')
    .eq('cammino_id', place.id)
    .order('ordinal', { ascending: true })
  if (tappeError) {
    console.error('[cammini/:id] tappe', tappeError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }

  const body: CamminoDetail = {
    id: place.id as string,
    name: place.name as string,
    description: (place.description as string | null) ?? null,
    officialUrl: (place.official_url as string | null) ?? null,
    region: (place.region as string | null) ?? null,
    stats,
    tappe: (rows ?? []).map(r => ({
      ordinal: r.ordinal as number,
      name: r.name as string,
      fromName: (r.from_name as string | null) ?? null,
      toName: (r.to_name as string | null) ?? null,
      lengthM: r.length_m as number,
      source: r.source as 'official' | 'computed',
      endsAtAnchor: (r.ends_at_anchor as boolean | null) ?? null,
      elevationGainM: (r.elevation_gain_m as number | null) ?? null,
      elevationLossM: (r.elevation_loss_m as number | null) ?? null,
      polyline: (Array.isArray(r.polyline) ? r.polyline : []) as [number, number][],
    })),
  }
  return NextResponse.json(body)
}
