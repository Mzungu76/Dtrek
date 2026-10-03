import type { CamminoSpec, TappaSpec } from './types'

// Ondata 3 — tracce ricevute il 2026-10-03 (10 zip). Non importati:
//  - Cammino delle Sette Sorelle: zip identico a quello dell'ondata 1 (già importato).
//  - Cammino di San Benedetto: esiste già nel catalogo da OpenStreetMap (cammino/cammino-san-benedetto, 16 tappe); in attesa di decisione.
// Le varianti stanno in cammini a parte (structure 'rete'). Tracce uniche senza tappe → computeTappe.

const OROPA = '0ea53c71-Cammino-di-Oropa/'
const MICHELE = '166a7e5e-Cammino-di-San-Michele/tracce/'
const BARTOLOMEO = '2976416a-Cammino-di-San-Bartolomeo/Cammino di San Bartolomeo.gpx'
const TONINO = '4b087cd7-Cammino-di-Don-Tonino/'
const CHIESETTE = '5615bd80-24_241265-Cammino-delle-44-Chiesette-Votive-nelle-Valli-del-Natisone/24_241265 - Georeferenziazione/Cammino-delle-44-Chiesette-votive-Itinerario-principale.gpx'
const ASSISI = '754a1cca-Cammino_di_Assisi1/'
const FRANCESCO = '8552c20e-Via-di-Francesco-nel-Lazio/'
const HASEKURA = 'c81131df-Cammino-di-Hasekura-e-dei-martiri-giapponesi/Cammino di Hasekura e dei martiri giapponesi.gpx'

const t = (file: string, from?: string, to?: string, name?: string, track?: string): TappaSpec => ({ file, from, to, name, track })
const nn = (n: number) => String(n).padStart(2, '0')
const numbered = (list: TappaSpec[]): TappaSpec[] => list.map((s, i) => ({ ...s, name: s.name ?? `Tappa ${nn(i + 1)}` }))

const TONINO_TAPPE: [string, string, string, string][] = [
  ['01.Molfetta-RuvodiPuglia-ComunitàCASA.gpx', 'Molfetta', 'Comunità CASA (Ruvo di Puglia)', ''],
  ['02.ComunitaCASA-Sovereto-Terlizzi.gpx', 'Comunità CASA (Ruvo di Puglia)', 'Terlizzi', ''],
  ['03.Terlizzi-Giovinazzo.gpx', 'Terlizzi', 'Giovinazzo', ''],
  ['04.Giovinazzo-SantoSpirito-Bari.gpx', 'Giovinazzo', 'Bari', ''],
  ['05.Bari-Capurso-Rutigliano.gpx', 'Bari', 'Rutigliano', ''],
  ['06.Rutigliano-Conversano-Castellana.gpx', 'Rutigliano', 'Castellana Grotte', ''],
  ['07.Castellana-Abb.Noci.gpx', 'Castellana Grotte', 'Abbazia Madonna della Scala (Noci)', ''],
  ['08.Abbazia-Noci-Alberobello.gpx', 'Abbazia Madonna della Scala (Noci)', 'Alberobello', ''],
  ['09.Alberobello-MartinaFranca.gpx', 'Alberobello', 'Martina Franca', ''],
  ['10.MartinaFranca-CeglieMessapica.gpx', 'Martina Franca', 'Ceglie Messapica', ''],
  ['11.CeglieMessapica-SanVitodeiNormanni.gpx', 'Ceglie Messapica', 'San Vito dei Normanni', ''],
  ['12.SanVitodeiNormanni-Mesagne.gpx', 'San Vito dei Normanni', 'Mesagne', ''],
  ['13.Mesagne-SanPietroVernotico-Torchiarolo.gpx', 'Mesagne', 'Torchiarolo', ''],
  ['14.Torchiarolo-Surbo-Lecce.gpx', 'Torchiarolo', 'Lecce', ''],
  ['15.Lecce-SanDonato-Sternatia-Soleto-Galatina.gpx', 'Lecce', 'Galatina', ''],
  ['16.Galatina-Cutrofiano-Ruffano.gpx', 'Galatina', 'Ruffano', ''],
  ['17.Ruffano-Specchia-Tricase-Alessano.gpx', 'Ruffano', 'Alessano', ''],
  ['18.Alessano-Leuca.gpx', 'Alessano', 'Santa Maria di Leuca', ''],
]

export const ONDATA_3: CamminoSpec[] = [
  {
    id: 'cammino-di-oropa', name: 'Cammino di Oropa', region: 'Piemonte', theme: 'religioso', structure: 'cammino',
    tappe: numbered([
      t(`${OROPA}co01-da-santhia-roppolo.gpx`, 'Santhià', 'Roppolo'),
      t(`${OROPA}co02-da-roppolo-sala-biellese.gpx`, 'Roppolo', 'Sala Biellese'),
      t(`${OROPA}co03-da-sala-biellese-al-santuario-di-graglia.gpx`, 'Sala Biellese', 'Santuario di Graglia'),
      t(`${OROPA}co04-dal-santuario-di-graglia-al-santuario-di-orop.gpx`, 'Santuario di Graglia', 'Santuario di Oropa'),
    ]),
  },
  {
    id: 'cammino-di-oropa-varianti', name: 'Cammino di Oropa — Varianti', region: 'Piemonte', theme: 'religioso', structure: 'rete',
    tappe: [
      t(`${OROPA}co01b-santhia-ostello-europa-agriturismo-tra-serra-e-lago-a-viverone-deviazione-rispetto-roppolo.gpx`, 'Santhià', 'Roppolo', 'CO01b Per Ostello Viverone'),
      t(`${OROPA}co02v-variante-breve-da-torrazzo-verso-il-santuari.gpx`, 'Torrazzo', 'Santuario di Graglia', 'CO02V Variante breve da Torrazzo'),
      t(`${OROPA}co03v-torrazzo-sala-la-coccinella-graglia.gpx`, 'Netro', 'Graglia', 'CO03V Da Netro a Graglia'),
      t(`${OROPA}co04-variante-tramvia-da-graglia-oropa.gpx`, 'Santuario di Graglia', 'Santuario di Oropa', 'CO04V Variante della tramvia'),
    ],
  },
  {
    id: 'cammino-di-san-michele', name: 'Cammino di San Michele', region: 'Italia', theme: 'religioso', structure: 'cammino', computeTappe: true,
    split: { minPopulation: 2000 },
    notes: 'Tracce per regione concatenate in ordine: Piemonte → Lombardia → Emilia-Romagna → Toscana → Lazio → Molise → Puglia (Sacra di San Michele → Monte Sant\'Angelo). Tappe calcolate sui borghi con almeno 2000 abitanti. Varianti Toscana nel cammino Varianti; poi.geojson (punti d\'interesse e tracce alternative) non importato.',
    tappe: [{
      file: `${MICHELE}Piemonte.gpx`,
      moreFiles: ['Lombardia', 'Emilia-Romagna', 'toscana', 'Lazio', 'Molise', 'Puglia'].map(r => `${MICHELE}${r}.gpx`),
    }],
  },
  {
    id: 'cammino-di-san-michele-varianti', name: 'Cammino di San Michele — Varianti', region: 'Toscana', theme: 'religioso', structure: 'rete',
    tappe: [
      t(`${MICHELE}Toscana_1.gpx`, undefined, undefined, 'Variante Sasso Fortino'),
      t(`${MICHELE}Toscana_2.gpx`, undefined, undefined, 'Variante Paganico'),
    ],
  },
  {
    id: 'cammino-di-san-bartolomeo', name: 'Cammino di San Bartolomeo', region: 'Toscana', theme: 'religioso', structure: 'cammino', computeTappe: true,
    notes: 'Tappe calcolate (la traccia "completo" è unica).',
    tappe: [t(BARTOLOMEO)],
  },
  {
    id: 'cammino-di-hasekura', name: 'Cammino di Hasekura e dei martiri giapponesi', region: 'Lazio', theme: 'storico', structure: 'cammino', computeTappe: true,
    notes: 'Tappe calcolate (la traccia ufficiale è unica).',
    tappe: [t(HASEKURA)],
  },
  {
    id: 'cammino-di-don-tonino', name: 'Cammino di Don Tonino', region: 'Puglia', theme: 'religioso', structure: 'cammino',
    notes: 'Molfetta → Santa Maria di Leuca.',
    tappe: numbered(TONINO_TAPPE.map(([f, from, to]) => t(`${TONINO}${f}`, from, to))),
  },
  {
    id: 'cammino-delle-44-chiesette-votive', name: 'Cammino delle 44 Chiesette Votive', region: 'Friuli-Venezia Giulia', theme: 'religioso', structure: 'cammino', computeTappe: true,
    notes: 'Itinerario principale ad anello nelle Valli del Natisone (121,8 km). Tappe calcolate. I 66 waypoint (chiesette) non sono importati.',
    tappe: [t(CHIESETTE)],
  },
  {
    id: 'via-di-francesco-nel-lazio', name: 'Via di Francesco nel Lazio', region: 'Lazio', theme: 'religioso', structure: 'cammino',
    notes: 'Piediluco → San Pietro per Rieti e Monterotondo. Alternative (via Greccio, variante per Farfa) nel cammino Varianti; il duplicato "08 (1)" è ignorato.',
    tappe: numbered([
      t(`${FRANCESCO}01_Tappa-da-Piediluco-a-Poggio-Bustone.GPX`, 'Piediluco', 'Poggio Bustone'),
      t(`${FRANCESCO}02_Tappa-da-Poggio-Bustone-a-Rieti.GPX`, 'Poggio Bustone', 'Rieti'),
      t(`${FRANCESCO}06_Tappa-da-Rieti-a-Poggio-San-Lorenzo.GPX`, 'Rieti', 'Poggio San Lorenzo'),
      t(`${FRANCESCO}08_Tappa-da-Poggio-San-Lorenzo-a-Ponticelli-Sabino.GPX`, 'Poggio San Lorenzo', 'Ponticelli Sabino'),
      t(`${FRANCESCO}Via-di-Roma-Tappa-20-da-Ponticelli-di-Scandriglia-a-Monterotondo.GPX`, 'Ponticelli Sabino', 'Monterotondo'),
      t(`${FRANCESCO}Via-di-Roma-Tappa-21-da-Monterotondo-a-Monte-Sacro.GPX`, 'Monterotondo', 'Monte Sacro'),
      t(`${FRANCESCO}13_Tappa-da-Montesacro-a-San-Pietro.GPX`, 'Monte Sacro', 'San Pietro'),
    ]),
  },
  {
    id: 'via-di-francesco-nel-lazio-varianti', name: 'Via di Francesco nel Lazio — Varianti', region: 'Lazio', theme: 'religioso', structure: 'rete',
    tappe: [
      t(`${FRANCESCO}03_Tappa-da-Poggio-Bustone-a-Greccio.GPX`, 'Poggio Bustone', 'Greccio', 'Poggio Bustone → Greccio'),
      t(`${FRANCESCO}04_Tappa-da-Greccio-a-Rieti.GPX`, 'Greccio', 'Rieti', 'Greccio → Rieti'),
      t(`${FRANCESCO}05_Tappa-da-Terni-a-Greccio.GPX`, 'Terni', 'Greccio', 'Terni → Greccio'),
      t(`${FRANCESCO}09_Tappa-Variante-per-Farfa.GPX`, undefined, undefined, 'Variante per Farfa'),
    ],
  },
  {
    id: 'cammino-di-assisi', name: 'Cammino di Assisi', region: 'Italia', theme: 'religioso', structure: 'cammino',
    notes: 'Rocca San Casciano → Assisi (Emilia-Romagna, Toscana, Umbria): tracce "h-" e "L-" in sequenza, solo la traccia principale di ogni file.',
    tappe: numbered([
      t(`${ASSISI}h-RoccaSC-Premilcuore.gpx`, 'Rocca San Casciano', 'Premilcuore', undefined, '#0'),
      t(`${ASSISI}h-Premilcuore-Corniolo.gpx`, 'Premilcuore', 'Corniolo'),
      t(`${ASSISI}h-Corniolo-Camaldoli.gpx`, 'Corniolo', 'Camaldoli'),
      t(`${ASSISI}h-Camaldoli_Serravalle- Biforco.gpx`, 'Camaldoli', 'Biforco'),
      t(`${ASSISI}h-Biforco-Caprese.gpx`, 'Biforco', 'Caprese Michelangelo', undefined, '#0'),
      t(`${ASSISI}h-Caprese-Sansepolcro.gpx`, 'Caprese Michelangelo', 'Sansepolcro'),
      t(`${ASSISI}L-Sansepolcro-Citt�diCastello.gpx`, 'Sansepolcro', 'Città di Castello', undefined, '#0'),
      t(`${ASSISI}L-Cittadi-Pietralunga.gpx`, 'Città di Castello', 'Pietralunga'),
      t(`${ASSISI}h-Pietralunga-Gubbio.gpx`, 'Pietralunga', 'Gubbio', undefined, '#0'),
      t(`${ASSISI}h-Gubbio-Eremo_Vigneto.gpx`, 'Gubbio', 'Eremo del Vigneto'),
      t(`${ASSISI}h-Eremo_vigneto-Valfabbrica.gpx`, 'Eremo del Vigneto', 'Valfabbrica'),
      t(`${ASSISI}h-Valfabbrica - Assisi.gpx`, 'Valfabbrica', 'Assisi', undefined, '#0'),
    ]),
  },
  {
    id: 'cammino-di-assisi-varianti', name: 'Cammino di Assisi — Varianti', region: 'Italia', theme: 'religioso', structure: 'rete',
    tappe: [
      t(`${ASSISI}h-RoccaSC-Premilcuore.gpx`, 'Rocca San Casciano', 'Premilcuore', 'Variante del guado', '#1'),
      t(`${ASSISI}h-Biforco-Caprese.gpx`, 'Biforco', 'Caprese Michelangelo', 'Variante al sentiero 53', '#1'),
      t(`${ASSISI}L-Sansepolcro-Citt�diCastello.gpx`, 'Sansepolcro', 'Città di Castello', 'Variante pioggia', '#1'),
      t(`${ASSISI}h-Pietralunga-Gubbio.gpx`, 'Pietralunga', 'Gubbio', 'Variante Pietralunga → Gubbio', '#1'),
      t(`${ASSISI}h-Gubbio-Valfabbrica.gpx`, 'Gubbio', 'Valfabbrica', 'Gubbio → Valfabbrica (diretta)'),
      t(`${ASSISI}h-Valfabbrica - Assisi.gpx`, 'Valfabbrica', 'Assisi', 'Variante 1 Valfabbrica → Assisi', '#1'),
      t(`${ASSISI}h-Valfabbrica - Assisi.gpx`, 'Valfabbrica', 'Assisi', 'Variante 2 Valfabbrica → Assisi', '#2'),
    ],
  },
]
