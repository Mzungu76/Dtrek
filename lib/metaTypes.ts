import type { LucideIcon } from 'lucide-react'
import {
  Mountain, Building2, Landmark, Palette, Castle, Church, Pyramid, Theater,
  Waves, Gem, MountainSnow, Trees, MapPin,
} from 'lucide-react'

// Tipologia di Meta scelta esplicitamente dall'utente (docs/piano-mete-multitipologia.md §1) —
// mai dedotta da geometria, GPX o altre euristiche (piano §48.11). Ogni Meta esistente in
// planned_hikes ha meta_type = 'sentiero' come DEFAULT di colonna (vedi
// supabase/migrations/add_meta_type_columns.sql), quindi il valore è sempre presente lato server;
// resta opzionale a livello di tipo TS solo per i punti client che costruiscono un PlannedHike
// prima del round-trip col server.
export type MetaType = 'sentiero' | 'borgo_citta' | 'sito'

// Categoria Dtrek per una Meta borgo_citta (piano §6) — mai dedotta da "Comune = Borgo": una
// classificazione propria, separata dall'entità amministrativa ISTAT. Non ancora assegnata dalla
// pipeline di import (scripts/places/istat/fetch.ts la lascia undefined di proposito) — riservata
// per quando esisterà una classificazione esplicita (Blocco C/D).
export type PlaceCategory = 'borgo' | 'citta'

// Sottotipologia di un sito culturale/naturalistico — valorizzata solo quando meta_type = 'sito'.
export type SiteType =
  | 'museo'
  | 'castello'
  | 'abbazia'
  | 'chiesa'
  | 'sito_archeologico'
  | 'monumento'
  | 'palazzo'
  | 'teatro'
  | 'cascata'
  | 'grotta'
  | 'belvedere'
  | 'area_naturale'
  | 'altro'

interface MetaTypeConfig {
  label: string
  pluralLabel: string
  description: string
  icon: LucideIcon
  searchPlaceholder: string
  // Se false, la scheda/Guida/Reportage di questa tipologia non deve mai mostrare metriche
  // escursionistiche (Trail Score, Safety Score, DTM, profilo altimetrico, distanza/D+) — vedi
  // piano §9/§24 e docs/meta-multitype-audit.md §1 per i call site da rendere condizionali prima
  // di aprire nuovi percorsi di creazione per questa tipologia.
  hikingMetrics: boolean
  // Colore per tipologia — un solo posto per icona+colore invece di tre costanti duplicate nei
  // punti che disegnano una tipologia (chip di filtro, pin della carta, miniatura di riga in
  // app/percorsi/page.tsx e components/mete/MeteMap.tsx): senza un'unica fonte, i tre punti erano
  // già andati fuori sincrono (pin colorati diversamente dai chip). Stessi valori della palette
  // "Taccuino Botanico" già in uso altrove (lib/taccuinoTokens.tsx's TACCUINO_ACCENT[600]/
  // TACCUINO_ACCENT_SECONDARY, tailwind.config.ts's botanico.bar) — hex letterali qui, non un
  // import da taccuinoTokens.tsx, perché questo modulo resta leggero e senza dipendenze React
  // (letto anche da route.ts lato server).
  color: string
}

interface SiteTypeConfig {
  label: string
  icon: LucideIcon
  // Tempo di visita tipico in minuti (verifica utente, piano guide-eccellenza — "un poi potrebbe
  // essere molto vicino ma richiedere mezza giornata di visita") — usato per il raggruppamento in
  // tappe di un itinerario Borgo/Città (lib/metaSearch/borgoItinerary.ts), come base personalizzabile
  // dall'utente con uno slider per singolo punto, mai un valore fisso imposto. Stime di buon senso
  // calibrate su siti locali/regionali italiani (l'archivio di questa app), non su landmark mondiali
  // (Louvre, Pompei, Windsor...) — quei riferimenti tornano numeri 2-4× più alti, coerenti con
  // musei/siti di scala e affluenza molto maggiori di un museo civico o un'area archeologica locale.
  visitMinutes: number
}

export const META_TYPE_CONFIG: Record<MetaType, MetaTypeConfig> = {
  sentiero: {
    label:             'Sentiero',
    pluralLabel:       'Sentieri',
    description:       'Un percorso escursionistico da camminare, con traccia GPS.',
    icon:              Mountain,
    searchPlaceholder: 'Cerca un sentiero...',
    hikingMetrics:     true,
    color:             '#7C8F6E',
  },
  borgo_citta: {
    label:             'Borgo / Città',
    pluralLabel:       'Borghi / Città',
    description:       'Un centro storico o una città da esplorare a piedi, tappa per tappa.',
    icon:              Building2,
    searchPlaceholder: 'Cerca un borgo o una città...',
    hikingMetrics:     false,
    color:             '#C0603D',
  },
  sito: {
    label:             'Sito',
    pluralLabel:       'Siti',
    description:       'Un museo, castello, sito archeologico o altro luogo da visitare.',
    icon:              Landmark,
    searchPlaceholder: 'Cerca un museo, un castello, un sito...',
    hikingMetrics:     false,
    color:             '#5F7355',
  },
}

export const SITE_TYPE_CONFIG: Record<SiteType, SiteTypeConfig> = {
  museo:             { label: 'Museo',             icon: Palette,      visitMinutes: 90 },
  castello:          { label: 'Castello',           icon: Castle,      visitMinutes: 120 },
  abbazia:           { label: 'Abbazia',            icon: Church,      visitMinutes: 60 },
  chiesa:            { label: 'Chiesa',             icon: Church,      visitMinutes: 20 },
  sito_archeologico: { label: 'Sito archeologico',  icon: Pyramid,     visitMinutes: 60 },
  monumento:         { label: 'Monumento',          icon: Landmark,    visitMinutes: 15 },
  palazzo:           { label: 'Palazzo',            icon: Building2,   visitMinutes: 60 },
  teatro:            { label: 'Teatro',             icon: Theater,     visitMinutes: 45 },
  cascata:           { label: 'Cascata',            icon: Waves,       visitMinutes: 30 },
  grotta:            { label: 'Grotta',             icon: Gem,         visitMinutes: 60 },
  belvedere:         { label: 'Belvedere',          icon: MountainSnow, visitMinutes: 20 },
  area_naturale:     { label: 'Area naturale',      icon: Trees,       visitMinutes: 45 },
  altro:             { label: 'Altro',               icon: MapPin,     visitMinutes: 30 },
}

// Nessun siteType (tappa da Wikipedia senza classificazione, o un punto archivio senza subtype) —
// stesso valore di 'altro': una via di mezzo prudente, mai zero (un punto senza tempo di visita
// stimato sparirebbe dal budget della tappa come se non richiedesse nulla).
export const DEFAULT_VISIT_MINUTES = SITE_TYPE_CONFIG.altro.visitMinutes

export const META_TYPES: MetaType[] = ['sentiero', 'borgo_citta', 'sito']
export const SITE_TYPES: SiteType[] = Object.keys(SITE_TYPE_CONFIG) as SiteType[]

export function isMetaType(value: unknown): value is MetaType {
  return typeof value === 'string' && (META_TYPES as string[]).includes(value)
}

export function isSiteType(value: unknown): value is SiteType {
  return typeof value === 'string' && (SITE_TYPES as string[]).includes(value)
}

// Metriche escursionistiche (Trail Score/Safety/DTM/distanza/D+) hanno senso solo per un
// sentiero — vedi piano §9. Assente/undefined è trattato come 'sentiero' (il default di colonna),
// mai come "tipologia sconosciuta ⇒ nascondi tutto".
export function metaHasHikingMetrics(metaType: MetaType | undefined): boolean {
  return META_TYPE_CONFIG[metaType ?? 'sentiero'].hikingMetrics
}

// Parole generiche nel NOME che indicano una tipologia più precisa di 'altro' — stesso stile a
// sottostringa di MIC_TYPE_MAP in scripts/places/mic/fetch.ts (riusato qui come ripiego runtime,
// non ridondante: quella lista classifica dall'ETICHETTA MiC, questa dal NOME della Meta, fonti
// diverse). Serve perché 'altro' non significa sempre "davvero non classificabile" — un caso
// frequente osservato dal vivo: OSM tagga molti musei/luoghi minori con `tourism=attraction`
// (troppo generico, mappato ad 'altro' in scripts/places/osm/fetch.ts) anche quando il NOME dice
// esplicitamente "Museo civico ...". Un fix alla fonte (OSM) richiederebbe un nuovo import
// completo; questo ripiego corregge anche le Mete già importate, al momento in cui vengono lette.
const NAME_TYPE_HINTS: [string, SiteType][] = [
  ['museo', 'museo'], ['pinacoteca', 'museo'], ['galleria', 'museo'], ['collezione', 'museo'],
  ['castello', 'castello'], ['rocca', 'castello'], ['fortezza', 'castello'], ['forte', 'castello'],
  ['abbazia', 'abbazia'], ['monastero', 'abbazia'], ['convento', 'abbazia'], ['eremo', 'abbazia'],
  ['chiesa', 'chiesa'], ['basilica', 'chiesa'], ['cattedrale', 'chiesa'], ['santuario', 'chiesa'], ['duomo', 'chiesa'], ['battistero', 'chiesa'],
  ['area archeologic', 'sito_archeologico'], ['scavi', 'sito_archeologico'], ['necropoli', 'sito_archeologico'], ['parco archeologic', 'sito_archeologico'],
  ['palazzo', 'palazzo'], ['villa', 'palazzo'],
  ['teatro', 'teatro'], ['anfiteatro', 'teatro'],
  ['monumento', 'monumento'], ['mausoleo', 'monumento'], ['obelisco', 'monumento'],
  ['cascata', 'cascata'],
  ['grotta', 'grotta'],
  ['belvedere', 'belvedere'],
]

/**
 * `subtype` così com'è quando è già una classificazione specifica (mai sovrascritta — il nome è
 * solo un ripiego, non un'autorità superiore a un dato strutturato reale). Solo per 'altro' o
 * assente si prova a leggere il nome; se nemmeno quello aiuta, resta 'altro'/assente — mai
 * inventare una categoria senza nessun segnale.
 */
export function inferSiteTypeFromName(name: string, subtype: SiteType | null | undefined): SiteType | undefined {
  if (subtype && subtype !== 'altro') return subtype
  const lower = name.toLowerCase()
  for (const [needle, type] of NAME_TYPE_HINTS) {
    if (lower.includes(needle)) return type
  }
  return subtype ?? undefined
}
