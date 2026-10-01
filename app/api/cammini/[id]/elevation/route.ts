import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { fetchDtmTileCached } from '@/lib/dtm/dtmCache'
import { elevationAtPoint } from '@/lib/dtm/slopeAspect'
import { densifyPolyline, smooth, gainLoss, downsample } from '@/lib/cammini/elevation'
import { computeProvisionalScore } from '@/lib/routeBuilder/provisionalScore'
import { ctsLabel } from '@/lib/trailScore'
import { estimateTimeMinutes } from '@/lib/trailStats'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export interface TappaElevation {
  ordinal: number
  gainM: number
  lossM: number
  /** Solo con ?profile=1: punti [distanza m, quota m] per il grafico, quota max/min e CTS stimato. */
  profile?: [number, number][]
  maxM?: number
  minM?: number
  cts?: { ts: number; label: string; color: string }
  /** Solo con ?profile=1: punti [lat, lon, quota] (stessa sequenza del profilo) per i grafici che vogliono una traccia. */
  points?: [number, number, number][]
}

// Dislivello di UNA tappa, calcolato dal DTM al primo bisogno e salvato in dtrek_cammino_tappe
// (docs/piano-cammini.md, Fase 5): le tappe sono dato di catalogo uguale per tutti, quindi si calcola
// una volta sola. La polilinea di catalogo è semplificata: si infittisce a 100 m e si liscia, il
// valore resta comunque indicativo. Con ?profile=1 si ricalcola il profilo completo (la tile DTM è
// in cache) per il grafico e il CTS della tappa.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const ordinal = Number(req.nextUrl.searchParams.get('ordinal'))
  if (!Number.isInteger(ordinal) || ordinal < 1) return NextResponse.json({ error: 'ordinal non valido' }, { status: 400 })
  const wantProfile = req.nextUrl.searchParams.get('profile') === '1'

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

  if (!wantProfile && row.elevation_gain_m != null && row.elevation_loss_m != null) {
    const out: TappaElevation = { ordinal, gainM: row.elevation_gain_m, lossM: row.elevation_loss_m }
    return NextResponse.json(out)
  }

  const polyline = Array.isArray(row.polyline) ? (row.polyline as [number, number][]) : []
  if (polyline.length < 2) return NextResponse.json({ error: 'Tappa senza tracciato' }, { status: 404 })

  let tile
  try {
    tile = await fetchDtmTileCached(bboxBufferMeters(polyline, 50))
  } catch {
    tile = null
  }
  if (!tile) return NextResponse.json({ error: 'Quote non disponibili' }, { status: 503 })

  const dense = densifyPolyline(polyline, 100)
  const raw = dense.map(([lat, lon]) => elevationAtPoint(tile, lat, lon))
  // Un punto senza quota (bordo della tile) ripete il vicino anziché inventare un salto.
  let last: number | null = raw.find(v => v != null) ?? null
  if (last == null) return NextResponse.json({ error: 'Quote non disponibili' }, { status: 503 })
  const filled = raw.map(v => { if (v != null) last = v; return last as number })
  const alts = smooth(filled, 5)
  const { gainM, lossM, maxM, minM } = gainLoss(alts)

  const out: TappaElevation = { ordinal, gainM, lossM }
  if (wantProfile) {
    const idx = downsample(dense.map((_, i) => i), 120)
    out.profile = idx.map(i => [Math.round(dense[i][2]), Math.round(alts[i])])
    out.points = idx.map(i => [dense[i][0], dense[i][1], Math.round(alts[i])])
    out.maxM = maxM
    out.minM = minM
    const distanceMeters = dense[dense.length - 1][2]
    const now = new Date().toISOString()
    const { ts } = computeProvisionalScore({
      routePolyline: polyline,
      trackPoints: dense.map(([lat, lon], i) => ({ time: now, lat, lon, altitudeMeters: alts[i] })),
      distanceMeters, elevationGain: gainM, elevationLoss: lossM, altitudeMax: maxM, altitudeMin: minM,
      estimatedTimeSeconds: estimateTimeMinutes(distanceMeters / 1000, gainM) * 60,
      pois: [],
    })
    out.cts = { ts: Math.round(ts), ...ctsLabel(ts) }
  }

  const { error: upErr } = await supabase
    .from('dtrek_cammino_tappe')
    .update({ elevation_gain_m: gainM, elevation_loss_m: lossM })
    .eq('cammino_id', params.id)
    .eq('ordinal', ordinal)
  if (upErr) console.error('[cammini/:id/elevation] salvataggio', upErr)
  return NextResponse.json(out)
}
