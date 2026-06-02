import { NextRequest, NextResponse } from 'next/server'
import { supabase }            from '@/lib/supabase'
import { getUserFromRequest }  from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

function maskKey(key: string): string {
  const tail = key.slice(-6)
  return `sk-ant-••••••••${tail}`
}

// ── GET: all user settings ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, max_heart_rate, beauty_natura_weight')
    .eq('user_id', user.id)
    .single()

  const key = data?.claude_api_key as string | null | undefined
  return NextResponse.json({
    hasKey:             !!key,
    keyHint:            key ? maskKey(key) : null,
    subscriptionTier:   (data?.subscription_tier as string) ?? 'free',
    maxHeartRate:       (data?.max_heart_rate as number) ?? 0,
    beautyNaturaWeight: (data?.beauty_natura_weight as number) ?? 50,
  })
}

// ── POST: save any combination of settings ───────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    apiKey?: string
    maxHeartRate?: number
    beautyNaturaWeight?: number
  }

  const upsertData: Record<string, unknown> = {
    user_id:    user.id,
    updated_at: new Date().toISOString(),
  }

  // Claude API key
  if (body.apiKey !== undefined) {
    const trimmed = body.apiKey.trim()
    if (trimmed.length < 20 || (!trimmed.startsWith('sk-ant-') && !trimmed.startsWith('sk-'))) {
      return NextResponse.json({ error: 'Chiave API non valida' }, { status: 400 })
    }
    upsertData.claude_api_key = trimmed
  }

  // FCmax personale
  if (body.maxHeartRate !== undefined) {
    const hr = Math.round(body.maxHeartRate)
    if (hr < 100 || hr > 230) {
      return NextResponse.json({ error: 'FCmax fuori range (100–230 bpm)' }, { status: 400 })
    }
    upsertData.max_heart_rate = hr
  }

  // Peso Natura/Cultura slider (0–100)
  if (body.beautyNaturaWeight !== undefined) {
    const w = Math.round(body.beautyNaturaWeight)
    if (w < 0 || w > 100) {
      return NextResponse.json({ error: 'Peso fuori range (0–100)' }, { status: 400 })
    }
    upsertData.beauty_natura_weight = w
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(upsertData, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const response: Record<string, unknown> = { ok: true }
  if (body.apiKey) response.keyHint = maskKey(body.apiKey.trim())
  return NextResponse.json(response)
}

// ── DELETE: remove Claude API key ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('user_settings')
    .update({ claude_api_key: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
