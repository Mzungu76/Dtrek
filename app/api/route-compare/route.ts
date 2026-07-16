import { NextRequest, NextResponse } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { formatDuration } from '@/lib/tcxParser'
import { difficultyIndex, formatPaceMinkm } from '@/lib/stats'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { jsonSchemaFormat } from '@/lib/aiJsonOutput'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_ENTRIES = 3
const MIN_ENTRIES = 2

interface EntryInput { id: string; type: 'completata' | 'pianificata' }

interface RankedEntry {
  id:    string
  title: string
  type:  'completata' | 'pianificata'
  block: string
}

const SYSTEM = `Sei Giulia, guida escursionistica esperta di DTrek. Confronti percorsi per aiutare
l'utente a scegliere, non ti limiti alla difficoltà: consideri distanza, dislivello, durata,
punteggi già calcolati dall'app (bellezza, sentiero, sicurezza) quando presenti, e soprattutto
quanto ogni percorso si adatta A QUESTO UTENTE SPECIFICO — alle sue preferenze dichiarate e alle
abitudini che emergono dal suo storico. Non dai un giudizio assoluto: la classifica è personale.
Il campo "narrative" è un resoconto in massimo 180 parole, in italiano, tono caldo e diretto. Il
campo "ranking" contiene ESATTAMENTE gli id ricevuti, ordinati dal più consigliato al meno
consigliato per questo utente, ciascuno con una "reason" di massimo 2 frasi specifiche per quel
percorso e questo utente.`

interface RouteCompareOutput {
  narrative: string
  ranking: { id: string; reason: string }[]
}

const RANKING_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string' },
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['narrative', 'ranking'],
  additionalProperties: false,
}

function buildEntryBlock(title: string, type: 'completata' | 'pianificata', lines: string[]): string {
  return `### ${title} (${type === 'completata' ? 'già completato' : 'pianificato'})\n${lines.join('\n')}`
}

export async function POST(req: NextRequest) {
  // `degraded` intentionally not gated on here (unlike app/api/guide/route.ts,
  // app/api/route-search/route.ts): this route reads user-owned planned_hikes/activities by id,
  // which needs a real verified user.id, not just "some session might exist" — no client-fallback
  // data path exists yet for that, so this stays a hard 401/503 even when degraded.
  const { user, authUnavailable } = await getUserFromRequestDetailed(req)
  if (!user) {
    return authUnavailable
      ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento (Supabase non raggiungibile) — riprova tra poco.' }, { status: 503 })
      : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const { apiKey, userGender, claudeModel, aiUseBiometricData, aiUseHistoryData, lookupFailed } = await resolveApiKeyAndSettings(user.id, 'routeCompare')

  if (!apiKey) {
    return NextResponse.json(
      lookupFailed
        ? {
            error:   'ai_temporarily_unavailable',
            message: 'Non riesco a verificare la tua chiave AI in questo momento (Supabase non raggiungibile) — riprova tra poco.',
          }
        : {
            error:   'no_ai_access',
            message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per usare il confronto AI.',
          },
      { status: lookupFailed ? 503 : 402 },
    )
  }

  // resolveApiKeyAndSettings doesn't carry age/effort/duration preferences (only used by the
  // guide-generation flow it was built for) — a small supplementary read for the profileBlock
  // below. hr_rest/hr_max dropped: selected by the old inline query but never actually used here.
  const { data: extraPrefs } = await supabase
    .from('user_settings')
    .select('user_age, pref_sforzo, pref_durata')
    .eq('user_id', user.id)
    .maybeSingle()

  let entries: EntryInput[]
  try {
    const body = await req.json()
    entries = Array.isArray(body.entries) ? body.entries : []
    if (entries.length < MIN_ENTRIES || entries.length > MAX_ENTRIES) throw new Error()
    if (entries.some(e => !e?.id || (e.type !== 'completata' && e.type !== 'pianificata'))) throw new Error()
  } catch {
    return NextResponse.json({ error: `Servono da ${MIN_ENTRIES} a ${MAX_ENTRIES} percorsi` }, { status: 400 })
  }

  // planned_hikes/activities sono la fonte server-side per id, stesso pattern già usato da
  // /api/guide/qa e /api/resoconto-assist — non i dati locali cache-first del client.
  const loaded = await Promise.all(entries.map(async (e): Promise<RankedEntry | null> => {
    if (e.type === 'pianificata') {
      const { data } = await supabase
        .from('planned_hikes')
        .select('title, planned_date, distance_meters, elevation_gain, elevation_loss, altitude_max, estimated_time_seconds, assessment, cached_beauty_score, cached_trail_score, cached_safety_score')
        .eq('id', e.id).eq('user_id', user.id).maybeSingle()
      if (!data) return null
      const km = (data.distance_meters as number) / 1000
      const dplus = Math.round(data.elevation_gain as number)
      const assessment = data.assessment as { difficulty?: string; suitabilityScore?: number; summary?: string } | null
      const lines = [
        data.planned_date ? `Data prevista: ${format(new Date(data.planned_date as string), 'd MMMM yyyy', { locale: it })}` : null,
        `Distanza: ${km.toFixed(1)} km`,
        `Dislivello positivo: ${dplus} m (${difficultyIndex(dplus, data.distance_meters as number)} m/km)`,
        `Dislivello negativo: ${Math.round(data.elevation_loss as number)} m`,
        `Quota massima: ${Math.round(data.altitude_max as number)} m`,
        `Durata stimata: ${formatDuration(data.estimated_time_seconds as number)}`,
        assessment?.difficulty ? `Difficoltà valutata: ${assessment.difficulty}` : null,
        assessment?.suitabilityScore ? `Adatta al ${assessment.suitabilityScore}% degli escursionisti` : null,
        data.cached_beauty_score ? `Punteggio bellezza già calcolato dall'app: presente` : null,
        data.cached_trail_score != null ? `Punteggio sentiero (Trail Score): ${data.cached_trail_score}/100` : null,
        data.cached_safety_score ? `Punteggio sicurezza già calcolato dall'app: presente` : null,
      ].filter((l): l is string => !!l)
      return { id: e.id, title: data.title as string, type: 'pianificata', block: buildEntryBlock(data.title as string, 'pianificata', lines) }
    }
    const { data } = await supabase
      .from('activities')
      .select('title, start_time, distance_meters, elevation_gain, elevation_loss, altitude_max, total_time_seconds, avg_heart_rate, max_heart_rate, avg_speed_ms, calories, user_rating, soddisfazione, trail_score')
      .eq('id', e.id).eq('user_id', user.id).maybeSingle()
    if (!data) return null
    const title = (data.title as string) ?? 'Escursione'
    const dplus = Math.round(data.elevation_gain as number)
    const lines = [
      data.start_time ? `Data: ${format(new Date(data.start_time as string), 'd MMMM yyyy', { locale: it })}` : null,
      `Distanza: ${((data.distance_meters as number) / 1000).toFixed(1)} km`,
      `Dislivello positivo: ${dplus} m (${difficultyIndex(dplus, data.distance_meters as number)} m/km)`,
      `Dislivello negativo: ${Math.round(data.elevation_loss as number)} m`,
      `Quota massima: ${Math.round(data.altitude_max as number)} m`,
      `Durata reale: ${formatDuration(data.total_time_seconds as number)}`,
      `Passo medio: ${formatPaceMinkm(data.distance_meters as number, data.total_time_seconds as number)}`,
      data.avg_heart_rate ? `FC media: ${data.avg_heart_rate} bpm (massima: ${data.max_heart_rate ?? '—'} bpm)` : null,
      data.calories ? `Calorie: ${data.calories} kcal` : null,
      data.user_rating ? `Voto di bellezza dato dall'utente: ${data.user_rating}/10` : null,
      data.soddisfazione ? `Soddisfazione dichiarata dall'utente: ${data.soddisfazione}/10` : null,
      data.trail_score != null ? `Punteggio sentiero (Trail Score): ${data.trail_score}/100` : null,
    ].filter((l): l is string => !!l)
    return { id: e.id, title, type: 'completata', block: buildEntryBlock(title, 'completata', lines) }
  }))

  const found = loaded.filter((x): x is RankedEntry => !!x)
  if (found.length < MIN_ENTRIES) {
    return NextResponse.json({ error: 'Percorsi non trovati' }, { status: 404 })
  }

  // Storico — pattern dalle escursioni completate dall'utente (non solo quelle selezionate), per
  // capire cosa affronta/apprezza davvero, non solo cosa dichiara nelle preferenze. Rispetta il
  // consenso dell'utente all'uso dello storico nei prompt AI (vedi
  // components/profilo/SectionAiPrivacy.tsx) — a consenso negato non viene nemmeno letto.
  const historyRows = aiUseHistoryData
    ? (await supabase
        .from('activities')
        .select('distance_meters, elevation_gain, user_rating, soddisfazione')
        .eq('user_id', user.id)
        .limit(200)).data
    : null

  const history = historyRows ?? []
  const historyBlock = !aiUseHistoryData
    ? 'Storico non disponibile: l\'utente ha disattivato l\'uso dello storico escursionistico nei prompt AI.'
    : history.length > 0
    ? (() => {
        const avgKm    = history.reduce((s, h) => s + (h.distance_meters as number), 0) / history.length / 1000
        const avgDplus = history.reduce((s, h) => s + (h.elevation_gain as number), 0) / history.length
        const ratings  = history.map(h => (h.user_rating ?? h.soddisfazione) as number | null).filter((r): r is number => r != null)
        const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null
        return [
          `Escursioni completate finora: ${history.length}`,
          `Distanza media affrontata: ${avgKm.toFixed(1)} km`,
          `Dislivello medio affrontato: ${Math.round(avgDplus)} m (${difficultyIndex(avgDplus, avgKm * 1000)} m/km)`,
          avgRating != null ? `Voto/soddisfazione medi dati in passato: ${avgRating.toFixed(1)}/10` : null,
        ].filter((l): l is string => !!l).join('\n')
      })()
    : 'Nessuna escursione completata ancora registrata.'

  const age    = aiUseBiometricData ? extraPrefs?.user_age as number | undefined : undefined
  const prefSforzo = aiUseHistoryData ? extraPrefs?.pref_sforzo as number | undefined : undefined
  const prefDurata = aiUseHistoryData ? extraPrefs?.pref_durata as number | undefined : undefined
  const profileBlock = [
    age ? `Età: ${age} anni` : null,
    aiUseBiometricData && userGender && userGender !== 'non_specificato' ? `Genere: ${userGender}` : null,
    prefSforzo != null ? `Sforzo fisico preferito (0=leggero, 100=intenso): ${prefSforzo}/100` : null,
    prefDurata != null ? `Durata di escursione preferita: circa ${formatDuration(prefDurata * 60)}` : null,
  ].filter((l): l is string => !!l).join('\n') || 'Nessuna preferenza dichiarata nelle impostazioni.'

  const prompt = `Confronta questi ${found.length} percorsi per questo utente e produci una classifica personalizzata.

PERCORSI DA CONFRONTARE:
${found.map(f => f.block).join('\n\n')}

PROFILO DICHIARATO DALL'UTENTE:
${profileBlock}

STORICO ESCURSIONISTICO DELL'UTENTE:
${historyBlock}

id da usare nel ranking, nello stesso ordine dei percorsi sopra: ${found.map(f => `"${f.id}"`).join(', ')}`

  const client = new Anthropic({ apiKey })

  let msg
  try {
    msg = await client.messages.parse({
      model:          claudeModel,
      max_tokens:     1200,
      system:         SYSTEM,
      messages:       [{ role: 'user', content: prompt }],
      output_config:  { format: jsonSchemaFormat<RouteCompareOutput>(RANKING_SCHEMA) },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore AI' }, { status: 502 })
  }

  const parsed = msg.parsed_output
  if (!parsed) {
    return NextResponse.json({ error: 'Risposta AI non valida, riprova.' }, { status: 502 })
  }

  const byId = new Map(found.map(f => [f.id, f]))
  const ranking = (parsed.ranking ?? [])
    .filter(r => byId.has(r.id))
    .map((r, i) => ({ id: r.id, title: byId.get(r.id)!.title, type: byId.get(r.id)!.type, position: i + 1, reason: r.reason }))

  return NextResponse.json({
    narrative: parsed.narrative ?? '',
    ranking:   ranking.length > 0 ? ranking : found.map((f, i) => ({ id: f.id, title: f.title, type: f.type, position: i + 1, reason: '' })),
  })
}
