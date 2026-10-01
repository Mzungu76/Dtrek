import type { MetaType, SiteType } from './metaTypes'
import { isNaturalSiteType, type BorgoCardVariant } from './guideCardVariant'
import { GUIDE_SECTIONS, type GuideSectionKey } from './guideSections'

// Blocco E (piano §28) — quali sezioni della Guida ha senso generare/mostrare per tipologia, e
// quali istruzioni aggiuntive dare a Giulia perché non parli mai di traccia GPS/dislivello/
// difficoltà per una Meta che non ne ha (piano §48.9). Deliberatamente NON un secondo scheletro di
// sezioni parallelo: riusa GUIDE_SECTIONS (lib/guideSections.ts) filtrandolo/sovrascrivendo solo
// dove il significato cambia davvero — così parsing (GuideReader), il picker "Breve" globale
// (SectionGuida) e la generazione restano un solo elenco canonico di chiavi.

export interface GuideSectionOverride {
  /** Titolo esatto che Giulia deve usare dopo "## " — sostituisce GUIDE_SECTIONS[k].title. */
  title: string
  /** Istruzioni per questa sezione, sostituisce SECTION_BRIEF[k] in app/api/guide/route.ts. */
  brief: string
}

export interface GuideProfile {
  metaType: MetaType
  /** Sottoinsieme (nell'ordine canonico di GUIDE_SECTIONS) delle sezioni generabili per questa
   *  tipologia — una sezione esclusa qui non viene mai proposta né generata, indipendentemente da
   *  cosa il client richiede (vedi app/api/guide/route.ts's filtro post-fetch della Meta). */
  availableSections: GuideSectionKey[]
  sectionOverrides?: Partial<Record<GuideSectionKey, GuideSectionOverride>>
  /** Istruzione aggiunta in coda a SYSTEM_CORE (app/api/guide/route.ts) solo per questa
   *  tipologia — assente per 'sentiero', che resta l'unico system prompt invariato rispetto a
   *  prima dell'introduzione del piano multi-tipologia. */
  personaAddendum?: string
}

// "Dati e sicurezza" commenta punteggi/rischi (Trail Score, Sicurezza, dislivello, quota) che
// esistono solo per un sentiero — nessuna metrica fabbricata per una Meta che non ne ha mai avute
// (piano §48.9). "Su misura per te" confronta il percorso con lo storico/profilo escursionistico
// dell'utente (lib/hikerHistory.ts, lib/hikerProfile.ts) — stesso principio, non ha un
// equivalente per la visita di un borgo o di un sito. Nessun'altra sezione (luoghi/natura/sapori/
// consigli) è specifica al camminare in sé: restano valide così come sono anche per un borgo o
// un sito.
const HIKING_ONLY_SECTIONS: GuideSectionKey[] = ['dati_sicurezza', 'comfort']

/** Sezioni che per un Cammino non sono un testo unico ma stanno dentro ogni tappa. */
export const CAMMINO_PER_TAPPA_SECTIONS: GuideSectionKey[] = ['luoghi', 'dati_sicurezza', 'comfort']

function availableSectionsFor(exclude: GuideSectionKey[]): GuideSectionKey[] {
  return GUIDE_SECTIONS.map(s => s.key).filter(k => !exclude.includes(k))
}

// "Natura intorno a te" ha senso solo quando c'è un vero tratto a piedi nella natura da
// raccontare (verifica post-piano guide-eccellenza): un Sentiero sempre, un Borgo/Città solo con
// una traccia reale collegata (trekking_misto, vedi applyBorgoVariantOverride sotto — stessa
// condizione di dati_sicurezza), un Sito solo se è esso stesso un luogo naturale (cascata, grotta,
// belvedere, area naturale — vedi isNaturalSiteType). Un museo o un palazzo in centro città non ha
// una "natura intorno" da mostrare: prima la sezione restava comunque disponibile, con
// NaturaWidget che mostrava due pulsanti "Galleria" quasi certamente vuoti.
const NON_HIKING_SECTIONS = availableSectionsFor([...HIKING_ONLY_SECTIONS, 'natura'])

// Brief di "luoghi" per un Borgo/Città (piano §29, "Guida diventa narrativa e geografica" con
// Tappa 1/Tappa 2/...) — un'unica istruzione che si adatta da sola a due casi, invece di due
// varianti scelte lato codice: quando app/api/guide/route.ts (lib/guideBorgoDetailStops.ts) ha
// trovato punti di dettaglio nel raggio del Borgo, il prompt li elenca già numerati come "TAPPA 1,
// TAPPA 2, ..." in ordine di visita a piedi dal centro — qui si chiede di raccontarli in quello
// stesso ordine, uno per sottotitolo ###, chiudendo ciascuno con l'indicazione per proseguire
// verso il successivo (esattamente i 4 campi del piano: luogo, posizione, contenuto, indicazione
// per proseguire). Quando quell'elenco manca (borgo isolato, o la scoperta non ha trovato nulla),
// non si inventano tappe numerate: si ripiega su un ritratto dei luoghi più noti, stesso taglio a
// sottotitoli ma senza la sequenza vincolata.
const BORGO_LUOGHI_BRIEF = `## Itinerario consigliato
Se più sotto trovi un elenco TAPPA 1, TAPPA 2, ... numerato, racconta il borgo seguendo ESATTAMENTE
quell'ordine di visita (non riordinarlo, non saltarne nessuna): per ciascuna tappa, un sottotitolo
### col suo nome, poi la sua storia, architettura o la curiosità più memorabile, e chiudi con una
riga breve che indichi come si prosegue a piedi verso la tappa successiva (es. "Da qui, pochi passi
lungo i vicoli portano a...") — l'ultima tappa non ha una riga di proseguimento.
Se quell'elenco non è presente o è vuoto, non inventare tappe numerate: racconta invece, con lo
stesso taglio a sottotitoli ###, i luoghi più significativi del borgo che emergono dagli altri dati
disponibili.`

export const GUIDE_PROFILES: Record<MetaType, GuideProfile> = {
  sentiero: {
    metaType: 'sentiero',
    availableSections: availableSectionsFor([]),
  },
  borgo_citta: {
    metaType: 'borgo_citta',
    availableSections: NON_HIKING_SECTIONS,
    sectionOverrides: {
      prima_di_partire: {
        title: 'Prima di partire',
        brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore, come muoversi nel borgo/città (a piedi, parcheggi,
zone a traffico limitato), eventuali orari di apertura di chiese/musei principali se noti.`,
      },
      il_percorso: {
        title: 'Il borgo',
        brief: `## Il borgo
Narrazione d'insieme del centro storico: la prima impressione arrivando, l'atmosfera generale,
il carattere che lo contraddistingue da altri borghi della zona, il cambio di paesaggio da un
quartiere all'altro. Resta sul quadro d'insieme: il racconto luogo per luogo vive nella sezione
dedicata più avanti, qui non anticiparlo.`,
      },
      luoghi: {
        title: 'Itinerario consigliato',
        brief: BORGO_LUOGHI_BRIEF,
      },
    },
    personaAddendum: `\n\nQuesta Meta è un borgo o una città da esplorare a piedi, NON un sentiero
escursionistico: non parlare mai di traccia GPS, dislivello, quota o difficoltà del cammino — questi
concetti non esistono per questa tipologia. Concentrati su storia, architettura, atmosfera del
centro storico e vita quotidiana del luogo.`,
  },
  cammino: {
    metaType: 'cammino',
    // Niente "Tappa per tappa", "Dati e sicurezza" e "Su misura per te" come sezioni AI uniche per tutto
    // il cammino: una sola sezione su 16 tappe superava il budget di token e si troncava; dati,
    // punteggi e racconto vivono per tappa (CamminoTappeWidget, testo generato su richiesta).
    availableSections: availableSectionsFor(CAMMINO_PER_TAPPA_SECTIONS),
    sectionOverrides: {
      prima_di_partire: {
        title: 'Prima di partire',
        brief: `## Prima di partire
Consigli pratici per affrontare il cammino: periodo migliore, credenziale del pellegrino e timbri
se il cammino li prevede, quanto allenarsi, cosa mettere nello zaino. Parla di alloggi e servizi
SOLO se emergono dai dati disponibili — mai inventare ostelli, strutture o prezzi.`,
      },
      il_percorso: {
        title: 'Il cammino',
        brief: `## Il cammino
Narrazione d'insieme dell'intero cammino: da dove a dove, la sua storia e il suo significato, il
carattere dei paesaggi attraversati. Resta sul quadro d'insieme: il racconto tappa per tappa vive
nella sezione dedicata più avanti, qui non anticiparlo.`,
      },
      luoghi: {
        title: 'Tappa per tappa',
        brief: `## Tappa per tappa
Se più sotto trovi un elenco TAPPA 1, TAPPA 2, ... racconta il cammino seguendo ESATTAMENTE quell'ordine,
con un sottotitolo ### per ciascuna tappa (da dove a dove, il carattere del tratto, i luoghi da non
perdere lungo la strada). Non inventare tappe, distanze o servizi che non compaiono nei dati.`,
      },
    },
    personaAddendum: `\n\nQuesta Meta è un cammino a tappe di più giorni: parla di tappe, giornate di
marcia, paesi di sosta e storia del cammino. Distanza e dislivello valgono per ogni singola tappa,
non solo per il totale. Non inventare mai alloggi, servizi, prezzi o varianti non presenti nei dati.`,
  },
  sito: {
    metaType: 'sito',
    availableSections: NON_HIKING_SECTIONS,
    sectionOverrides: {
      prima_di_partire: {
        title: 'Prima di partire',
        brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore, orari e biglietti se noti, tempo indicativo da
dedicare alla visita, come raggiungere il luogo.`,
      },
      il_percorso: {
        title: 'Il sito',
        brief: `## Il sito
Narrazione vivace del luogo: storia, architettura, atmosfera, cosa colpisce di più a chi lo visita.
Dai l'idea di cosa si prova davvero a trovarsi lì.`,
      },
      luoghi: {
        title: 'Cosa vedere',
        brief: `## Cosa vedere
Un Sito è un luogo puntuale da visitare, non un itinerario a tappe: non parlare di "proseguire verso"
o di un ordine di percorrenza. Racconta invece, con un sottotitolo ### per ciascuno, gli
elementi/ambienti/opere più notevoli da non perdere durante la visita (es. una sala del museo, un
ambiente del castello, un affresco, un reperto) — cosa cercare con lo sguardo e perché merita
attenzione. Se non emergono elementi distinti dai dati disponibili, un solo blocco senza sottotitoli
va bene: mai inventarne per riempire lo spazio.`,
      },
    },
    personaAddendum: `\n\nQuesta Meta è un museo, un castello, un sito archeologico o un altro luogo
puntuale da visitare, NON un sentiero escursionistico: non parlare mai di traccia GPS, dislivello,
quota o difficoltà del cammino — questi concetti non esistono per questa tipologia. Concentrati su
storia, architettura, curiosità e cosa vedere durante la visita.`,
  },
}

// ── Profili per siteType (piano §30, "Guida sito dipende da siteType") ────────────────────────
//
// Sovrascrivono SOLO "prima_di_partire"/"il_percorso" del profilo 'sito' generico sopra — le due
// sezioni la cui natura cambia davvero passando da un museo a una cascata (cosa serve sapere prima
// di partire, cosa raccontare del luogo in sé). Le altre sezioni disponibili per 'sito'
// (luoghi/natura/sapori/consigli) restano quelle del profilo generico: già scritte in modo
// abbastanza aperto da restare pertinenti per qualunque sottotipo, e "natura" in particolare vale
// tanto per una cascata quanto per il contesto paesaggistico di un castello o di un'abbazia.
// 'altro' non ha un override proprio: resta il profilo 'sito' generico, corretto per un luogo che
// non rientra in nessuna delle categorie note.
const SITE_TYPE_OVERRIDES: Partial<Record<SiteType, Partial<Record<GuideSectionKey, GuideSectionOverride>>>> = {
  museo: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: giorno/orario migliore per evitare la folla, biglietti e riduzioni
se noti, se serve prenotare, tempo indicativo da dedicare alla visita.`,
    },
    il_percorso: {
      title: 'Il museo',
      brief: `## Il museo
Le opere e le sale principali, gli artisti rappresentati, un percorso di visita consigliato, cosa
non perdere assolutamente anche con poco tempo a disposizione.`,
    },
  },
  castello: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore, orari e biglietti se noti, tempo indicativo di
visita, eventuali limiti di accessibilità (scale, cortili, mura, torri).`,
    },
    il_percorso: {
      title: 'Il castello',
      brief: `## Il castello
Storia (chi lo costruì, assedi o battaglie, i passaggi di proprietà nel tempo), architettura (torri,
mura, fossato), personaggi che vi hanno vissuto, gli ambienti principali da vedere, eventi che vi si
svolgono ancora oggi se noti, il panorama che si gode dall'alto.`,
    },
  },
  abbazia: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: orari di apertura, eventuali funzioni religiose da rispettare,
un abbigliamento adeguato se richiesto, tempo indicativo di visita.`,
    },
    il_percorso: {
      title: "L'abbazia",
      brief: `## L'abbazia
Fondazione e ordine religioso, architettura (chiostro, chiesa, biblioteca, refettorio), la vita
monastica di ieri e di oggi, le opere d'arte custodite, l'atmosfera di raccoglimento del luogo.`,
    },
  },
  chiesa: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: orari di apertura, eventuali funzioni in corso da rispettare, se
l'ingresso è libero o a offerta.`,
    },
    il_percorso: {
      title: 'La chiesa',
      brief: `## La chiesa
Storia della fondazione, stile architettonico, opere d'arte e affreschi custoditi, i dettagli che
meritano uno sguardo attento (facciata, campanile, cripta, altari).`,
    },
  },
  sito_archeologico: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore per il caldo/l'ombra, orari e biglietti se noti,
calzature adatte a un terreno irregolare, tempo indicativo di visita.`,
    },
    il_percorso: {
      title: 'Il sito archeologico',
      brief: `## Il sito archeologico
Epoca e civiltà a cui appartiene, cosa resta visibile oggi e come leggerlo, scoperte o scavi
significativi, come doveva apparire il luogo nel suo periodo di massimo splendore.`,
    },
  },
  monumento: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: come raggiungerlo, orari se prevede un interno visitabile, tempo
indicativo da dedicargli.`,
    },
    il_percorso: {
      title: 'Il monumento',
      brief: `## Il monumento
Cosa commemora o rappresenta, chi lo ha voluto e realizzato, i dettagli scultorei o architettonici
da notare, il suo ruolo nella vita e nella memoria della città.`,
    },
  },
  palazzo: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: orari e biglietti se noti, se è ancora abitato o sede istituzionale
(e quindi con accesso limitato), tempo indicativo di visita.`,
    },
    il_percorso: {
      title: 'Il palazzo',
      brief: `## Il palazzo
La famiglia o l'istituzione che lo fece costruire, lo stile e la facciata, i saloni e le stanze
principali, le opere e gli arredi custoditi all'interno.`,
    },
  },
  teatro: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: se è visitabile liberamente o solo con spettacoli/visite guidate,
orari, biglietti se noti.`,
    },
    il_percorso: {
      title: 'Il teatro',
      brief: `## Il teatro
Storia e inaugurazione, stile architettonico e acustica, gli spettacoli o gli artisti che lo hanno
reso celebre, cosa vedere della sala e del palcoscenico.`,
    },
  },
  cascata: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore per la portata d'acqua, come raggiungerla, calzature
adatte, attenzione a rocce bagnate e scivolose lungo l'accesso.`,
    },
    il_percorso: {
      title: 'La cascata',
      brief: `## La cascata
Origine geologica, come si è formata nel tempo, l'ambiente naturale che la circonda, i punti
migliori da cui ammirarla, una nota onesta sulla sicurezza dell'accesso.`,
    },
  },
  grotta: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: se serve una guida o una prenotazione, temperatura interna e
abbigliamento adatto, calzature adeguate a un terreno umido e irregolare.`,
    },
    il_percorso: {
      title: 'La grotta',
      brief: `## La grotta
Formazione geologica (stalattiti, stalagmiti, l'epoca in cui si sono formate), la storia di
scoperta e uso umano nel tempo, l'ambiente e il microclima interno, i punti di maggior suggestione
del percorso.`,
    },
  },
  belvedere: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: l'orario migliore per la luce (es. tramonto), come raggiungerlo,
attenzione a parapetti e dislivelli per chi soffre di vertigini.`,
    },
    il_percorso: {
      title: 'Il belvedere',
      brief: `## Il belvedere
Cosa si vede da lì e come leggere il panorama (vette, valli, coste riconoscibili), la storia del
punto panoramico stesso quando è rilevante.`,
    },
  },
  area_naturale: {
    prima_di_partire: {
      title: 'Prima di partire',
      brief: `## Prima di partire
Consigli pratici per la visita: periodo migliore, itinerari o punti di accesso interni se noti,
eventuali regole di tutela/accesso dell'area protetta.`,
    },
    il_percorso: {
      title: "L'area naturale",
      brief: `## L'area naturale
Le caratteristiche dell'ambiente protetto, l'ecosistema che lo popola, gli itinerari interni
principali, cosa rende questo luogo un ambiente da proteggere.`,
    },
  },
}

/** Applica, se presente, l'override specifico del siteType sopra il profilo 'sito' generico —
 *  solo le chiavi di sezione che quel siteType sovrascrive davvero (prima_di_partire/il_percorso),
 *  il resto del profilo base resta invariato. Un Sito "naturalistico" (isNaturalSiteType, verifica
 *  post-piano guide-eccellenza) riguadagna anche "Natura", esclusa di default dal profilo base. */
function applySiteTypeOverride(base: GuideProfile, siteType: SiteType | undefined): GuideProfile {
  const withNatura = isNaturalSiteType(siteType)
    ? { ...base, availableSections: availableSectionsFor(HIKING_ONLY_SECTIONS) }
    : base
  const overrides = siteType ? SITE_TYPE_OVERRIDES[siteType] : undefined
  if (!overrides) return withNatura
  return { ...withNatura, sectionOverrides: { ...withNatura.sectionOverrides, ...overrides } }
}

// piano §52.5 — un Sito nested (parentMetaId valorizzato, nato da una tappa promossa a Guida a
// sé dentro la Guida di un Borgo/Città) condivide il contesto territoriale col suo genitore: le
// tradizioni gastronomiche e i consigli pratici della zona sono già raccontati a livello di
// Borgo, ripeterli nella Guida del Sito sarebbe ridondante. Un Sito autonomo (nessun genitore che
// li racconti) le mantiene entrambe — resta il profilo base invariato.
const NESTED_SITE_EXCLUDED_SECTIONS: GuideSectionKey[] = ['sapori', 'consigli']

function applyNestedSiteOverride(base: GuideProfile, isNestedSite: boolean | undefined): GuideProfile {
  if (!isNestedSite) return base
  return { ...base, availableSections: base.availableSections.filter(k => !NESTED_SITE_EXCLUDED_SECTIONS.includes(k)) }
}

// piano guide-eccellenza §Fase 3 — lib/guideCardVariant.ts promette che un Borgo/Città
// 'trekking_misto' (traccia GPS reale collegata, un cammino che tocca il borgo) mantiene "Dati e
// sicurezza" quasi come un Sentiero; questo profilo escludeva prima dati_sicurezza per OGNI
// borgo_citta senza eccezione, in disaccordo con quella promessa. dati_sicurezza e natura (verifica
// post-piano — entrambe hanno senso solo con una traccia reale) cambiano con la variante —
// "comfort"/"Su misura per te" (confronto con lo storico escursionistico dell'utente) resta escluso
// in ogni caso, il piano non lo cita. "Il percorso" resta l'override narrativo "Il borgo" per ogni
// variante: qui non c'entra, invariato.
function applyBorgoVariantOverride(base: GuideProfile, variant: BorgoCardVariant | undefined): GuideProfile {
  if (variant !== 'trekking_misto') return base
  return { ...base, availableSections: availableSectionsFor(['comfort']) }
}

// Assente/undefined trattato come 'sentiero' (il default di colonna, coerente con
// lib/metaTypes.ts's metaHasHikingMetrics) — mai come "tipologia sconosciuta ⇒ profilo vuoto".
// siteType è letto SOLO quando metaType è 'sito' (piano §30), borgoVariant SOLO quando metaType è
// 'borgo_citta' (piano §Fase 3), isNestedSite SOLO quando metaType è 'sito' (piano §52.5) —
// ignorati per ogni altra tipologia/combinazione.
export function guideProfileFor(
  metaType: MetaType | undefined,
  siteType?: SiteType,
  borgoVariant?: BorgoCardVariant,
  isNestedSite?: boolean,
): GuideProfile {
  const base = GUIDE_PROFILES[metaType ?? 'sentiero']
  if (base.metaType === 'sito') return applyNestedSiteOverride(applySiteTypeOverride(base, siteType), isNestedSite)
  if (base.metaType === 'borgo_citta') return applyBorgoVariantOverride(base, borgoVariant)
  return base
}
