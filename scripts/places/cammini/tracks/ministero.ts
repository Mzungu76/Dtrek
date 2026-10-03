import { normalizeSiteUrl } from '../../../../lib/cammini/officialUrl'
import catalogo from './catalogo-ministero.json'

// Catalogo dei cammini religiosi del Ministero del Turismo (https://www.ministeroturismo.gov.it/catalogo-dei-cammini-religiosi-italiani/):
// per ogni cammino il «sito web» di approfondimento, usato come `official_url`. Il JSON è estratto dalle pagine salvate dall'utente
// (pagine 1-3 di 11, 2026-10-03). `zip` è il percorso scaricabile dal ministero (per le ondate future).

export interface CatalogoEntry { name: string; km: string | null; regione: string | null; sito: string; zip: string | null }
export const CATALOGO: CatalogoEntry[] = catalogo as CatalogoEntry[]

/**
 * id del cammino importato → nome nel catalogo. `null` = non ancora nelle pagine ricevute (manca la pagina del catalogo).
 * Il Cammino di San Benedetto (OSM) ha già il suo official_url e non passa da qui.
 */
export const MINISTERO_MAP: Record<string, string | null> = {
  'cammino-santuari-del-mare': 'Cammino dei Santuari del Mare',
  'cammino-protomartiri-francescani': 'Cammino dei Protomartiri Francescani',
  'cammino-dei-picentini': 'Cammino dei Picentini',
  'cammino-dei-francescani-abruzzo': 'Cammino dei Francescani',
  'cammino-dei-florensi': 'Cammino dei Florensi',
  'cammino-dei-florensi-variante-prato-piano': 'Cammino dei Florensi',
  'cammino-dei-cappuccini': 'Cammino dei cappuccini',
  'cammino-delle-sette-sorelle': 'Cammino delle Sette Sorelle',
  'cammini-madonna-del-monticino': 'Cammini della Madonna del Monticino e Percorsi Medievali',
  'anello-cimino-santi-patroni': 'Anello Cimino. Il cammino dei Santi Patroni',
  'alta-via-delle-grazie': 'Alta Via delle Grazie',
  'alta-via-delle-grazie-varianti': 'Alta Via delle Grazie',
  'cammino-basiliano-tratto-calabro': 'Cammino Basiliano',
  'cammino-basiliano-tratto-lucano': 'Cammino Basiliano',
  'cammino-della-pace': 'Cammino della Pace',
  'cammino-della-pace-varianti': 'Cammino della Pace',
  'cammino-della-magna-grecia': 'Cammino della Magna Grecia con la Via Sacra e la Via dell’Asceta',
  'cammino-della-magna-grecia-varianti': 'Cammino della Magna Grecia con la Via Sacra e la Via dell’Asceta',
  'via-dellasceta': 'Cammino della Magna Grecia con la Via Sacra e la Via dell’Asceta',
  'percorso-santa-spina': 'Cammino della Santa Spina',
  'cammino-della-madonna-nera': 'Cammino della Madonna Nera',
  'cammino-del-salento-via-dei-borghi': 'Cammino del Salento',
  'cammino-del-salento-via-del-mare': 'Cammino del Salento',
  'cammino-dellacqua': 'Cammino dell’Acqua',
  'cammino-dellacqua-varianti': 'Cammino dell’Acqua',
  'cammino-del-perdono': 'Cammino del Perdono – Sui passi di Celestino',
  'cammino-del-santo-marino': 'Cammino del Santo Marino',
  'cammino-del-beato-enrico': 'Cammino del Beato Enrico da Bolzano',
  'cammino-di-oropa': 'Cammino di Oropa',
  'cammino-di-oropa-varianti': 'Cammino di Oropa',
  'cammino-di-san-michele': null,
  'cammino-di-san-michele-varianti': null,
  'cammino-di-san-bartolomeo': 'Cammino di San Bartolomeo',
  'cammino-di-hasekura': 'Cammino di Hasekura e dei martiri giapponesi',
  'cammino-di-don-tonino': 'Cammino di Don Tonino',
  'cammino-delle-44-chiesette-votive': 'Cammino delle 44 Chiesette Votive nelle Valli del Natisone',
  'via-di-francesco-nel-lazio': 'Cammino di Francesco nel Lazio',
  'via-di-francesco-nel-lazio-varianti': 'Cammino di Francesco nel Lazio',
  'cammino-di-assisi': 'Cammino di Assisi',
  'cammino-di-assisi-varianti': 'Cammino di Assisi',
}

/** Link di approfondimento (normalizzato) del cammino importato, o null se non è nel catalogo ricevuto o l'indirizzo non è valido. */
export function officialUrlFor(id: string): string | null {
  const name = MINISTERO_MAP[id]
  if (!name) return null
  const entry = CATALOGO.find(c => c.name === name)
  return entry ? normalizeSiteUrl(entry.sito) : null
}
