import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { formatDuration }    from '@/lib/tcxParser'
import { format }            from 'date-fns'
import { it }                from 'date-fns/locale'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

type ResocontoLength = 'breve' | 'media' | 'lunga'

const LENGTH_CONFIG: Record<ResocontoLength, { maxTokens: number; instruction: string }> = {
  breve: {
    maxTokens: 1800,
    instruction: 'Scrivi in modo conciso: 2-3 paragrafi per sezione, massimo 150 parole per sezione.',
  },
  media: {
    maxTokens: 6000,
    instruction: 'Scrivi con buon equilibrio di dettagli: 3-4 paragrafi per sezione, circa 300 parole per sezione.',
  },
  lunga: {
    maxTokens: 10000,
    instruction: 'Scrivi con grande ricchezza di dettagli: 5-6 paragrafi per sezione, circa 500 parole per sezione.',
  },
}

const SYSTEM = `Sei un giornalista outdoor di punta, specializzato in reportage escursionistici per riviste come Meridiani Montagne e National Geographic Traveller Italia.
Hai una solida formazione in geografia, storia naturale e medicina dello sport, che usi per arricchire ogni articolo con dati precisi e contesto culturale profondo.

Il tuo stile è autorevole ma accessibile: come un corrispondente dal campo, descrivi l'escursione in terza persona con tono oggettivo ma evocativo.
Usa i dati biometrici (frequenza cardiaca, calorie, passo) come elementi narrativi che raccontano lo sforzo fisico.
Integra i dati di percorso con riferimenti storici, geologici e naturalistici tratti dalla guida disponibile.
Descrivi le fotografie scattate lungo il percorso come dispacci visivi: cosa immortalano, a che punto del cammino, cosa rivelano del territorio.

Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio). Non usare asterischi per il grassetto.
Non usare bullet point: preferisci narrazione fluida e densa di dettagli.
Per curiosità, fatti insoliti o dati sorprendenti, racchiudili in: [curiosita] testo [/curiosita]`

interface PhotoMeta {
  caption: string
  lat?: number
  lon?: number
  progress: number
  hasExifGps?: boolean
}

function buildPrompt(
  activity: Record<string, unknown>,
  length: ResocontoLength,
  photos: PhotoMeta[],
  guideText?: string,
): string {
  const dateStr = activity.start_time
    ? format(new Date(activity.start_time as string), "EEEE d MMMM yyyy", { locale: it })
    : null

  // Biometric data
  const avgHR  = activity.avg_heart_rate  as number | undefined
  const maxHR  = activity.max_heart_rate  as number | undefined
  const avgSpd = activity.avg_speed_ms    as number | undefined
  const cal    = activity.calories        as number | undefined
  const biometricBlock = [
    avgHR  && avgHR  > 0 ? `FC MEDIA: ${Math.round(avgHR)} bpm` : '',
    maxHR  && maxHR  > 0 ? `FC MASSIMA: ${Math.round(maxHR)} bpm` : '',
    avgSpd && avgSpd > 0 ? `VELOCITÀ MEDIA: ${(avgSpd * 3.6).toFixed(1)} km/h` : '',
    cal    && cal    > 0 ? `CALORIE BRUCIATE: ${cal} kcal` : '',
  ].filter(Boolean).join('\n')

  // Photos sorted start→end (progress 0.0 → 1.0)
  const sortedPhotos = [...photos].sort((a, b) => a.progress - b.progress)
  function progressLabel(p: number): string {
    if (p < 0.15) return 'alla partenza'
    if (p < 0.4)  return 'nel primo tratto del percorso'
    if (p < 0.65) return 'a metà percorso'
    if (p < 0.85) return 'nel tratto finale'
    return 'quasi all\'arrivo'
  }

  const photoBlock = sortedPhotos.length > 0
    ? sortedPhotos
        .map((p, i) =>
          `• Scatto ${i + 1}: "${p.caption}" — ${progressLabel(p.progress)}${p.hasExifGps && p.lat && p.lon ? ` (GPS verificato: ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E)` : ''}`,
        )
        .join('\n')
    : '(nessun materiale fotografico)'

  const guideBlock = guideText
    ? `\nCONTESTO STORICO-NATURALISTICO (estratto dalla guida del percorso — usalo come fonte per approfondimenti):\n${guideText.slice(0, 2500)}\n`
    : ''

  return `Scrivi un reportage giornalistico di questa escursione per una rivista outdoor italiana di qualità:

TITOLO ESCURSIONE: ${activity.title ?? 'Escursione'}
${dateStr ? `DATA: ${dateStr}` : ''}

DATI DEL PERCORSO:
DISTANZA: ${((activity.distance_meters as number) / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(activity.elevation_gain as number)} m
DISLIVELLO NEGATIVO: ${Math.round((activity.elevation_loss as number) ?? 0)} m
DURATA EFFETTIVA: ${formatDuration(activity.total_time_seconds as number)}
${(activity.altitude_max as number) > 0 ? `QUOTA MASSIMA RAGGIUNTA: ${Math.round(activity.altitude_max as number)} m slm` : ''}
${biometricBlock ? `\nDATI DI RIFERIMENTO (usa solo se rilevanti, non come sezione separata):\n${biometricBlock}` : ''}
${activity.user_notes ? `\nNOTE DELL'ESCURSIONISTA:\n${activity.user_notes}` : ''}
${guideBlock}
DOCUMENTAZIONE FOTOGRAFICA (in ordine cronologico dal punto di partenza):
${photoBlock}

Scrivi il reportage strutturato in queste quattro sezioni (usa ## per ogni titolo):

## Il percorso
Descrivi il tracciato e il territorio attraversato: paesaggio, morfologia del terreno,
punti panoramici, cambi di vegetazione. Contestualizza geograficamente il percorso
senza usare toni enfatici. Usa i dati di distanza, dislivello e quota come ancoraggio.

## Cronaca
Racconta la progressione dell'escursione dall'inizio alla fine in ordine cronologico.
Integra le fotografie scattate come elementi della narrazione: cosa mostrano,
in quale tratto del percorso, cosa aggiungono alla comprensione dei luoghi.
Eventuali dati biometrici possono essere citati qui se aiutano a descrivere il ritmo o la fatica.

## Natura e storia
Approfondisci i luoghi attraversati: geologia, flora, fauna, siti storici o
archeologici nelle vicinanze, tradizioni locali. Includi almeno un fatto poco noto
che arricchisca la conoscenza del territorio.

## In sintesi
Valutazione complessiva: difficoltà effettiva, qualità del contesto, periodo ideale,
consigli pratici. Una o due frasi conclusive che catturino l'essenza dell'esperienza.

${photos.length > 0 ? 'Le fotografie sono in ordine cronologico: la prima è vicino alla partenza, l\'ultima vicino all\'arrivo.' : ''}
Scrivi in italiano preciso, diretto, senza aggettivi inflazionati o toni epici.

LUNGHEZZA: ${LENGTH_CONFIG[length].instruction}

IMPORTANTE: Completa obbligatoriamente tutte e quattro le sezioni.`

}


// ── GET — fetch existing report ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response('{"error":"Non autenticato"}', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const activityId = req.nextUrl.searchParams.get('activityId')
  if (!activityId) {
    return new Response('{"error":"activityId mancante"}', {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await supabase
    .from('hike_reports')
    .select('id, activity_id, title, content, photos, created_at, updated_at')
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

// ── POST — generate (streaming) + save ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response('{"error":"Non autenticato"}', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier')
    .eq('user_id', user.id)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSub  = (settings?.subscription_tier as string) === 'premium'
  const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null)

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni per generare il resoconto.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let activityId: string
  let length: ResocontoLength = 'media'
  let photos: PhotoMeta[] = []
  try {
    const body = await req.json()
    activityId = body.activityId
    if (!activityId) throw new Error('activityId mancante')
    if (body.length && ['breve', 'media', 'lunga'].includes(body.length)) {
      length = body.length as ResocontoLength
    }
    if (Array.isArray(body.photos)) photos = body.photos
  } catch {
    return new Response('{"error":"Body non valido"}', {
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
    return new Response('{"error":"Attività non trovata"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  let guideText: string | undefined
  if (activity.linked_planned_id) {
    const { data: hike } = await supabase
      .from('planned_hikes')
      .select('cached_guide')
      .eq('id', activity.linked_planned_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (hike?.cached_guide) guideText = hike.cached_guide
  }

  const client  = new Anthropic({ apiKey })
  const prompt  = buildPrompt(activity, length, photos, guideText)
  const { maxTokens } = LENGTH_CONFIG[length]

  let fullText = ''

  const aiStream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text
            fullText += text
            controller.enqueue(new TextEncoder().encode(text))
          }
        }
        // Upsert BEFORE closing so the async work completes within stream lifetime
        try {
          const reportId  = `report-${activityId}`
          const photoMeta = photos.map(({ caption, lat, lon, progress }) => ({ caption, lat, lon, progress }))
          await supabase.from('hike_reports').upsert(
            {
              id:          reportId,
              user_id:     user.id,
              activity_id: activityId,
              title:       (activity.title as string) ?? 'Escursione',
              content:     fullText,
              photos:      photoMeta,
              updated_at:  new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
        } catch { /* save errors are non-fatal — content was already streamed */ }

        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':     'text/plain; charset=utf-8',
      'Cache-Control':    'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ── PATCH — autosave edited content ────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response('{"error":"Non autenticato"}', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  let activityId: string, content: string
  try {
    const body = await req.json()
    activityId = body.activityId
    content    = body.content
    if (!activityId || content === undefined) throw new Error()
  } catch {
    return new Response('{"error":"Body non valido"}', {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error } = await supabase
    .from('hike_reports')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', `report-${activityId}`)
    .eq('user_id', user.id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })
}
