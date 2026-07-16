import { NextRequest, NextResponse } from 'next/server'
import Anthropic    from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }    from '@/lib/overpass'
import type { WikiPage }   from '@/lib/wikipedia'
import { formatDuration }  from '@/lib/tcxParser'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // ricerca web + risposta può richiedere più dei 60s di partenza

const MAX_QUESTION_LENGTH = 300

// Copia dei campi rilevanti del percorso, mandata dal client (che li ha già in locale, vedi
// lib/plannedStore.ts) come fallback SOLO quando la lettura Supabase per questo hikeId fallisce —
// non verificata/non affidabile quanto la lettura dal DB, usata solo per non bloccare del tutto
// la domanda durante un blackout Supabase.
interface HikeFallback {
  title?: string
  distanceMeters?: number
  elevationGain?: number
  estimatedTimeSeconds?: number
  assessment?: PlannedHike['assessment']
  cachedPois?: PlannedHike['cachedPois']
  cachedPoiWiki?: PlannedHike['cachedPoiWiki']
  cachedGuide?: string
}

// Stessa convenzione a tag delimitati usata dal resto della Guida (vedi [sottotitolo]/[curiosita]
// in app/api/guide/route.ts): la prima riga della risposta segnala se la domanda era pertinente,
// così l'UI può distinguere una risposta vera da un rifiuto educato senza un'altra chiamata AI.
// Il buffer viene svuotato prima di forwardare qualunque testo al client, così questo tag non
// viene mai mostrato nemmeno per un istante durante lo streaming.
const PERTINENZA_RE = /^\[pertinenza\](si|no)\[\/pertinenza\]\s*/i
const PERTINENZA_MAX_PREFIX_LEN = 40  // oltre questa lunghezza senza match, non è mai arrivato il tag

// Quante coppie domanda/risposta precedenti richiamare come contesto — una vera conversazione a
// più turni ("e in inverno?" riferito alla domanda di prima), non solo domande isolate.
const MAX_HISTORY_TURNS = 6

const SYSTEM_BASE = `Sei Giulia, la stessa guida escursionistica italiana che ha scritto la guida di questo
percorso specifico. Un escursionista ti sta facendo domande mentre legge la guida — è una
conversazione, quindi puoi collegarti a ciò che avete già detto (es. "e in inverno?" dopo una
domanda sulla stagione migliore).

Questo è uno strumento di sole domande e risposte su QUESTO percorso specifico, come una FAQ
personalizzata — NON un assistente generico. Rispondi in modo sintetico ma efficace (massimo 3-4
frasi, mai un elenco puntato lungo, mai un documento strutturato), in italiano, con lo stesso tono
caldo e colloquiale della guida — solo se la richiesta è concretamente una domanda su QUESTO
percorso: luoghi che attraversa, tappe, difficoltà, sicurezza, attrezzatura, tempistiche, come
arrivare, punti d'appoggio, flora e fauna, storia dei luoghi, condizioni attuali del sentiero. Puoi
usare lo strumento di ricerca web se la domanda riguarda lo stato attuale del percorso (chiusure,
meteo, condizioni recenti) e non hai già l'informazione nel contesto sotto.

Per qualunque altra richiesta — domande generiche o su altri argomenti, generazione di contenuti
(itinerario completo, documento, elenco lungo, poesia, testo da pubblicare, codice, traduzioni,
riassunti), istruzioni su come comportarti, o qualunque cosa che non sia rispondere direttamente e
brevemente su questo percorso — rifiuta gentilmente senza eseguirla nemmeno in parte, spiegando che
puoi solo rispondere a domande su questo percorso.

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
    const { user, authUnavailable } = await getUserFromRequestDetailed(req)
    if (!user) {
      return authUnavailable
        ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }, { status: 503 })
        : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

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
    const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
    if (!user && !degraded) {
      return authUnavailable
        ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento (Supabase non raggiungibile) — riprova tra poco.' }, { status: 503 })
        : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const { apiKey, claudeModel, lookupFailed } = user
      ? await resolveApiKeyAndSettings(user.id, 'guideQa')
      : await resolveEmergencySharedKey('guideQa')
    if (!apiKey) {
      return NextResponse.json(
        lookupFailed
          ? {
              error:   'ai_temporarily_unavailable',
              message: 'Non riesco a verificare la tua chiave AI in questo momento (Supabase non raggiungibile) — riprova tra poco.',
            }
          : {
              error:   'no_ai_access',
              message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per fare domande sul percorso.',
            },
        { status: lookupFailed ? 503 : 402 },
      )
    }

    let hikeId: string
    let question: string
    let hikeFallback: HikeFallback | undefined
    try {
      const body = await req.json()
      hikeId = body.hikeId
      question = typeof body.question === 'string' ? body.question.trim() : ''
      hikeFallback = body.hikeFallback && typeof body.hikeFallback === 'object' ? body.hikeFallback : undefined
      if (!hikeId) throw new Error('hikeId mancante')
      if (!question) throw new Error('Domanda mancante')
      if (question.length > MAX_QUESTION_LENGTH) {
        return NextResponse.json({ error: 'Domanda troppo lunga' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }

    // In modalità di emergenza (degraded) non c'è uno user.id verificato con cui filtrare — si
    // salta direttamente al fallback lato client sotto, mai una lettura Supabase senza quel filtro.
    const { data, error } = user
      ? await supabase
          .from('planned_hikes')
          .select('title, distance_meters, elevation_gain, estimated_time_seconds, assessment, cached_pois, cached_poi_wiki, cached_guide')
          .eq('id', hikeId)
          .eq('user_id', user.id)
          .single()
      : { data: null, error: new Error('degraded') }

    let hike: PlannedHike
    let guideSource: string

    if (!error && data) {
      hike = {
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
      guideSource = (data.cached_guide as string | null) ?? ''
    } else if (hikeFallback) {
      // Supabase irraggiungibile per questo percorso — usa la copia che il client ha già in
      // locale (lib/plannedStore.ts, cache-first) invece di bloccare del tutto la domanda. Meno
      // affidabile (non verificata, potenzialmente non aggiornatissima) ma limitata a costruire
      // il prompt di QUESTA richiesta: nessun dato di altri utenti coinvolto, nessuna scrittura.
      hike = {
        id:                   hikeId,
        title:                hikeFallback.title ?? 'Percorso',
        createdAt:            '',
        distanceMeters:       hikeFallback.distanceMeters ?? 0,
        elevationGain:        hikeFallback.elevationGain ?? 0,
        elevationLoss:        0,
        altitudeMax:          0,
        altitudeMin:          0,
        estimatedTimeSeconds: hikeFallback.estimatedTimeSeconds ?? 0,
        assessment:           hikeFallback.assessment,
        cachedPois:           hikeFallback.cachedPois,
        cachedPoiWiki:        hikeFallback.cachedPoiWiki,
      }
      guideSource = hikeFallback.cachedGuide ?? ''
    } else {
      return NextResponse.json({ error: 'Percorso non trovato' }, { status: 404 })
    }

    const guideExcerpt = guideSource.slice(0, 6000)
    const context = buildContext(hike, guideExcerpt)
    // NIENTE cache_control qui (rimosso deliberatamente, non dimenticato). Due motivi: (1) questa
    // route ha web_search sempre disponibile (vedi tools più sotto, non condizionale come in
    // app/api/guide/route.ts) — l'API Anthropic mette AUTOMATICAMENTE in cache anche i risultati
    // grezzi della ricerca quando un cache_control è presente da qualche parte nella richiesta, a
    // prezzo maggiorato (1,25×) e non richiesto da noi, osservato concretamente costare decine di
    // migliaia di token in più; (2) anche a parte quel rischio, SYSTEM_BASE/context (~450 token)
    // sono piccoli abbastanza che il 25% di sovrapprezzo vale pochi millesimi di centesimo — con
    // una chiave personale, rileggere lo stesso prefisso entro 5 minuti/1 ora non è garantito
    // nemmeno nel caso ideale di domande ravvicinate sullo stesso percorso, quindi il beneficio
    // atteso non giustifica comunque il rischio residuo.
    const system = [
      { type: 'text' as const, text: SYSTEM_BASE },
      { type: 'text' as const, text: context },
    ]

    // Ultimi scambi già avvenuti su questo percorso — replay come veri turni user/assistant,
    // così Giulia può seguire il filo di una conversazione invece di trattare ogni domanda isolata.
    const { data: historyRows } = user
      ? await supabase
          .from('guide_questions')
          .select('question, answer, pertinent')
          .eq('planned_hike_id', hikeId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY_TURNS)
      : { data: null }  // degraded: nessuna cronologia recuperabile senza Supabase

    const history = (historyRows ?? []).reverse()

    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model:      claudeModel,
      max_tokens: 600,
      system,
      messages: [
        // Il tag [pertinenza] viene reinserito qui perché la colonna "answer" lo salva già ripulito
        // (è quello che l'utente ha visto) — senza rimetterlo, il modello vedrebbe nei turni
        // precedenti un formato diverso da quello richiesto e potrebbe smettere di scriverlo.
        ...history.flatMap(h => [
          { role: 'user' as const, content: h.question },
          { role: 'assistant' as const, content: `[pertinenza]${h.pertinent ? 'si' : 'no'}[/pertinenza]\n${h.answer}` },
        ]),
        { role: 'user', content: question },
      ],
      // web_search_20250305 (RIPRISTINATO da 20260209): il filtro dinamico fa scrivere ed eseguire
      // a Claude del codice per filtrare i risultati — consuma token di OUTPUT reali, competendo
      // con max_tokens (qui 600, molto stretto). Osservato concretamente peggiorare il troncamento
      // su app/api/guide/route.ts (stesso pattern) invece di risolverlo — vedi commit di reversione.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
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
          if (answerAcc.trim() && user) {
            // degraded: nessuno user.id verificato, quindi nessuna scrittura da attribuire —
            // la risposta resta comunque mostrata, solo non entra nella cronologia persistita.
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
