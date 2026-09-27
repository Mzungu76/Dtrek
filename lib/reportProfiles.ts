import type { MetaType, SiteType } from './metaTypes'

// Blocco E (piano §30) — equivalente di lib/guideProfiles.ts ma per il Reportage
// (app/api/resoconto/route.ts): a differenza della Guida, il Reportage ha uno scheletro fisso di
// sole 3 sezioni (+ "Cronaca" opzionale, guidata dal questionario, non dalla tipologia) invece di
// 8 — non serve un elenco di sezioni disponibili, solo sovrascrivere titolo/istruzioni di ciascuna
// delle tre sezioni fisse e sopprimere il blocco distanza/dislivello/durata/quota per una Meta
// senza traccia (piano §48.9).
//
// Fino a qui il profilo cambiava SOLO la prima sezione ("Il percorso"/"Il borgo"/"Il sito") — le
// altre due restavano scritte in un linguaggio pensato per un sentiero ("Natura e storia":
// geologia/flora/fauna "nelle vicinanze", presuppone un territorio attraversato; "In sintesi":
// "difficoltà effettiva", non pertinente per una visita) anche per un Borgo/Sito. Ora tutte e tre
// le sezioni sono profilate.

export interface ReportProfile {
  metaType: MetaType
  hikingMetrics: boolean
  sectionTitle: string
  sectionBrief: string
  section2Title: string
  section2Brief: string
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
    section3Title: 'In sintesi',
    section3Brief: IN_SINTESI_VISITA,
    personaAddendum: `\n\nQuesta Meta è un borgo o una città visitata a piedi, NON un'escursione: non
parlare mai di distanza percorsa, dislivello, quota o passo — questi dati non esistono per questa
tipologia. Concentrati su storia, architettura, atmosfera del centro storico e vita quotidiana del
luogo.`,
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
// — stesso argomento per ciascun siteType, tono retrospettivo invece che introduttivo. Le altre
// due sezioni (Storia e curiosità / In sintesi) restano quelle del profilo 'sito' generico sopra:
// già scritte in modo abbastanza aperto da restare pertinenti per qualunque sottotipo. 'altro' non
// ha un override proprio: resta "Il sito" generico, corretto per un luogo che non rientra in
// nessuna delle categorie note.
interface SiteTypeReportOverride {
  sectionTitle: string
  sectionBrief: string
}

const SITE_TYPE_REPORT_OVERRIDES: Partial<Record<SiteType, SiteTypeReportOverride>> = {
  museo: {
    sectionTitle: 'Il museo',
    sectionBrief: `Racconta la visita: le opere e le sale che hanno colpito di più, gli artisti
rappresentati, cosa si è visto seguendo il percorso di visita, eventuali sorprese rispetto alle
aspettative.`,
  },
  castello: {
    sectionTitle: 'Il castello',
    sectionBrief: `Racconta la visita: storia del castello, gli ambienti visitati, i dettagli
architettonici notati di persona, il panorama goduto dall'alto se presente.`,
  },
  abbazia: {
    sectionTitle: "L'abbazia",
    sectionBrief: `Racconta la visita: gli ambienti visitati (chiostro, chiesa, biblioteca), l'atmosfera
di raccoglimento percepita, le opere d'arte custodite, l'eventuale vita monastica osservata.`,
  },
  chiesa: {
    sectionTitle: 'La chiesa',
    sectionBrief: `Racconta la visita: lo stile architettonico, le opere d'arte e gli affreschi visti
di persona, i dettagli che hanno colpito di più (facciata, campanile, cripta, altari).`,
  },
  sito_archeologico: {
    sectionTitle: 'Il sito archeologico',
    sectionBrief: `Racconta la visita: cosa resta visibile oggi, come si presentava al momento della
visita, l'impressione suscitata dal camminare tra i resti, eventuali pannelli o guide che hanno
aiutato la lettura del luogo.`,
  },
  monumento: {
    sectionTitle: 'Il monumento',
    sectionBrief: `Racconta la visita: cosa commemora o rappresenta, i dettagli scultorei o
architettonici notati da vicino, il contesto urbano in cui si trova.`,
  },
  palazzo: {
    sectionTitle: 'Il palazzo',
    sectionBrief: `Racconta la visita: i saloni e le stanze visitate, le opere e gli arredi custoditi,
l'impressione suscitata dallo stile e dalla facciata.`,
  },
  teatro: {
    sectionTitle: 'Il teatro',
    sectionBrief: `Racconta la visita: la sala e il palcoscenico visti di persona, lo stile
architettonico e l'acustica se sperimentata, un eventuale spettacolo assistito.`,
  },
  cascata: {
    sectionTitle: 'La cascata',
    sectionBrief: `Racconta la visita: come si presentava (portata d'acqua, stagione), l'ambiente
naturale che la circonda, i punti da cui è stata ammirata, l'impressione suscitata dal salto d'acqua.`,
  },
  grotta: {
    sectionTitle: 'La grotta',
    sectionBrief: `Racconta la visita: le formazioni geologiche viste (stalattiti, stalagmiti),
l'ambiente e il microclima interno percepito, i punti di maggior suggestione del percorso.`,
  },
  belvedere: {
    sectionTitle: 'Il belvedere',
    sectionBrief: `Racconta la visita: cosa si vedeva dal punto panoramico (vette, valli, coste
riconoscibili), le condizioni di visibilità del momento, l'impressione suscitata dal panorama.`,
  },
  area_naturale: {
    sectionTitle: "L'area naturale",
    sectionBrief: `Racconta la visita: l'ambiente e l'ecosistema osservati, l'itinerario interno
seguito, cosa rende questo luogo un ambiente da proteggere.`,
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
  return { ...base, sectionTitle: override.sectionTitle, sectionBrief: override.sectionBrief }
}
