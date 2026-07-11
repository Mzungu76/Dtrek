import { NextRequest, NextResponse } from 'next/server'
import { supabase }            from '@/lib/supabase'
import { getUserFromRequest }  from '@/lib/supabaseAuth'
import { sanitizeBreveSections, DEFAULT_BREVE_SECTIONS } from '@/lib/guideSections'

/** Tanaka formula for max heart rate: 211 − 0.64 × age */
function deriveFCmax(age: number): number {
  return Math.round(211 - 0.64 * age)
}

export const dynamic = 'force-dynamic'

function maskKey(key: string): string {
  const tail = key.slice(-6)
  return `sk-ant-••••••••${tail}`
}

// ── GET: all user settings ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try full select (all columns); progressively fall back if newer columns don't exist yet
  let data: Record<string, unknown> | null = null
  // .single() errors both on "no row yet" (PGRST116 — a brand new user, expected/harmless) and
  // on a genuine lookup failure (e.g. Supabase unreachable) — only the latter should be surfaced
  // as "unavailable", otherwise every new user would wrongly see a "try again later" message.
  let settingsUnavailable = false

  const { data: d1, error: e1 } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, user_age, user_weight_kg, user_height_cm, user_gender, beauty_natura_weight, beauty_paesaggio_weight, beauty_archeologia_weight, beauty_architettura_weight, beauty_interesse_weight, beauty_natura_cultura, beauty_natura_type, beauty_cultura_type, pref_sforzo, pref_durata, hiker_face_data_url, display_name, personal_delta, hr_hike_count, hr_rest, hr_max, starting_address, starting_lat, starting_lon, guide_pending_days, guide_breve_sections')
    .eq('user_id', user.id)
    .single()

  if (!e1) {
    data = d1 as Record<string, unknown> | null
  } else {
    // Retry without CTS + hr columns (they may not be migrated yet) — starting_address/lat/lon
    // stay in this fallback select too: dropping them here would make a correctly saved address
    // silently disappear from the response whenever any *other* column in the full select above
    // isn't migrated yet, even though the address itself was never touched.
    const { data: d2, error: e2 } = await supabase
      .from('user_settings')
      .select('claude_api_key, subscription_tier, user_age, user_weight_kg, user_height_cm, user_gender, hiker_face_data_url, display_name, starting_address, starting_lat, starting_lon')
      .eq('user_id', user.id)
      .single()
    if (!e2) data = d2 as Record<string, unknown> | null
    else if (e2.code !== 'PGRST116') settingsUnavailable = true
  }

  const key = data?.claude_api_key as string | null | undefined
  const age = (data?.user_age as number) ?? 0

  return NextResponse.json({
    hasKey:             !!key,
    keyHint:            key ? maskKey(key) : null,
    settingsUnavailable,
    subscriptionTier:   (data?.subscription_tier as string) ?? 'free',
    userAge:            age,
    userWeightKg:       (data?.user_weight_kg as number) ?? 0,
    userHeightCm:       (data?.user_height_cm as number) ?? 0,
    userGender:         (data?.user_gender as string) ?? 'non_specificato',
    derivedFCmax:       age > 0 ? deriveFCmax(age) : 0,
    beautyNaturaWeight:       (data?.beauty_natura_weight       as number) ?? 55,
    beautyPaesaggioWeight:    (data?.beauty_paesaggio_weight    as number) ?? 45,
    beautyArcheologiaWeight:  (data?.beauty_archeologia_weight  as number) ?? 35,
    beautyArchitetturaWeight: (data?.beauty_architettura_weight as number) ?? 40,
    beautyInteresseWeight:    (data?.beauty_interesse_weight    as number) ?? 25,
    beautyNaturaCultura:      (data?.beauty_natura_cultura      as number) ?? 50,
    beautyNaturaType:         (data?.beauty_natura_type         as number) ?? 50,
    beautyCulturaType:        (data?.beauty_cultura_type        as number) ?? 50,
    prefSforzo:               (data?.pref_sforzo                as number) ?? 50,
    prefDurata:               (data?.pref_durata                as number) ?? 270,
    hikerFaceDataUrl:         (data?.hiker_face_data_url        as string) ?? null,
    displayName:              (data?.display_name               as string) ?? null,
    personalDelta:            (data?.personal_delta             as number) ?? null,
    hrHikeCount:              (data?.hr_hike_count              as number) ?? 0,
    hrRest:                   (data?.hr_rest                    as number) ?? null,
    hrMax:                    (data?.hr_max                     as number) ?? null,
    startingAddress:          (data?.starting_address           as string) ?? null,
    startingLat:              (data?.starting_lat               as number) ?? null,
    startingLon:              (data?.starting_lon               as number) ?? null,
    guidePendingDays:         (data?.guide_pending_days         as number) ?? 30,
    guideBreveSections:       data?.guide_breve_sections ? sanitizeBreveSections(data.guide_breve_sections) : DEFAULT_BREVE_SECTIONS,
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
    userGender?: 'maschio' | 'femmina' | 'altro' | 'non_specificato'
    beautyNaturaWeight?: number
    beautyPaesaggioWeight?: number
    beautyArcheologiaWeight?: number
    beautyArchitetturaWeight?: number
    beautyInteresseWeight?: number
    beautyNaturaCultura?: number
    beautyNaturaType?: number
    beautyCulturaType?: number
    prefSforzo?: number
    prefDurata?: number
    hikerFaceDataUrl?: string | null
    displayName?: string | null
    hrRest?: number
    hrMax?: number | null
    startingAddress?: string | null
    startingLat?: number | null
    startingLon?: number | null
    guidePendingDays?: number
    guideBreveSections?: string[]
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

  if (body.userGender !== undefined) {
    if (!['maschio', 'femmina', 'altro', 'non_specificato'].includes(body.userGender)) {
      return NextResponse.json({ error: 'Sesso non valido' }, { status: 400 })
    }
    upsertData.user_gender = body.userGender
  }

  // Beauty weights — old 5 and new 3 slider columns (each 0–100)
  for (const [bodyKey, dbCol] of [
    ['beautyNaturaWeight',       'beauty_natura_weight'],
    ['beautyPaesaggioWeight',    'beauty_paesaggio_weight'],
    ['beautyArcheologiaWeight',  'beauty_archeologia_weight'],
    ['beautyArchitetturaWeight', 'beauty_architettura_weight'],
    ['beautyInteresseWeight',    'beauty_interesse_weight'],
    ['beautyNaturaCultura',      'beauty_natura_cultura'],
    ['beautyNaturaType',         'beauty_natura_type'],
    ['beautyCulturaType',        'beauty_cultura_type'],
  ] as [string, string][]) {
    const val = (body as Record<string, unknown>)[bodyKey]
    if (val !== undefined) {
      const w = Math.round(val as number)
      if (w < 0 || w > 100) return NextResponse.json({ error: `${bodyKey} fuori range (0–100)` }, { status: 400 })
      upsertData[dbCol] = w
    }
  }

  // HR fields
  if (body.hrRest !== undefined) {
    const v = Math.round(body.hrRest)
    if (v < 30 || v > 100) return NextResponse.json({ error: 'hrRest fuori range (30–100)' }, { status: 400 })
    upsertData.hr_rest = v
  }
  if (body.hrMax !== undefined) {
    if (body.hrMax === null) {
      upsertData.hr_max = null
    } else {
      const v = Math.round(body.hrMax)
      if (v < 100 || v > 250) return NextResponse.json({ error: 'hrMax fuori range (100–250)' }, { status: 400 })
      upsertData.hr_max = v
    }
  }

  if (body.prefSforzo !== undefined) {
    const s = Math.round(body.prefSforzo)
    if (s < 0 || s > 100) return NextResponse.json({ error: 'prefSforzo fuori range (0–100)' }, { status: 400 })
    upsertData.pref_sforzo = s
  }

  if (body.prefDurata !== undefined) {
    const r = Math.round(body.prefDurata)
    if (r < 60 || r > 480 || r % 30 !== 0) return NextResponse.json({ error: 'prefDurata: valore non valido (60–480 min, step 30)' }, { status: 400 })
    upsertData.pref_durata = r
  }

  if (body.hikerFaceDataUrl !== undefined) {
    upsertData.hiker_face_data_url = body.hikerFaceDataUrl || null
  }

  if (body.displayName !== undefined) {
    upsertData.display_name = (body.displayName ?? '').trim() || null
  }

  // Starting address (indirizzo di partenza per calcolo distanza/tempo di guida)
  if (body.startingAddress !== undefined) {
    upsertData.starting_address = (body.startingAddress ?? '').trim() || null
  }
  if (body.startingLat !== undefined) {
    upsertData.starting_lat = body.startingLat
  }
  if (body.startingLon !== undefined) {
    upsertData.starting_lon = body.startingLon
  }

  if (body.guidePendingDays !== undefined) {
    const d = Math.round(body.guidePendingDays)
    if (d < 1 || d > 365) return NextResponse.json({ error: 'guidePendingDays fuori range (1–365 giorni)' }, { status: 400 })
    upsertData.guide_pending_days = d
  }

  if (body.guideBreveSections !== undefined) {
    upsertData.guide_breve_sections = sanitizeBreveSections(body.guideBreveSections)
  }

  let { error } = await supabase
    .from('user_settings')
    .upsert(upsertData, { onConflict: 'user_id' })

  // A column not yet migrated on this environment fails the whole upsert — retry dropping only
  // the specific column PostgREST actually complained about (its error names it directly),
  // instead of blanket-deleting a fixed list of "newer" columns. The old blanket approach could
  // silently drop a column that DOES exist (e.g. starting_lat/lon) just because some unrelated
  // column in the same request didn't, making a save request report success while quietly not
  // persisting the address at all.
  let attempts = 0
  while (error && attempts < 8) {
    const missingCol = /column ['"]?([a-z0-9_]+)['"]?/i.exec(error.message)?.[1]
    if (!missingCol || !(missingCol in upsertData)) break
    delete upsertData[missingCol]
    attempts++
    ;({ error } = await supabase.from('user_settings').upsert(upsertData, { onConflict: 'user_id' }))
  }

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
