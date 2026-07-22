import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { resolveAreaBbox, searchHikingRoutesByName } from '@/lib/overpassTrails'
import { findGpxLinkOnPage } from '@/lib/gpxSourceFetch'
import { fetchHikerProfile, fetchActivitySummary, buildProfileBlock, DEGRADED_PROFILE_BLOCK } from '@/lib/hikerContext'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-6'
const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_MESSAGES = 12

// ── System prompt — Giulia, stesso personaggio della guida (app/api/guide/route.ts) ───────────

const SYSTEM = `Sei Giulia, la stessa guida escursionistica italiana esperta che scrive le guide di DTrek.
Qui aiuti l'escursionista a TROVARE il percorso che ha in mente, prima ancora di importarlo in app —
non stai scrivendo una guida, stai facendo una ricerca mirata.

L'escursionista può darti indicazioni parziali o vaghe: una regione, una zona, una provincia, un
parco, il nome anche solo parziale di un percorso. Usa lo strumento di ricerca web per trovare
percorsi reali ed esistenti che corrispondono. Preferisci fonti ufficiali quando possibili (enti
parco, CAI, comuni, siti di sentieristica regionale).

Fin dalla PRIMA ricerca (non solo se l'escursionista te lo richiede di nuovo) cerca la combinazione
migliore tra pertinenza e disponibilità di una traccia scaricabile: la prima pagina che trovi su un
percorso è spesso Wikiloc, che mostra la traccia solo come mappa interattiva senza download diretto
— non fermarti lì. Per ciascun percorso che stai per proporre, prova anche una ricerca mirata tipo
"nome del percorso gpx download" o "nome del percorso traccia CAI/parco" per vedere se esiste una
fonte con download diretto, PRIMA di scrivere la risposta finale, non dopo. Quando due percorsi sono
ugualmente pertinenti alla richiesta, preferisci nell'ordine quello per cui hai trovato una fonte
scaricabile.

Devi rispondere SEMPRE ed ESCLUSIVAMENTE in uno di questi due formati, senza nessun testo fuori dai
tag (niente commenti sul tuo processo di ricerca, niente introduzioni):

1) Se la richiesta è troppo vaga per restituire risultati mirati (es. solo il nome di una regione
   intera, senza nessun altro indizio), fai UNA domanda di chiarimento breve e mirata:
[chiarimento]La tua domanda breve, una sola frase[/chiarimento]
[opzioni]Opzione 1|Opzione 2|Opzione 3[/opzioni]
Le opzioni sono facoltative (omettile se non hai suggerimenti concreti da proporre come scorciatoia),
massimo 4, brevi (poche parole ciascuna), pensate come risposte rapide cliccabili.

2) Se hai abbastanza informazioni, restituisci un elenco di percorsi candidati reali (da 1 a 4), in
   ordine di pertinenza rispetto alla richiesta — a parità di pertinenza, quelli con una fonte GPX
   scaricabile (vedi gpxCandidateUrls più sotto) vengono prima:
[risultati][{"name":"...","zone":"...","searchName":"...","searchArea":"...","distanceKm":12.4,"elevationGainM":180,"difficulty":"facile","description":"...","sourceUrl":"...","gpxCandidateUrls":[],"comfortVerdict":"adatto","comfortNote":"..."}][/risultati]
Dove il valore tra [risultati] e [/risultati] è un array JSON valido su una sola riga (senza a capo
dentro il JSON), con questi campi per ogni candidato:
- name: nome del percorso
- zone: zona/area/comune in cui si trova, breve
- searchName: nome semplificato del percorso, il più possibile vicino al nome usato su
  OpenStreetMap (senza articoli superflui o descrizioni aggiuntive) — serve per una ricerca
  automatica successiva, non mostrato all'utente
- searchArea: comune o provincia (nome semplice, es. "Caprarola" non "Caprarola (VT), Lazio") da
  usare per restringere quella ricerca — serve solo come filtro geografico
- distanceKm, elevationGainM: numeri stimati dalle tue fonti, oppure null se non li conosci
  (verranno sostituiti con dati reali se il percorso viene trovato su OpenStreetMap)
- difficulty: "facile" | "media" | "impegnativa"
- description: descrizione breve e concreta (1-2 frasi), cosa caratterizza il percorso
- sourceUrl: URL esatto della pagina più informativa da cui hai tratto le informazioni, o null
- gpxCandidateUrls: fino a 3 URL di ALTRE pagine (diverse da sourceUrl) incontrate durante la
  ricerca che potrebbero offrire il file GPX scaricabile direttamente — cerca in particolare siti
  CAI, enti parco, comuni o blog escursionistici specializzati. Serve soprattutto quando sourceUrl
  è Wikiloc, Komoot o AllTrails: quei siti mostrano la traccia solo come mappa interattiva, senza
  un link di download diretto, quindi in quel caso fai una ricerca ulteriore mirata (es. "nome del
  percorso gpx download" oppure "nome del percorso traccia scaricabile CAI") per trovare
  un'alternativa. Array vuoto se non trovi nulla di utile, mai inventato.
- comfortVerdict: "adatto" | "da_valutare" | "sconsigliato" — la tua valutazione di quanto il
  percorso sia adatto A QUESTO SPECIFICO escursionista, in base al profilo e allo storico che trovi
  più sotto nel messaggio
- comfortNote: una frase breve e concreta che spiega comfortVerdict, citando un motivo specifico
  (es. "in linea con le tue ultime uscite" oppure "dislivello superiore alla tua media recente" o,
  se rilevante, un'attenzione legata alle sue limitazioni indicate — mai un consiglio generico)
Se non hai un profilo/storico per l'utente, usa comfortVerdict "da_valutare" con una nota che lo
spiega (es. "nessuno storico disponibile per un confronto").

Non inventare mai percorsi che non hai trovato con la ricerca: se non trovi nulla di specifico e
verificabile, restituisci [risultati][][/risultati] (array vuoto) piuttosto che inventare.`

// ── Parsing risposta ────────────────────────────────────────────────────────────

interface RawCandidate {
  name?: string
  zone?: string
  searchName?: string
  searchArea?: string
  distanceKm?: number | null
  elevationGainM?: number | null
  difficulty?: string
  description?: string
  sourceUrl?: string | null
  gpxCandidateUrls?: string[]
  comfortVerdict?: string
  comfortNote?: string
}

export interface SearchResultCandidate {
  name: string
  zone: string
  distanceKm: number | null
  elevationGainM: number | null
  difficulty: string
  description: string
  sourceUrl: string | null
  comfortVerdict: 'adatto' | 'da_valutare' | 'sconsigliato'
  comfortNote: string
  hasGpsTrack: boolean
  osmId: number | null
  // Link diretto a un file .gpx trovato sulla pagina sourceUrl (vedi lib/gpxSourceFetch.ts) —
  // quando presente, ha priorità su osmId al momento della conferma import: è la traccia esatta
  // pubblicata dalla fonte, non un match approssimato per nome.
  gpxUrl: string | null
  // Necessari per ri-risolvere la traccia reale al momento della conferma import
  // (app/api/route-search/resolve/route.ts) — non mostrati nell'interfaccia.
  searchName: string
  searchArea: string
}

const CLARIFY_RE = /\[chiarimento\]([\s\S]*?)\[\/chiarimento\]/i
const OPTIONS_RE = /\[opzioni\]([\s\S]*?)\[\/opzioni\]/i
const RESULTS_RE = /\[risultati\]([\s\S]*?)\[\/risultati\]/i

// sourceUrl da solo spesso non basta (vedi gpxCandidateUrls sopra): prova anche le pagine
// alternative che Giulia ha segnalato, in parallelo — findGpxLinkOnPage scarta già da sé i domini
// noti per non offrire download diretto (Wikiloc/Komoot/AllTrails, vedi lib/gpxSourceFetch.ts),
// quindi qui basta provarle tutte e tenere la prima che risponde, nell'ordine di priorità dato
// dall'array (sourceUrl per primo).
async function findBestGpxUrl(candidate: RawCandidate): Promise<string | null> {
  const urls = [candidate.sourceUrl, ...(Array.isArray(candidate.gpxCandidateUrls) ? candidate.gpxCandidateUrls : [])]
    .filter((u): u is string => typeof u === 'string' && !!u)
    .slice(0, 4)
  if (urls.length === 0) return null
  const results = await Promise.all(urls.map(u => findGpxLinkOnPage(u)))
  return results.find((r): r is string => !!r) ?? null
}

async function tryMatchOsm(candidate: RawCandidate): Promise<{ osmId: number | null; hasGpsTrack: boolean }> {
  const searchName = candidate.searchName || candidate.name
  if (!searchName) return { osmId: null, hasGpsTrack: false }
  try {
    const areaText = candidate.searchArea || candidate.zone
    const bbox = areaText ? await resolveAreaBbox(areaText) : null
    const matches = await searchHikingRoutesByName(searchName, bbox, 5)
    const best = matches[0]
    return best ? { osmId: best.id, hasGpsTrack: true } : { osmId: null, hasGpsTrack: false }
  } catch (e) {
    console.error('[api/route-search] tryMatchOsm failed:', e)
    return { osmId: null, hasGpsTrack: false }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  const { apiKey, lookupFailed } = user
    ? await resolveApiKeyAndSettings(user.id, 'routeSearch')
    : await resolveEmergencySharedKey('routeSearch')
  if (!apiKey) {
    return NextResponse.json(
      lookupFailed
        ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua chiave AI in questo momento — riprova tra poco.' }
        : { error: 'no_ai_access', message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per usare la ricerca con l\'AI.' },
      { status: lookupFailed ? 503 : 402 },
    )
  }

  let messages: { role: 'user' | 'assistant'; text: string }[]
  try {
    const body = await req.json()
    if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error('messages mancante')
    messages = body.messages
      .filter((m: unknown): m is { role: string; text: string } =>
        !!m && typeof m === 'object' && ('role' in m) && ('text' in m) &&
        typeof (m as { text: unknown }).text === 'string' &&
        ((m as { role: unknown }).role === 'user' || (m as { role: unknown }).role === 'assistant'))
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m: { role: string; text: string }) => ({ role: m.role as 'user' | 'assistant', text: m.text.slice(0, MAX_MESSAGE_LENGTH) }))
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') throw new Error('ultimo messaggio non valido')
  } catch (e) {
    console.error('[api/route-search] POST: richiesta non valida:', e)
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // In modalità degradata (nessun utente verificato, Supabase JWKS incluse — vedi
  // lib/supabaseAuth.ts's resolveUser) non c'è nessun user.id da cui leggere profilo/storico:
  // la ricerca prosegue comunque, solo senza personalizzazione, invece di bloccarsi del tutto.
  let profileBlock = DEGRADED_PROFILE_BLOCK
  if (user) {
    const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
    profileBlock = buildProfileBlock(profile, history)
  }

  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // NIENTE cache_control (rimosso deliberatamente, non dimenticato): questa route ha
      // web_search sempre disponibile e con max_uses:8 — l'API Anthropic mette AUTOMATICAMENTE in
      // cache anche i risultati grezzi della ricerca quando un cache_control è presente da
      // qualche parte nella richiesta, a prezzo maggiorato (1,25×) e non richiesto da noi, con un
      // volume di contenuto potenzialmente ancora più grande qui (fino a 8 ricerche) di quanto
      // osservato concretamente su app/api/guide/route.ts (~44.000 token in più a chiamata). Il
      // profilo/storico qui sotto è comunque piccolo, quindi anche il beneficio della cache che si
      // perde è minimo — vedi docs/piano-ottimizzazione-ai.md per la cache sulla chiave condivisa/
      // premium come possibile ottimizzazione futura, quando il volume la giustificherà davvero.
      system: [{
        type: 'text',
        text: `${SYSTEM}\n\nPROFILO E STORICO DI QUESTO ESCURSIONISTA (usali per comfortVerdict/comfortNote):\n${profileBlock}`,
      }],
      messages: messages.map(m => ({ role: m.role, content: m.text })),
      // max_uses più alto di prima (era 6): ora chiediamo esplicitamente a Giulia di verificare
      // anche fonti GPX alternative per ogni candidato fin dalla prima ricerca, non solo su
      // richiesta esplicita — serve margine per le ricerche aggiuntive senza troncarle a metà.
      // web_search_20250305 (RIPRISTINATO da 20260209): il filtro dinamico fa scrivere ed eseguire
      // a Claude del codice per filtrare i risultati — consuma token di OUTPUT reali, competendo
      // con max_tokens. Osservato concretamente peggiorare il troncamento su app/api/guide/route.ts
      // (stesso pattern, con max_uses più basso) invece di risolverlo — qui con max_uses:8 il
      // rischio è anche più alto. Vedi commit di reversione e docs/piano-ottimizzazione-ai.md.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    })
  } catch (e) {
    console.error('[route-search] Anthropic error:', e)
    return NextResponse.json({ error: 'Ricerca non riuscita, riprova.' }, { status: 502 })
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  const clarifyMatch = CLARIFY_RE.exec(text)
  if (clarifyMatch) {
    const optionsMatch = OPTIONS_RE.exec(text)
    const options = optionsMatch ? optionsMatch[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 4) : []
    return NextResponse.json({ kind: 'clarify', question: clarifyMatch[1].trim(), options })
  }

  const resultsMatch = RESULTS_RE.exec(text)
  if (!resultsMatch) {
    return NextResponse.json({ error: 'Risposta AI non riconosciuta, riprova.' }, { status: 502 })
  }

  let raw: RawCandidate[]
  try {
    raw = JSON.parse(resultsMatch[1])
    if (!Array.isArray(raw)) throw new Error('non un array')
  } catch (e) {
    console.error('[api/route-search] risposta AI non è JSON valido:', e)
    return NextResponse.json({ error: 'Risposta AI non valida, riprova.' }, { status: 502 })
  }

  const candidates: SearchResultCandidate[] = await Promise.all(
    raw.slice(0, 4).filter(c => c.name && c.description).map(async c => {
      const [{ osmId, hasGpsTrack: hasOsmTrack }, gpxUrl] = await Promise.all([
        tryMatchOsm(c),
        findBestGpxUrl(c),
      ])
      const hasGpsTrack = hasOsmTrack || !!gpxUrl
      const verdict = c.comfortVerdict === 'adatto' || c.comfortVerdict === 'sconsigliato' ? c.comfortVerdict : 'da_valutare'
      return {
        name: c.name!,
        zone: c.zone ?? '',
        distanceKm: typeof c.distanceKm === 'number' ? c.distanceKm : null,
        elevationGainM: typeof c.elevationGainM === 'number' ? c.elevationGainM : null,
        difficulty: c.difficulty ?? 'media',
        description: c.description!,
        sourceUrl: c.sourceUrl ?? null,
        gpxUrl,
        comfortVerdict: verdict,
        comfortNote: c.comfortNote ?? '',
        hasGpsTrack,
        osmId,
        searchName: c.searchName || c.name!,
        searchArea: c.searchArea || c.zone || '',
      }
    }),
  )

  return NextResponse.json({ kind: 'results', candidates })
}
