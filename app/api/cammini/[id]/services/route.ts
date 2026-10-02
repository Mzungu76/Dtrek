import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchServicesAlongTrack } from '@/lib/cammini/servicesServer'
import type { ServiceItem } from '@/lib/cammini/services'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export interface TappaServices {
  ordinal: number
  services: ServiceItem[]
  /** Quando sono stati letti da OpenStreetMap (ISO): i dati si ricontrollano dopo un po'. */
  fetchedAt: string
}

/** Dopo questo tempo i servizi in cache si rileggono da OpenStreetMap (negozi e alloggi cambiano). */
const MAX_AGE_MS = 90 * 24 * 3600 * 1000

// Servizi di UNA tappa (acqua, cibo, negozi, alloggi, trasporti, farmacie), dal catalogo se già letti e recenti,
// altrimenti da OpenStreetMap, e salvati per tutti (docs/piano-cammini.md, Fase E). Un elenco vuoto per errore di
// rete non si mette in cache.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const ordinal = Number(req.nextUrl.searchParams.get('ordinal'))
  if (!Number.isInteger(ordinal) || ordinal < 1) return NextResponse.json({ error: 'ordinal non valido' }, { status: 400 })

  const { data: row, error } = await supabase
    .from('dtrek_cammino_tappe')
    .select('polyline, services, services_at')
    .eq('cammino_id', params.id)
    .eq('ordinal', ordinal)
    .maybeSingle()
  if (error) {
    console.error('[cammini/:id/services]', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!row) return NextResponse.json({ error: 'Non trovata' }, { status: 404 })

  const cached = Array.isArray(row.services) ? (row.services as ServiceItem[]) : null
  const at = row.services_at ? new Date(row.services_at as string).getTime() : 0
  if (cached && at && Date.now() - at < MAX_AGE_MS) {
    const out: TappaServices = { ordinal, services: cached, fetchedAt: new Date(at).toISOString() }
    return NextResponse.json(out)
  }

  const polyline = Array.isArray(row.polyline) ? (row.polyline as [number, number][]) : []
  if (polyline.length < 2) return NextResponse.json({ error: 'Tappa senza tracciato' }, { status: 404 })

  try {
    const services = await fetchServicesAlongTrack(polyline)
    const fetchedAt = new Date().toISOString()
    const { error: upErr } = await supabase
      .from('dtrek_cammino_tappe')
      .update({ services, services_at: fetchedAt })
      .eq('cammino_id', params.id)
      .eq('ordinal', ordinal)
    if (upErr) console.error('[cammini/:id/services] salvataggio', upErr)
    const out: TappaServices = { ordinal, services, fetchedAt }
    return NextResponse.json(out)
  } catch (e) {
    console.error('[cammini/:id/services] fetch', e)
    // Meglio un dato vecchio che nessun dato.
    if (cached) return NextResponse.json({ ordinal, services: cached, fetchedAt: row.services_at ?? new Date(0).toISOString() } satisfies TappaServices)
    return NextResponse.json({ error: 'Servizi non disponibili' }, { status: 503 })
  }
}
