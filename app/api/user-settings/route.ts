import { NextRequest, NextResponse } from 'next/server'
import { supabase }            from '@/lib/supabase'
import { getUserFromRequest }  from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

function maskKey(key: string): string {
  // "sk-ant-api03-XXXX...YYYY" → "sk-ant-...YYYY"
  const tail = key.slice(-6)
  return `sk-ant-••••••••${tail}`
}

// ── GET: returns whether a key is saved, plus a masked hint ──────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier')
    .eq('user_id', user.id)
    .single()

  const key = data?.claude_api_key as string | null | undefined
  return NextResponse.json({
    hasKey:           !!key,
    keyHint:          key ? maskKey(key) : null,
    subscriptionTier: (data?.subscription_tier as string) ?? 'free',
  })
}

// ── POST: save (or replace) the user's Claude API key ────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { apiKey } = (await req.json()) as { apiKey?: string }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
    return NextResponse.json({ error: 'Chiave non valida' }, { status: 400 })
  }

  const trimmed = apiKey.trim()

  // Basic format check (Anthropic keys start with "sk-ant-")
  if (!trimmed.startsWith('sk-ant-') && !trimmed.startsWith('sk-')) {
    return NextResponse.json(
      { error: 'La chiave deve iniziare con "sk-ant-" o "sk-"' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, claude_api_key: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, keyHint: maskKey(trimmed) })
}

// ── DELETE: remove the stored key ────────────────────────────────────────────
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
