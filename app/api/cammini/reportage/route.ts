import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'
import { logAiUsage } from '@/lib/aiUsageLog'
import { formatDuration } from '@/lib/tcxParser'
import { wmoInfo, type WeatherAtHike } from '@/lib/weather'
import { readProfile, isProfileReady, formatStyleProfileBlock } from '@/lib/writingStyleProfile'
import { POI_META, type PoiItem } from '@/lib/overpass'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { chapterFor, orderedChapters, reportProgress, setPart, upsertChapter, type ReportPart } from '@/lib/cammini/report'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

// Reportage unico del cammino (docs/piano-cammini.md, Fase 6): un capitolo per ogni tappa percorsa,
// scritto da Giulia sui dati reali dell'attività (registrata col Navigator o importata) e sulle note
// dell'utente; introduzione al primo capitolo, conclusione a cammino finito. Il testo vive in
// planned_hikes.cammino_plan.report, quindi cresce con le tappe e si sincronizza come il resto del piano.

const SYSTEM = `Sei un giornalista outdoor di punta, specializzato in reportage di cammini per riviste come
Meridiani e National Geographic Traveller Italia. Racconti in terza persona, con tono evocativo ma
oggettivo, usando i dati reali che ti vengono forniti: distanza, tempo, dislivello, meteo, luoghi
incontrati e le note scritte dal camminatore. Non inventare mai incontri, alloggi, ristoranti, dialoghi,
fatti o dettagli che non compaiono nei dati; se un dato manca, non parlarne. Non usare titoli, elenchi
puntati né asterischi: solo prosa. Non commentare il tuo processo.`

type Kind = 'tappa' | 'epilogue'
type Loaded = { plan: CamminoPlan; title: string }

async function loadPlan(hikeId: string, userId: string): Promise<Loaded | null> {
  const { data } = await supabase.from('planned_hikes').select('title, cammino_plan').eq('id', hikeId).eq('user_id', userId).maybeSingle()
  const plan = data?.cammino_plan as CamminoPlan | null | undefined
  return data && plan ? { plan, title: data.title as string } : null
}

async function savePlan(hikeId: string, userId: string, mutate: (fresh: CamminoPlan) => CamminoPlan): Promise<CamminoPlan | null> {
  // Rilegge subito prima di scrivere: due capitoli richiesti insieme non si sovrascrivono.
  const { data } = await supabase.from('planned_hikes').select('cammino_plan').eq('id', hikeId).eq('user_id', userId).maybeSingle()
  const fresh = data?.cammino_plan as CamminoPlan | null | undefined
  if (!fresh) return null
  const next = mutate(fresh)
  const { error } = await supabase.from('planned_hikes').update({ cammino_plan: next }).eq('id', hikeId).eq('user_id', userId)
  if (error) { console.error('[cammini/reportage] salvataggio', error); return null }
  return next
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`

// PUT — il camminatore corregge un testo (capitolo, introduzione o conclusione).
export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  let body: { hikeId?: unknown; part?: unknown; ordinal?: unknown; text?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const hikeId = typeof body.hikeId === 'string' ? body.hikeId : ''
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 20000) : ''
  if (!hikeId || !text) return NextResponse.json({ error: 'hikeId e text richiesti' }, { status: 400 })
  const now = new Date().toISOString()
  const part = body.part === 'intro' || body.part === 'epilogue' ? (body.part as ReportPart) : null
  const ordinal = Number(body.ordinal)
  const plan = await savePlan(hikeId, user.id, fresh => {
    if (part) return { ...fresh, report: setPart(fresh.report, part, text, now) }
    const existing = chapterFor(fresh, ordinal)
    if (!existing) return fresh
    return { ...fresh, report: upsertChapter(fresh.report, { ...existing, body: text }, now) }
  })
  if (!plan) return NextResponse.json({ error: 'Cammino non trovato' }, { status: 404 })
  return NextResponse.json({ report: plan.report })
}

// POST — Giulia scrive il capitolo di una tappa percorsa, o la conclusione.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: { hikeId?: unknown; kind?: unknown; ordinal?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const hikeId = typeof body.hikeId === 'string' ? body.hikeId : ''
  const kind: Kind = body.kind === 'epilogue' ? 'epilogue' : 'tappa'
  const ordinal = Number(body.ordinal)
  if (!hikeId || (kind === 'tappa' && !Number.isInteger(ordinal))) return NextResponse.json({ error: 'hikeId e ordinal richiesti' }, { status: 400 })

  const { apiKey, claudeModel, aiUseBiometricData, entitlement } = await resolveApiKeyAndSettings(user.id, 'resoconto')
  if (!apiKey) return NextResponse.json({ error: 'no_ai_access', message: 'Al momento non hai accesso alla generazione AI.' }, { status: 402 })

  const loaded = await loadPlan(hikeId, user.id)
  if (!loaded) return NextResponse.json({ error: 'Cammino non trovato' }, { status: 404 })
  const { plan } = loaded

  // Il primo capitolo conta come un nuovo reportage nel periodo di prova.
  if (!plan.report?.chapters.length && entitlement && !entitlement.canCreateReport) {
    return NextResponse.json({ error: 'trial_limit_reached', message: 'Hai raggiunto il limite di reportage del periodo di prova — sblocca Dtrek per continuare.' }, { status: 403 })
  }
  if (entitlement?.trialExpired && plan.report) {
    return NextResponse.json({ error: 'trial_expired', message: 'Periodo di prova terminato — il reportage è in sola lettura finché non sblocchi Dtrek.' }, { status: 403 })
  }

  const { data: place } = await supabase.from('dtrek_places').select('description').eq('id', plan.camminoId).maybeSingle()
  const styleProfile = await readProfile(user.id)
  const styleLine = styleProfile && isProfileReady(styleProfile) ? `\n${formatStyleProfileBlock(styleProfile)}\n` : ''
  const client = new Anthropic({ apiKey })

  async function write(prompt: string, maxTokens: number, feature: string): Promise<string | null> {
    const msg = await client.messages.create({ model: claudeModel, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: prompt }] })
    void logAiUsage({ userId: user!.id, hikeId, feature, model: claudeModel, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens })
    return msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim() || null
  }

  try {
    const now = new Date().toISOString()

    if (kind === 'epilogue') {
      const progress = reportProgress(plan)
      if (!progress.complete) return NextResponse.json({ error: 'incomplete', message: 'La conclusione si scrive quando tutte le tappe hanno il loro capitolo.' }, { status: 409 })
      const chapters = orderedChapters(plan).map(c => {
        const t = plan.tappe.find(x => x.ordinal === c.ordinal)
        return `TAPPA ${t?.fromName ?? '?'} → ${t?.toName ?? '?'}: ${c.body.slice(0, 600)}`
      }).join('\n\n')
      const text = await write(
        `CAMMINO: ${plan.camminoName}\nTAPPE PERCORSE: ${plan.tappe.length}, ${km(plan.tappe.reduce((s, t) => s + t.lengthM, 0))}\n${styleLine}\nCAPITOLI GIÀ SCRITTI:\n${chapters}\n\nScrivi la conclusione del reportage in circa 200 parole: cosa resta di questo cammino, il filo che lega le tappe, un bilancio onesto di fatica e scoperta. Non ripetere i capitoli.`,
        900, 'cammino_reportage_epilogue',
      )
      if (!text) return NextResponse.json({ error: 'Risposta vuota, riprova.' }, { status: 502 })
      const saved = await savePlan(hikeId, user.id, fresh => ({ ...fresh, report: setPart(fresh.report, 'epilogue', text, now) }))
      return NextResponse.json({ report: saved?.report })
    }

    // Capitolo di una tappa: serve l'attività che l'ha percorsa (la più recente se ce n'è più d'una).
    const tappa = plan.tappe.find(t => t.ordinal === ordinal)
    if (!tappa) return NextResponse.json({ error: 'Tappa non trovata' }, { status: 404 })
    const { data: acts } = await supabase.from('activities').select('*').eq('user_id', user.id).eq('linked_planned_id', hikeId).eq('tappa_index', ordinal).order('start_time', { ascending: false }).limit(1)
    const act = acts?.[0] as Record<string, unknown> | undefined
    if (!act) return NextResponse.json({ error: 'no_activity', message: 'Questa tappa non è ancora stata percorsa: registrala col Navigator o importa il file del percorso.' }, { status: 409 })

    const seqIdx = plan.days.flatMap(d => d.tappe).indexOf(ordinal)
    const { data: tappaRow } = await supabase.from('dtrek_cammino_tappe').select('pois').eq('cammino_id', plan.camminoId).eq('ordinal', ordinal).maybeSingle()
    const pois = (Array.isArray(tappaRow?.pois) ? (tappaRow.pois as PoiItem[]) : []).filter(p => p.name).slice(0, 10)

    const weather = act.weather_at_hike as WeatherAtHike | null | undefined
    const notes = (Array.isArray(act.hike_notes) ? (act.hike_notes as { text?: string }[]).map(n => n.text).filter(Boolean) : []) as string[]
    const userNotes = typeof act.user_notes === 'string' && act.user_notes.trim() ? [act.user_notes.trim()] : []
    const facts = [
      act.start_time ? `DATA: ${format(new Date(act.start_time as string), 'EEEE d MMMM yyyy', { locale: it })}` : '',
      `DISTANZA PERCORSA: ${km(act.distance_meters as number)}`,
      act.total_time_seconds ? `TEMPO IN MOVIMENTO E SOSTE: ${formatDuration(act.total_time_seconds as number)}` : '',
      act.elevation_gain ? `DISLIVELLO: +${Math.round(act.elevation_gain as number)} m / −${Math.round((act.elevation_loss as number) ?? 0)} m` : '',
      aiUseBiometricData && (act.avg_heart_rate as number) > 0 ? `FC MEDIA: ${Math.round(act.avg_heart_rate as number)} bpm` : '',
      weather ? `METEO: ${wmoInfo(weather.weathercode).label}, ${Math.round(weather.temperature)}°C, vento ${Math.round(weather.windspeed)} km/h${weather.precipitation > 0 ? `, ${weather.precipitation.toFixed(1)} mm di pioggia` : ''}` : '',
      act.trail_score ? `CTS DELLA TAPPA: ${Math.round(act.trail_score as number)}` : '',
    ].filter(Boolean).join('\n')

    const chapterPrompt = `CAMMINO: ${plan.camminoName}${place?.description ? `\n${String(place.description).slice(0, 500)}` : ''}
TAPPA ${seqIdx + 1} DI ${plan.tappe.length}: ${tappa.fromName ?? 'partenza'} → ${tappa.toName ?? 'arrivo'}
${facts}
${pois.length ? `LUOGHI LUNGO LA TAPPA:\n${pois.map(p => `• ${p.name} (${POI_META[p.type]?.label ?? p.type})`).join('\n')}\n` : ''}${[...userNotes, ...notes].length ? `NOTE DEL CAMMINATORE (le sue parole, da valorizzare):\n${[...userNotes, ...notes].map(n => `- ${n}`).join('\n')}\n` : ''}${styleLine}
Scrivi il capitolo di questa tappa in circa 220 parole: la giornata di cammino, il tratto percorso, ciò che emerge dai dati e dalle note.`

    const [chapterText, introText] = await Promise.all([
      write(chapterPrompt, 1200, 'cammino_reportage_tappa'),
      plan.report?.intro ? Promise.resolve(null) : write(
        `CAMMINO: ${plan.camminoName}${place?.description ? `\n${String(place.description).slice(0, 700)}` : ''}\nTAPPE PREVISTE: ${plan.tappe.length}, ${km(plan.tappe.reduce((s, t) => s + t.lengthM, 0))}\n${styleLine}\nScrivi l'introduzione del reportage in circa 120 parole: cos'è questo cammino e cosa significa metterlo sotto i piedi. Non anticipare le singole tappe.`,
        700, 'cammino_reportage_intro',
      ),
    ])
    if (!chapterText) return NextResponse.json({ error: 'Risposta vuota, riprova.' }, { status: 502 })

    const saved = await savePlan(hikeId, user.id, fresh => {
      let report = upsertChapter(fresh.report, { ordinal, activityId: act.id as string, body: chapterText, generatedAt: now }, now)
      if (introText && !report.intro) report = setPart(report, 'intro', introText, now)
      return { ...fresh, report }
    })
    return NextResponse.json({ report: saved?.report })
  } catch (e) {
    if (isCreditBalanceError(e)) return NextResponse.json({ error: 'credito', message: 'Il credito residuo della tua chiave API Claude si è esaurito.' }, { status: 402 })
    console.error('[cammini/reportage]', e)
    return NextResponse.json({ error: 'Non sono riuscita a scrivere il reportage, riprova.' }, { status: 502 })
  }
}
