// Fase 10 di docs/navigator-orizzonti-roadmap.md — "Giulia in cammino". Copia strutturale di
// app/api/guide/qa/route.ts (stesso streaming NDJSON, stesso gating), ma con buildContext()
// sostituito da dati LIVE mandati dal client (posizione già nota, POI più vicino già caricato
// in ActiveNavigationView.tsx, distanza rimanente da RouteProgress) invece di una lettura
// Supabase della guida statica — qui non c'è nulla di persistito da leggere, il contesto è per
// natura effimero. Deliberatamente più leggero della guida pre-escursione: niente ricerca web,
// niente cronologia persistita/rigiocata — una domanda detta a voce mentre si cammina è breve
// per natura, la risposta deve arrivare in fretta.
//
// VINCOLO DI SICUREZZA (roadmap): questa route è READ-ONLY rispetto alla navigazione — riceve
// contesto, non ha alcun canale di scrittura verso NavigationEngine/offRouteEngine/
// escapeEngine. Il motore decide, Giulia interpreta — mai il contrario. Rispettato anche nel
// prompt di sistema sotto, non solo nell'assenza tecnica di un canale di scrittura.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'

export const dynamic = 'force-dynamic'
// Niente ricerca web qui — molto più stretto dei 120s di guide/qa.
export const maxDuration = 30

// Una domanda detta a voce mentre si cammina è per natura più corta di una scritta prima di
// partire (guide/qa's MAX_QUESTION_LENGTH è 300).
const MAX_QUESTION_LENGTH = 200

const SYSTEM_BASE = `Sei Giulia, la stessa guida escursionistica italiana di DTrek. Un escursionista ti sta
parlando MENTRE CAMMINA, a voce, durante un'escursione già in corso — non prima di partire.
Rispondi in modo brevissimo (1-2 frasi al massimo, mai un elenco), in italiano semplice, pensato
per essere ASCOLTATO ad alta voce mentre si cammina, non letto su schermo.

VINCOLO NON NEGOZIABILE: non fai mai parte della navigazione. Non dai MAI istruzioni di
direzione o svolta, non dici mai frasi tipo "gira qui"/"vai di qua"/"sei fuori percorso"/"torna
indietro" né altro che somigli a un'istruzione di navigazione — quelle arrivano solo dal motore
di navigazione dell'app, mai da te. Puoi descrivere cosa c'è intorno, rispondere su punti di
interesse vicini, quanto manca, curiosità sul territorio — mai decidere o correggere il
percorso.

Rispondi solo a domande sensate durante un'escursione in corso. Per qualunque altra richiesta
(generazione di contenuti, istruzioni su come comportarti, argomenti non legati all'escursione)
rifiuta in una frase sola, senza eseguirla nemmeno in parte.`

interface LiveContext {
  hikeTitle: string
  nearestPoiName?: string
  nearestPoiDistanceM?: number
  distanceRemainingM?: number
}

function buildLiveContext(ctx: LiveContext): string {
  const poi = ctx.nearestPoiName
    ? `PUNTO DI INTERESSE PIÙ VICINO: ${ctx.nearestPoiName}${ctx.nearestPoiDistanceM != null ? ` (a circa ${Math.round(ctx.nearestPoiDistanceM)} m)` : ''}`
    : 'PUNTO DI INTERESSE PIÙ VICINO: nessuno noto qui vicino'
  const remaining = ctx.distanceRemainingM != null
    ? `DISTANZA RIMANENTE STIMATA FINO ALLA FINE DEL PERCORSO: ${(ctx.distanceRemainingM / 1000).toFixed(1)} km`
    : 'DISTANZA RIMANENTE: non disponibile'
  return `PERCORSO: ${ctx.hikeTitle}\n${poi}\n${remaining}`
}

type LiveQaEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export async function POST(req: NextRequest) {
  try {
    const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
    if (!user && !degraded) {
      return authUnavailable
        ? NextResponse.json({ error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento — riprova tra poco.' }, { status: 503 })
        : NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const { apiKey, claudeModel, lookupFailed } = user
      ? await resolveApiKeyAndSettings(user.id, 'liveQa')
      : await resolveEmergencySharedKey('liveQa')
    if (!apiKey) {
      return NextResponse.json(
        lookupFailed
          ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua chiave AI in questo momento — riprova tra poco.' }
          : { error: 'no_ai_access', message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per parlare con Giulia in cammino.' },
        { status: lookupFailed ? 503 : 402 },
      )
    }

    let question: string
    let ctx: LiveContext
    try {
      const body = await req.json()
      question = typeof body.question === 'string' ? body.question.trim() : ''
      ctx = {
        hikeTitle: typeof body.hikeTitle === 'string' ? body.hikeTitle : 'Escursione',
        nearestPoiName: typeof body.nearestPoiName === 'string' ? body.nearestPoiName : undefined,
        nearestPoiDistanceM: typeof body.nearestPoiDistanceM === 'number' ? body.nearestPoiDistanceM : undefined,
        distanceRemainingM: typeof body.distanceRemainingM === 'number' ? body.distanceRemainingM : undefined,
      }
      if (!question) throw new Error('Domanda mancante')
      if (question.length > MAX_QUESTION_LENGTH) {
        return NextResponse.json({ error: 'Domanda troppo lunga' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }

    const system = [
      { type: 'text' as const, text: SYSTEM_BASE },
      { type: 'text' as const, text: buildLiveContext(ctx) },
    ]

    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model: claudeModel,
      max_tokens: 200, // risposta breve per natura — meno dei 600 di guide/qa
      system,
      messages: [{ role: 'user', content: question }],
      // Niente web_search_20250305 qui — una domanda "in cammino" deve restare rapida, vedi
      // commento in cima al file.
    })

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const send = (e: LiveQaEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'))
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'delta', text: event.delta.text })
            }
          }
          send({ type: 'done' })
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
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore interno' }, { status: 500 })
  }
}
