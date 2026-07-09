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
export const maxDuration = 120  // ricerca web + risposta può richiedere più dei 60s di partenza

const MAX_QUESTION_LENGTH = 300

// Stessa convenzione a tag delimitati usata dal resto della Guida (vedi [sottotitolo]/[curiosita]
// in app/api/guide/route.ts): la prima riga della risposta segnala se la domanda era pertinente,
// così l'UI può distinguere una risposta vera da un rifiuto educato senza un'altra chiamata AI.
// Il buffer viene svuotato prima di forwardare qualunque testo al client, così questo tag non
// viene mai mostrato nemmeno per un istante durante lo streaming.
const PERTINENZA_RE = /^\[pertinenza\](si|no)\[\/pertinenza\]\s*/i
const PERTINENZA_MAX_PREFIX_LEN = 40  // oltre questa lunghezza senza match, non è mai arrivato il tag

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

// Ogni riga della risposta è un oggetto NDJSON — l'UI aggiorna via via lo stato mentre Giulia
// cerca online e scrive, invece di restare in sospeso fino alla fine come una singola risposta.
type QaEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; pertinent: boolean; sources: { url: string; title: string }[] }
  | { type: 'error'; message: string }

// ── GET /api/guide/qa?hikeId=X → cronologia domande già poste su questo percorso ─────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const hikeId = req.nextUrl.searchParams.get('hikeId')
    if (!hikeId) return NextResponse.json({ error: 'hikeId mancante' }, { status: 400 })

    const { data, error } = await supabase
      .from('guide_questions')
      .select('question, answer, pertinent, sources, created_at')
      .eq('planned_hike_id', hikeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      entries: (data ?? []).map(r => ({
        question:  r.question,
        answer:    r.answer,
        pertinent: r.pertinent,
        sources:   r.sources ?? [],
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const stream = client.messages.stream({
      model:      'claude-sonnet-4-6',
      max_tokens: 600,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: `${context}\n\nDOMANDA DELL'ESCURSIONISTA: ${question}` }],
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    })

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const send = (e: QaEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'))

        // [pertinenza] arriva sempre per primo — bufferizzato finché non lo riconosciamo (o
        // finché non è chiaramente assente), così non compare mai nel testo mostrato all'utente.
        let pertinent = true
        let resolved = false
        let prefixBuf = ''
        let answerAcc = ''
        const sourcesMap = new Map<string, string>()
        const emitDelta = (text: string) => { answerAcc += text; send({ type: 'delta', text }) }

        try {
          for await (const event of stream) {
            if (event.type === 'content_block_start') {
              const cb = event.content_block
              if (cb.type === 'server_tool_use' && cb.name === 'web_search') {
                send({ type: 'status', text: 'Sto verificando lo stato aggiornato del percorso online…' })
              } else if (cb.type === 'web_search_tool_result') {
                send({ type: 'status', text: 'Ho trovato alcune fonti, sto leggendo…' })
              }
            }

            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              if (!resolved) {
                prefixBuf += event.delta.text
                const m = PERTINENZA_RE.exec(prefixBuf)
                if (m) {
                  pertinent = m[1].toLowerCase() === 'si'
                  resolved = true
                  const rest = prefixBuf.slice(m[0].length)
                  if (rest) emitDelta(rest)
                } else if (prefixBuf.length > PERTINENZA_MAX_PREFIX_LEN) {
                  // Il tag non è mai arrivato (risposta malformata) — non blocchiamo oltre l'utente.
                  resolved = true
                  emitDelta(prefixBuf)
                }
              } else {
                emitDelta(event.delta.text)
              }
            }

            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'citations_delta' &&
              event.delta.citation.type === 'web_search_result_location'
            ) {
              const { url, title } = event.delta.citation
              if (url && !sourcesMap.has(url)) sourcesMap.set(url, title ?? url)
            }
          }

          if (!resolved && prefixBuf) emitDelta(prefixBuf)

          const sources = Array.from(sourcesMap, ([url, title]) => ({ url, title }))

          // Persistita PRIMA di chiudere lo stream: una volta chiamato controller.close() la
          // piattaforma può terminare l'invocazione della function in qualunque momento, quindi
          // un salvataggio "fire and forget" dopo la chiusura rischierebbe di non completare mai.
          // Un fallimento qui non deve però intaccare la risposta già mostrata all'utente.
          if (answerAcc.trim()) {
            try {
              await supabase.from('guide_questions').insert({
                planned_hike_id: hikeId,
                user_id:         user.id,
                question,
                answer:           answerAcc.trim(),
                pertinent,
                sources,
              })
            } catch (e) {
              console.error('Salvataggio guide_questions fallito:', e)
            }
          }

          send({ type: 'done', pertinent, sources })
          controller.close()
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'Errore Claude' })
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type':  'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore interno' }, { status: 500 })
  }
}
