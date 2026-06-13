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

const SYSTEM = `Sei Giulia, una guida escursionistica italiana con vent'anni di esperienza sul campo.
Stai aiutando un escursionista a scrivere il resoconto della sua escursione appena completata.
Il tuo stile è caldo, personale e immersivo: scrivi in prima persona (come se fossi l'escursionista),
con vivacità descrittiva e attenzione ai dettagli sensoriali. Racconta l'esperienza come un capitolo di un libro di viaggio.

Usa la prima persona singolare (io/mi/mio). Scrivi in italiano vivace e letterario.
Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio). Non usare asterischi per il grassetto.
Non usare bullet point: preferisci frasi di narrazione fluida.
Per riflessioni o momenti particolarmente significativi, racchiudili in: [curiosita] testo [/curiosita]`

interface PhotoMeta {
  caption: string
  lat?: number
  lon?: number
  progress: number
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

  const photoBlock = photos.length > 0
    ? photos
        .map((p, i) =>
          `• Foto ${i + 1}: "${p.caption}"${p.lat && p.lon ? ` (GPS: ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})` : ''} — al ${(p.progress * 100).toFixed(0)}% del percorso`,
        )
        .join('\n')
    : '(nessuna foto)'

  const guideBlock = guideText
    ? `\nGUIDA DEL PERCORSO (usa come riferimento per luoghi e storia):\n${guideText.slice(0, 2000)}\n`
    : ''

  return `Scrivi il resoconto personale di questa escursione appena completata:

TITOLO: ${activity.title ?? 'Escursione'}
${dateStr ? `DATA: ${dateStr}` : ''}
DISTANZA: ${((activity.distance_meters as number) / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(activity.elevation_gain as number)} m
DURATA: ${formatDuration(activity.total_time_seconds as number)}
${(activity.altitude_max as number) > 0 ? `QUOTA MASSIMA: ${Math.round(activity.altitude_max as number)} m slm` : ''}
${(activity.calories as number) > 0 ? `CALORIE: ${activity.calories} kcal` : ''}
${activity.user_notes ? `NOTE PERSONALI:\n${activity.user_notes}` : ''}
${guideBlock}
FOTO SCATTATE DURANTE L'ESCURSIONE:
${photoBlock}

Scrivi il resoconto strutturato in queste cinque sezioni (usa ## per ogni titolo):

## La partenza
Come è iniziata la giornata, l'atmosfera del mattino, le prime impressioni, il punto di partenza.

## La salita
Il percorso verso il punto più alto: il terreno, il paesaggio che cambiava, le fatiche, gli incontri.

## Il punto culminante
Il momento più significativo dell'escursione: la vetta, il panorama, le emozioni, le riflessioni.

## La discesa
Il ritorno: il corpo stanco ma soddisfatto, le ultime visioni del paesaggio, i pensieri.

## Riflessioni finali
Cosa porterò con me di questa giornata. Il valore dell'esperienza. Cosa tornare a esplorare.

Scrivi in prima persona, come se stessi raccontando l'escursione a un amico caro. Evoca i sensi: profumi, suoni, sensazioni fisiche.
${photos.length > 0 ? 'Integra naturalmente i riferimenti alle foto scattate nel racconto.' : ''}

LUNGHEZZA: ${LENGTH_CONFIG[length].instruction}

IMPORTANTE: Completa obbligatoriamente tutte e cinque le sezioni.`
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
        controller.close()

        // Upsert report after stream ends
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
