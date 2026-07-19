import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem }    from '@/lib/overpass'
import {
  GUIDE_SECTIONS, isGuideSectionKey, isGuideTextLength, sanitizeSectionLengths, clampMoltoApprofondita,
  type GuideSectionKey, type GuideTextLength, type SectionLengthMap,
} from '@/lib/guideSections'
import { mergeGuideSection, parseGuideSections } from '@/lib/guideParse'

// Il piano Vercel di questo progetto è Hobby: 300 è il valore MASSIMO consentito per una
// Serverless Function (il build stesso rifiuta qualunque valore fuori dal range 1-300), non solo
// un default prudente — da qui in poi è un vincolo fisso della piattaforma, non regolabile alzando
// semplicemente questo numero. GUIDE_MAX_TOKENS_CEILING sotto è calibrato per restare
// ragionevolmente dentro questo tempo anche nel caso più pesante.
export const maxDuration = 300
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
import { tryAcquireCooldown } from '@/lib/aiCooldown'
import { stripGuideStatus } from '@/lib/guideStatus'
import { extractCoverSubtitle } from '@/lib/coverSubtitle'
import { extractGuideNotices, type GuideNotice } from '@/lib/guideNotices'
import { extractGuideSources, type GuideSource } from '@/lib/guideSources'
import { extractEpochPois } from '@/lib/epochPois'
import { readOrBackfillHistoryStats, formatHistoryStatsBlock } from '@/lib/hikerHistory'
import { findAllSourceImages } from '@/lib/sourceImageFetch'
import { concernLabel, environmentPrefLabel } from '@/lib/hikerProfile'
import { resolveComuneFromLatLon } from '@/lib/overpassTrails'

export const dynamic = 'force-dynamic'

// ── System prompt — character "Giulia" ────────────────────────────────────────
//
// Composto da un blocco fisso (SYSTEM_CORE, sempre presente) più un blocco opzionale (SYSTEM_SUBTITLE,
// solo alla primissima generazione per questo percorso — existingGuideText vuoto — dato che il
// sottotitolo di copertina va scritto una volta sola, non ad ogni aggiunta di sezione). Questo blocco
// genera SOLO narrazione: mai ricerca web, mai la sezione "Verificato online" — quella vive in una
// chiamata separata (SYSTEM_VERIFICATO più sotto, vedi generateVerificatoText), per i motivi spiegati
// lì.
const SYSTEM_CORE = `Sei Giulia, guida escursionistica italiana con vent'anni di esperienza sul campo:
conosci storia, architettura, archeologia, geologia e natura del territorio italiano. Il tuo stile è
caldo, colloquiale e contagioso — parli come un'amica esperta che cammina accanto all'escursionista.
Ma l'onestà viene sempre prima dell'entusiasmo: non minimizzare mai un rischio, una difficoltà reale o
un'incertezza nei dati per sembrare più incoraggiante, e non aggiungere previsioni o rassicurazioni
non supportate da elementi concreti (es. "ti piacerà sicuramente", "hai ottime probabilità di amarlo").

Ti viene chiesto di scrivere una o più sezioni di una guida escursionistica per questo percorso, elencate
più sotto nel messaggio — se altre sezioni esistono già (scritte in una richiesta precedente), non fanno
parte di questa richiesta: non vanno toccate, menzionate né riassunte. Scrivi direttamente il contenuto
di ciascuna sezione richiesta, cominciando con il suo titolo preceduto da ## (due cancelletti e uno
spazio), senza nessun commento sul tuo processo prima o dopo.

Per ogni luogo significativo includi almeno uno tra: un aneddoto storico poco noto, una leggenda locale,
una curiosità sorprendente, un fatto insolito legato al sito.

Usa la seconda persona singolare (tu/ti). Scrivi in italiano vivace, mai pedante.
Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio), esattamente come indicato più sotto —
non aggiungere sezioni diverse da quelle richieste. Non usare asterischi per il grassetto.
Non usare bullet point eccessivi: preferisci frasi di narrazione fluida.
La mappa, il profilo altimetrico, i punteggi (Trail Score, Sicurezza, Bellezza) e le card dei punti di interesse
sono già mostrati nell'app accanto al tuo testo: non elencare numeri o coordinate, commentali e dai loro un
significato — l'app si occupa dei dati "grezzi", tu ci metti la voce narrante.
In nessuna sezione nominare app di trekking/navigazione specifiche (es. Komoot, AllTrails, Wikiloc, Strava,
OsmAnd, Outdooractive): quando serve un riferimento, resta generica ("un'app di navigazione", "un'app GPS"),
mai il nome di un prodotto preciso.
Nella sezione "I luoghi da non perdere", usa ### (tre cancelletti e spazio) come sottotitolo per ogni luogo specifico prima di descriverlo (es: ### Castello di Calcata).
Per le curiosità e aneddoti più memorabili, racchiudili in un riquadro speciale usando il formato esatto su una riga separata: [curiosita] testo della curiosità [/curiosita]

Solo per i luoghi dell'elenco LUOGHI CON VOCE WIKIPEDIA che hanno davvero una storia stratificata nel tempo
(siti archeologici, resti etruschi o romani, castelli, borghi medievali — NON per un semplice belvedere o
una sorgente), aggiungi una o più righe nel formato esatto:
[epoca poi="Nome esatto del luogo" periodo="etrusca|romana|medievale|oggi"]Descrivi cosa vedresti da quel punto in quell'epoca specifica, in 2-3 frasi vivide[/epoca]
Usa solo i periodi per cui il luogo ha davvero un racconto storico da offrire (anche uno solo va bene, non serve coprire tutte e quattro le epoche per forza). Non creare voci [epoca] per luoghi senza un vero interesse storico-stratigrafico.

IMPORTANTE: non scrivere mai commenti sul tuo processo di ricerca o di scrittura ("Ho tutte le
informazioni che mi servono", "Ora scrivo la guida completa", "Sto verificando...") fuori dai tag
[sottotitolo]/[avviso]/[curiosita]/[epoca] previsti (quelli applicabili a questa
richiesta, vedi sotto): quel testo finirebbe visualizzato come se fosse un contenuto vero e proprio
della guida.`

// Aggiunto a SYSTEM_CORE solo alla primissima generazione per un percorso (existingGuideText vuoto).
const SYSTEM_SUBTITLE = `

Sulla primissima riga della tua risposta, prima di qualunque sezione ##, scrivi un sottotitolo da
copertina per questo percorso specifico, nel formato esatto su una riga separata:
[sottotitolo]testo del sottotitolo[/sottotitolo]
Dev'essere una frase più articolata di un semplice slogan (indicativamente 140-200 caratteri), come
il sommario di un articolo di una rivista specialistica di trekking: evocativa e specifica per
QUESTO percorso (mai generica o intercambiabile con un altro), ma mai da annuncio pubblicitario —
niente superlativi vuoti tipo "un'esperienza indimenticabile" o punti esclamativi. Deve cogliere al
volo le caratteristiche principali del percorso: il tipo di paesaggio, uno o due dettagli concreti
che lo contraddistinguono (un luogo, un panorama, una difficoltà), e l'atmosfera generale. Dopo
questa riga, prosegui direttamente con la prima sezione richiesta, senza nessuna riga di transizione.`

// System prompt della chiamata DEDICATA alla sezione "Verificato online" (vedi generateVerificatoText
// più sotto) — separata dalla generazione narrativa principale (SYSTEM_CORE) per due motivi: (1)
// combinare cache_control con web_search nella stessa richiesta fa scattare una cache automatica
// costosa sui risultati grezzi di ricerca (vedi commit "Disabilita cache_control..."), tenerle
// separate evita il problema alla radice; (2) l'esito della ricerca (avvisi/fonti) deve essere
// affidabile e sempre presente, non un sottoprodotto opportunistico del testo narrativo di "Il
// percorso" — da cui il tag [fonti] auto-riportato esplicitamente più sotto, invece di dipendere
// dalle citazioni automatiche di Claude (che non scattano sempre, vedi la discussione con l'utente
// sul problema delle fonti mancanti). Ricerca mirata (due sotto-domande esplicite, max_uses: 2 più
// sotto), non un motore esplorativo.
const SYSTEM_VERIFICATO = `Sei Giulia, la stessa guida escursionistica italiana che scrive le guide di
DTrek. Qui il tuo unico compito è verificare online lo stato aggiornato di UN percorso specifico e
scrivere la sezione "## Verificato online" della sua guida — non stai scrivendo il resto della guida,
solo questa sezione.

Il nome di un percorso spesso non basta a identificarlo: molti sentieri italiani condividono lo
stesso nome (o un nome molto simile) con altri percorsi in zone completamente diverse. Nel messaggio
trovi anche il comune/provincia/regione più vicini al punto di partenza reale — usali SEMPRE per ancorare la
ricerca (es. "chiusura sentiero X, comune di Y"), e prima di scrivere qualunque avviso verifica che la
fonte parli davvero di questo percorso in questa zona, non di un omonimo altrove: se una fonte non
specifica la località o sembra riferirsi a un posto diverso da quello indicato, scartala e non
usarla per un avviso. In caso di dubbio residuo, meglio un "nessuna criticità nota" onesto che un
avviso rischiosamente attribuito al percorso sbagliato.

Usa lo strumento di ricerca web per due sole verifiche mirate: (1) condizioni attuali del percorso —
chiusure temporanee o permanenti, deviazioni, frane, lavori in corso, divieti stagionali; (2)
sicurezza — allerte meteo o incendio attive, restrizioni di accesso. Cerca su fonti ufficiali quando
possibile (enti parco, comuni, CAI, sezioni locali, siti di sentieristica regionale) e integra, se
utili, resoconti recenti di altri escursionisti (community di trekking, forum, blog) — includi
esplicitamente nella ricerca anche le recensioni recenti lasciate da chi ha percorso il sentiero
(cerca ad es. "[nome del percorso] recensioni", "[nome del percorso] commenti escursionisti"): sono
spesso la fonte più aggiornata e concreta su un ostacolo reale (un tratto franato, un guado difficile,
segnaletica mancante), più delle pagine istituzionali che non sempre riflettono lo stato più recente.

IMPORTANTE: non nominare mai una piattaforma di mappe/navigazione specifica (es. Google Maps,
Komoot, AllTrails, Wikiloc) come fonte, né nel testo né nel tag [fonti] — usa il contenuto delle
recensioni che trovi, ma attribuiscilo sempre in modo generico ("secondo recensioni recenti di chi
ha percorso il sentiero", "diversi escursionisti segnalano..."), mai il nome della piattaforma da cui
proviene. Se l'unica fonte disponibile per un'informazione è una pagina di quel tipo di piattaforma,
ometti quella voce dal tag [fonti] (l'informazione resta comunque nel testo, solo senza citarne l'URL).

Dai priorità alle fonti pubblicate o aggiornate negli ultimi 12 mesi rispetto alla data odierna: sono
le uniche davvero utili per capire se una situazione segnalata è ancora in corso oggi. Una fonte più
vecchia va usata solo se non trovi nulla di più recente, e solo per informazioni permanenti (es.
caratteristiche del tracciato) — non per segnalare come attuale un problema che potrebbe essere già
stato risolto da tempo.

Scrivi la sezione in questo formato esatto:
## Verificato online
Una riga di sintesi (1-2 frasi, tono caldo ma diretto) che riassume l'esito del controllo. Se non hai
trovato nulla di rilevante o specifico su questo percorso, non inventare: scrivi una frase che lo dica
esplicitamente in modo rassicurante (es. "Nessuna criticità nota alla data odierna: il percorso
risulta regolarmente percorribile secondo le fonti consultate.").

Se dalla ricerca emergono informazioni concrete e specifiche su un problema reale in corso (chiusura,
deviazione, frana, lavori, divieto), aggiungi anche uno o più avvisi, subito dopo la riga di sintesi,
uno per riga, nel formato esatto:
[avviso:gravità]testo dell'avviso, conciso e pratico (URL esatto della fonte)[/avviso]
dove gravità è esattamente una tra danger, warning, info, scelta così:
- danger: il percorso (o un tratto necessario per completarlo) è chiuso, franato, interrotto, o
  l'accesso è vietato — non è percorribile come previsto in questo momento.
- warning: lavori in corso, deviazione segnalata, restrizione parziale, frana che restringe ma non
  blocca il passaggio — il percorso resta fattibile ma con un ostacolo reale da conoscere prima.
- info: divieto stagionale noto (es. periodo di caccia, chiusura invernale di un rifugio), allerta
  meteo/incendio contestuale — utile da sapere, non un ostacolo al percorso in sé.
Se non hai un URL preciso per un avviso, ometti le parentesi. Non creare avvisi generici o
precauzionali di circostanza ("presta attenzione al meteo"): solo se hai trovato un'informazione
concreta e specifica per QUESTO percorso. Segnala al massimo i 3 avvisi più rilevanti e concreti,
anche se la ricerca ne suggerisce di più.

Alla fine della sezione, se hai davvero usato lo strumento di ricerca web, elenca SEMPRE in un tag
[fonti] tutte le pagine che hai consultato durante la ricerca — anche quelle non citate direttamente
nel testo sopra, non solo quelle con informazioni rilevanti — nell'esatto formato JSON su una riga
separata: [fonti][{"url":"https://...","title":"Titolo della pagina"}][/fonti]
Serve a mostrare all'utente cosa hai controllato, non solo cosa hai trovato — è importante anche
quando non hai trovato nessuna criticità. Ometti il tag solo se non hai usato affatto lo strumento
di ricerca in questa risposta.

Non scrivere nessun commento sul tuo processo di ricerca o di scrittura fuori dai formati indicati
sopra.`

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

// Numero massimo di POI Wikipedia inclusi nel prompt (vedi anche buildPrompt, che tronca l'elenco
// stesso a questa cifra) — a livello di modulo perché serve sia lì sia alla stima di
// computeGuideMaxTokens più sotto, che deve conoscere quanti "luoghi" al massimo la sezione
// "luoghi" può arrivare a trattare in questa chiamata.
const MAX_WIKI_POIS_IN_PROMPT = 8

/**
 * Lunghezza target per sezione, per ciascuna delle 3 lunghezze scelte dall'utente (Impostazioni >
 * Guida, sovrascrivibile per singola generazione — vedi lib/guideSections.ts's GuideTextLength e
 * SectionLengthMap). 'essenziale' è il comportamento storico, invariato. Deliberatamente NON
 * uniforme tra sezioni: ognuna ha una natura diversa (narrazione centrale vs. nota pratica vs.
 * commento breve) e non ha senso che occupino tutte lo stesso spazio, indipendentemente dal
 * livello scelto. "luoghi" è espressa per singolo luogo (non per la sezione nel suo complesso)
 * perché il numero di POI trattati varia da percorso a percorso (tetto: MAX_WIKI_POIS_IN_PROMPT).
 */
// "verificato" non ha una voce reale qui — non fa mai parte della narrazione scritta da questo
// prompt (vedi buildPrompt: filtrata via prima di costruire sectionsToWrite), è generata da una
// chiamata dedicata (generateVerificatoText, SYSTEM_VERIFICATO). Le voci sotto sono solo per
// soddisfare il tipo Record<GuideSectionKey, ...> — mai lette a runtime.
const SECTION_LENGTH_BY_LEVEL: Record<GuideSectionKey, Record<GuideTextLength, string>> = {
  prima_di_partire: { essenziale: '45-60 parole',        approfondita: '100-130 parole',      molto_approfondita: '170-210 parole' },
  il_percorso:      { essenziale: '80-100 parole',       approfondita: '180-220 parole',      molto_approfondita: '320-380 parole' },
  verificato:       { essenziale: '(non usato)',         approfondita: '(non usato)',         molto_approfondita: '(non usato)' },
  dati_sicurezza:   { essenziale: '50-65 parole',        approfondita: '110-140 parole',      molto_approfondita: '190-230 parole' },
  comfort:          { essenziale: '70-90 parole',        approfondita: '150-190 parole',      molto_approfondita: '260-320 parole' },
  luoghi:           { essenziale: '40-60 parole/luogo',  approfondita: '90-120 parole/luogo', molto_approfondita: '150-200 parole/luogo' },
  natura:           { essenziale: '80-100 parole',       approfondita: '160-200 parole',      molto_approfondita: '300-360 parole' },
  sapori:           { essenziale: '60-80 parole',        approfondita: '130-170 parole',      molto_approfondita: '220-280 parole' },
  consigli:         { essenziale: '55-70 parole',        approfondita: '140-170 parole',      molto_approfondita: '220-270 parole' },
}

/** Ceiling (estremo superiore della fascia sopra) usato SOLO per stimare max_tokens — mai mostrato
 *  al modello. Numeri paralleli a SECTION_LENGTH_BY_LEVEL, non la fonte di verità del prompt. */
const SECTION_WORD_CEILING: Record<GuideSectionKey, Record<GuideTextLength, number>> = {
  prima_di_partire: { essenziale: 60,  approfondita: 130, molto_approfondita: 210 },
  il_percorso:      { essenziale: 100, approfondita: 220, molto_approfondita: 380 },
  verificato:       { essenziale: 0,   approfondita: 0,   molto_approfondita: 0 },
  dati_sicurezza:   { essenziale: 65,  approfondita: 140, molto_approfondita: 230 },
  comfort:          { essenziale: 90,  approfondita: 190, molto_approfondita: 320 },
  luoghi:           { essenziale: 60,  approfondita: 120, molto_approfondita: 200 },  // per luogo
  natura:           { essenziale: 100, approfondita: 200, molto_approfondita: 360 },
  sapori:           { essenziale: 80,  approfondita: 170, molto_approfondita: 280 },
  consigli:         { essenziale: 70,  approfondita: 170, molto_approfondita: 270 },
}

// Sezioni dove, a "Molto approfondita", è utile poter distendere la narrazione su più paragrafi
// tematici invece di un unico blocco — non "luoghi" (già strutturata per singolo luogo con ### ,
// vedi SYSTEM_CORE) né le sezioni pratiche/brevi per natura (prima_di_partire, dati_sicurezza,
// comfort, consigli), che restano un blocco unico anche al livello massimo: più ricche di dettaglio,
// non spezzettate.
const SECTIONS_ALLOWING_SUBPARAGRAPHS = new Set<GuideSectionKey>(['il_percorso', 'luoghi', 'natura', 'sapori'])

/** Istruzione aggiuntiva iniettata dopo SECTION_BRIEF[k] quando il livello non è 'essenziale' —
 *  vuota per 'essenziale' perché quel livello è il comportamento di sempre, non deve cambiare. */
function lengthGuidance(key: GuideSectionKey, level: GuideTextLength): string {
  if (level === 'essenziale') return ''
  const depth = level === 'approfondita'
    ? 'Aggiungi più contesto e dettagli concreti rispetto al minimo indispensabile, senza diventare prolissa o ripetitiva.'
    : 'Scrivi un racconto più ricco e disteso: più aneddoti, dettagli storici/tecnici e sfumature — sempre pertinenti, mai riempitivo solo per allungare il testo.'
  const structure = level === 'molto_approfondita' && SECTIONS_ALLOWING_SUBPARAGRAPHS.has(key)
    ? ' Se il contenuto lo giustifica, articola il testo in 2-3 paragrafi tematici distinti (separati da una riga vuota) invece di un unico blocco, ciascuno con un suo filo conduttore.'
    : ''
  return `\n${depth}${structure}`
}

// Tetti di sicurezza sul budget di output dinamico (vedi computeGuideMaxTokens) — mai sotto il
// pavimento (anche una sola sezione essenziale ha overhead fisso: titolo, eventuali tag
// epoca/curiosità). Il tetto superiore vorrebbe stare SOPRA la stima del caso peggiore
// reale (tutte le sezioni narrative insieme, tutte a "Molto approfondita" — vedi
// REFERENCE_WORD_TOTAL sotto, ~21000 token stimati), ma è vincolato dal piano Vercel Hobby di
// questo progetto: maxDuration qui sopra non può superare 300s, quindi il budget di output deve
// restare abbastanza contenuto da completare lo streaming entro quel tempo — 26000 (che avrebbe
// coperto anche il caso peggiore) richiedeva più margine di quanto 300s permettano. 18000 è un
// compromesso: resta ben sopra il vecchio tetto fisso di 6000 (quindi molto meno troncamento per
// le combinazioni comuni, poche sezioni alla volta), ma non garantisce più il caso limite di TUTTE
// le sezioni insieme a "Molto approfondita" — se anche quello va coperto, serve un piano Vercel con
// un maxDuration più alto, non solo alzare questo numero.
const GUIDE_MAX_TOKENS_FLOOR = 3200
const GUIDE_MAX_TOKENS_CEILING = 18000
// 6000 era il tetto fisso storico, calibrato per le 7 sezioni narrative insieme, tutte a
// 'essenziale' (l'unico livello che esisteva prima di questa opzione) — resta il punto di
// riferimento: il nuovo budget scala proporzionalmente a quanto la combinazione richiesta (sezioni
// × livello scelto) si discosta da quel caso di riferimento, invece di ripartire da zero con
// costanti di overhead inventate.
const REFERENCE_MAX_TOKENS = 6000
const REFERENCE_WORD_TOTAL = GUIDE_SECTIONS
  .map(s => s.key)
  .filter(k => k !== 'verificato')
  .reduce((sum, k) => sum + SECTION_WORD_CEILING[k].essenziale * (k === 'luoghi' ? MAX_WIKI_POIS_IN_PROMPT : 1), 0)

/** Budget di output per la chiamata narrativa, proporzionale a quante sezioni sono state richieste
 *  e a quanto lunghe (vedi REFERENCE_MAX_TOKENS/REFERENCE_WORD_TOTAL sopra), clampato tra
 *  GUIDE_MAX_TOKENS_FLOOR e GUIDE_MAX_TOKENS_CEILING. */
function computeGuideMaxTokens(sections: GuideSectionKey[], lengths: SectionLengthMap): number {
  const wordTotal = sections.reduce((sum, k) => {
    const perPlaceMultiplier = k === 'luoghi' ? MAX_WIKI_POIS_IN_PROMPT : 1
    return sum + SECTION_WORD_CEILING[k][lengths[k]] * perPlaceMultiplier
  }, 0)
  const scaled = Math.round(REFERENCE_MAX_TOKENS * (wordTotal / REFERENCE_WORD_TOTAL))
  return Math.min(GUIDE_MAX_TOKENS_CEILING, Math.max(GUIDE_MAX_TOKENS_FLOOR, scaled))
}

/** Contenuto (istruzioni + intestazione) per una singola sezione dello scheletro. */
const SECTION_BRIEF: Record<GuideSectionKey, string> = {
  prima_di_partire: `## Prima di partire
Consigli pratici: equipaggiamento, abbigliamento, cosa mettere nello zaino, orario ideale di partenza.
Sii specifica rispetto alla stagione ideale, al tipo di terreno, all'acqua disponibile lungo il percorso.`,
  il_percorso: `## Il percorso
Narrazione vivace del tracciato dall'inizio alla fine. Descrivi l'atmosfera, i panorami, i cambi di paesaggio,
i momenti più belli. Dai l'idea di cosa si prova davvero a camminare lì.`,
  verificato: '', // non usato — vedi commento su SECTION_LENGTH
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
contatti utili (soccorso alpino, rifugi). Non nominare app specifiche (vale come per ogni altra sezione,
vedi istruzione generale più sopra): se serve, parla genericamente di "un'app di navigazione".`,
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
  nature: NatureContext | undefined,
  /** Sezioni richieste in QUESTA chiamata, già filtrate/valide — una sola (dal pulsante
   *  "Approfondisci con Giulia" su una sezione) o più insieme (generazione automatica iniziale,
   *  o il pulsante "Genera il resto della guida"). */
  sections: GuideSectionKey[],
  scores: DataScores,
  /** true quando questo percorso non ha ancora nessuna sezione scritta — cambia solo la frase di
   *  apertura del prompt (vedi sotto); il sottotitolo di copertina è pilotato separatamente lato
   *  SYSTEM_SUBTITLE, non da qui. */
  isFirstGeneration: boolean,
  /** Profilo + storico dell'escursionista (lib/hikerProfile.ts + lib/hikerHistory.ts), già
   *  formattato — solo per la sezione 'comfort' ("Su misura per te"), undefined quando quella
   *  sezione non viene scritta in questa richiesta (risparmia la lettura Supabase altrimenti). */
  comfortContext?: string,
  /** Lunghezza scelta per ciascuna sezione (default utente, sovrascrivibile per questa singola
   *  generazione — vedi requestedSectionLengths in generateGuide). Sempre completa. */
  sectionLengths: SectionLengthMap = sanitizeSectionLengths(undefined),
): string {
  const wiki = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const raw  = (hike.cachedPois   ?? []) as PoiItem[]

  // Un tetto qui non è solo per limitare il prompt in ingresso: la sezione "I luoghi da non
  // perdere" tratta OGNI luogo di questo elenco (vedi SYSTEM_CORE), quindi un tracciato con molti
  // POI Wikipedia poteva far sforare
  // max_tokens a metà di quella sezione, troncando tutte le sezioni successive — mai una
  // limitazione voluta, solo un elenco senza tetto. Gli 8 più vicini al percorso restano comunque
  // i più pertinenti (wiki arriva già ordinato per distanza dalla traccia).
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

  // Ordine canonico (GUIDE_SECTIONS), non l'ordine in cui il chiamante le ha elencate — così
  // l'output arriva già nell'ordine giusto indipendentemente da come è stata costruita la richiesta.
  // "verificato" esclusa sempre: non è mai narrata da questo prompt, vedi SECTION_LENGTH_BY_LEVEL
  // sopra — il chiamante (generateGuide) dovrebbe già filtrarla, questa è solo una difesa in più.
  const sectionsToWrite = GUIDE_SECTIONS.map(s => s.key).filter(k => k !== 'verificato' && sections.includes(k))

  const sectionsBlock = sectionsToWrite
    .map(k => {
      const level = sectionLengths[k]
      return `${SECTION_BRIEF[k]}${lengthGuidance(k, level)}\n(LUNGHEZZA per questa sezione: ${SECTION_LENGTH_BY_LEVEL[k][level]})`
    })
    .join('\n\n')
  const sectionTitles = sectionsToWrite.map(k => GUIDE_SECTIONS.find(s => s.key === k)!.title).join(', ')

  return `${isFirstGeneration
    ? `Crea una guida escursionistica per questo percorso, analizzando tutti i dati disponibili qui sotto:`
    : `Scrivi una o più sezioni, finora senza testo, di una guida escursionistica già esistente per questo percorso (le altre sezioni sono già scritte e non vanno toccate), analizzando tutti i dati disponibili qui sotto:`}

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

// Il tag [fonti] deve elencare SEMPRE tutte le pagine consultate durante la ricerca (vedi
// SYSTEM_VERIFICATO sotto) — con più fonti trovate (URL lunghi + titoli, in JSON) il tetto da 1000
// bastava a troncare il blocco a metà, senza mai arrivare al tag di chiusura [/fonti]: senza quel
// tag, extractGuideSources (lib/guideSources.ts) non trova alcun match e lascia l'intero JSON
// grezzo visibile in pagina — non un problema di regex, ma di budget insufficiente per contenuto
// che varia in lunghezza col numero di fonti trovate. 3000 lascia margine ampio anche con molte
// fonti, restando comunque ben sotto la soglia (~16000) oltre la quale una richiesta non in
// streaming come questa (client.messages.create, non .stream) rischierebbe timeout HTTP.
const VERIFICATO_MAX_TOKENS = 3000

/**
 * Chiamata DEDICATA per la sezione "Verificato online" — separata dalla generazione narrativa
 * principale (vedi SYSTEM_VERIFICATO per i motivi: niente cache_control + web_search insieme, esito
 * sempre affidabile invece che opportunistico). Non streaming (client.messages.create, non .stream):
 * l'output è breve e delimitato, non serve un'anteprima progressiva token-per-token. Lanciata IN
 * PARALLELO alla generazione narrativa da generateGuide (nessuna dipendenza tra le due: "Il
 * percorso" è tornata pura narrazione, non ha più bisogno dell'esito di questa ricerca).
 * Ritorna null (mai un'eccezione) su qualunque fallimento — un errore qui non deve mai far fallire
 * l'intera generazione della guida, solo lasciare questa sezione vuota per un prossimo tentativo.
 */
async function generateVerificatoText(
  hikeTitle: string, zona: string | null, claudeModel: string, apiKey: string,
): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey })
    const todayStr = format(new Date(), "d MMMM yyyy", { locale: it })
    const zonaLine = zona ? `Zona (comune/provincia/regione più vicini al punto di partenza): ${zona}` : 'Zona: non nota'
    const msg = await client.messages.create({
      model:      claudeModel,
      max_tokens: VERIFICATO_MAX_TOKENS,
      system:     SYSTEM_VERIFICATO,
      messages:   [{
        role: 'user',
        content: `Percorso: ${hikeTitle}\n${zonaLine}\nData odierna: ${todayStr}\n\nVerifica online lo stato di questo percorso e scrivi la sezione "## Verificato online" come da istruzioni.`,
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    })
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
    if (msg.stop_reason === 'max_tokens') {
      console.error('[guide] generazione "Verificato online" troncata per max_tokens')
    }
    // Difesa in profondità, indipendente dal budget: se il tag [fonti] risulta aperto ma non
    // chiuso (troncamento, o una qualunque altra causa), il JSON grezzo e incompleto non deve MAI
    // arrivare all'utente — extractGuideSources (lib/guideSources.ts) richiede comunque il tag di
    // chiusura per estrarlo, quindi senza questo taglio resterebbe visibile inalterato in pagina.
    // Perdere la lista fonti di questa singola generazione (si riottiene al prossimo tentativo) è
    // sempre preferibile a mostrare testo illeggibile.
    const fontiOpenIdx = text.indexOf('[fonti]')
    const hasUnclosedFonti = fontiOpenIdx !== -1 && !text.slice(fontiOpenIdx).includes('[/fonti]')
    const safeText = hasUnclosedFonti ? text.slice(0, fontiOpenIdx).trimEnd() : text
    return safeText || null
  } catch (e) {
    console.error('[guide] generazione "Verificato online" fallita:', e)
    return null
  }
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
    ? await resolveApiKeyAndSettings(user.id, 'guide')
    : await resolveEmergencySharedKey('guide')
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

  const { apiKey, userGender, breveSections, claudeModel, aiUseBiometricData, aiUseHistoryData, aiUseWebSearch, sectionLengths, lookupFailed } = user
    ? await resolveApiKeyAndSettings(user.id, 'guide')
    : await resolveEmergencySharedKey('guide')

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
  let hikeFallback: GuideHikeFallback | undefined
  // Sezioni richieste esplicitamente dal client — dal pulsante "Approfondisci con Giulia" su una
  // sola sezione, o da "Genera il resto della guida" su tutte quelle ancora mancanti. Se il client
  // non ne manda (generazione automatica alla prima apertura del percorso), si usano le sezioni
  // Breve scelte dall'utente in Impostazioni (breveSections) — stesso comportamento di sempre.
  let requestedSections: GuideSectionKey[] = []
  // Override della lunghezza per QUESTA generazione (dal selettore accanto ad "Approfondisci con
  // Giulia" / "Genera il resto della guida") — solo le sezioni esplicitamente cambiate lì, non
  // un'intera mappa: quelle assenti restano al valore salvato in Impostazioni (sectionLengths).
  const sectionLengthOverrides: Partial<SectionLengthMap> = {}
  try {
    const body = await req.json()
    hikeId = body.hikeId
    if (!hikeId) throw new Error('hikeId mancante')
    hikeFallback = body.hikeFallback && typeof body.hikeFallback === 'object' ? body.hikeFallback : undefined
    if (Array.isArray(body.sections)) requestedSections = body.sections.filter(isGuideSectionKey)
    if (body.sectionLengths && typeof body.sectionLengths === 'object') {
      for (const [k, v] of Object.entries(body.sectionLengths as Record<string, unknown>)) {
        if (isGuideSectionKey(k) && isGuideTextLength(v)) sectionLengthOverrides[k] = v
      }
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // clampMoltoApprofondita è una difesa lato server, non il meccanismo primario — l'UI (Impostazioni
  // e override per singola guida) impedisce già di superare MAX_MOLTO_APPROFONDITA_SECTIONS, ma una
  // richiesta diretta all'API (o un client non aggiornato) potrebbe comunque bypassarla.
  const effectiveSectionLengths: SectionLengthMap = clampMoltoApprofondita({ ...sectionLengths, ...sectionLengthOverrides })

  const sectionKeys = requestedSections.length > 0 ? requestedSections : breveSections
  if (sectionKeys.length === 0) {
    return new Response(JSON.stringify({ error: 'Nessuna sezione da generare' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Rete di sicurezza economica contro click ripetuti in sequenza su "Approfondisci con Giulia" /
  // "Genera il resto della guida" — vedi lib/aiCooldown.ts. Per percorso (hikeId), non per utente:
  // ogni riga planned_hikes appartiene già a un solo utente, quindi coincide con lo stesso effetto.
  if (!(await tryAcquireCooldown('guide', hikeId))) {
    return new Response(
      JSON.stringify({
        error:   'cooldown',
        message: 'Hai appena generato o aggiornato questa guida — aspetta qualche secondo prima di richiederla di nuovo.',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Va letta solo quando la sezione 'comfort' ("Su misura per te") è davvero tra quelle richieste
  // in questa generazione — evita una lettura Supabase in più su ogni altra chiamata. Rispetta
  // anche il consenso dell'utente all'uso dello storico nei prompt AI (vedi
  // components/profilo/SectionAiPrivacy.tsx) — a consenso negato la sezione viene comunque scritta,
  // solo senza il confronto personalizzato con storico/profilo dichiarato.
  const needsComfortSection = sectionKeys.includes('comfort')
  const comfortContext = needsComfortSection && user && aiUseHistoryData ? await buildComfortContext(user.id) : undefined

  let hike: PlannedHike
  let scores: DataScores
  let s2: Parameters<typeof fetchNatureContext>[0]['s2']
  let trackPoints: TrackPoint[]
  // Testo/epoche già esistenti su cui fondere il risultato di un "Approfondisci" per
  // sezione (vedi persistenza più sotto) — vuoti quando non è una richiesta di quel tipo, o quando
  // non c'è nulla da leggere (degraded/hikeFallback non porta questi campi, vedi GuideHikeFallback).
  let existingGuideText = ''
  let existingEpochPois: PlannedHike['cachedEpochPois'] = []
  // Riportati invariati nell'update quando questa chiamata non include/completa con successo
  // "Verificato online" (unica sezione che li scrive/riscrive, vedi SYSTEM_VERIFICATO) — senza
  // questi, un update senza quella sezione sovrascriverebbe avvisi/fonti già salvati con un vuoto.
  let existingGuideNotices: GuideNotice[] = []
  let existingGuideSources: GuideSource[] = []

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
      // existingGuideText/existingEpochPois restano vuoti (già inizializzati sopra) — non c'è
      // nulla da leggere finché la riga non esiste ancora.
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
      existingEpochPois = data.cached_epoch_pois ?? []
      existingGuideNotices = data.cached_guide_notices ?? []
      existingGuideSources = data.cached_guide_sources ?? []
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

  const isFirstGeneration = !existingGuideText
  // "verificato" non è mai narrata dalla chiamata principale (buildPrompt la filtra comunque, vedi
  // sopra) — generata da generateVerificatoText, lanciata IN PARALLELO qui sotto perché non ha
  // nessuna dipendenza dalla narrazione (né viceversa): "Il percorso" è tornata pura narrazione,
  // non scrive più avvisi/fonti. Il consenso dell'utente (SectionAiPrivacy.tsx) la disattiva del
  // tutto, indipendentemente da cosa è stato richiesto.
  const needsVerificato = sectionKeys.includes('verificato') && aiUseWebSearch
  const narrativeSectionKeys = sectionKeys.filter(k => k !== 'verificato')

  const client = new Anthropic({ apiKey })
  // Comune/provincia/regione del punto di partenza: passati a generateVerificatoText come ancoraggio
  // geografico esplicito (vedi SYSTEM_VERIFICATO) — un nome di sentiero da solo non basta a
  // distinguerlo da un omonimo altrove in Italia, ed è esattamente il tipo di scambio di
  // percorso osservato in produzione. Nominatim è pubblico/gratuito ma può fallire o essere
  // lento: null in quel caso, generateVerificatoText prosegue comunque senza l'ancoraggio
  // invece di bloccare la generazione per questo.
  const startPoint = trackPoints.find(p => p.lat != null && p.lon != null)
  const verificatoPromise = needsVerificato
    ? (async () => {
        const comune = startPoint ? await resolveComuneFromLatLon(startPoint.lat!, startPoint.lon!) : null
        return generateVerificatoText(hike.title, comune, claudeModel, apiKey)
      })()
    : Promise.resolve(null)

  // Caso "Approfondisci con Giulia" premuto solo su "Verificato online": nessuna narrazione da
  // generare in questa chiamata, solo l'esito della ricerca — un percorso più leggero rispetto a
  // quello sotto, che riusa la stessa pipeline di estrazione/salvataggio ma senza stream/epoch/
  // sottotitolo (non pertinenti per questa sola sezione).
  if (narrativeSectionKeys.length === 0) {
    const readableOnly = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const verificatoText = await verificatoPromise
        try { if (verificatoText) controller.enqueue(enc.encode(verificatoText)) } catch {}
        try { controller.close() } catch {}

        if (user && verificatoText) {
          try {
            const rn = extractGuideNotices(verificatoText)
            const rs = extractGuideSources(rn.cleanedText)
            const foundImages = await findAllSourceImages(rs.sources.map(s => s.url)).catch(() => [])
            const imageByUrl = new Map(foundImages.map(f => [f.url, f.imageUrl]))
            const sourcesList = rs.sources.map(s => (imageByUrl.has(s.url) ? { ...s, imageUrl: imageByUrl.get(s.url) } : s))
            const parsedVerificato = parseGuideSections(rs.cleanedText)[0]
            if (parsedVerificato?.key) {
              const mergedText = mergeGuideSection(existingGuideText, parsedVerificato.key, parsedVerificato.title, parsedVerificato.body)
              const { error: persistError } = await supabase.from('planned_hikes').update({
                cached_guide: mergedText,
                cached_guide_notices: rn.notices,
                cached_guide_sources: sourcesList,
                guide_generated_at: new Date().toISOString(),
              }).eq('id', hikeId).eq('user_id', user.id)
              if (persistError) console.error('[guide] server-side persist (solo Verificato online) failed:', persistError.message)
            }
          } catch (e) {
            console.error('[guide] server-side persist (solo Verificato online) failed:', e)
          }
        }
      },
    })
    return new Response(readableOnly, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
    })
  }

  const prompt = buildPrompt(hike, nature, narrativeSectionKeys, scores, isFirstGeneration, comfortContext, effectiveSectionLengths)

  // SYSTEM_CORE (+ SYSTEM_SUBTITLE quando applicabile) è testo fisso, identico per ogni utente e
  // ogni percorso nella stessa combinazione (~1700-1900 token) — niente cache_control (rimosso
  // deliberatamente, non dimenticato): con una chiave personale generare una guida è un'azione rara,
  // improbabile che rilegga lo stesso prefisso entro la finestra di 5 minuti/1 ora della cache — il
  // 25% di sovrapprezzo di scrittura (pochi millesimi di centesimo qui) non vale il rischio residuo.
  // Questa chiamata non fa mai ricerca web (vedi SYSTEM_VERIFICATO/generateVerificatoText sopra per
  // quella, isolata apposta in una chiamata separata).
  const systemText = SYSTEM_CORE + (isFirstGeneration ? SYSTEM_SUBTITLE : '')
  const system = [
    { type: 'text' as const, text: systemText },
    // Il genere è un dato biometrico/anagrafico — rispetta il consenso dell'utente (vedi
    // components/profilo/SectionAiPrivacy.tsx), tornando alla formulazione neutra quando negato.
    { type: 'text' as const, text: genderInstruction(aiUseBiometricData ? userGender : 'non_specificato') },
  ]

  const stream = client.messages.stream({
    model:      claudeModel,
    max_tokens: computeGuideMaxTokens(narrativeSectionKeys, effectiveSectionLengths),
    system,
    messages:   [{ role: 'user', content: prompt }],
  })

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
      // Segnala subito che la ricerca "Verificato online" è in corso in parallelo — non arriverà
      // char-per-char (client.messages.create, non stream), solo un pop-in a fine narrazione, ma
      // così l'utente sa che sta succedendo qualcosa anche prima che compaia.
      if (needsVerificato) safeEnqueue('[stato]Sto verificando lo stato del percorso online…[/stato]')
      let fullText = ''
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullText += event.delta.text
            safeEnqueue(event.delta.text)
          }
        }

        // Rileva un troncamento per esaurimento token: senza questo controllo, una guida tagliata
        // a metà sezione (o a metà di un tag [epoca], scartato in silenzio dal parsing perché mai
        // chiuso — vedi lib/epochPois.ts) passava inosservata, sia lato log che per l'utente, che
        // vedeva semplicemente sparire le ultime sezioni.
        const finalMessage = await stream.finalMessage().catch(() => null)
        if (finalMessage?.stop_reason === 'max_tokens') {
          console.error(`[guide] generazione troncata per max_tokens (hikeId=${hikeId}, sections=${narrativeSectionKeys.join(',')})`)
        }

        // Il risultato della ricerca (kickata in parallelo, prima di questo stream) è quasi sempre
        // già pronto a questo punto — l'attesa qui è solo per il caso raro in cui sia più lenta
        // della narrazione. null quando disattivata dall'utente O quando la ricerca è fallita
        // (vedi generateVerificatoText): in quel caso non si tocca affatto la sezione, notices/
        // fonti esistenti restano quelle già salvate in precedenza (mai sovrascritte con un vuoto).
        const verificatoText = needsVerificato ? await verificatoPromise : null
        if (verificatoText) {
          const chunk = '\n\n' + verificatoText
          fullText += chunk
          safeEnqueue(chunk)
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

            // Pipeline unica sia per la primissima generazione sia per l'aggiunta di sezioni a una
            // guida già esistente — [sottotitolo] viene estratto solo se questa era la prima
            // generazione (isFirstGeneration, coerente con SYSTEM_SUBTITLE sopra), [avviso]/[fonti]
            // solo se la ricerca "Verificato online" è riuscita in QUESTA chiamata (verificatoText
            // non nullo): per ogni altro caso semplicemente non compaiono nel testo, quindi
            // extract* su di essi tornerebbe comunque vuoto — la guardia esiste solo per non
            // SOVRASCRIVERE con un elenco vuoto un sottotitolo/avvisi/fonti già salvati prima.
            const step1 = stripGuideStatus(fullText).cleanedText
            let step2 = step1
            let subtitle: string | undefined
            if (isFirstGeneration) {
              const r = extractCoverSubtitle(step1)
              subtitle = r.subtitle
              step2 = r.cleanedText
            }
            let step3 = step2
            let notices = existingGuideNotices
            let sourcesList = existingGuideSources
            if (verificatoText) {
              const rn = extractGuideNotices(step2)
              notices = rn.notices
              const rs = extractGuideSources(rn.cleanedText)
              step3 = rs.cleanedText
              // Foto di riferimento del percorso, per ogni fonte auto-riportata da Giulia che ne
              // espone una pubblicamente (meta tag og:image, vedi lib/sourceImageFetch.ts) — mai
              // sui domini che non la mostrerebbero comunque (Komoot/AllTrails/Wikiloc).
              const foundImages = await findAllSourceImages(rs.sources.map(s => s.url)).catch(() => [])
              const imageByUrl = new Map(foundImages.map(f => [f.url, f.imageUrl]))
              sourcesList = rs.sources.map(s => (imageByUrl.has(s.url) ? { ...s, imageUrl: imageByUrl.get(s.url) } : s))
            }
            const { epochPois, cleanedText: step4 } = extractEpochPois(step3, cachedPoisArr, cachedPoiWikiArr)
            const firstHeadingIdx = step4.search(/^## /m)
            const cleaned = firstHeadingIdx > 0 ? step4.slice(firstHeadingIdx) : step4

            const parsedNew = parseGuideSections(cleaned)
            if (parsedNew.every(s => !s.key)) throw new Error('nessuna sezione riconosciuta nella risposta')
            let mergedText = existingGuideText
            for (const sec of parsedNew) {
              if (!sec.key) continue
              mergedText = mergeGuideSection(mergedText, sec.key, sec.title, sec.body)
            }

            // Le epoche sono legate solo alla sezione "luoghi": rigenerandola le vecchie sono da
            // sostituire, non accumulare; per ogni altra combinazione di sezioni restano
            // semplicemente quelle già esistenti, invariate.
            const mergedEpochPois = sectionKeys.includes('luoghi') ? epochPois : existingEpochPois

            const updateData: Record<string, unknown> = {
              cached_guide: mergedText,
              cached_guide_notices: notices,
              cached_guide_sources: sourcesList,
              cached_epoch_pois: mergedEpochPois,
              guide_tier: 'breve',
              guide_generated_at: new Date().toISOString(),
            }
            if (isFirstGeneration) updateData.cached_guide_subtitle = subtitle ?? null

            const { error: persistError } = await supabase.from('planned_hikes').update(updateData).eq('id', hikeId).eq('user_id', user.id)
            if (persistError) console.error('[guide] server-side persist failed:', persistError.message)
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
    },
  })
}
