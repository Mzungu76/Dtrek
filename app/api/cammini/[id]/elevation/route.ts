import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export interface TappaElevation {
  ordinal: number
  gainM: number
  lossM: number
}

// Dislivello di UNA tappa, calcolato dal DTM al primo bisogno e salvato in dtrek_cammino_tappe
// (docs/piano-cammini.md, Fase 5): le tappe sono dato di catalogo uguale per tutti, quindi si calcola
// una volta sola. Il profilo usa i vertici della tappa semplificata: il valore è indicativo.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const ordinal = Number(req.nextUrl.searchParams.get('ordinal'))
  if (!Number.isInteger(ordinal) || ordinal < 1) return NextResponse.json({ error: 'ordinal non valido' }, { status: 400 })

  const { data: row, error } = await supabase
    .from('dtrek_cammino_tappe')
    .select('elevation_gain_m, elevation_loss_m, polyline')
    .eq('cammino_id', params.id)
    .eq('ordinal', ordinal)
    .maybeSingle()
  if (error) {
    console.error('[cammini/:id/elevation]', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Non trovata' }, { status: 404 })

  if (row.elevation_gain_m != null && row.elevation_loss_m != null) {
    const out: TappaElevation = { ordinal, gainM: row.elevation_gain_m, lossM: row.elevation_loss_m }
    return NextResponse.json(out)
  }

  const polyline = Array.isArray(row.polyline) ? (row.polyline as [number, number][]) : []
  let enriched
  try {
    enriched = await enrichGeometryWithElevation(polyline)
  } catch {
    enriched = null
  }
  if (!enriched) return NextResponse.json({ error: 'Quote non disponibili' }, { status: 503 })

  const out: TappaElevation = {
    ordinal,
    gainM: Math.round(enriched.elevationGain),
    lossM: Math.round(enriched.elevationLoss),
  }
  const { error: upErr } = await supabase
    .from('dtrek_cammino_tappe')
    .update({ elevation_gain_m: out.gainM, elevation_loss_m: out.lossM })
    .eq('cammino_id', params.id)
    .eq('ordinal', ordinal)
  if (upErr) console.error('[cammini/:id/elevation] salvataggio', upErr)
  return NextResponse.json(out)
}
