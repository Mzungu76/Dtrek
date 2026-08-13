import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveDefaultModel, isValidClaudeModelId } from '@/lib/claudeModels'
import { jsonSchemaFormat } from '@/lib/aiJsonOutput'
import { resolveDtrekEntitlement } from '@/lib/dtrekEntitlement'

export const dynamic = 'force-dynamic'

// Il prompt precedente chiedeva "hook potente", "massimizza engagement", "evocativo", "seconda
// persona singolare", "call-to-action": esattamente la ricetta che produce il testo che chiunque
// riconosce come scritto da una macchina — la frase a effetto staccata in cima, la domanda finta
// in fondo, gli aggettivi che non descrivono niente. Qui si chiede l'opposto: la voce di chi è
// tornato dal sentiero e scrive due righe sotto la propria foto.
const SYSTEM_RICORDO = `Scrivi la didascalia che metterebbe sotto al proprio video una persona che ha appena fatto questa escursione. Parla in prima persona, di quello che ha fatto lei.

Come deve suonare:
- Concreta: il posto, cosa si vede, come è andata. Un dettaglio vero vale più di tre aggettivi.
- Asciutta: 2-4 frasi in tutto, 30-60 parole. Chi scrive davvero è breve.
- Prima persona singolare ("sono salito", "ci ho messo"), mai rivolta al lettore ("scopri", "immagina", "sali con me").
- I numeri del percorso entrano solo se aggiungono qualcosa, detti come li direbbe una persona ("nove chilometri e mezzo", "quasi mille di dislivello"), non come una scheda tecnica.

Cosa NON fare, mai:
- Nessuna frase a effetto isolata in apertura.
- Nessuna domanda finale al lettore, nessun invito, nessuna morale ("a volte basta poco…", "la montagna insegna…").
- Niente parole da brochure: mozzafiato, incredibile, magico, indimenticabile, avventura, esperienza unica, panorama da cartolina.
- Niente trattini lunghi, niente frasi a tre membri ("non solo X, ma Y, e soprattutto Z"), niente maiuscole enfatiche.
- Al massimo una emoji, e solo se cade naturale. Anche zero va benissimo — di norma è la scelta giusta.

Per gli hashtag:
- Da 8 a 12, non di più: un muro di hashtag si riconosce a colpo d'occhio come gonfiato.
- Prima quelli del posto vero (zona, monte, parco, sentiero), poi due o tre generici di escursionismo.
- In italiano, salvo un paio in inglese se il posto è noto anche fuori.
- Niente hashtag di ingaggio (#reelsitalia, #videooftheday, #followme) e niente hashtag inventati lunghi come una frase.`

// Stessa voce sobria del prompt "ricordo" sopra, ma spersonalizzata: chi legge questa non ha
// camminato, sta valutando se andarci. Niente "io", niente vissuto — solo il percorso descritto
// da chi lo conosce, come farebbe una guida.
const SYSTEM_PERCORSO = `Scrivi la didascalia che accompagna un video di presentazione di questo percorso escursionistico, come la scriverebbe chi cura una guida di sentieri. Descrivi il percorso, non l'esperienza di chi l'ha camminato.

Come deve suonare:
- Concreta: dove si trova, cosa si incontra, cosa lo caratterizza. Un dettaglio vero vale più di tre aggettivi.
- Asciutta: 2-4 frasi in tutto, 30-60 parole. Una scheda, non un racconto.
- Impersonale: terza persona o forma neutra ("il sentiero sale…", "si cammina tra…"), mai in prima persona ("sono salito"), mai rivolta al lettore ("scopri", "immagina", "vieni con me").
- I numeri del percorso (distanza, dislivello, difficoltà) entrano naturalmente, come li darebbe una scheda tecnica ma scritta bene, non come un elenco puntato.

Cosa NON fare, mai:
- Nessuna frase a effetto isolata in apertura.
- Nessuna domanda finale al lettore, nessun invito, nessuna morale.
- Niente parole da brochure: mozzafiato, incredibile, magico, indimenticabile, avventura, esperienza unica, panorama da cartolina.
- Niente trattini lunghi, niente frasi a tre membri ("non solo X, ma Y, e soprattutto Z"), niente maiuscole enfatiche.
- Nessuna emoji: è una scheda informativa, non un post personale.

Per gli hashtag:
- Da 8 a 12, non di più: un muro di hashtag si riconosce a colpo d'occhio come gonfiato.
- Prima quelli del posto vero (zona, monte, parco, sentiero), poi due o tre generici di escursionismo.
- In italiano, salvo un paio in inglese se il posto è noto anche fuori.
- Niente hashtag di ingaggio (#reelsitalia, #videooftheday, #followme) e niente hashtag inventati lunghi come una frase.`

interface CaptionOutput {
  caption: string
  hashtags: string
}

const CAPTION_SCHEMA = {
  type: 'object',
  properties: {
    caption:  { type: 'string' },
    hashtags: { type: 'string' },
  },
  required: ['caption', 'hashtags'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Gate/trial (docs/navigator-dtrek-boundary.md) — la chiave condivisa va a chi è sbloccato
  // (owner/premium/BYOK) o ancora nel periodo di prova attivo.
  const entitlement = await resolveDtrekEntitlement(user.id)

  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, claude_model')
    .eq('user_id', user.id)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSharedAccess = entitlement.unlocked || entitlement.trialActive
  const apiKey  = userKey ?? (hasSharedAccess ? process.env.ANTHROPIC_API_KEY : null)
  const claudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : resolveDefaultModel('caption')

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: entitlement.trialExpired
          ? 'Il periodo di prova gratuito è terminato — sblocca Dtrek per continuare a generare caption Instagram.'
          : 'Al momento non hai accesso alla generazione AI — sblocca Dtrek nelle impostazioni del profilo.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // videoFormat non entra più nel prompt: il formato del file non cambia cosa una persona scrive
  // sotto la propria foto, e chiederlo al modello serviva solo a fargli dire "Reel".
  let title: string, distanceKm: number, elevationGain: number, maxAlt: number,
      date: string | undefined, style: 'ricordo' | 'percorso'

  try {
    const body = await req.json()
    title        = body.title        ?? 'Escursione'
    distanceKm   = Number(body.distanceKm)   || 0
    elevationGain= Number(body.elevationGain) || 0
    maxAlt       = Number(body.maxAlt)        || 0
    date         = body.date
    style        = body.style === 'percorso' ? 'percorso' : 'ricordo'
  } catch {
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const difficulty = elevationGain > 1200 ? 'impegnativa' : elevationGain > 600 ? 'media difficoltà' : 'accessibile'

  const userPrompt = `Escursione da raccontare:

Percorso: ${title}
Distanza: ${distanceKm.toFixed(1)} km
Dislivello positivo: ${elevationGain} m
Quota massima: ${maxAlt > 0 ? `${maxAlt} m slm` : 'non disponibile'}
Impegno: ${difficulty}${date ? `\nData: ${date}` : ''}

Il nome del percorso dice dove siamo: usalo per ancorare gli hashtag al posto vero. Non serve
citare tutti i numeri — prendine al massimo uno o due, quelli che dicono davvero com'è andata.`

  const client = new Anthropic({ apiKey })

  // Un secondo tentativo automatico solo se il primo lancia un'eccezione — non se restituisce
  // semplicemente parsed_output vuoto, caso già gestito più sotto col fallback sul testo grezzo.
  // L'SDK Anthropic rilancia un errore tipo "Failed to parse structured output: SyntaxError:
  // Unexpected end of JSON input" quando il testo non è JSON valido (risposta troncata o vuota) —
  // quasi sempre transitorio, non un dettaglio da mostrare all'utente così com'è.
  let msg: Awaited<ReturnType<typeof client.messages.parse>> | undefined
  for (let attempt = 1; attempt <= 2 && !msg; attempt++) {
    try {
      msg = await client.messages.parse({
        model:         claudeModel,
        max_tokens:    700,
        system:        style === 'percorso' ? SYSTEM_PERCORSO : SYSTEM_RICORDO,
        messages:      [{ role: 'user', content: userPrompt }],
        output_config: { format: jsonSchemaFormat<CaptionOutput>(CAPTION_SCHEMA) },
      })
    } catch (e) {
      console.error(`[caption] tentativo ${attempt} fallito:`, e)
    }
  }
  if (!msg) {
    return new Response(
      JSON.stringify({ error: 'ai_error', message: 'La caption non è arrivata completa — riprova.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (msg.parsed_output) {
    return new Response(JSON.stringify(msg.parsed_output), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  // Fallback raro (refusal/troncamento): nessun output strutturato, ma il testo grezzo può
  // comunque contenere una caption leggibile da mostrare — meglio di un errore secco.
  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
  return new Response(JSON.stringify({ caption: raw, hashtags: '' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
