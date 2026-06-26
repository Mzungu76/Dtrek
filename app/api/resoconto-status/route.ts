import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

export type ResocontoStatus = 'narrato' | 'parziale' | 'da_narrare'

const COMPLETE_THRESHOLD_CHARS = 800

function statusForContent(content: string | null | undefined): ResocontoStatus {
  if (!content || !content.trim()) return 'da_narrare'
  return content.trim().length >= COMPLETE_THRESHOLD_CHARS ? 'narrato' : 'parziale'
}

// GET → { [activityId]: ResocontoStatus } for every report owned by the user
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { data, error } = await supabase
    .from('hike_reports')
    .select('activity_id, content')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const statuses: Record<string, ResocontoStatus> = {}
  for (const row of data ?? []) {
    statuses[row.activity_id as string] = statusForContent(row.content as string | null)
  }
  return NextResponse.json(statuses)
}
