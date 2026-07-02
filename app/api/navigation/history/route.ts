import { NextRequest, NextResponse } from 'next/server'
import { getUserScopedClient } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// Deletes every hike_navigation_sessions row owned by the caller — events
// and track fixes cascade automatically (ON DELETE CASCADE, see
// supabase/migrations/add_navigation_system.sql). Runs through the
// anon-key/RLS-scoped client (not service-role), so the delete can only
// ever touch the caller's own rows regardless of any filter bug here.
export async function DELETE(req: NextRequest) {
  try {
    const scoped = await getUserScopedClient(req)
    if (!scoped) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { user, supabase } = scoped

    const { error } = await supabase
      .from('hike_navigation_sessions')
      .delete()
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/navigation/history] DELETE failed:', e)
    return NextResponse.json({ error: 'Errore durante la cancellazione della cronologia di navigazione' }, { status: 500 })
  }
}
