import type { MetaType } from './metaTypes'

// Blocco E (piano §30) — equivalente di lib/guideProfiles.ts ma per il Reportage
// (app/api/resoconto/route.ts): a differenza della Guida, il Reportage ha uno scheletro fisso di
// sole 3 sezioni (+ "Cronaca" opzionale, guidata dal questionario, non dalla tipologia) invece di
// 8 — non serve un elenco di sezioni disponibili, solo sovrascrivere titolo/istruzioni della
// sezione "Il percorso" (che presuppone un cammino) e sopprimere il blocco
// distanza/dislivello/durata/quota per una Meta senza traccia (piano §48.9).

export interface ReportProfile {
  metaType: MetaType
  hikingMetrics: boolean
  sectionTitle: string
  sectionBrief: string
  personaAddendum?: string
}

export const REPORT_PROFILES: Record<MetaType, ReportProfile> = {
  sentiero: {
    metaType: 'sentiero',
    hikingMetrics: true,
    sectionTitle: 'Il percorso',
    sectionBrief: `Descrivi il tracciato e il territorio attraversato: paesaggio, morfologia del terreno,
punti panoramici, cambi di vegetazione. Contestualizza geograficamente il percorso
senza usare toni enfatici. Usa i dati di distanza, dislivello e quota come ancoraggio.`,
  },
  borgo_citta: {
    metaType: 'borgo_citta',
    hikingMetrics: false,
    sectionTitle: 'Il borgo',
    sectionBrief: `Descrivi il centro storico esplorato: atmosfera, architettura, scorci, vicoli e piazze,
il cambio di paesaggio da un quartiere all'altro. Contestualizza geograficamente il luogo senza usare
toni enfatici.`,
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
    personaAddendum: `\n\nQuesta Meta è un museo, un castello, un sito archeologico o un altro luogo
puntuale visitato, NON un'escursione: non parlare mai di distanza percorsa, dislivello, quota o passo
— questi dati non esistono per questa tipologia. Concentrati su storia, architettura, curiosità e cosa
si è visto durante la visita.`,
  },
}

// Assente/undefined trattato come 'sentiero' (il default di colonna), coerente con
// lib/metaTypes.ts's metaHasHikingMetrics e lib/guideProfiles.ts's guideProfileFor.
export function reportProfileFor(metaType: MetaType | undefined): ReportProfile {
  return REPORT_PROFILES[metaType ?? 'sentiero']
}
