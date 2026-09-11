import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { normalizeDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '@/lib/dashboardConfig'

export const dynamic = 'force-dynamic'

// GET /api/dashboard-config → la configurazione della Bacheca-dashboard dell'utente (schede +
// widget per scheda), con i default per un account mai personalizzato.
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('dashboard_config')
      .eq('user_id', user.id)
      .single()
    if (error || !data?.dashboard_config) return NextResponse.json(DEFAULT_DASHBOARD_CONFIG)
    return NextResponse.json(normalizeDashboardConfig(data.dashboard_config))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/dashboard-config { ...DashboardConfig } → sostituisce l'intera configurazione, stesso
// contratto "corpo sempre completo" di /api/diary-config (niente merge parziale lato server).
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const config = normalizeDashboardConfig(body)

    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update({ dashboard_config: config })
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, dashboard_config: config })
      if (error) throw error
    }
    return NextResponse.json(config)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
