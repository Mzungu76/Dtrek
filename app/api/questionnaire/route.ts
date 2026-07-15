import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { haversineM }   from '@/lib/geoUtils'
import { formatDuration } from '@/lib/tcxParser'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem }    from '@/lib/overpass'
import { POI_META }        from '@/lib/overpass'
import { fetchNatureContext, type NatureContext } from '@/lib/aiNatureContext'
import { resolveDefaultModel, isValidClaudeModelId } from '@/lib/claudeModels'
import { jsonSchemaFormat } from '@/lib/aiJsonOutput'

export const dynamic = 'force-dynamic'

const SYSTEM = `Sei un'intervistatrice esperta che aiuta gli escursionisti a raccontare le proprie esperienze in montagna con parole proprie.
Il tuo compito è preparare un breve questionario mirato, basato su punti specifici di un percorso (vette, salite, punti di interesse, foto scattate, vegetazione/fenologia osservata), per raccogliere ricordi, sensazioni e dettagli personali da fondere poi in un resoconto scritto.
Le domande devono essere concrete e ancorate a un punto preciso del percorso, mai generiche o intercambiabili tra escursioni diverse.
Scrivi in italiano naturale e colloquiale, come faresti parlando di persona con l'escursionista.`

interface QuestionnaireOutput {
  questions: RawQuestion[]
}

const QUESTIONNAIRE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          anchorIndex: { type: 'integer' },
          question:    { type: 'string' },
          inputType:   { type: 'string', enum: ['choice', 'text', 'freewrite'] },
          choices:     { type: 'array', items: { type: 'string' } },
        },
        required: ['anchorIndex', 'question', 'inputType'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
}

interface PhotoMeta {
  caption: string
  lat?: number
  lon?: number
  progress: number
  hasExifGps?: boolean
}

type AnchorType = 'start' | 'poi' | 'photo' | 'climb' | 'summit' | 'end' | 'flora'

interface Anchor {
  type: AnchorType
  label: string
  progress: number
  detail?: string
  anchorRef?: string
}

interface QuestionnaireQuestion {
  id: string
  anchorType: AnchorType
  anchorRef?: string
  progress: number
  label: string
  question: string
  inputType: 'choice' | 'text' | 'freewrite'
  choices?: string[]
  isFreeWrite: boolean
}

// ── Anchor extraction ─────────────────────────────────────────────────────────

function pointsWithCoords(track: TrackPoint[]) {
  return track
    .map((p, idx) => ({ lat: p.lat, lon: p.lon, ele: p.altitudeMeters, idx }))
    .filter((p): p is { lat: number; lon: number; ele: number | undefined; idx: number } =>
      p.lat !== undefined && p.lon !== undefined,
    )
}

function buildAltimetryAnchors(track: TrackPoint[]): Anchor[] {
  const pts = pointsWithCoords(track)
  if (pts.length < 2) return []

  const anchors: Anchor[] = [
    { type: 'start', label: 'Partenza', progress: 0 },
    { type: 'end',   label: 'Arrivo',   progress: 1 },
  ]

  const withEle = pts.filter(p => p.ele !== undefined) as { lat: number; lon: number; ele: number; idx: number }[]

  if (withEle.length > 0) {
    const summit = withEle.reduce((max, p) => (p.ele > max.ele ? p : max))
    anchors.push({
      type:     'summit',
      label:    `Punto più alto (${Math.round(summit.ele)} m)`,
      progress: summit.idx / (pts.length - 1),
    })
  }

  if (withEle.length > 10) {
    const windowSize = Math.max(5, Math.floor(withEle.length * 0.1))
    let best = { gain: 0, startIdx: 0, endIdx: 0 }
    for (let i = 0; i + windowSize < withEle.length; i++) {
      const a = withEle[i], b = withEle[i + windowSize]
      const gain = b.ele - a.ele
      if (gain > best.gain) best = { gain, startIdx: a.idx, endIdx: b.idx }
    }
    if (best.gain > 50) {
      const midIdx = Math.round((best.startIdx + best.endIdx) / 2)
      anchors.push({
        type:     'climb',
        label:    `Salita più impegnativa (+${Math.round(best.gain)} m)`,
        progress: midIdx / (pts.length - 1),
      })
    }
  }

  return anchors
}

function nearestProgress(lat: number, lon: number, pts: { lat: number; lon: number; idx: number }[], total: number): number {
  let bestIdx = 0, bestDist = Infinity
  for (const p of pts) {
    const d = haversineM(lat, lon, p.lat, p.lon)
    if (d < bestDist) { bestDist = d; bestIdx = p.idx }
  }
  return total > 1 ? bestIdx / (total - 1) : 0
}

function buildPoiAnchors(pois: PoiItem[], track: TrackPoint[]): Anchor[] {
  const pts = pointsWithCoords(track)
  if (pts.length === 0 || pois.length === 0) return []
  const total = track.length

  return pois
    .filter(p => p.distFromTrack <= 250 && (p.name || p.tags?.['wikipedia']))
    .sort((a, b) => {
      const score = (p: PoiItem) => (p.tags?.['wikipedia'] ? 2 : 0) + (p.name ? 1 : 0)
      return score(b) - score(a)
    })
    .slice(0, 5)
    .map(p => ({
      type:      'poi' as const,
      label:     p.name ?? POI_META[p.type]?.label ?? 'Punto di interesse',
      progress:  nearestProgress(p.lat, p.lon, pts, total),
      detail:    POI_META[p.type]?.label,
      anchorRef: String(p.id),
    }))
}

const LEAF_LABEL_IT: Record<string, string> = { broadleaved: 'latifoglie', needleleaved: 'conifere', mixed: 'bosco misto' }

/** A single anchor summarizing real flora/phenology data (GBIF seasonal species, OSM forest type) —
 * placed at the route's midpoint since none of these sources resolve to a specific track position. */
function buildFloraAnchor(nature: NatureContext): Anchor | null {
  let detail: string | null = null
  if (nature.species.length > 0) {
    const names = nature.species.slice(0, 4).map(s => s.vernacularIta ?? s.scientificName)
    detail = `Specie osservate in zona in questo periodo: ${names.join(', ')}`
  } else if (nature.forest?.leafTypeDominant) {
    detail = `Bosco di ${LEAF_LABEL_IT[nature.forest.leafTypeDominant]}`
  } else if (nature.forest?.estimatedBelt) {
    detail = nature.forest.estimatedBelt.label
  }
  if (!detail) return null

  return { type: 'flora', label: 'Vegetazione del percorso', progress: 0.5, detail }
}

function buildPhotoAnchors(photos: PhotoMeta[]): Anchor[] {
  return photos.map((p, i) => ({
    type:      'photo' as const,
    label:     p.caption?.trim() ? p.caption : `Foto ${i + 1}`,
    progress:  p.progress,
    anchorRef: String(i),
  }))
}

/** Caps the merged anchor list at `max`, always keeping start/end/summit/climb and trimming photos/POIs first. */
function capAnchors(anchors: Anchor[], max = 12): Anchor[] {
  if (anchors.length <= max) return anchors
  const essential = anchors.filter(a => a.type === 'start' || a.type === 'end' || a.type === 'summit' || a.type === 'climb' || a.type === 'flora')
  const pois      = anchors.filter(a => a.type === 'poi')
  const photos    = anchors.filter(a => a.type === 'photo')

  const budget    = Math.max(0, max - essential.length)
  const keptPois  = pois.slice(0, Math.ceil(budget * 0.6))
  const remaining = Math.max(0, budget - keptPois.length)
  const step      = photos.length > 0 ? Math.max(1, Math.ceil(photos.length / Math.max(1, remaining))) : 1
  const keptPhotos = photos.filter((_, i) => i % step === 0).slice(0, remaining)

  return [...essential, ...keptPois, ...keptPhotos].sort((a, b) => a.progress - b.progress)
}

// ── Claude question generation ──────────────────────────────────────────────

interface RawQuestion {
  anchorIndex: number
  question: string
  inputType: 'choice' | 'text' | 'freewrite'
  choices?: string[]
}

function buildUserPrompt(activity: Record<string, unknown>, anchors: Anchor[]): string {
  const avgHR = activity.avg_heart_rate as number | undefined
  const maxHR = activity.max_heart_rate as number | undefined
  const cal   = activity.calories       as number | undefined
  const biometricBlock = [
    avgHR && avgHR > 0 ? `FC MEDIA: ${Math.round(avgHR)} bpm` : '',
    maxHR && maxHR > 0 ? `FC MASSIMA: ${Math.round(maxHR)} bpm` : '',
    cal   && cal   > 0 ? `CALORIE: ${cal} kcal` : '',
  ].filter(Boolean).join(', ')

  const anchorLines = anchors.map((a, i) =>
    `${i}. [${a.type}] ${a.label} — al ${Math.round(a.progress * 100)}% del percorso${a.detail ? ` (${a.detail})` : ''}`,
  ).join('\n')

  return `Genera un questionario per intervistare l'escursionista su questa escursione, per aiutarlo a raccontarla con parole sue.

PERCORSO: ${activity.title ?? 'Escursione'}
DISTANZA: ${((activity.distance_meters as number ?? 0) / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round((activity.elevation_gain as number) ?? 0)} m
DURATA: ${formatDuration((activity.total_time_seconds as number) ?? 0)}
${biometricBlock ? `DATI BIOMETRICI: ${biometricBlock}` : ''}

PUNTI DI ANCORAGGIO LUNGO IL PERCORSO (in ordine cronologico, usa l'indice per riferirti a ciascuno):
${anchorLines}

Crea tra 5 e 8 domande, una per ciascuno dei punti di ancoraggio più significativi (non è necessario usarli tutti), in ordine crescente di indice.
Le domande devono essere specifiche per quel punto del percorso (la salita, la foto, la vetta, il rifugio...), non generiche o intercambiabili.
Scegli 1 o 2 punti tra quelli più "emotivamente densi" (una vetta, una foto significativa) per invitare l'escursionista a scrivere liberamente con parole sue: in quel caso usa inputType "freewrite" e la domanda deve invitarlo esplicitamente a raccontare cosa ha provato o pensato in quel momento.
Per gli altri punti usa inputType "text" (risposta breve) oppure "choice" con 3-4 opzioni quando ha senso una scelta rapida (es. percezione di difficoltà, stato d'animo).
Il campo "choices" va incluso solo quando inputType è "choice", con almeno 2 opzioni.`
}

function parseQuestions(items: RawQuestion[], anchors: Anchor[]): QuestionnaireQuestion[] | null {
  // Struttura e tipi dei campi sono già garantiti dallo schema (output_config.format,
  // vedi QUESTIONNAIRE_SCHEMA) — qui restano solo i controlli semantici che lo schema non può
  // esprimere: indice dell'ancora esistente, "choices" con almeno 2 opzioni per le domande a scelta.
  const out: QuestionnaireQuestion[] = []
  for (const item of items) {
    if (typeof item.anchorIndex !== 'number') continue
    const anchor = anchors[item.anchorIndex]
    if (!anchor) continue
    if (typeof item.question !== 'string' || !item.question.trim()) continue
    if (!['choice', 'text', 'freewrite'].includes(item.inputType)) continue
    const choices = item.inputType === 'choice' && Array.isArray(item.choices)
      ? item.choices.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : undefined
    if (item.inputType === 'choice' && (!choices || choices.length < 2)) continue

    out.push({
      id:          `q${out.length}`,
      anchorType:  anchor.type,
      anchorRef:   anchor.anchorRef,
      progress:    anchor.progress,
      label:       anchor.label,
      question:    item.question.trim(),
      inputType:   item.inputType,
      choices,
      isFreeWrite: item.inputType === 'freewrite',
    })
  }

  out.sort((a, b) => a.progress - b.progress)
  return out.length > 0 ? out : null
}

// ── GET — fetch existing questionnaire (resume) ────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const activityId = req.nextUrl.searchParams.get('activityId')
  if (!activityId) {
    return new Response(JSON.stringify({ error: 'activityId mancante' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await supabase
    .from('hike_questionnaires')
    .select('*')
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(data ?? null), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── POST — generate questionnaire ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, claude_model')
    .eq('user_id', user.id)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSub  = (settings?.subscription_tier as string) === 'premium'
  const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null)
  const claudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : resolveDefaultModel('questionnaire')

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni per generare il questionario.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let activityId: string
  let photos: PhotoMeta[] = []
  try {
    const body = await req.json()
    activityId = body.activityId
    if (!activityId) throw new Error('activityId mancante')
    if (Array.isArray(body.photos)) photos = body.photos
  } catch (e) {
    console.error('[api/questionnaire] POST: body non valido:', e)
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .eq('user_id', user.id)
    .single()

  if (actErr || !activity) {
    return new Response(JSON.stringify({ error: 'Attività non trovata' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  const track: TrackPoint[] = Array.isArray(activity.track_points) ? activity.track_points : []

  let pois: PoiItem[] = []
  if (activity.linked_planned_id) {
    const { data: hike } = await supabase
      .from('planned_hikes')
      .select('cached_pois')
      .eq('id', activity.linked_planned_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (Array.isArray(hike?.cached_pois)) pois = hike.cached_pois
  }

  const nature = await fetchNatureContext({
    trackPoints: track,
    altitudeMax: activity.altitude_max as number | undefined,
    month: activity.start_time ? new Date(activity.start_time as string).getMonth() + 1 : new Date().getMonth() + 1,
  })
  const floraAnchor = buildFloraAnchor(nature)

  const anchors = capAnchors(
    [
      ...buildAltimetryAnchors(track),
      ...buildPoiAnchors(pois, track),
      ...buildPhotoAnchors(photos),
      ...(floraAnchor ? [floraAnchor] : []),
    ].sort((a, b) => a.progress - b.progress),
  )

  if (anchors.length === 0) {
    return new Response(
      JSON.stringify({ error: 'no_anchors', message: 'Dati insufficienti per generare un questionario (nessun percorso o foto disponibile).' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const client = new Anthropic({ apiKey })
  const prompt = buildUserPrompt(activity, anchors)

  let output: QuestionnaireOutput | null
  try {
    const msg = await client.messages.parse({
      model:         claudeModel,
      max_tokens:    3000,
      system:        SYSTEM,
      messages:      [{ role: 'user', content: prompt }],
      output_config: { format: jsonSchemaFormat<QuestionnaireOutput>(QUESTIONNAIRE_SCHEMA) },
    })
    output = msg.parsed_output
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: 'ai_error', message: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const questions = output ? parseQuestions(output.questions, anchors) : null
  if (!questions) {
    return new Response(
      JSON.stringify({ error: 'ai_parse_error', message: 'La risposta AI non era nel formato atteso. Riprova oppure usa la generazione rapida.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const row = {
    id:            `questionnaire-${activityId}`,
    user_id:       user.id,
    activity_id:   activityId,
    status:        'in_progress',
    questions,
    answers:       {},
    current_index: 0,
    updated_at:    new Date().toISOString(),
  }

  const { data: saved, error: saveErr } = await supabase
    .from('hike_questionnaires')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()

  if (saveErr) {
    return new Response(JSON.stringify({ error: saveErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(saved), { headers: { 'Content-Type': 'application/json' } })
}

// ── PATCH — save one answer, advance index, or set status ─────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  let activityId: string
  let questionId: string | undefined
  let answer: { text?: string; skipped?: boolean } | undefined
  let newIndex: number | undefined
  let status: 'in_progress' | 'completed' | 'skipped' | undefined
  try {
    const body = await req.json()
    activityId = body.activityId
    if (!activityId) throw new Error('activityId mancante')
    questionId = body.questionId
    answer     = body.answer
    newIndex   = typeof body.newIndex === 'number' ? body.newIndex : undefined
    if (body.status && ['in_progress', 'completed', 'skipped'].includes(body.status)) {
      status = body.status
    }
  } catch (e) {
    console.error('[api/questionnaire] PATCH: body non valido:', e)
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const id = `questionnaire-${activityId}`

  const { data: existing, error: fetchErr } = await supabase
    .from('hike_questionnaires')
    .select('answers')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchErr || !existing) {
    return new Response(JSON.stringify({ error: 'Questionario non trovato' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  const answers = { ...(existing.answers as Record<string, unknown> ?? {}) }
  if (questionId && answer) {
    answers[questionId] = {
      questionId,
      text:       answer.text ?? '',
      skipped:    !!answer.skipped,
      answeredAt: new Date().toISOString(),
    }
  }

  const update: Record<string, unknown> = { answers, updated_at: new Date().toISOString() }
  if (newIndex !== undefined) update.current_index = newIndex
  if (status)                 update.status        = status

  const { error } = await supabase
    .from('hike_questionnaires')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
