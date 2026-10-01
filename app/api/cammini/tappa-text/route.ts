import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'
import { logAiUsage } from '@/lib/aiUsageLog'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { fetchNatureContext, formatNatureContextBlock } from '@/lib/aiNatureContext'
import { POI_META, type PoiItem } from '@/lib/overpass'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Testi di UNA tappa di un Cammino, su richiesta (docs/piano-cammini.md, Fase 5): racconto, natura e
// sapori sono chiamate brevi e delimitate invece di sezioni uniche per tutto il cammino, che
// superavano il budget di token e si troncavano a metà. Il testo si salva dentro il piano
// (planned_hikes.cammino_plan).
type Kind = 'racconto' | 'natura' | 'sapori'
const FIELD: Record<Kind, 'text' | 'natura' | 'sapori'> = { racconto: 'text', natura: 'natura', sapori: 'sapori' }

const ASK: Record<Kind, (to: string) => string> = {
  racconto: to => `Scrivi il racconto di questa tappa in circa 150-200 parole: il carattere del tratto, cosa attraversi, un luogo o un aneddoto da non perdere se emerge dai dati (altrimenti resta sul paesaggio), e come arrivi a ${to}.`,
  natura: () => 'Scrivi "La natura intorno a te" per questa tappa in circa 120-160 parole: ambienti, boschi, fioriture e fauna che puoi incontrare in questo periodo. Per specie e habitat usa SOLO i dati naturalistici forniti sotto; se sono scarsi resta sul tipo di paesaggio, senza inventare specie.',
  sapori: to => `Scrivi "Sapori e tradizioni" per questa tappa in circa 120-160 parole: piatti, prodotti e tradizioni autentiche di questo tratto e dei paesi di partenza e arrivo (${to}). Nomina solo specialità realmente legate a questi luoghi, mai ristoranti, prezzi o orari; se non sei certa, resta su ciò che è noto della zona.`,
}

const SYSTEM = `Sei Giulia, guida italiana di cammini a piedi con vent'anni di esperienza: conosci storia, arte,
paesaggi e tradizioni dei luoghi attraversati. Parli in seconda persona singolare, in italiano vivace ma
onesto: non minimizzare mai una difficoltà e non inventare mai alloggi, servizi, prezzi, distanze o luoghi
che non compaiono nei dati. Scrivi SOLO il testo richiesto per questa tappa, senza titoli, senza elenchi
puntati e senza commenti sul tuo processo. Non usare asterischi. Non elencare numeri: km e dislivello sono
già mostrati dall'app, commentali e dai loro un significato.`

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: { hikeId?: unknown; ordinal?: unknown; kind?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const hikeId = typeof body.hikeId === 'string' ? body.hikeId : ''
  const ordinal = Number(body.ordinal)
  const kind: Kind = body.kind === 'natura' || body.kind === 'sapori' ? body.kind : 'racconto'
  if (!hikeId || !Number.isInteger(ordinal)) return NextResponse.json({ error: 'hikeId e ordinal richiesti' }, { status: 400 })

  const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'guide')
  if (!apiKey) return NextResponse.json({ error: 'no_ai_access', message: 'Al momento non hai accesso alla generazione AI.' }, { status: 402 })

  const { data: row, error } = await supabase
    .from('planned_hikes')
    .select('id, title, cammino_plan')
    .eq('id', hikeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  const plan = row?.cammino_plan as CamminoPlan | null | undefined
  if (!row || !plan) return NextResponse.json({ error: 'Cammino non trovato' }, { status: 404 })

  const idx = plan.tappe.findIndex(t => t.ordinal === ordinal)
  if (idx < 0) return NextResponse.json({ error: 'Tappa non trovata' }, { status: 404 })
  const t = plan.tappe[idx]
  const prev = plan.tappe[idx - 1], next = plan.tappe[idx + 1]
  const dayIdx = plan.days.findIndex(d => d.tappe.includes(ordinal))
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`

  const [{ data: place }, { data: tappaRow }] = await Promise.all([
    supabase.from('dtrek_places').select('description, region').eq('id', plan.camminoId).maybeSingle(),
    supabase.from('dtrek_cammino_tappe').select('polyline, pois').eq('cammino_id', plan.camminoId).eq('ordinal', ordinal).maybeSingle(),
  ])
  const pois = (Array.isArray(tappaRow?.pois) ? (tappaRow.pois as PoiItem[]) : []).filter(p => p.name).slice(0, 12)
  const poiBlock = pois.length > 0
    ? `LUOGHI LUNGO LA TAPPA (OpenStreetMap):\n${pois.map(p => `• ${p.name} [${POI_META[p.type]?.label ?? p.type}, a ${Math.round(p.distFromTrack)} m dal tracciato]`).join('\n')}\n`
    : ''
  let natureBlock = ''
  if (kind === 'natura' && Array.isArray(tappaRow?.polyline)) {
    const month = (plan.startDate ? new Date(plan.startDate + 'T12:00') : new Date()).getMonth() + 1
    try {
      const ctx = await fetchNatureContext({ trackPoints: (tappaRow.polyline as [number, number][]).map(([lat, lon]) => ({ lat, lon })), month })
      natureBlock = `DATI NATURALISTICI REALI:\n${formatNatureContextBlock(ctx)}\n`
    } catch { /* senza dati la tappa resta sul paesaggio */ }
  }

  const prompt = `CAMMINO: ${plan.camminoName}${plan.direction === 'reverse' ? ' (percorso al contrario rispetto al catalogo)' : ''}
${place?.description ? `PRESENTAZIONE DEL CAMMINO: ${String(place.description).slice(0, 600)}\n` : ''}TAPPA ${idx + 1} DI ${plan.tappe.length}${dayIdx >= 0 ? ` (giornata ${dayIdx + 1} di ${plan.days.length})` : ''}: ${t.fromName ?? 'partenza'} → ${t.toName ?? 'arrivo'}, ${km(t.lengthM)}${t.elevationGainM != null ? `, dislivello +${Math.round(t.elevationGainM)} m / −${Math.round(t.elevationLossM ?? 0)} m` : ''}
${t.endsAtAnchor === false ? 'La tappa si chiude in aperta campagna, non in un paese: dillo e invita a verificare dove dormire.\n' : ''}${poiBlock}${natureBlock}${prev ? `TAPPA PRECEDENTE: ${prev.fromName ?? '?'} → ${prev.toName ?? '?'}\n` : 'È la prima tappa del tuo percorso.\n'}${next ? `TAPPA SUCCESSIVA: ${next.fromName ?? '?'} → ${next.toName ?? '?'}\n` : 'È l’ultima tappa del tuo percorso.\n'}
${ASK[kind](t.toName ?? 'destinazione')}`

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: claudeModel,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    void logAiUsage({ userId: user.id, hikeId, feature: `cammino_tappa_${kind}`, model: claudeModel, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens })
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim()
    if (!text) return NextResponse.json({ error: 'Risposta vuota, riprova.' }, { status: 502 })

    // Rilegge il piano appena prima di scrivere: due tappe richieste insieme non si sovrascrivono.
    const { data: fresh } = await supabase.from('planned_hikes').select('cammino_plan').eq('id', hikeId).eq('user_id', user.id).maybeSingle()
    const freshPlan = (fresh?.cammino_plan as CamminoPlan | null) ?? plan
    const nextPlan: CamminoPlan = { ...freshPlan, tappe: freshPlan.tappe.map(x => (x.ordinal === ordinal ? { ...x, [FIELD[kind]]: text } : x)) }
    const { error: upErr } = await supabase.from('planned_hikes').update({ cammino_plan: nextPlan }).eq('id', hikeId).eq('user_id', user.id)
    if (upErr) console.error('[cammini/tappa-text] salvataggio', upErr)
    return NextResponse.json({ text, kind })
  } catch (e) {
    if (isCreditBalanceError(e)) return NextResponse.json({ error: 'credito', message: 'Il credito residuo della tua chiave API Claude si è esaurito.' }, { status: 402 })
    console.error('[cammini/tappa-text]', e)
    return NextResponse.json({ error: 'Non sono riuscita a scrivere la tappa, riprova.' }, { status: 502 })
  }
}
