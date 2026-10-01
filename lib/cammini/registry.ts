import type { DiscoveryFamily } from './discovery'

// Registro dei cammini approvati (docs/piano-cammini.md): la lista scelta a mano guardando i
// risultati reali della scoperta nazionale. La scoperta resta automatica (candidati), il registro
// decide cosa entra nel catalogo, in quale ondata e con quale struttura.
//
// `match` si applica alla CHIAVE di famiglia (lib/cammini/discovery.ts's familyKey: minuscolo, senza
// accenti, senza tratti/regioni/sigle di tappa), non al nome grezzo di una singola relazione.

export type CamminoStructure = 'cammino' | 'rete'

export interface RegistryEntry {
  id: string
  name: string
  /** 'rete': centinaia di tappe, nessuno le percorre intere — l'utente sceglie un tratto. */
  structure: CamminoStructure
  /** 1: tappe ufficiali già in OSM · 2: da calcolare (una relazione sola) · 3: rifugi/reti. */
  wave: 1 | 2 | 3
  match: RegExp
  /** Dove si chiudono le tappe: nei paesi (default) o nei rifugi (Alte Vie, GTA, Via Alpina). */
  anchors: 'borghi' | 'rifugi'
  /** Per la ricerca per nome quando la scoperta automatica non lo trova (stringa per Overpass). */
  searchName?: string
  /** Stesso cammino sotto un altro id del registro: da verificare con la geometria prima di tenerli entrambi. */
  overlapsWith?: string
  /** Una sola relazione OSM spezzata in due cammini a un punto (Francigena: Canterbury–Roma / Roma–Leuca). */
  splitAt?: { name: string; lat: number; lon: number; before: string; after: string }
  notes?: string
}

const c = (e: Omit<RegistryEntry, 'structure' | 'anchors'> & Partial<Pick<RegistryEntry, 'structure' | 'anchors'>>): RegistryEntry =>
  ({ structure: 'cammino', anchors: 'borghi', ...e })

export const REGISTRY: RegistryEntry[] = [
  // ── Ondata 1: tappe ufficiali già in OSM ───────────────────────────────────────────────────
  c({
    id: 'via-francigena', name: 'Via Francigena', wave: 1, match: /^via francigena( del sud)?$/, searchName: 'Via Francigena',
    // In OSM la relazione "07 Lazio" copre sia il tratto verso Roma sia la Francigena del Sud: per
    // l'utente sono due cammini (decisione confermata), si dividono a San Pietro.
    splitAt: { name: 'Roma (San Pietro)', lat: 41.9022, lon: 12.4539, before: 'via-francigena', after: 'via-francigena-sud' },
  }),
  c({ id: 'cammino-sant-antonio', name: "Cammino di Sant'Antonio", wave: 1, match: /sant'antonio/, searchName: "Cammino di Sant'Antonio" }),
  c({ id: 'cammino-san-benedetto', name: 'Cammino di San Benedetto', wave: 1, match: /^(il )?cammino di san benedetto/, searchName: 'Cammino di San Benedetto' }),
  c({ id: 'via-matildica', name: 'Via Matildica del Volto Santo', wave: 1, match: /^via matildica/, searchName: 'Via Matildica' }),
  c({ id: 'via-degli-abati', name: 'Via degli Abati', wave: 1, match: /^via (degli )?abati/, searchName: 'Via degli Abati' }),
  c({ id: 'via-vandelli', name: 'Via Vandelli', wave: 1, match: /^via vandelli/, searchName: 'Via Vandelli' }),
  c({ id: 'alpe-adria-trail', name: 'Alpe Adria Trail', wave: 1, match: /^alpe adria trail/, searchName: 'Alpe Adria Trail', notes: 'Attraversa Austria e Slovenia: importare solo i pezzi in Italia.' }),
  c({ id: 'cammino-san-jacopo', name: 'Cammino di San Jacopo', wave: 1, match: /cammino di san jacopo/, searchName: 'Cammino di San Jacopo' }),

  // ── Ondata 2: una relazione sola, tappe da calcolare ───────────────────────────────────────
  c({ id: 'sentiero-della-pace', name: 'Sentiero della Pace', wave: 2, match: /^sentiero della pace/, searchName: 'Sentiero della Pace' }),
  c({ id: 'bassa-via-del-garda', name: 'Bassa Via del Garda', wave: 2, match: /^bassa via del garda/, searchName: 'Bassa Via del Garda' }),
  c({ id: 'cammino-materano', name: 'Cammino Materano', wave: 2, match: /^cammino materano/, searchName: 'Cammino Materano', notes: 'Include la Via Peuceta.' }),
  c({
    id: 'via-di-francesco', name: 'Via di Francesco', wave: 2, match: /^(via|cammino) di francesco/, searchName: 'Francesco',
    // Decisione confermata: un cammino solo con le varianti (Via di Roma, Via del Sud, Cammino di Francesco).
    notes: 'Un solo cammino con le varianti: Via di Roma, Via del Sud, Cammino di Francesco.',
  }),
  c({ id: 'cammino-celeste', name: 'Cammino Celeste', wave: 2, match: /^cammino celeste/, searchName: 'Cammino Celeste' }),
  c({ id: 'via-valtellina', name: 'Via Valtellina', wave: 2, match: /^via valtellina/, searchName: 'Via Valtellina' }),
  c({ id: 'via-claudia-augusta', name: 'Via Claudia Augusta', wave: 2, match: /^via claudia augusta/, searchName: 'Via Claudia Augusta' }),
  c({ id: 'via-romea', name: 'Via Romea', wave: 2, match: /^via romea( germanica)?$/, searchName: 'Via Romea', overlapsWith: 'romea-strata' }),
  c({ id: 'sentiero-spartiacque-appenninico', name: 'Sentiero di spartiacque appenninico', wave: 2, match: /spartiacque appenninico/, searchName: 'spartiacque appenninico' }),
  c({ id: 'via-spluga', name: 'Via Spluga', wave: 2, match: /^via spluga/, searchName: 'Via Spluga' }),
  c({ id: 'cammino-tuscia', name: 'Cammino Tuscia', wave: 2, match: /^cammino tuscia/, searchName: 'Cammino Tuscia' }),
  c({ id: 'via-mercatorum', name: 'Via Mercatorum', wave: 2, match: /^via mercatorum/, searchName: 'Via Mercatorum' }),
  c({ id: 'cammino-due-santuari', name: 'Cammino dei Due Santuari', wave: 2, match: /^cammino dei due santuari/, searchName: 'Cammino dei due Santuari' }),
  c({ id: 'sentiero-degli-ulivi', name: 'Sentiero degli Ulivi', wave: 2, match: /^sentiero degli ulivi/, searchName: 'Sentiero degli Ulivi' }),
  c({ id: 'sentiero-dei-pastori', name: 'Sentiero dei Pastori', wave: 2, match: /^sentiero dei pastori/, searchName: 'Sentiero dei Pastori' }),
  c({ id: 'cammino-della-acqua', name: "Cammino dell'Acqua", wave: 2, match: /^cammino (della|dell') ?acqua/, searchName: 'Cammino della Acqua' }),
  c({ id: 'via-aurelia', name: 'Via Aurelia', wave: 2, match: /^via aurelia/, searchName: 'Via Aurelia', notes: 'Include tratti francesi (Menton…): importare solo i pezzi in Italia.' }),
  c({ id: 'cammino-di-assisi', name: 'Cammino di Assisi', wave: 2, match: /^cammino di assisi/, searchName: 'Cammino di Assisi' }),

  // ── Ondata 3: Alte Vie (tappe in rifugio) e reti (l'utente sceglie un tratto) ─────────────────
  ...[1, 2, 6, 9].map(n => c({
    id: `alta-via-${n}-dolomiti`, name: `Alta Via n. ${n} delle Dolomiti`, wave: 3, anchors: 'rifugi',
    match: new RegExp(`^alta via n\\. ?${n} delle dolomiti`), searchName: `Alta via n. ${n} delle Dolomiti`,
    notes: 'Le tappe si chiudono nei rifugi, non nei paesi (docs/rifugi-progettazione.md).',
  })),
  c({ id: 'via-alpina', name: 'Via Alpina', structure: 'rete', wave: 3, anchors: 'rifugi', match: /^via alpina$/, searchName: 'Via Alpina' }),
  c({ id: 'gta', name: 'Grande Traversata delle Alpi (GTA)', structure: 'rete', wave: 3, anchors: 'rifugi', match: /^(gta|grande traversata delle alpi)$/, searchName: 'Grande Traversata delle Alpi' }),
  c({ id: 'romea-strata', name: 'Romea Strata', structure: 'rete', wave: 3, match: /^romea strata/, searchName: 'Romea Strata', overlapsWith: 'via-romea' }),
  c({ id: 'sentiero-italia', name: 'Sentiero Italia CAI', structure: 'rete', wave: 3, anchors: 'rifugi', match: /^sentiero italia( cai)?$/, searchName: 'Sentiero Italia', notes: 'Rete di ~7000 km: tratto scelto dall\'utente.' }),
]

export type RegistryStatus = 'trovato' | 'solo_da_rivedere' | 'non_trovato'

export interface RegistryMatch {
  entry: RegistryEntry
  families: DiscoveryFamily[]
  relations: number
  /** Pezzi con numero di tappa/figli: indizio che esistono tappe ufficiali in OSM. */
  stageRelations: number
  status: RegistryStatus
}

/** Quali famiglie scoperte corrispondono a ogni voce del registro (e cosa manca). */
export function matchRegistry(families: DiscoveryFamily[], entries: RegistryEntry[] = REGISTRY): RegistryMatch[] {
  return entries.map(entry => {
    const matched = families.filter(f => entry.match.test(f.key))
    const usable = matched.filter(f => f.verdict !== 'scartato' && f.inItaly !== 'no')
    return {
      entry,
      families: matched,
      relations: matched.reduce((s, f) => s + f.members, 0),
      stageRelations: matched.reduce((s, f) => s + f.stageRelations, 0),
      status: matched.length === 0 ? 'non_trovato' : usable.length === 0 ? 'solo_da_rivedere' : 'trovato',
    }
  })
}

/** Le famiglie del registro sono ammesse per decisione umana: il punteggio non conta più. */
export function applyRegistry(families: DiscoveryFamily[], entries: RegistryEntry[] = REGISTRY): DiscoveryFamily[] {
  for (const f of families) {
    const entry = entries.find(e => e.match.test(f.key))
    if (!entry) continue
    f.registryId = entry.id
    f.structure = entry.structure
    // Approvato a mano, ma mai un cammino interamente fuori dall'Italia.
    f.verdict = f.inItaly === 'no' ? 'scartato' : 'ammesso'
  }
  return families
}
