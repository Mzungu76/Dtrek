import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }    from '@/lib/overpass'

export const maxDuration = 300  // "lunga" can take well over 120s to stream fully; avoid cutting it off mid-guide
import type { WikiPage }   from '@/lib/wikipedia'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { format }          from 'date-fns'
import { it }              from 'date-fns/locale'
import { fetchNatureContext, formatNatureContextBlock, type NatureContext } from '@/lib/aiNatureContext'

export const dynamic = 'force-dynamic'

// ── System prompt — character "Giulia" ────────────────────────────────────────

const SYSTEM = `Sei Giulia, una guida escursionistica italiana con vent'anni di esperienza sul campo.
Conosci a menadito la storia, l'architettura, l'archeologia, la geologia e la natura del territorio italiano.
Il tuo stile è caldo, colloquiale e contagioso: parli come se stessi camminando accanto all'escursionista,
con un tono da amica esperta che non smette mai di stupirsi della bellezza dei luoghi.

Per ogni luogo significativo includi almeno uno tra: un aneddoto storico poco noto, una leggenda locale,
una curiosità sorprendente, un fatto insolito legato al sito. I dettagli che la gente non trova sulle guide
ordinarie sono il tuo punto di forza.

Usa la seconda persona singolare (tu/ti). Scrivi in italiano vivace, mai pedante.
Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio). Non usare asterischi per il grassetto.
Non usare bullet point eccessivi: preferisci frasi di narrazione fluida.
Nella sezione "I luoghi da non perdere", usa ### (tre cancelletti e spazio) come sottotitolo per ogni luogo specifico prima di descriverlo (es: ### Castello di Calcata).
Per le curiosità e aneddoti più memorabili, racchiudili in un riquadro speciale usando il formato esatto su una riga separata: [curiosita] testo della curiosità [/curiosita]

Nella sezione "I luoghi da non perdere", per ogni luogo che compare nell'elenco LUOGHI CON VOCE WIKIPEDIA
(usa il nome ESATTO così come scritto in quell'elenco, non abbreviarlo né parafrasarlo) aggiungi un piccolo
indovinello legato a quel luogo, su una riga separata, in questo formato esatto:
[indovinello poi="Nome esatto del luogo"]Domanda dell'indovinello?|Risposta breve[/indovinello]
Non inventare luoghi che non sono nell'elenco: se un luogo non è nell'elenco LUOGHI CON VOCE WIKIPEDIA, non creare un indovinello per esso.

Solo per i luoghi dell'elenco LUOGHI CON VOCE WIKIPEDIA che hanno davvero una storia stratificata nel tempo
(siti archeologici, resti etruschi o romani, castelli, borghi medievali — NON per un semplice belvedere o
una sorgente), aggiungi una o più righe nel formato esatto:
[epoca poi="Nome esatto del luogo" periodo="etrusca|romana|medievale|oggi"]Descrivi cosa vedresti da quel punto in quell'epoca specifica, in 2-3 frasi vivide[/epoca]
Usa solo i periodi per cui il luogo ha davvero un racconto storico da offrire (anche uno solo va bene, non serve coprire tutte e quattro le epoche per forza). Non creare voci [epoca] per luoghi senza un vero interesse storico-stratigrafico.`

function genderInstruction(gender: string): string {
  switch (gender) {
    case 'maschio':
      return "\n\nL'escursionista a cui ti rivolgi è di genere maschile: quando usi aggettivi o participi riferiti a lui (es. \"pronto\", \"stanco\", \"emozionato\"), usa sempre la forma maschile."
    case 'femmina':
      return "\n\nL'escursionista a cui ti rivolgi è di genere femminile: quando usi aggettivi o participi riferiti a lei (es. \"pronta\", \"stanca\", \"emozionata\"), usa sempre la forma femminile."
    case 'altro':
      return '\n\nEvita di presupporre il genere dell\'escursionista: quando ti rivolgi a lui/lei con aggettivi o participi, preferisci formulazioni neutre (es. "pronto/a a partire" o giri di frase che non richiedono accordo di genere, come "sei pronto per partire" → "non vedi l\'ora di partire").'
    default:
      return '\n\nNon presupporre il genere dell\'escursionista: quando un aggettivo o un participio richiederebbe l\'accordo di genere (es. "pronto/a", "stanco/a"), preferisci formulazioni neutre o giri di frase che lo evitino.'
  }
}

// ── POI helpers ───────────────────────────────────────────────────────────────

function poiDistance(m: number) {
  return m < 1000 ? `${m.toFixed(0)} m dal percorso` : `${(m / 1000).toFixed(1)} km dal percorso`
}

type GuideLength = 'breve' | 'media' | 'lunga'

const LENGTH_CONFIG: Record<GuideLength, { maxTokens: number; instruction: string }> = {
  breve: {
    maxTokens: 1800,
    instruction: 'Scrivi in modo conciso: 2-3 paragrafi brevi per sezione, massimo 150 parole per sezione.',
  },
  media: {
    maxTokens: 6000,
    instruction: 'Scrivi con buon equilibrio di dettagli: 3-4 paragrafi per sezione, circa 300 parole per sezione.',
  },
  lunga: {
    maxTokens: 16000,
    instruction: 'Scrivi con grande ricchezza di dettagli: 5-6 paragrafi per sezione, circa 500-600 parole per sezione, con aneddoti, curiosità e descrizioni vivide.',
  },
}

function buildPrompt(hike: PlannedHike, length: GuideLength = 'media', nature?: NatureContext): string {
  const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const raw  = (hike.cachedPois   ?? []) as PoiItem[]

  const wikiBlock = wiki.length > 0
    ? wiki.map(({ poi, wiki: w }) =>
        `• ${w.title} [${poi.type}${poi.ele ? `, ${poi.ele} m slm` : ''}, ${poiDistance(poi.distFromTrack)}]\n  ${(w.extract ?? '').slice(0, 500)}`
      ).join('\n\n')
    : '(nessun dato Wikipedia disponibile)'

  const rawOnly = raw
    .filter(p => !wiki.some(e => e.poi.id === p.id) && p.name)
    .slice(0, 12)
    .map(p => `• ${p.name} [${p.type}${p.ele ? `, ${p.ele} m` : ''}]`)
    .join('\n')

  const dateStr = hike.plannedDate
    ? format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    : null

  const diffStr = (hike.assessment?.difficulty ?? '')

  const natureBlock = nature ? formatNatureContextBlock(nature) : ''

  return `Crea una guida escursionistica completa e coinvolgente per questo percorso:

NOME: ${hike.title}
${dateStr ? `DATA: ${dateStr}` : ''}
DISTANZA: ${(hike.distanceMeters / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(hike.elevationGain)} m
DISLIVELLO NEGATIVO: ${Math.round(hike.elevationLoss)} m
QUOTA MASSIMA: ${Math.round(hike.altitudeMax)} m slm
QUOTA MINIMA: ${Math.round(hike.altitudeMin)} m slm
DURATA STIMATA: ${formatDuration(hike.estimatedTimeSeconds)}
${diffStr ? `DIFFICOLTÀ: ${diffStr}` : ''}
${hike.assessment?.suitabilityScore ? `ADATTA A: ${hike.assessment.suitabilityScore}% degli escursionisti` : ''}

LUOGHI CON VOCE WIKIPEDIA (usa questi come base per la narrazione storico-culturale):
${wikiBlock}
${rawOnly ? `\nALTRI PUNTI DI INTERESSE OSM:\n${rawOnly}` : ''}
${hike.userNotes ? `\nNOTE DEL PROPRIETARIO DEL PERCORSO:\n${hike.userNotes}` : ''}
${natureBlock ? `\nDATI NATURALISTICI E FENOLOGICI REALI (usa questi dati per la sezione "La natura intorno a te" — non inventare flora/fauna in contraddizione con questi dati):\n${natureBlock}` : ''}

Scrivi la guida strutturata esattamente in queste sei sezioni (usa ## per ogni titolo):

## Prima di partire
Consigli pratici: equipaggiamento, abbigliamento, cosa mettere nello zaino, orario ideale di partenza.
Sii specifica rispetto alla stagione ideale, al tipo di terreno, all'acqua disponibile lungo il percorso.

## Il percorso
Narrazione vivace del tracciato dall'inizio alla fine. Descrivi l'atmosfera, i panorami, i cambi di paesaggio,
i momenti più belli. Dai l'idea di cosa si prova davvero a camminare lì.

## I luoghi da non perdere
Approfondimento sui punti di interesse più significativi. Racconta la loro storia, le leggende,
le curiosità che la maggior parte dei turisti non conosce. Rendi ogni luogo memorabile.

## La natura intorno a te
Flora, fauna e geologia della zona. Cosa potresti incontrare (animali, fiori, rocce particolari).
Aggiungi curiosità naturalistiche legate alla stagione.${natureBlock ? ' Fonda questa sezione sui DATI NATURALISTICI E FENOLOGICI REALI forniti sopra (specie osservate, tipo di bosco, picco di fioritura, copertura d\'ombra): cita le specie con il loro nome comune dove possibile, e usa il periodo dell\'anno indicato per dire cosa si può vedere fiorito o in foglia in questo momento.' : ''}

## Sapori e tradizioni
Gastronomia locale, prodotti tipici del territorio, piatti da assaggiare dopo l'escursione.
Tradizioni e feste locali, artigianato, cultura popolare della zona.

## Consigli finali
Sicurezza, segnaletica, varianti del percorso, cosa fare in caso di maltempo,
contatti utili (soccorso alpino, rifugi, app di navigazione).

La guida deve essere ricca, coinvolgente, piena di vita. Scrivi come se raccontassi in persona, con calore ed entusiasmo genuino.

LUNGHEZZA: ${LENGTH_CONFIG[length].instruction}

IMPORTANTE: Completa obbligatoriamente tutte e sei le sezioni. Non terminare prima dell'ultima sezione "## Consigli finali".`
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response('{"error":"Non autenticato"}', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Resolve API key: user's personal key → else subscription (future) → else 402
  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, user_gender')
    .eq('user_id', user.id)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSub  = (settings?.subscription_tier as string) === 'premium'
  const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null)
  const userGender = (settings?.user_gender as string | null) ?? 'non_specificato'

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per generare guide turistiche.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let hikeId: string
  let length: GuideLength = 'media'
  try {
    const body = await req.json()
    hikeId = body.hikeId
    if (!hikeId) throw new Error('hikeId mancante')
    if (body.length && ['breve', 'media', 'lunga'].includes(body.length)) {
      length = body.length as GuideLength
    }
  } catch {
    return new Response('{"error":"Body non valido"}', {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fetch hike — scoped to the authenticated user
  const { data, error } = await supabase
    .from('planned_hikes')
    .select('*')
    .eq('id', hikeId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return new Response('{"error":"Percorso non trovato"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  const hike: PlannedHike = {
    id:                   data.id,
    title:                data.title,
    plannedDate:          data.planned_date ?? undefined,
    userNotes:            data.user_notes   ?? undefined,
    tags:                 data.tags         ?? undefined,
    createdAt:            data.created_at,
    distanceMeters:       data.distance_meters,
    elevationGain:        data.elevation_gain,
    elevationLoss:        data.elevation_loss,
    altitudeMax:          data.altitude_max,
    altitudeMin:          data.altitude_min,
    estimatedTimeSeconds: data.estimated_time_seconds,
    assessment:           data.assessment           ?? undefined,
    cachedPois:           data.cached_pois          ?? undefined,
    cachedPoiWiki:        data.cached_poi_wiki      ?? undefined,
  }

  const trackPoints: TrackPoint[] = Array.isArray(data.track_points) ? data.track_points : []
  const nature = await fetchNatureContext({
    trackPoints,
    altitudeMax: hike.altitudeMax,
    month: hike.plannedDate ? new Date(hike.plannedDate + 'T12:00').getMonth() + 1 : new Date().getMonth() + 1,
    s2: {
      available:         data.s2_available,
      phenologyPeakMonth: data.s2_phenology_peak_month,
      ndviDelta:          data.s2_ndvi_delta,
      landscapeVariety:   data.s2_landscape_variety,
      shadeScore:         data.s2_shade_score,
      waterSources:       data.s2_water_sources,
    },
  })

  const client = new Anthropic({ apiKey })
  const prompt = buildPrompt(hike, length, nature)
  const { maxTokens } = LENGTH_CONFIG[length]
  const system = SYSTEM + genderInstruction(userGender)

  // Stream Claude response
  const stream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system,
    messages:   [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
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
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
