import type { MetaType } from './metaTypes'
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
// (piano §48.9). Nessun'altra sezione (luoghi/natura/sapori/consigli) è specifica al camminare in
// sé: restano valide così come sono anche per un borgo o un sito.
const HIKING_ONLY_SECTIONS: GuideSectionKey[] = ['dati_sicurezza']

function availableSectionsFor(exclude: GuideSectionKey[]): GuideSectionKey[] {
  return GUIDE_SECTIONS.map(s => s.key).filter(k => !exclude.includes(k))
}

export const GUIDE_PROFILES: Record<MetaType, GuideProfile> = {
  sentiero: {
    metaType: 'sentiero',
    availableSections: availableSectionsFor([]),
  },
  borgo_citta: {
    metaType: 'borgo_citta',
    availableSections: availableSectionsFor(HIKING_ONLY_SECTIONS),
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
Narrazione vivace del centro storico: atmosfera, scorci, vicoli, piazze, il cambio di paesaggio da un
quartiere all'altro. Dai l'idea di cosa si prova davvero a camminarci ed esplorarlo.`,
      },
    },
    personaAddendum: `\n\nQuesta Meta è un borgo o una città da esplorare a piedi, NON un sentiero
escursionistico: non parlare mai di traccia GPS, dislivello, quota o difficoltà del cammino — questi
concetti non esistono per questa tipologia. Concentrati su storia, architettura, atmosfera del
centro storico e vita quotidiana del luogo.`,
  },
  sito: {
    metaType: 'sito',
    availableSections: availableSectionsFor(HIKING_ONLY_SECTIONS),
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
    },
    personaAddendum: `\n\nQuesta Meta è un museo, un castello, un sito archeologico o un altro luogo
puntuale da visitare, NON un sentiero escursionistico: non parlare mai di traccia GPS, dislivello,
quota o difficoltà del cammino — questi concetti non esistono per questa tipologia. Concentrati su
storia, architettura, curiosità e cosa vedere durante la visita.`,
  },
}

// Assente/undefined trattato come 'sentiero' (il default di colonna, coerente con
// lib/metaTypes.ts's metaHasHikingMetrics) — mai come "tipologia sconosciuta ⇒ profilo vuoto".
export function guideProfileFor(metaType: MetaType | undefined): GuideProfile {
  return GUIDE_PROFILES[metaType ?? 'sentiero']
}
