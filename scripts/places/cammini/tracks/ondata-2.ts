import type { CamminoSpec, TappaSpec } from './types'

// Ondata 2 — tracce ricevute il 2026-10-03 (9 zip). Dove una traccia è unica e senza tappe (Perdono, Santo Marino,
// Beato Enrico, Cammino dell'Acqua) le tappe sono calcolate sui borghi del catalogo (computeTappe).
// Le varianti brevi non sono importate: Acqua (Sant'Angelo in Grotte, Sepino), Pace (09b, 10b, 11b, 25, 26b),
// Magna Grecia (2_eremo_santa_severina_VS).

const SPINA = '05ba8c1f-Prot_Par-0008233-del-17-06-2024-Allegato-File-KMZ-e-GPX-Percorso-Santa-Spina/'
const PACE = 'e1d8027c-Cammino-della-Pace/'
const MG = '3684c74d-Cammino-della-Magna-Grecia-con-Via-dellAsceta-1/tracce_gpx/'
const MADONNA_NERA = '7aaa8ac5-Cammino-della-Madonna-Nera/'
const ACQUA = '13a826a3-Tracce_Cammino_dellAcqua1/'
const MARINO = '9f0602c9-Cammino-del-Santo-Marino-Full/Cammino del Santo Marino - Full.gpx'
const SALENTO = '9caa6669-Cammino-del-Salento/'
const PERDONO = '2de86983-Cammino-del-Perdono-Sui-passi-di-Celestino/Cammino del Perdono - Sui passi di Celestino.gpx'
const BEATO = '47d25d40-Cammino-Beato-Enrico-da-Bolzano-traccia-ufficiale-update-jan-20-1/'

const t = (file: string, from?: string, to?: string, name?: string): TappaSpec => ({ file, from, to, name })

// Cammino della Pace: numero tappa → file e capi. Via Apricena (25b + 26) come percorso principale; la via San Severo (25 + 26b) è alternativa.
const PACE_TAPPE: [string, string, string][] = [
  ['01', "L'Aquila", "Villa Sant'Angelo"], ['02', "Villa Sant'Angelo", "Prata d'Ansidonia"], ['03', "Prata d'Ansidonia", 'Caporciano'],
  ['04', 'Caporciano', 'Navelli'], ['05', 'Navelli', 'Bussi sul Tirino'], ['06', 'Bussi sul Tirino', 'San Clemente a Casauria'],
  ['07', 'San Clemente a Casauria', 'Salle'], ['08', 'Salle', 'Caramanico Terme'], ['09', 'Caramanico Terme', 'Roccamorice'],
  ['10', 'Roccamorice', 'Serramonacesca'], ['11', 'Serramonacesca', 'Roccamontepiano'], ['12', 'Roccamontepiano', 'Guardiagrele'],
  ['13', 'Guardiagrele', 'Orsogna'], ['14', 'Orsogna', 'Lanciano'], ['15', 'Lanciano', 'San Giovanni in Venere'],
  ['16', 'San Giovanni in Venere', 'Trabocco Le Morge'], ['17', 'Trabocco Le Morge', 'Casalbordino'], ['18', 'Casalbordino', 'Monteodorisio'],
  ['19', 'Monteodorisio', 'Lentella'], ['20', 'Lentella', 'Montenero di Bisaccia'], ['21', 'Montenero di Bisaccia', 'Guglionesi'],
  ['22', 'Guglionesi', 'Madonna Grande'], ['23', 'Madonna Grande', 'Serracapriola'], ['24', 'Serracapriola', 'San Paolo di Civitate'],
  ['25b', 'San Paolo di Civitate', 'Apricena'], ['26', 'Apricena', 'Santa Maria di Stignano'], ['27', 'Santa Maria di Stignano', 'San Matteo'],
  ['28', 'San Matteo', 'San Giovanni Rotondo'], ['29', 'San Giovanni Rotondo', "Monte Sant'Angelo"],
]

export const ONDATA_2: CamminoSpec[] = [
  {
    id: 'cammino-della-pace', name: 'Cammino della Pace', region: 'Italia', theme: 'religioso', structure: 'cammino',
    notes: "L'Aquila → Monte Sant'Angelo (Abruzzo, Molise, Puglia). Alternative non importate: 09b/10b/11b (via Santo Spirito e Rifugio di Marco) e 25 + 26b (via San Severo).",
    tappe: PACE_TAPPE.map(([n, from, to], i) => t(`${PACE}${n}.gpx`, from, to, `Tappa ${String(i + 1).padStart(2, '0')}`)),
  },
  {
    id: 'cammino-della-magna-grecia', name: 'Cammino della Magna Grecia', region: 'Calabria', theme: 'storico', structure: 'cammino',
    allowGapsAfter: [1, 7],
    notes: 'Anello Crotone → Crotone. Le tracce hanno due salti (3,1 km fra Eremo e Rocca di Neto, 4,6 km fra Casabona e Zinga): collegamenti non tracciati nei file. Il nome del file 10a dice Roccabernarda ma la traccia arriva a Petilia Policastro (segue la 11): capi dati dalla geometria. Variante 2_eremo_santa_severina_VS non importata.',
    tappe: [
      t(`${MG}1.Crotone-Eremo_Via_Sacra.kmz`, 'Crotone', 'Eremo della Via Sacra'),
      t(`${MG}2.Rocca di Neto - Strongoli.kmz`, 'Rocca di Neto', 'Strongoli'),
      t(`${MG}3a_Strongoli_Melissa.kmz`, 'Strongoli', 'Melissa'),
      t(`${MG}3b.Melissa_Cir� Marina.kmz`, 'Melissa', 'Cirò Marina'),
      t(`${MG}4.Cir� Marina - Crucoli.kmz`, 'Cirò Marina', 'Crucoli'),
      t(`${MG}5. CRUCOLI-PERTICARO.kmz`, 'Crucoli', 'Perticaro'),
      t(`${MG}6.Perticaro-Zinga-Casabona.kmz`, 'Perticaro', 'Casabona'),
      t(`${MG}7.zinga-san giovanni in fiore.kmz`, 'Zinga', 'San Giovanni in Fiore'),
      t(`${MG}8_san_giovanni_caccuri.kmz`, 'San Giovanni in Fiore', 'Caccuri'),
      t(`${MG}9. Caccuri - Altilia - Santa Severina.kmz`, 'Caccuri', 'Santa Severina'),
      t(`${MG}10a. Santa severina - ROccabernarda.kmz`, 'Santa Severina', 'Petilia Policastro'),
      t(`${MG}11. Petilia-Mesoraca.kmz`, 'Petilia Policastro', 'Mesoraca'),
      t(`${MG}12.mesoraca-cutro.kmz`, 'Mesoraca', 'Cutro'),
      t(`${MG}13.cutro_san_leonardo.kmz`, 'Cutro', 'San Leonardo'),
      t(`${MG}14a_san leonardo - le castella.kmz`, 'San Leonardo', 'Le Castella'),
      t(`${MG}14b_Le Castella - Capo Rizzuto-isola.kmz`, 'Le Castella', 'Isola di Capo Rizzuto'),
      t(`${MG}15.isola-capo colonna - crotone.kmz`, 'Isola di Capo Rizzuto', 'Crotone'),
    ].map((s, i) => ({ ...s, name: `Tappa ${String(i + 1).padStart(2, '0')}` })),
  },
  {
    id: 'via-dellasceta', name: "Via dell'Asceta", region: 'Calabria', theme: 'religioso', structure: 'cammino',
    tappe: [
      t(`${MG}Via_Asceta/Asceta_1_Belvedere_caccuri.kmz`, 'Belvedere di Spinello', 'Caccuri'),
      t(`${MG}Via_Asceta/Asceta_2 Caccuri-Roccabernarda.kmz`, 'Caccuri', 'Roccabernarda'),
      t(`${MG}Via_Asceta/Asceta_3_Roccabernarda_Petilia.kmz`, 'Roccabernarda', 'Petilia Policastro'),
    ],
  },
  {
    id: 'percorso-santa-spina', name: 'Percorso della Santa Spina', region: 'Calabria', theme: 'religioso', structure: 'cammino',
    notes: 'Percorso breve (3,9 km) a Petilia Policastro, "da San Francesco". Una sola tappa. File GPX (rotta) e KMZ identici.',
    tappe: [t(`${SPINA}percorso ok.gpx`, undefined, undefined, 'Percorso')],
  },
  {
    id: 'cammino-della-madonna-nera', name: 'Cammino della Madonna Nera', region: 'Basilicata', theme: 'religioso', structure: 'cammino',
    tappe: [1, 2, 3, 4].map(n => t(`${MADONNA_NERA}${n} Tappa - Cammino della Madonna Nera.gpx`)),
  },
  {
    id: 'cammino-del-salento-via-dei-borghi', name: 'Cammino del Salento — Via dei Borghi', region: 'Puglia', theme: 'storico', structure: 'cammino',
    tappe: [
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, 'Lecce', 'Sternatia'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, 'Sternatia', 'Corigliano d\'Otranto'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, "Corigliano d'Otranto", 'Otranto'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, 'Otranto', 'Santa Cesarea Terme'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, 'Santa Cesarea Terme', 'Marina Serra'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_dei_Borghi.gpx`, 'Marina Serra', 'Santa Maria di Leuca'),
    ].map((s, i) => ({ ...s, track: `#${i}`, name: `Tappa ${String(i + 1).padStart(2, '0')}` })),
  },
  {
    id: 'cammino-del-salento-via-del-mare', name: 'Cammino del Salento — Via del Mare', region: 'Puglia', theme: 'storico', structure: 'cammino',
    notes: 'La traccia "Percorso senza titolo 1.1" (sesta nel file) è ignorata.',
    tappe: [
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_del_Mare.gpx`, 'Lecce', 'San Foca'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_del_Mare.gpx`, 'San Foca', 'Otranto'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_del_Mare.gpx`, 'Otranto', 'Santa Cesarea Terme'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_del_Mare.gpx`, 'Santa Cesarea Terme', 'Marina Serra'),
      t(`${SALENTO}CAMMINO_DEL_SALENTO_-_Via_del_Mare.gpx`, 'Marina Serra', 'Santa Maria di Leuca'),
    ].map((s, i) => ({ ...s, track: `#${i}`, name: `Tappa ${String(i + 1).padStart(2, '0')}` })),
  },
  {
    id: 'cammino-dellacqua', name: "Cammino dell'Acqua", region: 'Molise', theme: 'naturalistico', structure: 'cammino', computeTappe: true,
    notes: "Castelpetroso → Cercemaggiore. Tappe calcolate. Varianti Sant'Angelo in Grotte e Sepino non importate.",
    tappe: [t(`${ACQUA}Cammino dell_Acqua.gpx`, 'Castelpetroso', 'Cercemaggiore')],
  },
  {
    id: 'cammino-del-perdono', name: 'Cammino del Perdono — Sui passi di Celestino', region: 'Abruzzo', theme: 'religioso', structure: 'cammino', computeTappe: true,
    notes: 'Tappe calcolate (la traccia è unica).',
    tappe: [t(PERDONO)],
  },
  {
    id: 'cammino-del-santo-marino', name: 'Cammino del Santo Marino', region: 'Italia', theme: 'religioso', structure: 'cammino', computeTappe: true,
    notes: 'Tappe calcolate (la traccia è unica). Il percorso attraversa anche la Repubblica di San Marino, dove il catalogo non ha borghi: lì le tappe si chiudono senza ancora.',
    tappe: [t(MARINO)],
  },
  {
    id: 'cammino-del-beato-enrico', name: 'Cammino del Beato Enrico da Bolzano', region: 'Italia', theme: 'religioso', structure: 'cammino', computeTappe: true,
    notes: 'Bolzano → Veneto (260 km). Tappe calcolate (la traccia è unica).',
    tappe: [t(`${BEATO}Cammino Beato Enrico da Bolzano - traccia-ufficiale-update-jan-20 (1).gpx`, 'Bolzano')],
  },
]
