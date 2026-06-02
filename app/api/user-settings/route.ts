import { NextRequest, NextResponse } from 'next/server'
import { supabase }            from '@/lib/supabase'
import { getUserFromRequest }  from '@/lib/supabaseAuth'
import { deriveFCmax }         from '@/lib/trailScore'

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
    .select('claude_api_key, subscription_tier, user_age, user_weight_kg, user_height_cm, beauty_natura_weight')
    .eq('user_id', user.id)
    .single()

  const key = data?.claude_api_key as string | null | undefined
  const age = (data?.user_age as number) ?? 0

  return NextResponse.json({
    hasKey:             !!key,
    keyHint:            key ? maskKey(key) : null,
    subscriptionTier:   (data?.subscription_tier as string) ?? 'free',
    userAge:            age,
    userWeightKg:       (data?.user_weight_kg as number) ?? 0,
    userHeightCm:       (data?.user_height_cm as number) ?? 0,
    derivedFCmax:       age > 0 ? deriveFCmax(age) : 0,
    beautyNaturaWeight: (data?.beauty_natura_weight as number) ?? 50,
  })
}

// ── POST: save any combination of settings ───────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    apiKey?: string
    userAge?: number
    userWeightKg?: number
    userHeightCm?: number
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

  // Biometric profile
  if (body.userAge !== undefined) {
    const age = Math.round(body.userAge)
    if (age < 10 || age > 90) {
      return NextResponse.json({ error: 'Età fuori range (10–90 anni)' }, { status: 400 })
    }
    upsertData.user_age = age
  }

  if (body.userWeightKg !== undefined) {
    const w = Math.round(body.userWeightKg)
    if (w < 30 || w > 250) {
      return NextResponse.json({ error: 'Peso fuori range (30–250 kg)' }, { status: 400 })
    }
    upsertData.user_weight_kg = w
  }

  if (body.userHeightCm !== undefined) {
    const h = Math.round(body.userHeightCm)
    if (h < 100 || h > 250) {
      return NextResponse.json({ error: 'Altezza fuori range (100–250 cm)' }, { status: 400 })
    }
    upsertData.user_height_cm = h
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
  if (body.userAge) response.derivedFCmax = deriveFCmax(body.userAge)
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
