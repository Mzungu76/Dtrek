import type { MetaType, SiteType } from './metaTypes'

// Blocco E (piano §30) — equivalente di lib/guideProfiles.ts ma per il Reportage
// (app/api/resoconto/route.ts): a differenza della Guida, il Reportage ha uno scheletro
// prevalentemente fisso — 3 sezioni per Sentiero/Sito (+ "Cronaca" opzionale, guidata dal
// questionario, non dalla tipologia), 4 per Borgo/Città (sessione conversazionale: "Sapori e
// tradizioni" al posto di "Natura e storia", rimossa perché non pertinente per un centro abitato).
//
// Fino a una prima iterazione il profilo cambiava SOLO la prima sezione ("Il percorso"/"Il
// borgo"/"Il sito") — le altre restavano scritte in un linguaggio pensato per un sentiero ("Natura
// e storia": geologia/flora/fauna "nelle vicinanze", presuppone un territorio attraversato; "In
// sintesi": "difficoltà effettiva", non pertinente per una visita) anche per un Borgo/Sito. Ora
// ogni sezione è profilata.

export interface ReportProfile {
  metaType: MetaType
  hikingMetrics: boolean
  sectionTitle: string
  sectionBrief: string
  section2Title: string
  section2Brief: string
  /** Solo per borgo_citta (sessione conversazionale) — sezione narrativa in più su gastronomia
   *  locale/tradizioni, al posto di "Natura e storia" (rimossa per Borgo/Città: non ha senso
   *  raccontare geologia/flora/fauna di un centro abitato). Assente per sentiero/sito: il loro
   *  schema resta a 3 sezioni fisse, mai 4 per omologazione. */
  saporiTitle?: string
  saporiBrief?: string
  section3Title: string
  section3Brief: string
  personaAddendum?: string
}

const IN_SINTESI_SENTIERO = `Valutazione complessiva: difficoltà effettiva, qualità del contesto, periodo ideale,
consigli pratici. Una o due frasi conclusive che catturino l'essenza dell'esperienza.`

const IN_SINTESI_VISITA = `Valutazione complessiva della visita: atmosfera, periodo ideale, consigli pratici per chi
ci andrà dopo (tempo da dedicarci, cosa non perdere). Una o due frasi conclusive che catturino
l'essenza dell'esperienza — mai una valutazione di sforzo fisico o di quanto sia impegnativa,
non pertinente per questa tipologia.`

export const REPORT_PROFILES: Record<MetaType, ReportProfile> = {
  sentiero: {
    metaType: 'sentiero',
    hikingMetrics: true,
    sectionTitle: 'Il percorso',
    sectionBrief: `Descrivi il tracciato e il territorio attraversato: paesaggio, morfologia del terreno,
punti panoramici, cambi di vegetazione. Contestualizza geograficamente il percorso
senza usare toni enfatici. Usa i dati di distanza, dislivello e quota come ancoraggio.`,
    section2Title: 'Natura e storia',
    section2Brief: `Approfondisci i luoghi attraversati: geologia, flora, fauna, siti storici o
archeologici nelle vicinanze, tradizioni locali. Includi almeno un fatto poco noto
che arricchisca la conoscenza del territorio.`,
    section3Title: 'In sintesi',
    section3Brief: IN_SINTESI_SENTIERO,
  },
  borgo_citta: {
    metaType: 'borgo_citta',
    hikingMetrics: false,
    sectionTitle: 'Il borgo',
    sectionBrief: `Descrivi il centro storico esplorato: atmosfera, architettura, scorci, vicoli e piazze,
il cambio di paesaggio da un quartiere all'altro. Contestualizza geograficamente il luogo senza usare
toni enfatici.`,
    section2Title: 'Storia e curiosità',
    section2Brief: `Approfondisci la storia del borgo o della città: origini, personaggi legati al luogo,
tradizioni ed eventi locali, aneddoti poco noti, il modo in cui il centro storico è cambiato nel
tempo. Includi almeno un fatto poco noto che arricchisca la conoscenza del luogo — niente geologia,
flora o fauna "lungo il percorso": qui il protagonista è il centro abitato, non il territorio
attraversato.`,
    saporiTitle: 'Sapori e tradizioni',
    saporiBrief: `Racconta cosa si è mangiato o assaggiato durante la visita, se emerge dalle foto o
dalle note dell'escursionista — un piatto tipico, un prodotto locale, un vino della zona, una
bottega o un mercato incontrato per strada. Se non c'è alcun indizio di soste gastronomiche,
descrivi comunque la tradizione gastronomica del luogo (piatti tipici, vini, prodotti tipici) come
contesto culturale, senza inventare che l'escursionista li abbia provati.`,
    section3Title: 'In sintesi',
    section3Brief: IN_SINTESI_VISITA,
    personaAddendum: `\n\nQuesta Meta è un borgo o una città visitata a piedi, NON un'escursione: non
parlare mai di distanza percorsa, dislivello, quota o passo — questi dati non esistono per questa
tipologia. Concentrati su storia, architettura, atmosfera del centro storico e vita quotidiana del
luogo.`,
  },
  cammino: {
    metaType: 'cammino',
    hikingMetrics: true,
    sectionTitle: 'Il cammino',
    sectionBrief: `Racconta il cammino percorso, tappa dopo tappa: i paesaggi attraversati, i paesi di sosta,
il ritmo delle giornate. Usa i dati di distanza e dislivello (per tappa e totali) come ancoraggio,
senza toni enfatici.`,
    section2Title: 'Storia e incontri',
    section2Brief: `Approfondisci la storia e il significato del cammino e dei luoghi attraversati,
le persone e gli incontri lungo la strada se emergono dalle note. Includi almeno un fatto poco
noto — mai alloggi o servizi non presenti nei dati.`,
    section3Title: 'In sintesi',
    section3Brief: IN_SINTESI_SENTIERO,
    personaAddendum: `\n\nQuesta Meta è un cammino a tappe di più giorni: organizza il racconto per
giornate di marcia e non inventare mai tappe, alloggi o servizi che non compaiono nei dati.`,
  },
  sito: {
    metaType: 'sito',
    hikingMetrics: false,
    sectionTitle: 'Il sito',
    sectionBrief: `Descrivi il luogo visitato: storia, architettura, atmosfera, cosa colpisce di più a chi
lo vede di persona. Contestualizza geograficamente il luogo senza usare toni enfatici.`,
    section2Title: 'Storia e curiosità',
    section2Brief: `Approfondisci la storia del luogo: origini, personaggi legati ad esso, eventi
significativi, aneddoti poco noti. Includi almeno un fatto poco noto che arricchisca la conoscenza
del luogo — niente geologia, flora o fauna "nelle vicinanze": qui il protagonista è il luogo stesso,
non il territorio circostante.`,
    section3Title: 'In sintesi',
    section3Brief: IN_SINTESI_VISITA,
    personaAddendum: `\n\nQuesta Meta è un museo, un castello, un sito archeologico o un altro luogo
puntuale visitato, NON un'escursione: non parlare mai di distanza percorsa, dislivello, quota o passo
— questi dati non esistono per questa tipologia. Concentrati su storia, architettura, curiosità e cosa
si è visto durante la visita.`,
  },
}

// ── Override per siteType (solo sectionTitle/sectionBrief della prima sezione) ─────────────────
//
// Stesso principio di lib/guideProfiles.ts's SITE_TYPE_OVERRIDES, ma in chiave di reportage: la
// Guida racconta cosa ASPETTARSI prima di partire, il Reportage cosa si è VISTO durante la visita
// — stesso argomento per ciascun siteType, tono retrospettivo invece che introduttivo. Anche la
// seconda e la terza sezione sono proprie del tipo (non più "Storia e curiosità"/"In sintesi"
// identiche per ogni sito). Il profilo 'sito' generico sopra resta per 'altro':
// già scritte in modo abbastanza aperto da restare pertinenti per qualunque sottotipo. 'altro' non
// ha un override proprio: resta "Il sito" generico, corretto per un luogo che non rientra in
// nessuna delle categorie note.
interface SiteTypeReportOverride {
  sectionTitle: string
  sectionBrief: string
  /** Seconda e terza sezione proprie del tipo (prima erano "Storia e curiosità"/"In sintesi" per
   *  ogni sito, cioè la stessa ossatura di un percorso con altri titoli): un museo racconta le
   *  opere e le sale, una cascata l'ambiente e la stagione, una chiesa l'arte e i simboli. */
  section2Title: string
  section2Brief: string
  section3Title: string
  section3Brief: string
}

const SITE_TYPE_REPORT_OVERRIDES: Partial<Record<SiteType, SiteTypeReportOverride>> = {
  museo: {
    sectionTitle: 'Il museo',
    sectionBrief: `Racconta la visita: le sale percorse, l'allestimento, l'atmosfera, eventuali sorprese
rispetto alle aspettative.`,
    section2Title: 'Le opere e le sale',
    section2Brief: `Racconta le opere e gli ambienti che hanno colpito di più: artisti e periodi rappresentati,
un pezzo da non perdere, un dettaglio notato da vicino. Includi almeno un fatto poco noto sulla collezione
o sul museo — niente geologia, flora o fauna, e nessun riferimento a un percorso da camminare.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche per chi ci andrà dopo: tempo da dedicarci, orari o momenti meno
affollati, biglietti e prenotazioni se emergono, cosa non perdere se si ha poco tempo. Chiudi con una o
due frasi che catturino l'essenza della visita.`,
  },
  castello: {
    sectionTitle: 'Il castello',
    sectionBrief: `Racconta la visita: l'arrivo e la sagoma del castello, gli ambienti visitati, i dettagli
architettonici notati di persona, il panorama goduto dall'alto se presente.`,
    section2Title: 'Storia e architettura',
    section2Brief: `Approfondisci le vicende del castello: chi lo costruì e perché, assedi e trasformazioni, i
personaggi legati alle sue mura, le fasi costruttive riconoscibili. Includi almeno un aneddoto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche per chi ci andrà dopo: tempo da dedicarci, scale e accessibilità,
punti panoramici migliori, stagione e ora ideali. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  abbazia: {
    sectionTitle: "L'abbazia",
    sectionBrief: `Racconta la visita: gli ambienti visitati (chiostro, chiesa, biblioteca), l'atmosfera di
raccoglimento percepita, l'eventuale vita monastica osservata.`,
    section2Title: 'Storia e vita monastica',
    section2Brief: `Approfondisci la storia dell'abbazia: fondazione, ordine religioso, periodi di splendore e
declino, le opere d'arte e i manoscritti custoditi. Includi almeno un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: orari delle visite e delle funzioni, rispetto degli spazi di culto,
tempo da dedicarci. Chiudi con una o due frasi sull'atmosfera del luogo.`,
  },
  chiesa: {
    sectionTitle: 'La chiesa',
    sectionBrief: `Racconta la visita: l'esterno, l'ingresso, la prima impressione dell'interno, gli spazi
visti con calma.`,
    section2Title: 'Arte e simboli',
    section2Brief: `Racconta lo stile architettonico, le opere d'arte e gli affreschi visti di persona, i
simboli e i dettagli iconografici che hanno colpito (facciata, campanile, cripta, altari). Includi almeno
un fatto poco noto sulla storia della chiesa.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: orari di apertura, luce migliore per vedere gli affreschi,
rispetto durante le funzioni. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  sito_archeologico: {
    sectionTitle: 'Il sito archeologico',
    sectionBrief: `Racconta la visita: cosa resta visibile oggi, come si presentava al momento della visita,
l'impressione suscitata dal camminare tra i resti.`,
    section2Title: 'Cosa racconta il luogo',
    section2Brief: `Ricostruisci la storia del sito: chi lo abitò, in quale epoca, a cosa servivano gli
ambienti visibili, scavi e scoperte. Distingui ciò che è documentato da ciò che si ipotizza. Includi almeno
un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: percorso di visita, pannelli e guide disponibili, ombra e acqua,
stagione e ora ideali, eventuale museo annesso. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  monumento: {
    sectionTitle: 'Il monumento',
    sectionBrief: `Racconta la visita: cosa commemora o rappresenta, i dettagli scultorei o architettonici
notati da vicino, il contesto urbano in cui si trova.`,
    section2Title: 'Storia e significato',
    section2Brief: `Approfondisci perché fu eretto, da chi, in quale occasione e cosa rappresenta oggi per la
comunità. Includi almeno un aneddoto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: momento e luce migliori, cosa vedere lì attorno, tempo necessario.
Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  palazzo: {
    sectionTitle: 'Il palazzo',
    sectionBrief: `Racconta la visita: la facciata, i saloni e le stanze visitate, l'impressione suscitata
dallo stile e dagli arredi.`,
    section2Title: 'Storia e collezioni',
    section2Brief: `Approfondisci le famiglie e le vicende legate al palazzo, le opere e gli arredi custoditi,
le trasformazioni nel tempo. Includi almeno un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: visite guidate o libere, tempo da dedicarci, cosa non perdere.
Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  teatro: {
    sectionTitle: 'Il teatro',
    sectionBrief: `Racconta la visita: la sala e il palcoscenico visti di persona, lo stile architettonico,
l'acustica se sperimentata, un eventuale spettacolo assistito.`,
    section2Title: 'Storia e stagioni',
    section2Brief: `Approfondisci la storia del teatro: inaugurazione, grandi nomi e spettacoli, restauri, la
vita culturale che lo anima oggi. Includi almeno un aneddoto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: visite guidate o biglietti per gli spettacoli, posti migliori,
come vestirsi. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  cascata: {
    sectionTitle: 'La cascata',
    sectionBrief: `Racconta la visita: come si presentava (portata d'acqua, stagione), i punti da cui è stata
ammirata, l'impressione suscitata dal salto d'acqua.`,
    section2Title: "L'ambiente e la stagione",
    section2Brief: `Descrivi l'ambiente naturale che circonda la cascata: roccia, vegetazione, fauna, il
corso d'acqua che la alimenta e come cambia con le stagioni. Includi almeno un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: periodo con più acqua, sentiero d'accesso e calzature, sicurezza
vicino all'acqua, eventuali divieti. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  grotta: {
    sectionTitle: 'La grotta',
    sectionBrief: `Racconta la visita: l'ingresso, le formazioni viste (stalattiti, stalagmiti), il microclima
percepito, i punti di maggior suggestione.`,
    section2Title: 'Formazione e scoperta',
    section2Brief: `Spiega come si è formata la grotta, quando e da chi fu scoperta o esplorata, cosa vi vive
o vi è stato trovato. Includi almeno un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: visite guidate, temperatura interna e abbigliamento, prenotazione,
accessibilità. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  belvedere: {
    sectionTitle: 'Il belvedere',
    sectionBrief: `Racconta la visita: come si arriva al punto, cosa si vedeva (vette, valli, coste
riconoscibili), le condizioni di visibilità del momento.`,
    section2Title: 'Cosa si vede',
    section2Brief: `Racconta il panorama: i luoghi e le cime riconoscibili, il rapporto tra paesaggio e storia
del territorio, la luce a quell'ora. Includi almeno un fatto poco noto sul posto o su ciò che si scorge.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: ora e stagione migliori per la luce, tempo necessario, servizi
vicini, vento e sicurezza. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
  area_naturale: {
    sectionTitle: "L'area naturale",
    sectionBrief: `Racconta la visita: l'ambiente e l'ecosistema osservati, l'itinerario interno seguito.`,
    section2Title: 'Natura e tutela',
    section2Brief: `Approfondisci ciò che rende speciale l'area: habitat, specie osservate o attese, la storia
della sua tutela. Includi almeno un fatto poco noto.`,
    section3Title: 'Consigli per la visita',
    section3Brief: `Indicazioni pratiche: stagione migliore, regole dell'area protetta, sentieri e servizi,
tempo necessario. Chiudi con una o due frasi sull'essenza del luogo.`,
  },
}

// Assente/undefined trattato come 'sentiero' (il default di colonna), coerente con
// lib/metaTypes.ts's metaHasHikingMetrics e lib/guideProfiles.ts's guideProfileFor. siteType si
// applica solo quando metaType è 'sito' — ignorato altrimenti, mai un errore per un parametro
// irrilevante passato per comodità dal chiamante.
export function reportProfileFor(metaType: MetaType | undefined, siteType?: SiteType): ReportProfile {
  const base = REPORT_PROFILES[metaType ?? 'sentiero']
  if (base.metaType !== 'sito' || !siteType) return base
  const override = SITE_TYPE_REPORT_OVERRIDES[siteType]
  if (!override) return base
  return { ...base, ...override }
}
