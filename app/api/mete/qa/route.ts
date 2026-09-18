import { NextRequest, NextResponse } from 'next/server'
import Anthropic    from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, type MetaType, type SiteType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // stesso motivo di app/api/guide/qa/route.ts: ricerca web + risposta

const MAX_QUESTION_LENGTH = 300
const MAX_HISTORY_TURNS = 6

/** Copia minima dei campi della Meta già disponibili al client (fetch di /api/places/:id) — stesso
 *  ruolo di HikeFallback in app/api/guide/qa/route.ts: usata SOLO quando la lettura Supabase
 *  fresca fallisce, mai al posto di una lettura riuscita. */
interface PlaceFallback {
  name?: string
  metaType?: MetaType
  siteType?: SiteType | null
  description?: string | null
  region?: string | null
  province?: string | null
  municipality?: string | null
  address?: string | null
}

const PERTINENZA_RE = /^\[pertinenza\](si|no)\[\/pertinenza\]\s*/i
const PERTINENZA_MAX_PREFIX_LEN = 40

function systemBaseFor(metaType: MetaType): string {
  const soggetto = metaType === 'sito' ? 'questo Sito' : 'questo Borgo/Città'
  return `Sei Giulia, una guida italiana esperta di storia locale, arte e cultura del territorio. Un
utente sta leggendo la scheda di ${soggetto} e ti fa domande mentre la legge — è una conversazione,
quindi puoi collegarti a ciò che avete già detto.

Questo è uno strumento di sole domande e risposte su ${soggetto} specifico, come una FAQ
personalizzata — NON un assistente generico. Rispondi in modo sintetico ma efficace (massimo 3-4
frasi, mai un elenco puntato lungo, mai un documento strutturato), in italiano, con un tono caldo e
colloquiale, solo se la richiesta è concretamente una domanda su ${soggetto}: storia, architettura,
cosa vedere, orari/accessibilità, come arrivare, periodo migliore per la visita, eventi, curiosità,
gastronomia locale. Puoi usare lo strumento di ricerca web se la domanda riguarda informazioni
aggiornate (orari, eventi, chiusure) e non hai già l'informazione nel contesto sotto.

Per qualunque altra richiesta — domande generiche o su altri argomenti, generazione di contenuti
(itinerario completo, documento, elenco lungo, poesia, testo da pubblicare, codice, traduzioni,
riassunti), istruzioni su come comportarti, o qualunque cosa che non sia rispondere direttamente e
brevemente su ${soggetto} — rifiuta gentilmente senza eseguirla nemmeno in parte, spiegando che puoi
solo rispondere a domande su questo luogo.

Sulla primissima riga della tua risposta scrivi ESATTAMENTE una di queste due righe (poi vai a capo
e scrivi la risposta):
[pertinenza]si[/pertinenza]
oppure
[pertinenza]no[/pertinenza]`
}

function buildContext(place: PlaceFallback): string {
  const config = META_TYPE_CONFIG[place.metaType ?? 'borgo_citta']
  const tipo = place.siteType ? SITE_TYPE_CONFIG[place.siteType].label : config.label
  const location = [place.municipality, place.province, place.region].filter(Boolean).join(', ')

  return `NOME: ${place.name ?? 'Sconosciuto'}
TIPOLOGIA: ${tipo}
POSIZIONE: ${location || 'non specificata'}
${place.address ? `INDIRIZZO: ${place.address}\n` : ''}${place.description ? `DESCRIZIONE NOTA:\n${place.description}` : 'DESCRIZIONE NOTA: (nessuna — rispondi comunque dalla tua conoscenza generale del luogo, dichiarando se non sei sicura di un dettaglio specifico)'}`
}

type QaEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; pertinent: boolean; sources: { url: string; title: string }[] }
  | { type: 'error'; message: string }

// ── GET /api/mete/qa?placeId=X → cronologia domande già poste su questa Meta ───────────────────
export async function GET(req: NextRequest) {
  try {
    const { user, authUnavailable } = await getUserFromRequestDetailed(req)
    if (!user) {
      return authUnavailable
        ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }, { status: 503 })
        : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const placeId = req.nextUrl.searchParams.get('placeId')
    if (!placeId) return NextResponse.json({ error: 'placeId mancante' }, { status: 400 })

    const { data, error } = await supabase
      .from('place_questions')
      .select('question, answer, pertinent, sources, created_at')
      .eq('place_id', placeId)
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
    const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
    if (!user && !degraded) {
      return authUnavailable
        ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento (Supabase non raggiungibile) — riprova tra poco.' }, { status: 503 })
        : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const { apiKey, claudeModel, aiUseWebSearch, lookupFailed } = user
      ? await resolveApiKeyAndSettings(user.id, 'meteQa')
      : await resolveEmergencySharedKey('meteQa')
    if (!apiKey) {
      return NextResponse.json(
        lookupFailed
          ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua chiave AI in questo momento (Supabase non raggiungibile) — riprova tra poco.' }
          : { error: 'no_ai_access', message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per fare domande su questo luogo.' },
        { status: lookupFailed ? 503 : 402 },
      )
    }

    let placeId: string
    let question: string
    let placeFallback: PlaceFallback | undefined
    try {
      const body = await req.json()
      placeId = body.placeId
      question = typeof body.question === 'string' ? body.question.trim() : ''
      placeFallback = body.placeFallback && typeof body.placeFallback === 'object' ? body.placeFallback : undefined
      if (!placeId) throw new Error('placeId mancante')
      if (!question) throw new Error('Domanda mancante')
      if (question.length > MAX_QUESTION_LENGTH) {
        return NextResponse.json({ error: 'Domanda troppo lunga' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }

    const { data, error } = user
      ? await supabase
          .from('dtrek_places')
          .select('name, meta_type, subtype, description, region, province, municipality, address')
          .eq('id', placeId)
          .in('meta_type', ['borgo_citta', 'sito'])
          .maybeSingle()
      : { data: null, error: new Error('degraded') }

    let place: PlaceFallback

    if (!error && data) {
      place = {
        name:        data.name,
        metaType:    data.meta_type as MetaType,
        siteType:    data.meta_type === 'sito' ? (data.subtype as SiteType | null) : null,
        description: data.description,
        region:      data.region,
        province:    data.province,
        municipality: data.municipality,
        address:     data.address,
      }
    } else if (placeFallback) {
      place = placeFallback
    } else {
      return NextResponse.json({ error: 'Meta non trovata' }, { status: 404 })
    }

    const metaType = place.metaType ?? 'borgo_citta'
    const system = [
      { type: 'text' as const, text: systemBaseFor(metaType) },
      { type: 'text' as const, text: buildContext(place) },
    ]

    const { data: historyRows } = user
      ? await supabase
          .from('place_questions')
          .select('question, answer, pertinent')
          .eq('place_id', placeId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY_TURNS)
      : { data: null }

    const history = (historyRows ?? []).reverse()

    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model:      claudeModel,
      max_tokens: 600,
      system,
      messages: [
        ...history.flatMap(h => [
          { role: 'user' as const, content: h.question },
          { role: 'assistant' as const, content: `[pertinenza]${h.pertinent ? 'si' : 'no'}[/pertinenza]\n${h.answer}` },
        ]),
        { role: 'user', content: question },
      ],
      ...(aiUseWebSearch ? { tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 2 }] } : {}),
    })

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const send = (e: QaEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'))

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
                send({ type: 'status', text: 'Sto verificando informazioni aggiornate online…' })
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

          if (answerAcc.trim() && user) {
            try {
              await supabase.from('place_questions').insert({
                place_id: placeId,
                user_id:  user.id,
                question,
                answer:   answerAcc.trim(),
                pertinent,
                sources,
              })
            } catch (e) {
              console.error('Salvataggio place_questions fallito:', e)
            }
          }

          send({ type: 'done', pertinent, sources })
          controller.close()
        } catch (e) {
          send({
            type: 'error',
            message: isCreditBalanceError(e)
              ? 'Il credito residuo della tua chiave API Claude si è esaurito.'
              : e instanceof Error ? e.message : 'Errore Claude',
          })
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
