import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { DEFAULT_CLAUDE_MODEL, isValidClaudeModelId } from '@/lib/claudeModels'

export const dynamic = 'force-dynamic'

const SYSTEM = `Sei un esperto di marketing per Instagram specializzato in contenuti outdoor, hiking e avventura in montagna.
Il tuo obiettivo è massimizzare engagement e reach.

Regole per la caption:
- Prima riga: hook breve e potente (max 10 parole), deve far fermare il dito sullo scroll
- Corpo: 2-3 frasi autentiche, evocative, in seconda persona singolare (tu)
- Ultima riga: call-to-action leggera (domanda, invito, riflessione)
- Emoji: max 4, solo dove aggiungono valore visivo, non decorativi
- Lunghezza totale caption: 80-150 parole
- Tono: autentico, appassionato, mai promozionale

Regole per gli hashtag:
- 25-28 hashtag totali
- Mix strategico: 8 molto generici (>1M post), 10 medi (100k-1M), 7 specifici/niche (<100k)
- Metà in italiano, metà in inglese
- Includi hashtag di comunità hiking italiane: #escursionismo #camminandoimparo #italiainmontagna #montagnagram
- Includi hashtag internazionali performanti: #hikingitaly #trailrunning #alpinism #mountainlife
- Includi hashtag per il tipo di contenuto: #reelsitalia #videooftheday #outdooradventure

Rispondi SOLO con un oggetto JSON valido, nessun testo fuori dal JSON:
{"caption": "testo della caption", "hashtags": "#hashtag1 #hashtag2 ..."}`

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
  const claudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : DEFAULT_CLAUDE_MODEL

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni per generare caption Instagram.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let title: string, distanceKm: number, elevationGain: number, maxAlt: number,
      date: string | undefined, videoFormat: string

  try {
    const body = await req.json()
    title        = body.title        ?? 'Escursione'
    distanceKm   = Number(body.distanceKm)   || 0
    elevationGain= Number(body.elevationGain) || 0
    maxAlt       = Number(body.maxAlt)        || 0
    date         = body.date
    videoFormat  = body.videoFormat  ?? '9:16'
  } catch {
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const isReel = videoFormat === '9:16'
  const difficulty = elevationGain > 1200 ? 'impegnativa' : elevationGain > 600 ? 'media difficoltà' : 'accessibile'

  const userPrompt = `Genera caption e hashtag Instagram per questa escursione:

Titolo percorso: ${title}
Distanza: ${distanceKm.toFixed(1)} km
Dislivello positivo: ${elevationGain} m
Quota massima: ${maxAlt > 0 ? `${maxAlt} m slm` : 'non disponibile'}
Difficoltà: ${difficulty}${date ? `\nData: ${date}` : ''}
Formato video: ${isReel ? 'Reel verticale 9:16' : `Post ${videoFormat}`}

La caption deve rispecchiare le specifiche tecniche del percorso (distanza, dislivello) in modo naturale, non come elenco.`

  const client = new Anthropic({ apiKey })

  let raw = ''
  try {
    const msg = await client.messages.create({
      model:      claudeModel,
      max_tokens: 700,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    })
    raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: 'Errore AI', message: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Strip markdown code fences if the model wraps the JSON
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ caption: raw, hashtags: '' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
