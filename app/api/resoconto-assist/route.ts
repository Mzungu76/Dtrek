import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { formatDuration }    from '@/lib/tcxParser'
import { format }            from 'date-fns'
import { it }                from 'date-fns/locale'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const PRESET_INSTRUCTIONS: Record<string, string> = {
  __correggi:    'Correggi grammatica, punteggiatura e fluidità del testo mantenendo il significato e lo stile dell\'autore invariati.',
  __espandi:     'Espandi il testo con più dettagli descrittivi e contestuali, mantenendo il tono già presente.',
  __sintetizza:  'Riduci il testo alla metà mantenendo i concetti essenziali e il tono dell\'autore.',
  __personale:   'Riscrivi il testo in prima persona singolare, come se fosse l\'escursionista a raccontare direttamente.',
}

const SYSTEM = `Sei un editor letterario collaborativo specializzato in reportage escursionistici.
Non scrivi un testo ex-novo: lavori su un testo già esistente scritto dall'autore, applicando con precisione l'istruzione richiesta.
Mantieni la voce e lo stile dell'autore a meno che l'istruzione non chieda esplicitamente di cambiarli.
Restituisci SOLO il nuovo testo del corpo della sezione: nessun titolo, nessuna intestazione, nessun commento, nessuna nota tra parentesi su cosa hai fatto.
Non usare asterischi per il grassetto. Non usare bullet point: narrazione fluida.`

interface OtherSection {
  title: string
  preview: string
}

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
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni per usare l\'assistente AI.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let activityId: string, sectionTitle: string, currentText: string, instruction: string
  let otherSections: OtherSection[] = []
  try {
    const body = await req.json()
    activityId   = body.activityId
    sectionTitle = body.sectionTitle
    currentText  = body.currentText ?? ''
    instruction  = body.instruction
    if (Array.isArray(body.otherSections)) otherSections = body.otherSections
    if (!activityId || !sectionTitle || !instruction) throw new Error()
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

  const resolvedInstruction = PRESET_INSTRUCTIONS[instruction] ?? instruction

  const dateStr = activity.start_time
    ? format(new Date(activity.start_time as string), "EEEE d MMMM yyyy", { locale: it })
    : null

  const otherSectionsBlock = otherSections.length > 0
    ? `\nALTRE SEZIONI DEL REPORTAGE (solo per coerenza stilistica, non riscriverle):\n${
        otherSections.map(s => `## ${s.title}\n${s.preview}`).join('\n\n')
      }\n`
    : ''

  const prompt = `Contesto dell'escursione:
TITOLO: ${activity.title ?? 'Escursione'}
${dateStr ? `DATA: ${dateStr}` : ''}
DISTANZA: ${((activity.distance_meters as number) / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(activity.elevation_gain as number)} m
DURATA EFFETTIVA: ${formatDuration(activity.total_time_seconds as number)}
${otherSectionsBlock}
SEZIONE DA MODIFICARE: "${sectionTitle}"

TESTO ATTUALE DELLA SEZIONE:
${currentText || '(sezione vuota)'}

ISTRUZIONE: ${resolvedInstruction}

Restituisci solo il nuovo testo del corpo della sezione "${sectionTitle}", senza titolo.`

  const client = new Anthropic({ apiKey })

  const aiStream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(event.delta.text))
          }
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':      'text/plain; charset=utf-8',
      'Cache-Control':     'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
