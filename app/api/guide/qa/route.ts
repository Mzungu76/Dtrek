import { NextRequest, NextResponse } from 'next/server'
import Anthropic    from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }    from '@/lib/overpass'
import type { WikiPage }   from '@/lib/wikipedia'
import { formatDuration }  from '@/lib/tcxParser'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_QUESTION_LENGTH = 300

// Stessa convenzione a tag delimitati usata dal resto della Guida (vedi [sottotitolo]/[curiosita]
// in app/api/guide/route.ts): la prima riga della risposta segnala se la domanda era pertinente,
// così l'UI può distinguere una risposta vera da un rifiuto educato senza un'altra chiamata AI.
const PERTINENZA_RE = /^\[pertinenza\](si|no)\[\/pertinenza\]\s*/i

const SYSTEM = `Sei Giulia, la stessa guida escursionistica italiana che ha scritto la guida di questo
percorso specifico. Un escursionista ti sta facendo una domanda mentre legge la guida.

Rispondi in modo sintetico ma efficace (massimo 3-4 frasi), in italiano, con lo stesso tono caldo e
colloquiale della guida — solo se la domanda riguarda concretamente QUESTO percorso: luoghi che
attraversa, tappe, difficoltà, sicurezza, attrezzatura, tempistiche, come arrivare, punti d'appoggio,
flora e fauna, storia dei luoghi, condizioni attuali del sentiero. Puoi usare lo strumento di ricerca
web se la domanda riguarda lo stato attuale del percorso (chiusure, meteo, condizioni recenti) e non
hai già l'informazione nel contesto sotto.

Se la domanda NON riguarda questo percorso (domande generiche, su altri argomenti, o che non
c'entrano con l'escursione), rispondi gentilmente spiegando che puoi aiutare solo con domande su
questo percorso — non rispondere comunque alla domanda estranea, nemmeno in parte.

Sulla primissima riga della tua risposta scrivi ESATTAMENTE una di queste due righe (poi vai a capo
e scrivi la risposta):
[pertinenza]si[/pertinenza]
oppure
[pertinenza]no[/pertinenza]`

function buildContext(hike: PlannedHike, guideExcerpt: string): string {
  const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const luoghi = wiki.length > 0
    ? wiki.map(({ poi, wiki: w }) => `• ${w.title} [${poi.type}]`).join('\n')
    : '(nessun punto di interesse noto)'

  return `PERCORSO: ${hike.title}
DISTANZA: ${(hike.distanceMeters / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(hike.elevationGain)} m
DURATA STIMATA: ${formatDuration(hike.estimatedTimeSeconds)}
DIFFICOLTÀ: ${hike.assessment?.difficulty ?? 'non specificata'}

LUOGHI DEL PERCORSO:
${luoghi}

TESTO DELLA GUIDA GIÀ SCRITTA (estratto):
${guideExcerpt}`
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { apiKey } = await resolveApiKeyAndSettings(user.id)
  if (!apiKey) {
    return NextResponse.json({
      error: 'no_ai_access',
      message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per fare domande sul percorso.',
    }, { status: 402 })
  }

  let hikeId: string
  let question: string
  try {
    const body = await req.json()
    hikeId = body.hikeId
    question = typeof body.question === 'string' ? body.question.trim() : ''
    if (!hikeId) throw new Error('hikeId mancante')
    if (!question) throw new Error('Domanda mancante')
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json({ error: 'Domanda troppo lunga' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('planned_hikes')
    .select('title, distance_meters, elevation_gain, estimated_time_seconds, assessment, cached_pois, cached_poi_wiki, cached_guide')
    .eq('id', hikeId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Percorso non trovato' }, { status: 404 })
  }

  const hike: PlannedHike = {
    id:                   hikeId,
    title:                data.title,
    createdAt:            '',
    distanceMeters:       data.distance_meters,
    elevationGain:        data.elevation_gain,
    elevationLoss:        0,
    altitudeMax:          0,
    altitudeMin:          0,
    estimatedTimeSeconds: data.estimated_time_seconds,
    assessment:           data.assessment      ?? undefined,
    cachedPois:           data.cached_pois     ?? undefined,
    cachedPoiWiki:        data.cached_poi_wiki ?? undefined,
  }

  const guideExcerpt = ((data.cached_guide as string | null) ?? '').slice(0, 6000)
  const context = buildContext(hike, guideExcerpt)

  const client = new Anthropic({ apiKey })

  let message
  try {
    message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 600,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: `${context}\n\nDOMANDA DELL'ESCURSIONISTA: ${question}` }],
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore Claude' }, { status: 502 })
  }

  const textBlocks = message.content.filter(
    (b): b is Extract<typeof message.content[number], { type: 'text' }> => b.type === 'text',
  )
  const rawText = textBlocks.map(b => b.text).join('\n').trim()

  // Fonti web citate da Claude nella risposta (popolate automaticamente quando usa web_search) —
  // stessa logica di app/api/guide/route.ts, ma qui il messaggio non è in streaming: le citazioni
  // sono già presenti su ogni blocco di testo, non serve ricostruirle da eventi incrementali.
  const sourcesMap = new Map<string, string>()
  for (const b of textBlocks) {
    for (const c of b.citations ?? []) {
      if (c.type === 'web_search_result_location' && c.url && !sourcesMap.has(c.url)) {
        sourcesMap.set(c.url, c.title ?? c.url)
      }
    }
  }
  const sources = Array.from(sourcesMap, ([url, title]) => ({ url, title }))

  const match = PERTINENZA_RE.exec(rawText)
  const pertinent = match ? match[1].toLowerCase() === 'si' : true
  const answer = match ? rawText.slice(match[0].length).trim() : rawText

  return NextResponse.json({ answer, pertinent, sources })
}
