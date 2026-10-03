// Cammini importati da tracce GPX/KML fornite dagli enti (non da OpenStreetMap): per ognuno, quali
// file/tracce sono le tappe e come si chiamano i capi. I percorsi sono relativi alla cartella --src
// (gli zip ricevuti, scompattati). Un cammino con `structure: 'rete'` raccoglie varianti o percorsi
// alternativi: l'utente ne sceglie uno, non li cammina in sequenza.

export interface TappaSpec {
  /** File (GPX/KML) relativo alla cartella sorgente. */
  file: string
  /** Se il file contiene più tracce: espressione sul nome della traccia (decodificato). Senza: tutte, concatenate. */
  track?: string
  /** Nome mostrato; default `Tappa <ordinale>`. */
  name?: string
  from?: string
  to?: string
}

export interface CamminoSpec {
  /** Entra nel source_id (`cammino/<id>`): non rinominare dopo l'import. */
  id: string
  name: string
  region: string
  theme: 'religioso' | 'storico' | 'naturalistico'
  structure: 'cammino' | 'rete'
  tappe: TappaSpec[]
  /** Se presente, forza "da rivedere" (le tracce non bastano a ricostruire una sequenza affidabile). */
  reviewReason?: string
  notes?: string
  /** Ordinali dopo i quali un salto fra tappe è atteso (traghetto, trasferimento) e non va segnalato. */
  allowGapsAfter?: number[]
}

const SANTUARI = '149dc53e-Cammino-dei-Santuari-del-Mare/'
const PROTO = '5e4a5c3d-Cammino-dei-Protomartiri-Francescani/'
const PICENTINI = '034230b4-Cammino-dei-Picentini/'
const FLORENSI = '3537c458-Cammino-dei-Florensi/'
const CAPPUCCINI = 'd6d5d65b-Cammino-dei-Cappuccini/'
const SETTE = '60f02d5a-26_102458-Georeferenziazione-Cammino-delle-Sette-Sorelle/'
const MONTICINO = 'b5f71455-24_160368-Cammini-della-Madonna-del-Monticino-e-Percorsi-Medievali/24_160368 - Georeferenziazione/'
const CIMINO = '6fd5d255-Anello-Cimino-Cammino-dei-Santi-Patroni-UFFICIALE/Anello Cimino - Cammino dei Santi Patroni UFFICIALE.gpx'
const FRANCESCANI = 'c1b98949-26_118070-Georeferenziazione-Cammino-dei-Francescani/26_118070 - Georeferenziazione/cammino-dei-francescani-percorso.gpx'
const GRAZIE = '7b60d8fc-Alta-Via-delle-Grazie/TRACCE GPX 13 TAPPE-20230620T112128Z-001_x/TRACCE GPX 13 TAPPE/'
const BASILIANO = 'b07bcaa0-CamminoBasiliano-tracciati-GPS/CamminoBasiliano-tracciati-GPS/Traccia-completa-cammino-basiliano-completo.gpx'

// Cammino Basiliano: numero CB → capi. Le tracce stanno tutte nel GPX completo (81 tracce).
const CB_CALABRO: Record<number, [string, string]> = {
  1: ['Rocca Imperiale', 'Nocara'], 2: ['Nocara', 'Oriolo'], 3: ['Rocca Imperiale', 'Montegiordano'], 4: ['Montegiordano', 'Oriolo'],
  5: ['Oriolo', 'Alessandria del Carretto'], 6: ['Alessandria del Carretto', 'Cerchiara di Calabria'], 7: ['Cerchiara di Calabria', 'Civita'],
  8: ['Civita', 'Cassano allo Ionio'], 9: ['Cassano allo Ionio', 'Terranova da Sibari'], 10: ['Terranova da Sibari', 'San Demetrio Corone'],
  11: ['San Demetrio Corone', 'Acri'], 12: ['Acri', 'Corigliano Calabro'], 13: ['Corigliano Calabro', 'Rossano'], 14: ['Rossano', 'Paludi'],
  15: ['Paludi', 'Longobucco'], 16: ['Paludi', 'Longobucco'], 17: ['Longobucco', 'Bocchigliero'], 18: ['Bocchigliero', 'Campana'],
  19: ['Campana', 'Umbriatico'], 20: ['Umbriatico', 'Verzino'], 21: ['Verzino', 'Pino Grande'], 22: ['Pino Grande', 'San Giovanni in Fiore'],
  23: ['San Giovanni in Fiore', 'Lago Ampollino'], 24: ['San Giovanni in Fiore', 'Lago Ampollino'], 25: ['Lago Ampollino', 'Petilia Policastro'],
  26: ['Lago Ampollino', 'Gariglione'], 27: ['San Giovanni in Fiore', 'Caccuri'], 28: ['Caccuri', 'Santa Severina'], 29: ['Santa Severina', 'Petilia Policastro'],
  30: ['Petilia Policastro', 'Mesoraca'], 31: ['Mesoraca', 'Sersale'], 32: ['Gariglione', 'Sersale'], 33: ['Sersale', 'Sellia Superiore'],
  34: ['Sellia Superiore', 'Villaggio Mancuso'], 35: ['Villaggio Mancuso', 'Pentone'], 36: ['Pentone', 'Catanzaro'], 37: ['Sellia', 'Catanzaro'],
  38: ['Catanzaro', 'Tiriolo'], 39: ['Tiriolo', 'San Floro'], 40: ['San Floro', 'Squillace'], 41: ['Squillace', 'San Vito sullo Ionio'],
  42: ['San Vito sullo Ionio', 'Torre Ruggiero'], 43: ['Torre Ruggiero', 'Satriano'], 44: ['Torre Ruggiero', 'Satriano'], 45: ['Satriano', "Sant'Andrea Apostolo"],
  46: ["Sant'Andrea Apostolo", 'Badolato'], 47: ['Badolato', 'Guardavalle'], 48: ['Torre Ruggiero', 'Serra San Bruno'], 49: ['Serra San Bruno', 'Bivongi'],
  50: ['Serra San Bruno', 'Bivongi'], 51: ['Guardavalle', 'Bivongi'], 52: ['Bivongi', 'Pazzano'], 53: ['Bivongi', 'Pazzano'],
  54: ['Pazzano', 'Caulonia'], 55: ['Caulonia', 'Gioiosa Ionica'], 56: ['Gioiosa Ionica', 'Gerace'], 57: ['Gerace', 'Ardore'],
  58: ['Gerace', 'Bovalino'], 59: ['Ardore', 'Bovalino'], 60: ['Bovalino', 'Bianco'], 61: ['Bianco', 'Samo'], 62: ['Samo', 'Staiti'],
  63: ['Samo', 'Africo Vecchio'], 64: ['Staiti', 'Palizzi'], 65: ['Palizzi', 'Bova'], 66: ['Africo Vecchio', 'Galliciano'], 67: ['Bova', 'Bagaladi'],
  68: ['Galliciano', 'Bagaladi'], 69: ['Bagaladi', 'Pentedattilo'], 70: ['Pentedattilo', 'Motta San Giovanni'], 71: ['Motta San Giovanni', 'Armo'],
  72: ['Armo', 'Reggio Calabria'],
}
const CB_LUCANO: Record<number, [string, string]> = {
  1: ['Lauria', 'Castelluccio Superiore'], 2: ['Castelluccio Superiore', 'Rotonda'], 3: ['Rotonda', 'Viggianello'],
  4: ['Viggianello', 'Madonna del Pollino'], 5: ['Madonna del Pollino', 'Terranova del Pollino'], 6: ['Terranova del Pollino', 'Alessandria del Carretto'],
}

const pad = (n: number) => String(n).padStart(2, '0')
const calabro = (n: number, label = `CB-${pad(n)}`): TappaSpec => ({ file: BASILIANO, track: `^${pad(n)}[-\\s]`, name: label, from: CB_CALABRO[n][0], to: CB_CALABRO[n][1] })
const lucano = (n: number, label = `CBL-${pad(n)}`): TappaSpec => ({ file: BASILIANO, track: `^${pad(n)}_(?!.*Variante)`, name: label, from: CB_LUCANO[n][0], to: CB_LUCANO[n][1] })

// Percorso principale del tratto calabro: dove ci sono alternative si è scelta quella numerata come
// tappa (non WILD, non "opzione più difficile", non 29 bis); le altre vanno nel cammino delle varianti.
const CALABRO_MAIN = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 25, 30, 31, 33, 34, 35, 36, 38, 39, 40, 41, 42, 48, 50, 53, 54, 55, 56, 57, 59, 60, 61, 62, 64, 65, 67, 69, 70, 71, 72]
const CALABRO_VARIANTI = [3, 4, 15, 24, 26, 27, 28, 29, 32, 37, 43, 44, 45, 46, 47, 49, 51, 52, 58, 63, 66, 68]

const grazie = (n: number, file: string, from: string, to: string): TappaSpec => ({ file: `${GRAZIE}${file}`, name: `Tappa ${pad(n)}`, from, to })
const station = (file: string, from: string, to: string, name?: string): TappaSpec => ({ file, from, to, name })

export const TRACK_CAMMINI: CamminoSpec[] = [
  {
    id: 'cammino-santuari-del-mare', name: 'Cammino dei Santuari del Mare', region: 'Liguria', theme: 'religioso', structure: 'cammino',
    tappe: [
      station(`${SANTUARI}Tappa-01-Sestri-Guardia.gpx`, 'Sestri Ponente', 'N.S. della Guardia'),
      station(`${SANTUARI}Tappa-02-Guardia-Campo-Ligure-1.gpx`, 'N.S. della Guardia', 'Campo Ligure'),
      station(`${SANTUARI}Tappa-03-Campo-Ligure-Tiglieto-1.gpx`, 'Campo Ligure', 'Tiglieto'),
      station(`${SANTUARI}Tappa-04-Tiglieto-Arenzano.gpx`, 'Tiglieto', 'Arenzano'),
      station(`${SANTUARI}Tappa-05-Arenzano-Acquasanta-1.gpx`, 'Arenzano', 'Acquasanta'),
      station(`${SANTUARI}Tappa-06-Acquasanta-Pegli.gpx`, 'Acquasanta', 'Pegli'),
    ],
  },
  {
    id: 'cammino-protomartiri-francescani', name: 'Cammino dei Protomartiri Francescani', region: 'Umbria', theme: 'religioso', structure: 'cammino',
    notes: 'Anello Terni → Terni. File GPX e KML identici: usati i KML (i GPX sono in zip annidati).',
    tappe: [
      station(`${PROTO}Tappa-1-Cammino-dei-Protomartiri-da-Terni-a-Stroncone.kml`, 'Terni', 'Stroncone'),
      station(`${PROTO}Tappa-2-Cammino-dei-Protomartiri-da-Stroncone-a-Calvi-dell-umbria.kml`, 'Stroncone', "Calvi dell'Umbria"),
      station(`${PROTO}Tappa-3-Cammino-dei-Protomartiri-da-Calvi-dell-umbria-a-Narni.kml`, "Calvi dell'Umbria", 'Narni'),
      station(`${PROTO}Tappa-4-Cammino-dei-Protomartiri-da-Narni-a-San-Gemini.kml`, 'Narni', 'San Gemini'),
      station(`${PROTO}Tappa-5-Cammino-dei-Protomartiri-da-San-Gemini-a-Cesi.kml`, 'San Gemini', 'Cesi'),
      station(`${PROTO}Tappa-6-Cammino-dei-Protomartiri-da-Cesi-a-Terni.kml`, 'Cesi', 'Terni'),
    ],
  },
  {
    id: 'cammino-dei-picentini', name: 'Cammino dei Picentini', region: 'Campania', theme: 'naturalistico', structure: 'cammino',
    notes: 'I KML non riportano i nomi delle località: capi tappa ricavati dal borgo più vicino (entro 1,5 km).',
    tappe: [1, 2, 3, 4, 5, 6, 7].map(n => ({ file: `${PICENTINI}TAPPA${n}.kml` })),
  },
  {
    id: 'cammino-dei-francescani-abruzzo', name: 'Cammino dei Francescani', region: 'Abruzzo', theme: 'religioso', structure: 'rete',
    reviewReason: 'Il file contiene 11 tratti senza nome né numerazione, non in sequenza (con diramazioni): ordine e tappe da confermare con l\'ente.',
    tappe: Array.from({ length: 11 }, (_, i) => ({ file: FRANCESCANI, track: `#${i}`, name: `Tratto ${pad(i + 1)}` })),
  },
  {
    id: 'cammino-dei-florensi', name: 'Cammino dei Florensi', region: 'Calabria', theme: 'religioso', structure: 'cammino',
    tappe: [
      station(`${FLORENSI}Celico - Pietrafitta .gpx`, 'Celico', 'Pietrafitta'),
      station(`${FLORENSI}Pietrafitta - Ceci.gpx`, 'Pietrafitta', 'Ceci'),
      station(`${FLORENSI}Ceci - Lorica .gpx`, 'Ceci', 'Lorica'),
      station(`${FLORENSI}Lorica - Cagno .gpx`, 'Lorica', 'Cagno'),
      station(`${FLORENSI}Cagno - S. Giovanni in Fiore .gpx`, 'Cagno', 'San Giovanni in Fiore'),
    ],
  },
  {
    id: 'cammino-dei-florensi-variante-prato-piano', name: 'Cammino dei Florensi — Variante Prato Piano', region: 'Calabria', theme: 'religioso', structure: 'cammino',
    notes: 'Prima tappa sulla variante Prato Piano, tappe 2-5 in comune col percorso principale.',
    tappe: [
      station(`${FLORENSI}Celico - Pietrafitta Variante Prato Piano.gpx`, 'Celico', 'Pietrafitta'),
      station(`${FLORENSI}Pietrafitta - Ceci.gpx`, 'Pietrafitta', 'Ceci'),
      station(`${FLORENSI}Ceci - Lorica .gpx`, 'Ceci', 'Lorica'),
      station(`${FLORENSI}Lorica - Cagno .gpx`, 'Lorica', 'Cagno'),
      station(`${FLORENSI}Cagno - S. Giovanni in Fiore .gpx`, 'Cagno', 'San Giovanni in Fiore'),
    ],
  },
  {
    id: 'cammino-dei-cappuccini', name: 'Cammino dei Cappuccini', region: 'Marche', theme: 'religioso', structure: 'cammino',
    tappe: [
      station(`${CAPPUCCINI}Tappa1-Fossombrone-Gola-del-Furlo-1.gpx`, 'Fossombrone', 'Gola del Furlo'),
      station(`${CAPPUCCINI}Tappa2-Gola-del-Furlo-Cagli-2.gpx`, 'Gola del Furlo', 'Cagli'),
      station(`${CAPPUCCINI}Tappa3-Cagli-Fonte-Avellana-1.gpx`, 'Cagli', 'Fonte Avellana'),
      station(`${CAPPUCCINI}Tappa-4-Fonte-Avellana-Pascelupo-1.gpx`, 'Fonte Avellana', 'Pascelupo'),
      station(`${CAPPUCCINI}Tappa-5-Pascelupo-Fabriano-1.gpx`, 'Pascelupo', 'Fabriano'),
      station(`${CAPPUCCINI}Tappa-6-Fabriano-Poggio-San-Romualdo-1.gpx`, 'Fabriano', 'Poggio San Romualdo'),
      station(`${CAPPUCCINI}Tappa-7-Poggio-San-Romualdo-Cupramontana-7.gpx`, 'Poggio San Romualdo', 'Cupramontana'),
      station(`${CAPPUCCINI}Tappa-8-Cupramontana-Cingoli-1.gpx`, 'Cupramontana', 'Cingoli'),
      station(`${CAPPUCCINI}Tappa-9-Cingoli-San-Severino-Marche.gpx`, 'Cingoli', 'San Severino Marche'),
      station(`${CAPPUCCINI}Tappa-10-San-Severino-Marche-Camerino-1.gpx`, 'San Severino Marche', 'Camerino'),
      station(`${CAPPUCCINI}Tappa-11-Camerino-San-Lorenzo-al-Lago-1.gpx`, 'Camerino', 'San Lorenzo al Lago'),
      station(`${CAPPUCCINI}Tappa-12-San-Lorenzo-al-Lago-Sarnano.gpx`, 'San Lorenzo al Lago', 'Sarnano'),
      station(`${CAPPUCCINI}Tappa-13-Sarnano-Montefortino-1.gpx`, 'Sarnano', 'Montefortino'),
      station(`${CAPPUCCINI}Tappa-14-Montefortino-Montefalcone-Appennino.gpx`, 'Montefortino', 'Montefalcone Appennino'),
      station(`${CAPPUCCINI}Tappa-15-Montefalcone-Appennino-Rotella-2.gpx`, 'Montefalcone Appennino', 'Rotella'),
      station(`${CAPPUCCINI}Tappa-16-Rotella-Offida-1.gpx`, 'Rotella', 'Offida'),
      station(`${CAPPUCCINI}Tappa-17-Offida-Ascoli-Piceno-1.gpx`, 'Offida', 'Ascoli Piceno'),
    ],
  },
  {
    id: 'cammino-delle-sette-sorelle', name: 'Cammino delle Sette Sorelle', region: 'Abruzzo', theme: 'naturalistico', structure: 'cammino',
    notes: 'Tappe 3 e 4 con più tracce (concatenate). Capi tappa dal borgo più vicino.',
    tappe: [`Tappa 1.gpx`, `Tappa 2 DEF 02_06_26.gpx`, `Tappa 3.gpx`, `Tappa 4.gpx`, `Tappa 5 DEF 13_06_26.gpx`, `Tappa 6.gpx`, `Tappa 7 DEF 02_06_26.gpx`].map(f => ({ file: SETTE + f })),
  },
  {
    id: 'cammini-madonna-del-monticino', name: 'Cammini della Madonna del Monticino', region: 'Emilia-Romagna', theme: 'religioso', structure: 'rete',
    notes: 'Percorsi ad anello con partenza dal Santuario (non una sequenza di tappe).',
    tappe: [
      { file: `${MONTICINO}Madonna del Monticino1.gpx`, name: 'Percorso 1' },
      { file: `${MONTICINO}Madonna del Monticino2.gpx`, name: 'Percorso 2' },
      { file: `${MONTICINO}Madonna del Monticino3.gpx`, name: 'Percorso 3' },
      { file: `${MONTICINO}Madonna del Monticino 4.1 001.gpx`, name: 'Percorso 4.1' },
      { file: `${MONTICINO}Madonna del Monticino 4.2 001.gpx`, name: 'Percorso 4.2' },
    ].map(t => ({ ...t, from: 'Madonna del Monticino', to: 'Madonna del Monticino' })),
  },
  {
    id: 'anello-cimino-santi-patroni', name: 'Anello Cimino — Cammino dei Santi Patroni', region: 'Lazio', theme: 'religioso', structure: 'cammino',
    notes: 'Anello Viterbo → Viterbo. Usate le 3 tappe ufficiali; ignorati l\'anello intero e le tracce "In Punta di Piedi" (duplicati).',
    tappe: [
      { file: CIMINO, track: '^ANELLO CIMINO 01', from: 'Viterbo', to: 'Vignanello' },
      { file: CIMINO, track: '^ANELLO CIMINO 02', from: 'Vignanello', to: 'Caprarola' },
      { file: CIMINO, track: '^ANELLO CIMINO 03', from: 'Caprarola', to: 'Viterbo' },
    ],
  },
  {
    id: 'alta-via-delle-grazie', name: 'Alta Via delle Grazie', region: 'Lombardia', theme: 'religioso', structure: 'cammino',
    notes: 'Versione a piedi in 13 tappe (anello Bergamo → Bergamo). Tappa 10 = giro di Monte Isola (si raggiunge in battello da Lovere); variante tappa 4 e traccia breve di Monte Isola nelle varianti.',
    allowGapsAfter: [9, 10],
    tappe: [
      grazie(1, 'Tappa 1- Bergamo-Selvino.gpx', 'Bergamo', 'Selvino'),
      grazie(2, 'Tappa 2- Selvino-Vertova.gpx', 'Selvino', 'Vertova'),
      grazie(3, 'Tappa 3- Vertova-Oneta (Sant. Frassino).gpx', 'Vertova', 'Santuario del Frassino'),
      grazie(4, 'Tappa 4- Oneta (Sant. Frassino)-Parre.gpx', 'Santuario del Frassino', 'Parre'),
      grazie(5, 'Tappa 5- Parre-Novazza.gpx', 'Parre', 'Novazza'),
      grazie(6, 'Tappa 6- Novazza-Lizzola.gpx', 'Novazza', 'Lizzola'),
      grazie(7, 'Tappa 7- Lizzola-Ardesio.gpx', 'Lizzola', 'Ardesio'),
      grazie(8, 'Tappa 8- Ardesio-Castione della Presolana.gpx', 'Ardesio', 'Castione della Presolana'),
      grazie(9, 'Tappa 9- Castione della Presolana-Lovere.gpx', 'Castione della Presolana', 'Lovere'),
      grazie(10, 'Tappa 10 Montisola-gpx.gpx', 'Monte Isola', 'Monte Isola'),
      grazie(11, 'Tappa 11- Lovere-Gandino.gpx', 'Lovere', 'Gandino'),
      grazie(12, 'Tappa 12- Gandino-Fiobbio.gpx', 'Gandino', 'Fiobbio'),
      grazie(13, 'Tappa 13- Fiobbio-Bergamo.gpx', 'Fiobbio', 'Bergamo'),
    ],
  },
  {
    id: 'alta-via-delle-grazie-varianti', name: 'Alta Via delle Grazie — Varianti', region: 'Lombardia', theme: 'religioso', structure: 'rete',
    tappe: [
      { file: `${GRAZIE}Tappa 4- VARIANTE Oneta (Sant. Frassino)-Parre.gpx`, name: 'Variante tappa 4', from: 'Santuario del Frassino', to: 'Parre' },
      { file: `${GRAZIE}Tappa 10  Montisola- Carzano-Peschiera Maraglio.gpx`, name: 'Monte Isola: Carzano → Peschiera Maraglio', from: 'Carzano', to: 'Peschiera Maraglio' },
    ],
  },
  {
    id: 'cammino-basiliano-tratto-calabro', name: 'Cammino Basiliano — Tratto calabro', region: 'Calabria', theme: 'religioso', structure: 'cammino',
    notes: 'Percorso principale Rocca Imperiale → Reggio Calabria (numerazione CB ufficiale). Alternative e tratti WILD nel cammino "Varianti".',
    tappe: CALABRO_MAIN.map(n => calabro(n)),
  },
  {
    id: 'cammino-basiliano-tratto-lucano', name: 'Cammino Basiliano — Tratto lucano', region: 'Basilicata', theme: 'religioso', structure: 'cammino',
    notes: 'Lauria → Alessandria del Carretto (si innesta nel tratto calabro).',
    tappe: [1, 2, 3, 4, 5, 6].map(n => lucano(n)),
  },
  {
    id: 'cammino-basiliano-varianti', name: 'Cammino Basiliano — Varianti e tratti WILD', region: 'Calabria', theme: 'religioso', structure: 'rete',
    notes: 'Opzioni alternative, tratti WILD, variante via Caccuri e Santa Severina (CB-27/28/29), percorso "29 bis" ionico e collegamenti del Pollino.',
    tappe: [
      ...CALABRO_VARIANTI.map(n => calabro(n, `CB-${pad(n)}${[24, 26, 32, 49, 63, 66, 68].includes(n) ? ' WILD' : ''}`)),
      { file: BASILIANO, track: '^02_.*Variante', name: 'CBL-02 Variante San Nilo', from: 'Castelluccio Superiore', to: 'Rotonda' },
      { file: BASILIANO, track: '^07_', name: 'CBL-07 Collegamento San Lorenzo Bellizzi', from: 'San Lorenzo Bellizzi', to: 'Terranova del Pollino' },
      { file: BASILIANO, track: '^WILD_MADONNA', name: 'CBL WILD Madonna del Pollino → Civita', from: 'Madonna del Pollino', to: 'Civita' },
    ],
  },
]
