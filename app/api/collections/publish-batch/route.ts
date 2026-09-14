import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { planPublishBatch, type MarkedCollectionRow } from '@/lib/raccolte/planPublishBatch'
import { hasActiveProfile, PROFILE_REQUIRED_ERROR } from '@/lib/requireActiveProfile'

export const dynamic = 'force-dynamic'

export interface PublishBatchResultRow {
  id: string
  title: string
  shareToken: string
}

// POST /api/collections/publish-batch → il pulsante "Pubblica tutto" della pagina di
// pre-pubblicazione (/raccolte/pubblica): pubblica in un solo giro TUTTE le Raccolte con
// marked_for_publish = true, invece che una alla volta come PATCH /api/collections/[id]/token.
// Idempotente sulle Raccolte già online (nessuna scrittura, tornano comunque nel risultato — la
// pagina mostra un rigo di link per ogni Raccolta marcata). Non smarca `marked_for_publish`: resta
// così com'era, coerente con la logica del pulsante "Pubblica" in elenco (vedi la migration).
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: rows, error: fetchErr } = await supabase
      .from('collections')
      .select('id, title, share_token, marked_for_publish')
      .eq('user_id', user.id)
      .eq('marked_for_publish', true)
    if (fetchErr) throw fetchErr

    const titleById = new Map((rows ?? []).map(r => [r.id as string, r.title as string]))
    const plan = planPublishBatch((rows ?? []) as MarkedCollectionRow[])

    if (plan.toPublish.length > 0 && !(await hasActiveProfile(user.id))) {
      return NextResponse.json({ error: PROFILE_REQUIRED_ERROR }, { status: 409 })
    }

    const newTokenById = new Map(plan.toPublish.map(id => [id, crypto.randomUUID()]))
    if (plan.toPublish.length > 0) {
      const { error: updateErr } = await Promise.all(
        plan.toPublish.map(id =>
          supabase
            .from('collections')
            .update({ share_token: newTokenById.get(id), updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user.id),
        ),
      ).then(results => {
        const failed = results.find(r => r.error)
        return { error: failed?.error ?? null }
      })
      if (updateErr) throw updateErr
    }

    const alreadyTokenById = new Map(
      (rows ?? [])
        .filter((r): r is typeof r & { share_token: string } => r.share_token !== null)
        .map(r => [r.id as string, r.share_token as string]),
    )

    const collections: PublishBatchResultRow[] = [...plan.toPublish, ...plan.alreadyPublished].map(id => ({
      id,
      title: titleById.get(id) ?? '',
      shareToken: newTokenById.get(id) ?? alreadyTokenById.get(id) ?? '',
    }))

    return NextResponse.json({ collections })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
