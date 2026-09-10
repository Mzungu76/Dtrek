import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { supabase } from '@/lib/supabase'
import {
  searchMeta, type MetaSearchParams, type MetaSearchOrigin,
  type BorgoInterest, type ExperienceType, type TimeBudget,
} from '@/lib/metaSearch'
import { isMetaType, isSiteType, SITE_TYPES, type PlaceCategory } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'

// Unico endpoint di ricerca Mete (piano §17) — dispatcha a searchBorghi()/searchSiti() via
// lib/metaSearch. La ricerca Sentieri (piano §18) resta volutamente FUORI da questo endpoint: il
// motore esistente (app/api/route-build, app/api/percorsi-per-te) è già chiamato direttamente
// dalla UI oggi e non va alterato — vedi lib/metaSearch/searchSentieri.ts per il perché non è
// nemmeno hairpin-chiamabile da qui in sicurezza.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 })
  }

  const params = parseMetaSearchParams(body)
  if (!params) {
    return NextResponse.json({ error: 'Parametri di ricerca non validi' }, { status: 400 })
  }

  if (params.metaType === 'sentiero') {
    return NextResponse.json(
      { error: 'not_implemented', message: 'La ricerca Sentieri resta su /api/route-build e /api/percorsi-per-te.' },
      { status: 501 },
    )
  }

  try {
    const result = await searchMeta(params, { supabase })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[meta-search]', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

// ── Validazione del body (mai fidarsi della forma di un JSON arrivato dal client) ───────────────

const BORGO_INTERESTS = new Set<BorgoInterest>([
  'storia', 'architettura', 'chiese', 'archeologia', 'curiosita', 'gastronomia',
  'artigianato', 'panorami', 'fotografia', 'famiglie', 'arte',
])
const PLACE_CATEGORIES = new Set<PlaceCategory>(['borgo', 'citta'])
const EXPERIENCE_TYPES = new Set<ExperienceType>(['essenziale', 'completa', 'storica', 'fotografica', 'gastronomica', 'personalizzata'])
const TIME_BUDGETS = new Set<TimeBudget>(['30min', '1h', '2h', 'mezza_giornata', 'giornata'])
const SITE_TYPE_SET = new Set(SITE_TYPES)

function parseOrigin(v: unknown): MetaSearchOrigin | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (typeof o.lat !== 'number' || typeof o.lon !== 'number') return undefined
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return undefined
  return { lat: o.lat, lon: o.lon }
}

function parseStringArray<T extends string>(v: unknown, allowed: Set<T>): T[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is T => typeof x === 'string' && allowed.has(x as T))
  return out.length > 0 ? out : undefined
}

function parseEnum<T extends string>(v: unknown, allowed: Set<T>): T | undefined {
  return typeof v === 'string' && allowed.has(v as T) ? (v as T) : undefined
}

function parseNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function parseString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function parseMetaSearchParams(body: unknown): MetaSearchParams | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!isMetaType(b.metaType)) return null

  const limit = parseNumber(b.limit)
  const query = parseString(b.query)
  const region = parseString(b.region)
  const province = parseString(b.province)
  const origin = parseOrigin(b.origin)
  const maxDistanceKm = parseNumber(b.maxDistanceKm)
  const interests = parseStringArray(b.interests, BORGO_INTERESTS)

  if (b.metaType === 'borgo_citta') {
    return {
      metaType: 'borgo_citta',
      query, region, province, origin, maxDistanceKm, interests,
      category: parseStringArray(b.category, PLACE_CATEGORIES),
      experienceType: parseEnum(b.experienceType, EXPERIENCE_TYPES),
      timeAvailable: parseEnum(b.timeAvailable, TIME_BUDGETS),
      limit,
    }
  }

  if (b.metaType === 'sito') {
    return {
      metaType: 'sito',
      query, region, province, origin, maxDistanceKm, interests,
      category: parseStringArray(b.category, SITE_TYPE_SET)?.filter(isSiteType),
      limit,
    }
  }

  // 'sentiero': validato solo a livello di forma qui, il payload effettivo passa senza
  // interpretazione (piano §18 — non è compito di questo modulo capire cosa contiene).
  return {
    metaType: 'sentiero',
    buildParams: (b.buildParams && typeof b.buildParams === 'object') ? b.buildParams as Record<string, unknown> : {},
  }
}
