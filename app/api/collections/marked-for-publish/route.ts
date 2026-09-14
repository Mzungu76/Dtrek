import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchMarkedCollectionsPreview } from '@/lib/raccolte/fetchMarkedCollectionsPreview'

export type { MarkedCollectionPreview, PreviewVolume, PreviewEntry } from '@/lib/raccolte/fetchMarkedCollectionsPreview'

export const dynamic = 'force-dynamic'

// GET /api/collections/marked-for-publish → per la pagina di pre-pubblicazione (/raccolte/pubblica):
// tutte le Raccolte con marked_for_publish = true, ciascuna col proprio albero Diario → Reportage
// filtrato ai soli elementi che finiranno online (stessa logica di fetchPublicCollection, qui
// risolta per utente autenticato invece che per token pubblico).
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const collections = await fetchMarkedCollectionsPreview(user.id)
    return NextResponse.json({ collections })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
