import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { formatDuration }    from '@/lib/tcxParser'
import { format }            from 'date-fns'
import { it }                from 'date-fns/locale'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { tryAcquireCooldown } from '@/lib/aiCooldown'

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
  // `degraded` intentionally not gated on here (unlike app/api/guide/route.ts,
  // app/api/route-search/route.ts): this route reads a user-owned activity by id, which needs a
  // real verified user.id, not just "some session might exist" — no client-fallback data path
  // exists yet for that, so this stays a hard 401/503 even when degraded.
  const { user, authUnavailable } = await getUserFromRequestDetailed(req)
  if (!user) {
    return new Response(
      JSON.stringify(
        authUnavailable
          ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento (Supabase non raggiungibile) — riprova tra poco.' }
          : { error: 'Non autenticato' },
      ),
      { status: authUnavailable ? 503 : 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { apiKey, claudeModel, lookupFailed } = await resolveApiKeyAndSettings(user.id)

  if (!apiKey) {
    return new Response(
      JSON.stringify(
        lookupFailed
          ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua chiave AI in questo momento (Supabase non raggiungibile) — riprova tra poco.' }
          : { error: 'no_ai_access', message: 'Aggiungi la tua chiave API Claude nelle impostazioni per usare l\'assistente AI.' },
      ),
      { status: lookupFailed ? 503 : 402, headers: { 'Content-Type': 'application/json' } },
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
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Rete di sicurezza economica contro click ripetuti in sequenza sullo stesso suggerimento AI —
  // vedi lib/aiCooldown.ts. Per attività+sezione, non per l'intera attività: sezioni diverse dello
  // stesso resoconto restano modificabili in parallelo senza bloccarsi a vicenda.
  if (!(await tryAcquireCooldown('resoconto-assist', `${activityId}:${sectionTitle}`))) {
    return new Response(
      JSON.stringify({
        error:   'cooldown',
        message: 'Hai appena chiesto una modifica a questa sezione — aspetta qualche secondo prima di richiederne un\'altra.',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .eq('user_id', user.id)
    .single()

  if (actErr || !activity) {
    return new Response(JSON.stringify({ error: 'Attività non trovata' }), {
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
    model:      claudeModel,
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
