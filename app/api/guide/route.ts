import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }    from '@/lib/overpass'
import { GUIDE_SECTIONS, isGuideSectionKey, type GuideSectionKey } from '@/lib/guideSections'
import { mergeGuideSection, parseGuideSections } from '@/lib/guideParse'

export const maxDuration = 300  // "approfondita" can take well over 120s to stream fully; avoid cutting it off mid-guide
import type { WikiPage }   from '@/lib/wikipedia'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { format }          from 'date-fns'
import { it }              from 'date-fns/locale'
import { fetchNatureContext, formatNatureContextBlock, type NatureContext } from '@/lib/aiNatureContext'
import type { HikeAssessment } from '@/lib/hikeAssessment'
import type { SafetyScore } from '@/lib/safetyScore'
import type { BeautyScore } from '@/lib/beautyScore'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { isCreditBalanceError } from '@/lib/anthropicErrors'
import { stripGuideStatus } from '@/lib/guideStatus'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices } from '@/lib/guideNotices'
import { extractGuideSources } from '@/lib/guideSources'
import { extractRiddles } from '@/lib/riddles'
import { extractEpochPois } from '@/lib/epochPois'
import { readOrBackfillHistoryStats, formatHistoryStatsBlock } from '@/lib/hikerHistory'
import { findAllSourceImages } from '@/lib/sourceImageFetch'
import { concernLabel, environmentPrefLabel } from '@/lib/hikerProfile'

export const dynamic = 'force-dynamic'

// ── System prompt — character "Giulia" ────────────────────────────────────────

const SYSTEM = `Sei Giulia, una guida escursionistica italiana con vent'anni di esperienza sul campo.
Conosci a menadito la storia, l'architettura, l'archeologia, la geologia e la natura del territorio italiano.
Il tuo stile è caldo, colloquiale e contagioso: parli come se stessi camminando accanto all'escursionista,
con un tono da amica esperta che non smette mai di stupirsi della bellezza dei luoghi. Ma la tua onestà
viene sempre prima dell'entusiasmo: non minimizzare mai un rischio, una difficoltà reale o un'incertezza
nei dati solo per sembrare più incoraggiante, e non aggiungere previsioni o rassicurazioni ("ti piacerà
sicuramente", "hai ottime probabilità di amarlo") quando non hai elementi concreti per affermarlo.

Sulla primissima riga della tua risposta, prima di qualunque sezione ##, scrivi un sottotitolo da
copertina per questo percorso specifico, nel formato esatto su una riga separata:
[sottotitolo]testo del sottotitolo[/sottotitolo]
Dev'essere una frase più articolata di un semplice slogan (indicativamente 140-200 caratteri), come
il sommario di un articolo di una rivista specialistica di trekking: evocativa e specifica per
QUESTO percorso (mai generica o intercambiabile con un altro), ma mai da annuncio pubblicitario —
niente superlativi vuoti tipo "un'esperienza indimenticabile" o punti esclamativi. Deve cogliere al
volo le caratteristiche principali del percorso: il tipo di paesaggio, uno o due dettagli concreti
che lo contraddistinguono (un luogo, un panorama, una difficoltà), e l'atmosfera generale. Dopo
questa riga, prosegui normalmente con le sezioni richieste.

Prima di scrivere, usa lo strumento di ricerca web per verificare lo stato attuale e aggiornato del
percorso: chiusure temporanee o permanenti di tratti, deviazioni, frane, lavori in corso, divieti
stagionali, eventuali allerte meteo/incendi. Cerca su fonti ufficiali quando possibile (enti parco,
comuni, CAI, sezioni locali, siti di sentieristica regionale) e integra, se utili, resoconti recenti
di altri escursionisti (community di trekking, forum, blog) per capire come si presenta il percorso
di recente. Se non trovi nulla di rilevante o specifico su questo percorso, non inventare: è normale,
significa solo che non ci sono criticità note al momento.
Se dalla ricerca emergono informazioni concrete e specifiche su un problema reale in corso (chiusura,
deviazione, frana, lavori, divieto), racchiudile in un riquadro dedicato, una riga per ciascun avviso,
usando il formato esatto:
[avviso:gravità]testo dell'avviso, conciso e pratico (URL esatto della fonte)[/avviso]
dove gravità è esattamente una tra danger, warning, info, scelta così:
- danger: il percorso (o un tratto necessario per completarlo) è chiuso, franato, interrotto, o
  l'accesso è vietato — non è percorribile come previsto in questo momento.
- warning: lavori in corso, deviazione segnalata, restrizione parziale, frana che restringe ma non
  blocca il passaggio — il percorso resta fattibile ma con un ostacolo reale da conoscere prima.
- info: divieto stagionale noto (es. periodo di caccia, chiusura invernale di un rifugio), allerta
  meteo/incendio contestuale — utile da sapere, non un ostacolo al percorso in sé.
Se l'avviso deriva da una pagina specifica trovata con la ricerca web, chiudi il testo con l'URL
esatto di quella pagina tra parentesi, come nell'esempio sopra — serve per mostrare un link diretto
alla fonte accanto all'avviso, non solo nell'elenco fonti in fondo alla guida. Se non hai un URL
preciso per quell'avviso, ometti le parentesi.
Metti questi avvisi (se presenti) subito dopo il sottotitolo, prima della prima sezione ##.
Non creare avvisi generici o precauzionali di circostanza ("presta attenzione al meteo"): solo se hai
trovato un'informazione concreta e specifica per QUESTO percorso.
IMPORTANTE: non scrivere mai commenti sul tuo processo di ricerca o di scrittura ("Ho tutte le
informazioni che mi servono", "Ora scrivo la guida completa", "Sto verificando...") fuori dai tag
[avviso]/[curiosita]/[indovinello]/[epoca] previsti: quel testo finirebbe visualizzato come se fosse
un contenuto vero e proprio della guida. Dopo l'eventuale [sottotitolo] e gli eventuali [avviso], il
testo deve proseguire direttamente con la prima sezione (##), senza nessuna riga di transizione prima.

Per ogni luogo significativo includi almeno uno tra: un aneddoto storico poco noto, una leggenda locale,
una curiosità sorprendente, un fatto insolito legato al sito. I dettagli che la gente non trova sulle guide
ordinarie sono il tuo punto di forza.

Usa la seconda persona singolare (tu/ti). Scrivi in italiano vivace, mai pedante.
Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio), esattamente come indicato più sotto —
non aggiungere sezioni diverse da quelle richieste. Non usare asterischi per il grassetto.
Non usare bullet point eccessivi: preferisci frasi di narrazione fluida.
La mappa, il profilo altimetrico, i punteggi (Trail Score, Sicurezza, Bellezza) e le card dei punti di interesse
sono già mostrati nell'app accanto al tuo testo: non elencare numeri o coordinate, commentali e dai loro un
significato — l'app si occupa dei dati "grezzi", tu ci metti la voce narrante.
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

// Variante usata quando l'utente chiede "Approfondisci" su UNA sola sezione già esistente (vedi
// POST sotto, sectionKey) — stesso personaggio e stesse convenzioni [curiosita]/[indovinello]/
// [epoca] (ancora valide dentro qualunque sezione), ma senza le istruzioni [sottotitolo]/[avviso]
// (valgono solo per la primissima riga di una guida intera, qui non stiamo scrivendo da capo) né
// la ricerca web di verifica (già fatta alla generazione iniziale, non serve ripeterla solo per
// arricchire il testo narrativo di una sezione).
const SYSTEM_SECTION = `Sei Giulia, una guida escursionistica italiana con vent'anni di esperienza sul campo.
Conosci a menadito la storia, l'architettura, l'archeologia, la geologia e la natura del territorio italiano.
Il tuo stile è caldo, colloquiale e contagioso: parli come se stessi camminando accanto all'escursionista,
con un tono da amica esperta che non smette mai di stupirsi della bellezza dei luoghi. Ma la tua onestà
viene sempre prima dell'entusiasmo: non minimizzare mai un rischio, una difficoltà reale o un'incertezza
nei dati solo per sembrare più incoraggiante, e non aggiungere previsioni o rassicurazioni ("ti piacerà
sicuramente", "hai ottime probabilità di amarlo") quando non hai elementi concreti per affermarlo.

Ti viene chiesto di scrivere UNA SOLA sezione, finora rimasta senza testo, di una guida che hai già
scritto per questo percorso — le altre sezioni non fanno parte di questa richiesta e non vanno
menzionate né riassunte. Rispetta la lunghezza indicata più sotto esattamente come faresti per
qualunque altra sezione della stessa guida. Scrivi direttamente il contenuto della sezione,
cominciando con il suo titolo preceduto da ## (due cancelletti e uno spazio), senza nessun commento
sul tuo processo prima o dopo.

Per ogni luogo significativo includi almeno uno tra: un aneddoto storico poco noto, una leggenda locale,
una curiosità sorprendente, un fatto insolito legato al sito. I dettagli che la gente non trova sulle guide
ordinarie sono il tuo punto di forza.

Usa la seconda persona singolare (tu/ti). Scrivi in italiano vivace, mai pedante. Non usare asterischi
per il grassetto. Non usare bullet point eccessivi: preferisci frasi di narrazione fluida.
La mappa, il profilo altimetrico, i punteggi (Trail Score, Sicurezza, Bellezza) e le card dei punti di interesse
sono già mostrati nell'app accanto al tuo testo: non elencare numeri o coordinate, commentali e dai loro un
significato — l'app si occupa dei dati "grezzi", tu ci metti la voce narrante.
Se la sezione è "I luoghi da non perdere": usa ### (tre cancelletti e spazio) come sottotitolo per ogni
luogo specifico prima di descriverlo (es: ### Castello di Calcata); per ogni luogo che compare
nell'elenco LUOGHI CON VOCE WIKIPEDIA (nome ESATTO, non abbreviato) aggiungi un piccolo indovinello
su una riga separata nel formato esatto [indovinello poi="Nome esatto del luogo"]Domanda?|Risposta breve[/indovinello]
(mai per luoghi fuori da quell'elenco); solo per i luoghi con una vera storia stratificata nel tempo
(siti archeologici, resti etruschi o romani, castelli, borghi medievali) aggiungi anche una o più righe
[epoca poi="Nome esatto del luogo" periodo="etrusca|romana|medievale|oggi"]cosa vedresti da quel punto in quell'epoca, 2-3 frasi vivide[/epoca].
Per le curiosità e aneddoti più memorabili in qualunque sezione, racchiudili nel formato esatto su una
riga separata: [curiosita] testo della curiosità [/curiosita]`

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

// ── Profilo + storico per la sezione "Su misura per te" ───────────────────────

async function fetchHikerProfileForComfort(userId: string): Promise<{ experienceLevel: string | null; concerns: string[]; environmentPrefs: string[] }> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('hiker_experience_level, hiker_concerns, hiker_environment_prefs')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[guide] fetchHikerProfileForComfort failed:', error.message)
  return {
    experienceLevel: (data?.hiker_experience_level as string | null) ?? null,
    concerns: (data?.hiker_concerns as string[] | null) ?? [],
    environmentPrefs: (data?.hiker_environment_prefs as string[] | null) ?? [],
  }
}

/** Testo pronto per il prompt della sezione 'comfort' — vedi buildPrompt's comfortContext. */
async function buildComfortContext(userId: string): Promise<string> {
  const [profile, history] = await Promise.all([
    fetchHikerProfileForComfort(userId),
    readOrBackfillHistoryStats(userId),
  ])
  const lines = [
    `Livello di esperienza dichiarato: ${profile.experienceLevel ?? 'non indicato'}`,
    profile.concerns.length ? `Attenzioni indicate dall'utente: ${profile.concerns.map(concernLabel).join('; ')}` : `Nessuna attenzione particolare indicata`,
    profile.environmentPrefs.length ? `Preferenze ambientali: ${profile.environmentPrefs.map(environmentPrefLabel).join('; ')}` : `Nessuna preferenza ambientale indicata`,
    formatHistoryStatsBlock(history),
  ]
  return lines.join('\n')
}

export type GuideTier = 'breve' | 'approfondita'

const TIER_CONFIG: Record<GuideTier, { maxTokens: number }> = {
  breve: {
    // Alzato da 1050: con budget fisso e fino a 8 sezioni abilitabili dall'utente (vedi
    // sanitizeBreveSections, nessun tetto sul numero di sezioni), il caso peggiore con "I luoghi
    // da non perdere" su più POI poteva avvicinarsi al vecchio tetto e rischiare un troncamento
    // silenzioso proprio nel tier generato automaticamente, senza intervento dell'utente.
    maxTokens: 1300,
  },
  approfondita: {
    // Margine di sicurezza oltre a quanto le 8 sezioni dovrebbero effettivamente richiedere (era
    // 16000) — non pensato per "coprire" una sezione Luoghi senza tetto (risolto sopra
    // limitando i POI trattati), solo per non tagliare una guida legittimamente ricca in un
    // percorso con molti luoghi interessanti.
    maxTokens: 20000,
  },
}

/**
 * Lunghezza target per sezione e per tier — deliberatamente NON uniforme: ogni sezione ha una
 * natura diversa (narrazione centrale vs. nota pratica vs. commento breve) e non ha senso che
 * tutte occupino lo stesso spazio solo perché appartengono allo stesso tier. Sostituisce la vecchia
 * istruzione unica "LUNGHEZZA" applicata identica a tutte le sezioni. "luoghi" è espressa per
 * singolo luogo (non per la sezione nel suo complesso) perché il numero di POI trattati varia da
 * percorso a percorso — vedi MAX_WIKI_POIS_IN_PROMPT più sotto per il tetto sul numero di luoghi.
 */
const SECTION_LENGTH: Record<GuideSectionKey, Record<GuideTier, string>> = {
  prima_di_partire: { breve: '45-60 parole',  approfondita: '300-380 parole, 3-4 paragrafi' },
  il_percorso:      { breve: '80-100 parole', approfondita: '650-800 parole, 6-7 paragrafi — la sezione narrativa principale, la più ricca di tutte' },
  dati_sicurezza:   { breve: '50-65 parole',  approfondita: '350-450 parole, 3-4 paragrafi' },
  comfort:          { breve: '30-45 parole, 1-2 frasi', approfondita: '40-60 parole, 1-2 frasi — resta sempre molto più breve delle altre sezioni, anche in modalità Approfondita' },
  luoghi:           { breve: '20-30 parole per luogo', approfondita: '90-130 parole per luogo' },
  natura:           { breve: '45-60 parole',  approfondita: '350-450 parole, 3-4 paragrafi' },
  sapori:           { breve: '40-55 parole',  approfondita: '300-380 parole, 3-4 paragrafi' },
  consigli:         { breve: '35-45 parole',  approfondita: '250-320 parole, 2-3 paragrafi' },
}

/** Contenuto (istruzioni + intestazione) per una singola sezione dello scheletro. */
const SECTION_BRIEF: Record<GuideSectionKey, string> = {
  prima_di_partire: `## Prima di partire
Consigli pratici: equipaggiamento, abbigliamento, cosa mettere nello zaino, orario ideale di partenza.
Sii specifica rispetto alla stagione ideale, al tipo di terreno, all'acqua disponibile lungo il percorso.`,
  il_percorso: `## Il percorso
Narrazione vivace del tracciato dall'inizio alla fine. Descrivi l'atmosfera, i panorami, i cambi di paesaggio,
i momenti più belli. Dai l'idea di cosa si prova davvero a camminare lì.`,
  dati_sicurezza: `## Dati e sicurezza
Commenta (senza elencare i numeri, già visibili nell'app) quanto il percorso è adatto a chi lo affronta, i rischi
principali indicati nella VALUTAZIONE PERSONALIZZATA e i punteggi di Trail Score/Sicurezza/Bellezza forniti sotto:
dai un consiglio pratico su come affrontarli. Sii onesta sui rischi reali (quota, dislivello, esposizione,
meteo, terreno) anche quando il percorso è nel complesso alla portata — il tuo tono caldo non deve mai
tradursi nel minimizzare una difficoltà vera pur di sembrare più incoraggiante.`,
  comfort: `## Su misura per te
Usa il PROFILO E STORICO DI QUESTO ESCURSIONISTA fornito più sotto (se presente) per valutare a parole,
in modo specifico e onesto, quanto QUESTO percorso è in linea con le sue capacità reali e le sue
preferenze dichiarate — un'interpretazione razionale ed emotiva che affianca, non ripete, i punteggi
numerici già mostrati (Trail Score, Comfort TrailScore, punteggio Sicurezza). Sii equilibrata, non solo
rassicurante: se il percorso è oggettivamente più impegnativo del suo storico o in contrasto con
un'attenzione dichiarata, dillo chiaramente, senza minimizzare per sembrare più incoraggiante. Cita un
confronto reale con il suo storico quando disponibile (es. "rispetto alle tue ultime uscite, che si
aggirano su...") ed eventuali attenzioni legate alle sue limitazioni indicate, mai un consiglio generico
valido per chiunque.
Se il PROFILO E STORICO non è disponibile o è vuoto, dillo in una riga sola e passa subito a commentare
il percorso in assoluto (dislivello, distanza, terreno) — senza aggiungere entusiasmo o previsioni non
basate su nulla (es. mai frasi come "le probabilità che tu la ami sono alte" quando non hai nessun dato
per saperlo).`,
  luoghi: `## I luoghi da non perdere
Approfondimento sui punti di interesse più significativi (quelli nell'elenco LUOGHI CON VOCE
WIKIPEDIA più sotto). Racconta la loro storia, le leggende, le curiosità che la maggior parte dei
turisti non conosce. Rendi ogni luogo memorabile.
IMPORTANTE: la lunghezza indicata più in basso (LUNGHEZZA) è PER SINGOLO LUOGO, non per la sezione
nel suo complesso — dedica a ciascun luogo dell'elenco circa quello spazio, così una sezione con più
luoghi resta comunque completa invece di esaurire lo spazio a metà elenco.`,
  natura: `## La natura intorno a te
Flora, fauna e geologia della zona. Cosa potresti incontrare (animali, fiori, rocce particolari).
Aggiungi curiosità naturalistiche legate alla stagione.`,
  sapori: `## Sapori e tradizioni
Gastronomia locale, prodotti tipici del territorio, piatti da assaggiare dopo l'escursione.
Tradizioni e feste locali, artigianato, cultura popolare della zona.`,
  consigli: `## Consigli finali
Sicurezza, segnaletica, varianti del percorso, cosa fare in caso di maltempo,
contatti utili (soccorso alpino, rifugi, app di navigazione).`,
}

interface DataScores {
  cachedTrailScore?: number
  cachedSafetyScore?: SafetyScore
  cachedTsTotal?: number
  cachedBeautyScore?: BeautyScore
  difficultyMarkers?: ClassifiedDifficultyMarker[]
}

// Copia dei campi rilevanti del percorso, mandata dal client (che li ha già in locale, vedi
// lib/plannedStore.ts) — usata SOLO in modalità di emergenza (nessun utente verificato, vedi
// lib/supabaseAuth.ts's `degraded`), quando il server non può leggere il percorso da Supabase.
interface GuideHikeFallback {
  title?: string
  plannedDate?: string
  userNotes?: string
  tags?: string[]
  distanceMeters?: number
  elevationGain?: number
  elevationLoss?: number
  altitudeMax?: number
  altitudeMin?: number
  estimatedTimeSeconds?: number
  assessment?: PlannedHike['assessment']
  cachedPois?: PlannedHike['cachedPois']
  cachedPoiWiki?: PlannedHike['cachedPoiWiki']
  trackPoints?: TrackPoint[]
}

/**
 * Costruisce un PlannedHike minimo dalla copia locale che il client manda ad ogni richiesta
 * (hikeFallback) — usata sia in modalità degradata (nessun utente verificabile) sia quando
 * l'utente è verificato ma la riga non è ancora arrivata su Supabase (percorso appena importato,
 * vedi il ramo `if (!data)` più sotto). `createdAt` resta vuoto: non è mai stato letto da una riga
 * reale, non ha senso inventarlo.
 */
function hikeFromFallback(hikeId: string, hikeFallback: GuideHikeFallback): PlannedHike {
  return {
    id:                   hikeId,
    title:                hikeFallback.title ?? 'Percorso',
    plannedDate:          hikeFallback.plannedDate,
    userNotes:            hikeFallback.userNotes,
    tags:                 hikeFallback.tags,
    createdAt:            '',
    distanceMeters:       hikeFallback.distanceMeters ?? 0,
    elevationGain:        hikeFallback.elevationGain ?? 0,
    elevationLoss:        hikeFallback.elevationLoss ?? 0,
    altitudeMax:          hikeFallback.altitudeMax ?? 0,
    altitudeMin:          hikeFallback.altitudeMin ?? 0,
    estimatedTimeSeconds: hikeFallback.estimatedTimeSeconds ?? 0,
    assessment:           hikeFallback.assessment,
    cachedPois:           hikeFallback.cachedPois,
    cachedPoiWiki:        hikeFallback.cachedPoiWiki,
  }
}

function buildPrompt(
  hike: PlannedHike,
  tier: GuideTier,
  nature: NatureContext | undefined,
  breveSections: GuideSectionKey[],
  scores: DataScores,
  /** Quando presente, "Approfondisci" richiesto su UNA sola sezione (vedi POST sotto) — il resto
   *  della guida già scritta non viene toccato, quindi qui si chiede solo quella sezione. */
  sectionKeyOverride?: GuideSectionKey,
  /** Profilo + storico dell'escursionista (lib/hikerProfile.ts + lib/hikerHistory.ts), già
   *  formattato — solo per la sezione 'comfort' ("Su misura per te"), undefined quando quella
   *  sezione non viene scritta in questa richiesta (risparmia la lettura Supabase altrimenti). */
  comfortContext?: string,
): string {
  const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const raw  = (hike.cachedPois   ?? []) as PoiItem[]

  // Un tetto qui non è solo per limitare il prompt in ingresso: la sezione "I luoghi da non
  // perdere" tratta OGNI luogo di questo elenco (narrazione + indovinello obbligatorio, vedi
  // SYSTEM/SYSTEM_SECTION), quindi un tracciato con molti POI Wikipedia poteva far sforare
  // max_tokens a metà di quella sezione, troncando tutte le sezioni successive — mai una
  // limitazione voluta, solo un elenco senza tetto. Gli 8 più vicini al percorso restano comunque
  // i più pertinenti (wiki arriva già ordinato per distanza dalla traccia).
  const MAX_WIKI_POIS_IN_PROMPT = 8
  const wikiCapped = wiki.slice(0, MAX_WIKI_POIS_IN_PROMPT)
  const wikiBlock = wikiCapped.length > 0
    ? wikiCapped.map(({ poi, wiki: w }) =>
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

  const assessment: HikeAssessment | undefined = hike.assessment
  const diffStr = assessment?.difficulty ?? ''

  const natureBlock = nature ? formatNatureContextBlock(nature) : ''

  const assessmentBlock = assessment
    ? [
        `VALUTAZIONE PERSONALIZZATA: ${assessment.summary}`,
        assessment.risks.length ? `Rischi:\n${assessment.risks.map(r => `- [${r.type}] ${r.text}`).join('\n')}` : '',
        assessment.suggestions.length ? `Suggerimenti:\n${assessment.suggestions.map(s => `- ${s.text}`).join('\n')}` : '',
      ].filter(Boolean).join('\n')
    : ''

  const scoresBlock = [
    scores.cachedTsTotal != null ? `Trail Score complessivo: ${Math.round(scores.cachedTsTotal)}/100` : '',
    scores.cachedTrailScore != null ? `Comfort/Trail Score: ${Math.round(scores.cachedTrailScore)}/100` : '',
    scores.cachedSafetyScore ? `Punteggio Sicurezza: ${Math.round(scores.cachedSafetyScore.overall)}/100 (${scores.cachedSafetyScore.label})` : '',
    scores.cachedSafetyScore?.allRisks?.length ? `Rischi di sicurezza rilevati: ${scores.cachedSafetyScore.allRisks.map(r => r.text).join('; ')}` : '',
    scores.cachedBeautyScore ? `Punteggio Bellezza percorso disponibile.` : '',
    scores.difficultyMarkers?.length ? `Segnalazioni difficoltà dal tracciato: ${scores.difficultyMarkers.map(m => m.text).join('; ')}` : '',
  ].filter(Boolean).join('\n')

  const sectionsToWrite = sectionKeyOverride
    ? [sectionKeyOverride]
    : tier === 'approfondita'
      ? GUIDE_SECTIONS.map(s => s.key)
      : GUIDE_SECTIONS.map(s => s.key).filter(k => breveSections.includes(k))

  const sectionsBlock = sectionsToWrite
    .map(k => `${SECTION_BRIEF[k]}\n(LUNGHEZZA per questa sezione: ${SECTION_LENGTH[k][tier]})`)
    .join('\n\n')
  const sectionTitles = sectionsToWrite.map(k => GUIDE_SECTIONS.find(s => s.key === k)!.title).join(', ')

  return `${sectionKeyOverride
    ? `Scrivi UNA singola sezione, finora senza testo, di una guida escursionistica già esistente per questo percorso (le altre sezioni sono già scritte e non vanno toccate), analizzando tutti i dati disponibili qui sotto:`
    : `Crea una guida escursionistica per questo percorso, analizzando tutti i dati disponibili qui sotto:`}

NOME: ${hike.title}
${dateStr ? `DATA: ${dateStr}` : ''}
DISTANZA: ${(hike.distanceMeters / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(hike.elevationGain)} m
DISLIVELLO NEGATIVO: ${Math.round(hike.elevationLoss)} m
QUOTA MASSIMA: ${Math.round(hike.altitudeMax)} m slm
QUOTA MINIMA: ${Math.round(hike.altitudeMin)} m slm
DURATA STIMATA: ${formatDuration(hike.estimatedTimeSeconds)}
${diffStr ? `DIFFICOLTÀ: ${diffStr}` : ''}
${assessment?.suitabilityScore ? `ADATTA A: ${assessment.suitabilityScore}% degli escursionisti` : ''}

${assessmentBlock}

${scoresBlock ? `PUNTEGGI E SEGNALAZIONI (già mostrati graficamente nell'app, usali solo per commentare):\n${scoresBlock}` : ''}

${comfortContext ? `PROFILO E STORICO DI QUESTO ESCURSIONISTA (usali SOLO per la sezione "Su misura per te"):\n${comfortContext}` : ''}

LUOGHI CON VOCE WIKIPEDIA (usa questi come base per la narrazione storico-culturale):
${wikiBlock}
${rawOnly ? `\nALTRI PUNTI DI INTERESSE OSM:\n${rawOnly}` : ''}
${hike.userNotes ? `\nNOTE DEL PROPRIETARIO DEL PERCORSO:\n${hike.userNotes}` : ''}
${natureBlock ? `\nDATI NATURALISTICI E FENOLOGICI REALI (usa questi dati per la sezione "La natura intorno a te" — non inventare flora/fauna in contraddizione con questi dati):\n${natureBlock}` : ''}

Scrivi la guida strutturata ESATTAMENTE in queste sezioni, in quest'ordine, senza aggiungerne altre (usa ## per ogni titolo):

${sectionsBlock}

La guida deve essere ricca di vita ma mai ridondante coi dati che l'app già mostra. Scrivi come se raccontassi in persona, con calore ed entusiasmo genuino.

IMPORTANTE: rispetta esattamente l'indicazione LUNGHEZZA scritta sotto ciascuna sezione qui sopra — sezioni diverse hanno lunghezze diverse per loro natura (una nota pratica non è lunga come la narrazione del percorso), non uniformarle tutte alla stessa misura.

IMPORTANTE: Completa obbligatoriamente tutte le sezioni richieste (${sectionTitles}). Non terminare prima dell'ultima.`
}

// ── GET /api/guide?hikeId=X → pre-flight AI-access check, no generation ───────
export async function GET(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return new Response(
      authUnavailable
        ? JSON.stringify({ hasAccess: false, unavailable: true })
        : JSON.stringify({ error: 'Non autenticato' }),
      { status: authUnavailable ? 200 : 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { apiKey, lookupFailed } = user
    ? await resolveApiKeyAndSettings(user.id)
    : await resolveEmergencySharedKey()
  return new Response(JSON.stringify({ hasAccess: !!apiKey, unavailable: lookupFailed }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}

// ── Route ─────────────────────────────────────────────────────────────────────
// POST è solo un guscio sottile attorno a generateGuide: qualunque eccezione non gestita che sfugga
// da generateGuide (letture Supabase che lanciano invece di restituire {error}, un TypeError su un
// campo inatteso, un fallimento di rete non catturato altrove...) diventerebbe altrimenti un 500
// generico di Next.js senza corpo JSON, mostrato lato client come errore illeggibile — a differenza
// di ogni altro errore già previsto qui sotto (402/404/503), che ha sempre un messaggio per l'utente.
export async function POST(req: NextRequest) {
  try {
    return await generateGuide(req)
  } catch (e) {
    console.error('[guide] errore non gestito in POST:', e)
    return new Response(
      JSON.stringify({
        error:   'ai_temporarily_unavailable',
        message: 'Si è verificato un errore imprevisto durante la generazione della guida — riprova tra poco.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

async function generateGuide(req: NextRequest): Promise<Response> {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return new Response(
      JSON.stringify(
        authUnavailable
          ? { error: 'ai_temporarily_unavailable', message: 'Non riesco a verificare la tua sessione in questo momento (Supabase non raggiungibile) — riprova tra poco.' }
          : { error: 'Non autenticato' },
      ),
      { status: authUnavailable ? 503 : 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { apiKey, userGender, breveSections, claudeModel, lookupFailed } = user
    ? await resolveApiKeyAndSettings(user.id)
    : await resolveEmergencySharedKey()

  if (!apiKey) {
    return new Response(
      JSON.stringify(
        lookupFailed
          ? {
              error:   'ai_temporarily_unavailable',
              message: 'Non riesco a verificare la tua chiave AI in questo momento (Supabase non raggiungibile) — riprova tra poco.',
            }
          : {
              error:   'no_ai_access',
              message: 'Aggiungi la tua chiave API Claude nelle impostazioni del profilo per generare guide turistiche.',
            },
      ),
      { status: lookupFailed ? 503 : 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let hikeId: string
  let tier: GuideTier = 'breve'
  let hikeFallback: GuideHikeFallback | undefined
  let sectionKey: GuideSectionKey | undefined
  try {
    const body = await req.json()
    hikeId = body.hikeId
    if (!hikeId) throw new Error('hikeId mancante')
    // 'media'/'lunga' sono valori legacy dal vecchio picker a 3 livelli — trattati come 'approfondita'.
    if (body.length === 'breve' || body.tier === 'breve') tier = 'breve'
    else tier = 'approfondita'
    hikeFallback = body.hikeFallback && typeof body.hikeFallback === 'object' ? body.hikeFallback : undefined
    // "Approfondisci" su una sola sezione (vedi buildPrompt/SYSTEM_SECTION) — stessa lunghezza
    // "breve" delle altre sezioni automatiche (tier deciso normalmente sopra, di solito 'breve'
    // dato che il client lo manda esplicitamente): riguarda solo quella sezione, non la rende
    // improvvisamente una sezione lunghissima. La versione integrale resta un'azione a sé (il
    // pulsante "Sblocca la guida integrale", che manda tier 'approfondita' su tutte le sezioni).
    if (isGuideSectionKey(body.sectionKey)) sectionKey = body.sectionKey
  } catch {
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Va letta solo quando la sezione 'comfort' ("Su misura per te") è davvero tra quelle richieste
  // in questa generazione — evita una lettura Supabase in più su ogni altra chiamata.
  const needsComfortSection = sectionKey === 'comfort' || (!sectionKey && (tier === 'approfondita' || breveSections.includes('comfort')))
  const comfortContext = needsComfortSection && user ? await buildComfortContext(user.id) : undefined

  let hike: PlannedHike
  let scores: DataScores
  let s2: Parameters<typeof fetchNatureContext>[0]['s2']
  let trackPoints: TrackPoint[]
  // Testo/indovinelli/epoche già esistenti su cui fondere il risultato di un "Approfondisci" per
  // sezione (vedi persistenza più sotto) — vuoti quando non è una richiesta di quel tipo, o quando
  // non c'è nulla da leggere (degraded/hikeFallback non porta questi campi, vedi GuideHikeFallback).
  let existingGuideText = ''
  let existingRiddles: PlannedHike['cachedRiddles'] = []
  let existingEpochPois: PlannedHike['cachedEpochPois'] = []

  if (user) {
    // Fetch hike — scoped to the authenticated user
    const { data, error } = await supabase
      .from('planned_hikes')
      .select('*')
      .eq('id', hikeId)
      .eq('user_id', user.id)
      .single()

    // PGRST116 = .single() non ha trovato righe: o genuinamente non esiste, o — caso comune per un
    // percorso appena importato — non è ancora arrivata su Supabase per via del debounce
    // dell'outbox (lib/plannedStore.ts's savePlanned tenta un salvataggio sincrono con qualche
    // retry ravvicinato, ma un blackout più lungo del previsto può comunque farla arrivare tardi).
    // Qualunque ALTRO errore (Supabase irraggiungibile, timeout...) non è la stessa cosa — dire
    // "percorso non trovato" per un blackout temporaneo farebbe pensare all'utente di aver perso
    // il percorso, quando basta riprovare tra poco. Stesso principio già usato altrove (es.
    // app/api/user-settings/route.ts) per distinguere i due casi.
    if (error && error.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({
          error: 'ai_temporarily_unavailable',
          message: 'Non riesco a recuperare il percorso in questo momento (Supabase non raggiungibile) — riprova tra poco.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!data) {
      // Il client manda già una copia locale del percorso (hikeFallback) ad ogni richiesta, non
      // solo in modalità degradata — se la riga non è ancora su Supabase ma il client la conosce
      // già (l'ha appena creata lui stesso), usa quella invece di dire "non trovato": è quasi
      // certamente solo questione di qualche secondo prima che l'outbox la sincronizzi.
      if (!hikeFallback) {
        return new Response(JSON.stringify({ error: 'Percorso non trovato' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        })
      }
      hike = hikeFromFallback(hikeId, hikeFallback)
      scores = { difficultyMarkers: [] }
      trackPoints = hikeFallback.trackPoints ?? []
      s2 = undefined
      // existingGuideText/existingRiddles/existingEpochPois restano vuoti (già inizializzati
      // sopra) — non c'è nulla da leggere finché la riga non esiste ancora.
    } else {
      const { data: markersRows } = await supabase
        .from('trail_difficulty_markers')
        .select('lat, lon, source, source_text, severity, keywords')
        .eq('planned_hike_id', hikeId)
      const difficultyMarkers: ClassifiedDifficultyMarker[] = (markersRows ?? []).map(m => ({
        lat: m.lat, lon: m.lon, source: m.source, text: m.source_text, severity: m.severity, keywords: m.keywords ?? [],
      }))

      hike = {
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

      scores = {
        cachedTrailScore:  data.cached_trail_score  ?? undefined,
        cachedSafetyScore: data.cached_safety_score ?? undefined,
        cachedTsTotal:     data.cached_ts_total      ?? undefined,
        cachedBeautyScore: data.cached_beauty_score  ?? undefined,
        difficultyMarkers,
      }

      trackPoints = Array.isArray(data.track_points) ? data.track_points : []
      s2 = {
        available:          data.s2_available,
        phenologyPeakMonth: data.s2_phenology_peak_month,
        ndviDelta:          data.s2_ndvi_delta,
        landscapeVariety:   data.s2_landscape_variety,
        shadeScore:         data.s2_shade_score,
        waterSources:       data.s2_water_sources,
      }
      existingGuideText = data.cached_guide ?? ''
      existingRiddles = data.cached_riddles ?? []
      existingEpochPois = data.cached_epoch_pois ?? []
    }
  } else {
    // Emergenza (degraded): Supabase irraggiungibile, nessun accesso al percorso lato server —
    // si usa solo la copia che il client ha già in locale (lib/plannedStore.ts, cache-first),
    // mandata insieme alla richiesta. Punteggi/dati satellitari cached_* non sono disponibili in
    // questa modalità (non mirrorati client-side): la guida resta generabile, solo un po' meno
    // arricchita di quei dettagli specifici finché Supabase non torna raggiungibile.
    if (!hikeFallback) {
      return new Response(JSON.stringify({ error: 'Percorso non trovato' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }
    hike = hikeFromFallback(hikeId, hikeFallback)
    scores = { difficultyMarkers: [] }
    trackPoints = hikeFallback.trackPoints ?? []
    s2 = undefined
  }

  const nature = await fetchNatureContext({
    trackPoints,
    altitudeMax: hike.altitudeMax,
    month: hike.plannedDate ? new Date(hike.plannedDate + 'T12:00').getMonth() + 1 : new Date().getMonth() + 1,
    s2,
  })

  const client = new Anthropic({ apiKey })
  const prompt = buildPrompt(hike, tier, nature, breveSections, scores, sectionKey, comfortContext)
  const { maxTokens } = TIER_CONFIG[tier]
  // sectionKey: niente [sottotitolo]/[avviso] (valgono solo per l'inizio di una guida intera) né
  // ricerca web di verifica (già fatta alla generazione iniziale) — vedi SYSTEM_SECTION.
  //
  // SYSTEM/SYSTEM_SECTION sono testo fisso, identico per ogni utente e ogni percorso (~1700/~700
  // token) — cache_control li marca come prefisso cacheabile (prompt caching Anthropic), così
  // richieste ravvicinate con la stessa chiave (personale o condivisa/premium) pagano l'intero
  // blocco una sola volta invece che ad ogni singola generazione. genderInstruction resta un
  // blocco separato SENZA cache_control perché varia da utente a utente — un blocco dopo il
  // breakpoint non invalida il prefisso già cacheato, quindi non rompe il risparmio sopra.
  const system = [
    { type: 'text' as const, text: sectionKey ? SYSTEM_SECTION : SYSTEM, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: genderInstruction(userGender) },
  ]

  // Stream Claude response — web_search abilita Giulia a verificare online lo stato aggiornato
  // del percorso (chiusure, deviazioni, lavori) prima di scrivere, vedi istruzioni in SYSTEM.
  // Omesso del tutto per un "Approfondisci" di sezione: non serve riverificare lo stato del
  // percorso solo per arricchire il testo narrativo, e risparmia sia costo che tempo.
  const stream = client.messages.stream({
    model:      claudeModel,
    max_tokens: maxTokens,
    system,
    messages:   [{ role: 'user', content: prompt }],
    ...(sectionKey ? {} : { tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: tier === 'approfondita' ? 8 : 4 }] }),
  })

  // Raccoglie le fonti web citate da Giulia mentre scrive (citations_delta sui blocchi di testo,
  // popolate automaticamente da Claude quando usa web_search) — appese in coda allo stream come
  // tag [fonti], stessa convenzione di [sottotitolo]/[avviso], estratte in lib/guideSources.ts.
  const sources = new Map<string, string>()

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      // Se il client si disconnette a metà (tab chiusa, navigazione fuori dall'app, rete caduta)
      // controller.enqueue inizia a lanciare — senza questo try/catch quell'eccezione uscirebbe dal
      // for-await sottostante e interromperebbe la generazione lì, PRIMA di arrivare al blocco di
      // salvataggio server-side qui sotto. Da questo momento in poi ci si limita ad accumulare
      // fullText dallo stream Anthropic (una connessione separata, indipendente dal client) senza
      // più provare a inviare nulla, cosicché la generazione prosegua comunque fino alla fine.
      let clientGone = false
      const safeEnqueue = (chunk: string) => {
        if (clientGone) return
        try { controller.enqueue(enc.encode(chunk)) } catch { clientGone = true }
      }
      let fullText = ''
      try {
        for await (const event of stream) {
          // [stato] è un marcatore transitorio (stessa convenzione di [sottotitolo]/[avviso]/
          // [fonti]) rimosso lato client man mano che arriva — dà un feedback di cosa sta facendo
          // Giulia durante la fase di ricerca web, prima che compaia il primo testo vero.
          if (event.type === 'content_block_start') {
            const cb = event.content_block
            if (cb.type === 'server_tool_use' && cb.name === 'web_search') {
              safeEnqueue('[stato]Sto verificando lo stato aggiornato del percorso online…[/stato]')
            } else if (cb.type === 'web_search_tool_result') {
              safeEnqueue('[stato]Ho trovato delle informazioni, le sto integrando…[/stato]')
            }
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullText += event.delta.text
            safeEnqueue(event.delta.text)
          }
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'citations_delta' &&
            event.delta.citation.type === 'web_search_result_location'
          ) {
            const { url, title } = event.delta.citation
            if (url && !sources.has(url)) sources.set(url, title ?? url)
          }
        }

        // Rileva un troncamento per esaurimento token: senza questo controllo, una guida tagliata
        // a metà sezione (o a metà di un tag [indovinello]/[epoca], scartato in silenzio dal
        // parsing perché mai chiuso — vedi lib/riddles.ts, lib/epochPois.ts) passava inosservata,
        // sia lato log che per l'utente, che vedeva semplicemente sparire le ultime sezioni.
        const finalMessage = await stream.finalMessage().catch(() => null)
        if (finalMessage?.stop_reason === 'max_tokens') {
          console.error(`[guide] generazione troncata per max_tokens (tier=${tier}, hikeId=${hikeId}, sectionKey=${sectionKey ?? 'tutte'})`)
        }

        if (sources.size > 0) {
          // Foto di riferimento del percorso, per ogni fonte citata che ne espone una pubblicamente
          // (meta tag og:image, vedi lib/sourceImageFetch.ts) — quante più se ne trovano, meglio è
          // per la Galleria fotografica; mai sui domini che non la mostrerebbero comunque
          // (Komoot/AllTrails/Wikiloc).
          const foundImages = await findAllSourceImages(Array.from(sources.keys())).catch(() => [])
          const imageByUrl = new Map(foundImages.map(f => [f.url, f.imageUrl]))
          const list = Array.from(sources, ([url, title]) => ({
            url, title,
            ...(imageByUrl.has(url) ? { imageUrl: imageByUrl.get(url) } : {}),
          }))
          const tag = `\n[fonti]${JSON.stringify(list)}[/fonti]`
          fullText += tag
          safeEnqueue(tag)
        }
        if (!clientGone) { try { controller.close() } catch {} }

        // Salvataggio lato server, indipendente dal client che ha fatto la richiesta — la stessa
        // pipeline di estrazione che gira anche lato client (components/guida/GuideReader.tsx),
        // qui rifatta a fronte dello stream server-side così la generazione non va persa nemmeno
        // se l'utente ha chiuso il percorso o la scheda prima che il client finisse di leggerlo.
        // Solo con un utente verificato: in modalità degradata non c'è uno `user.id` con cui
        // verificare che la riga planned_hikes appartenga davvero a chi ha fatto la richiesta.
        if (user) {
          try {
            const cachedPoisArr = (hike.cachedPois ?? []) as PoiItem[]
            const cachedPoiWikiArr = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]

            if (sectionKey) {
              // "Approfondisci" di UNA sezione: si fonde nel testo già esistente invece di
              // sovrascrivere l'intera guida — vedi lib/guideParse.ts's mergeGuideSection.
              const step1 = stripGuideStatus(fullText).cleanedText
              const { riddles, cleanedText: step2 } = extractRiddles(step1, cachedPoisArr, cachedPoiWikiArr)
              const { epochPois, cleanedText: step3 } = extractEpochPois(step2, cachedPoisArr, cachedPoiWikiArr)
              const parsedSection = parseGuideSections(step3)[0]
              if (!parsedSection) throw new Error('sezione non riconosciuta nella risposta')

              const mergedText = mergeGuideSection(existingGuideText, sectionKey, parsedSection.title, parsedSection.body)
              // Gli indovinelli/le epoche sono legati solo alla sezione "luoghi" (vedi SYSTEM_SECTION):
              // rigenerandola i vecchi sono da sostituire, non accumulare; per ogni altra sezione
              // restano semplicemente quelli già esistenti, invariati.
              const mergedRiddles = sectionKey === 'luoghi' ? riddles : existingRiddles
              const mergedEpochPois = sectionKey === 'luoghi' ? epochPois : existingEpochPois

              const { error: persistError } = await supabase.from('planned_hikes').update({
                cached_guide: mergedText,
                cached_riddles: mergedRiddles,
                cached_epoch_pois: mergedEpochPois,
              }).eq('id', hikeId).eq('user_id', user.id)
              if (persistError) console.error('[guide] server-side persist (sezione) failed:', persistError.message)
            } else {
              const step1 = stripGuideStatus(fullText).cleanedText
              const { subtitle, cleanedText: step2 } = extractCoverSubtitle(step1)
              const { notices, cleanedText: step3 } = extractGuideNotices(step2)
              const { sources: sourcesList, cleanedText: step4 } = extractGuideSources(step3)
              const { riddles, cleanedText: step5 } = extractRiddles(step4, cachedPoisArr, cachedPoiWikiArr)
              const { epochPois, cleanedText: step6 } = extractEpochPois(step5, cachedPoisArr, cachedPoiWikiArr)
              const firstHeadingIdx = step6.search(/^## /m)
              const finalText = firstHeadingIdx > 0 ? step6.slice(firstHeadingIdx) : step6

              const { error: persistError } = await supabase.from('planned_hikes').update({
                cached_guide: finalText,
                cached_guide_subtitle: subtitle ?? null,
                cached_guide_notices: notices,
                cached_guide_sources: sourcesList,
                cached_riddles: riddles,
                cached_epoch_pois: epochPois,
                guide_tier: tier,
                guide_generated_at: new Date().toISOString(),
              }).eq('id', hikeId).eq('user_id', user.id)
              if (persistError) console.error('[guide] server-side persist failed:', persistError.message)
            }
          } catch (e) {
            console.error('[guide] server-side persist failed:', e)
          }
        }
      } catch (e) {
        // Il credito residuo della chiave Anthropic è esaurito: a questo punto la Response è già
        // partita con status 200 (streaming), quindi non è più possibile segnalarlo con un codice
        // HTTP dedicato come per gli altri casi d'errore più sopra (402/503) — invece di lasciare
        // che lo stream vada semplicemente in errore (mostrato al client come un generico "errore
        // durante la generazione", indistinguibile da un blackout di rete), si manda un tag
        // dedicato riconosciuto lato client (vedi lib/guideAiError.ts, GuideReader.tsx) e si chiude
        // lo stream normalmente così il fetch del client completa senza un'eccezione di rete.
        if (isCreditBalanceError(e)) {
          safeEnqueue(`[erroreai:credito]Il credito residuo della tua chiave API Claude si è esaurito.[/erroreai]`)
          if (!clientGone) { try { controller.close() } catch {} }
        } else if (!clientGone) {
          try { controller.error(e) } catch {}
        }
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Guide-Tier': tier,
    },
  })
}
