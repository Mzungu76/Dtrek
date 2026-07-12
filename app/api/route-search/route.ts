import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { readIndex } from '@/lib/blobIndex'
import type { ActivityMeta } from '@/lib/blobStore'
import { resolveAreaBbox, searchHikingRoutesByName } from '@/lib/overpassTrails'
import { concernLabel, environmentPrefLabel } from '@/lib/hikerProfile'

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

Devi rispondere SEMPRE ed ESCLUSIVAMENTE in uno di questi due formati, senza nessun testo fuori dai
tag (niente commenti sul tuo processo di ricerca, niente introduzioni):

1) Se la richiesta è troppo vaga per restituire risultati mirati (es. solo il nome di una regione
   intera, senza nessun altro indizio), fai UNA domanda di chiarimento breve e mirata:
[chiarimento]La tua domanda breve, una sola frase[/chiarimento]
[opzioni]Opzione 1|Opzione 2|Opzione 3[/opzioni]
Le opzioni sono facoltative (omettile se non hai suggerimenti concreti da proporre come scorciatoia),
massimo 4, brevi (poche parole ciascuna), pensate come risposte rapide cliccabili.

2) Se hai abbastanza informazioni, restituisci un elenco di percorsi candidati reali (da 1 a 4), in
   ordine di pertinenza rispetto alla richiesta:
[risultati][{"name":"...","zone":"...","searchName":"...","searchArea":"...","distanceKm":12.4,"elevationGainM":180,"difficulty":"facile","description":"...","sourceUrl":"...","comfortVerdict":"adatto","comfortNote":"..."}][/risultati]
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
- sourceUrl: URL esatto della pagina da cui hai tratto le informazioni, o null
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

// ── Profilo utente + storico attività (stesso pattern di app/api/planned/route.ts) ────────────

interface HikerProfileBlock {
  experienceLevel: string | null
  concerns: string[]
  environmentPrefs: string[]
}

async function fetchHikerProfile(userId: string): Promise<HikerProfileBlock> {
  const { data } = await supabase
    .from('user_settings')
    .select('hiker_experience_level, hiker_concerns, hiker_environment_prefs')
    .eq('user_id', userId)
    .maybeSingle()
  return {
    experienceLevel: (data?.hiker_experience_level as string | null) ?? null,
    concerns: (data?.hiker_concerns as string[] | null) ?? [],
    environmentPrefs: (data?.hiker_environment_prefs as string[] | null) ?? [],
  }
}

async function fetchActivitySummary(userId: string): Promise<{ count: number; avgDistanceKm: number; avgElevationM: number; maxDistanceKm: number; maxElevationM: number }> {
  let activities: ActivityMeta[] = []
  try { activities = await readIndex() } catch {}
  if (!activities.length) {
    const { data } = await supabase
      .from('activities')
      .select('distance_meters, elevation_gain')
      .eq('user_id', userId)
    if (data) {
      activities = data.map((r: Record<string, unknown>) => ({
        id: '', title: '', startTime: '', totalTimeSeconds: 0, calories: 0,
        avgHeartRate: 0, maxHeartRate: 0, avgSpeedMs: 0, maxSpeedMs: 0, altitudeMax: 0,
        distanceMeters: r.distance_meters as number,
        elevationGain: r.elevation_gain as number,
        elevationLoss: 0,
      }))
    }
  }
  const n = activities.length
  if (n === 0) return { count: 0, avgDistanceKm: 0, avgElevationM: 0, maxDistanceKm: 0, maxElevationM: 0 }
  const avgDistanceKm = activities.reduce((s, a) => s + a.distanceMeters / 1000, 0) / n
  const avgElevationM = activities.reduce((s, a) => s + a.elevationGain, 0) / n
  const maxDistanceKm = Math.max(...activities.map(a => a.distanceMeters / 1000))
  const maxElevationM = Math.max(...activities.map(a => a.elevationGain))
  return { count: n, avgDistanceKm, avgElevationM, maxDistanceKm, maxElevationM }
}

function buildProfileBlock(profile: HikerProfileBlock, history: Awaited<ReturnType<typeof fetchActivitySummary>>): string {
  const lines: string[] = []
  lines.push(`Livello di esperienza dichiarato: ${profile.experienceLevel ?? 'non indicato'}`)
  lines.push(profile.concerns.length ? `Attenzioni indicate dall'utente: ${profile.concerns.map(concernLabel).join('; ')}` : `Nessuna attenzione particolare indicata`)
  lines.push(profile.environmentPrefs.length ? `Preferenze ambientali: ${profile.environmentPrefs.map(environmentPrefLabel).join('; ')}` : `Nessuna preferenza ambientale indicata`)
  lines.push(history.count > 0
    ? `Storico: ${history.count} escursioni registrate, distanza media ${history.avgDistanceKm.toFixed(1)} km (record ${history.maxDistanceKm.toFixed(1)} km), dislivello medio ${Math.round(history.avgElevationM)} m (record ${Math.round(history.maxElevationM)} m)`
    : `Nessuno storico di escursioni registrate`)
  return lines.join('\n')
}

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
  // Necessari per ri-risolvere la traccia reale al momento della conferma import
  // (app/api/route-search/resolve/route.ts) — non mostrati nell'interfaccia.
  searchName: string
  searchArea: string
}

const CLARIFY_RE = /\[chiarimento\]([\s\S]*?)\[\/chiarimento\]/i
const OPTIONS_RE = /\[opzioni\]([\s\S]*?)\[\/opzioni\]/i
const RESULTS_RE = /\[risultati\]([\s\S]*?)\[\/risultati\]/i

async function tryMatchOsm(candidate: RawCandidate): Promise<{ osmId: number | null; hasGpsTrack: boolean }> {
  const searchName = candidate.searchName || candidate.name
  if (!searchName) return { osmId: null, hasGpsTrack: false }
  try {
    const areaText = candidate.searchArea || candidate.zone
    const bbox = areaText ? await resolveAreaBbox(areaText) : null
    const matches = await searchHikingRoutesByName(searchName, bbox, 5)
    const best = matches[0]
    return best ? { osmId: best.id, hasGpsTrack: true } : { osmId: null, hasGpsTrack: false }
  } catch {
    return { osmId: null, hasGpsTrack: false }
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { user, authUnavailable } = await getUserFromRequestDetailed(req)
  if (!user) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  const { apiKey, lookupFailed } = await resolveApiKeyAndSettings(user.id)
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
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
  const profileBlock = buildProfileBlock(profile, history)

  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: `${SYSTEM}\n\nPROFILO E STORICO DI QUESTO ESCURSIONISTA (usali per comfortVerdict/comfortNote):\n${profileBlock}`,
      messages: messages.map(m => ({ role: m.role, content: m.text })),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
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
  } catch {
    return NextResponse.json({ error: 'Risposta AI non valida, riprova.' }, { status: 502 })
  }

  const candidates: SearchResultCandidate[] = await Promise.all(
    raw.slice(0, 4).filter(c => c.name && c.description).map(async c => {
      const { osmId, hasGpsTrack } = await tryMatchOsm(c)
      const verdict = c.comfortVerdict === 'adatto' || c.comfortVerdict === 'sconsigliato' ? c.comfortVerdict : 'da_valutare'
      return {
        name: c.name!,
        zone: c.zone ?? '',
        distanceKm: typeof c.distanceKm === 'number' ? c.distanceKm : null,
        elevationGainM: typeof c.elevationGainM === 'number' ? c.elevationGainM : null,
        difficulty: c.difficulty ?? 'media',
        description: c.description!,
        sourceUrl: c.sourceUrl ?? null,
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
