import { describe, it, expect } from 'vitest'
import { buildFromGpxFiles, type GpxCamminoInfo } from '../cammini/gpxTappe'

// Primi 60 punti dei GPX reali della Via Francigena (file "01a - Colle Gran San Bernardo - Roma",
// forniti dall'utente) — non il tracciato intero, solo il suo inizio, ma è l'XML vero di GDAL, non
// un fixture inventato.
const TAPPA_01 = `<?xml version="1.0"?>
<gpx version="1.1" creator="GDAL 1.7.3">
<trk>
  <name>Tappa 01 - Dal Gran S. Bernardo a Echevennoz</name>
  <trkseg>
<trkpt lat="45.869000000000000" lon="7.170561000000000"></trkpt>
<trkpt lat="45.869092000000002" lon="7.170328000000000"></trkpt>
<trkpt lat="45.869295999999999" lon="7.170046000000000"></trkpt>
<trkpt lat="45.869416999999999" lon="7.169693000000000"></trkpt>
<trkpt lat="45.869106000000002" lon="7.157373000000000"></trkpt>
</trkseg>
</trk>
</gpx>`

const TAPPA_02 = `<?xml version="1.0"?>
<gpx version="1.1" creator="GDAL 1.7.3">
<trk>
  <name>Tappa 02 - Da Echevennoz ad Aosta</name>
  <trkseg>
<trkpt lat="45.808348000000002" lon="7.241900000000000"></trkpt>
<trkpt lat="45.808276999999997" lon="7.241990000000000"></trkpt>
<trkpt lat="45.807898000000002" lon="7.242550000000000"></trkpt>
<trkpt lat="45.804577999999999" lon="7.255021000000000"></trkpt>
</trkseg>
</trk>
</gpx>`

const TAPPA_02_VARIANTE = `<?xml version="1.0"?>
<gpx version="1.1"><trk><name>Tappa 02 variante da Montjovet</name><trkseg>
<trkpt lat="45.80" lon="7.24"></trkpt><trkpt lat="45.81" lon="7.25"></trkpt>
</trkseg></trk></gpx>`

const info: GpxCamminoInfo = { id: 'via-francigena', name: 'Via Francigena', theme: 'religioso' }

describe('buildFromGpxFiles', () => {
  it('ordina per numero di tappa, scarta le varianti, numera le tappe nel risultato', () => {
    const { built, skipped } = buildFromGpxFiles(
      [
        { filename: 'tappa-02-da-echevennoz-ad-aosta.gpx', xml: TAPPA_02 },
        { filename: 'tappa-01-dal-gran-s-bernardo-echevennoz.gpx', xml: TAPPA_01 },
        { filename: 'tappa-02-variante.gpx', xml: TAPPA_02_VARIANTE },
      ],
      info, [],
    )
    expect(built.tappe.map(t => t.ordinal)).toEqual([1, 2])
    expect(built.tappe[0].name).toContain('Tappa 01')
    expect(built.tappe[1].name).toContain('Tappa 02')
    expect(built.tappe.every(t => t.source === 'official')).toBe(true)
    expect(skipped).toEqual([{ filename: 'tappa-02-variante.gpx', reason: 'variante: non entra nella sequenza principale, salvata come variante' }])
  })

  it('salva le varianti invece di scartarle, agganciate all\'ordinal della tappa giusta', () => {
    const { variants } = buildFromGpxFiles(
      [
        { filename: 'tappa-01.gpx', xml: TAPPA_01 },
        { filename: 'tappa-02.gpx', xml: TAPPA_02 },
        { filename: 'tappa-02-variante.gpx', xml: TAPPA_02_VARIANTE },
      ],
      info, [],
    )
    expect(variants).toHaveLength(1)
    expect(variants[0].tappaOrdinal).toBe(2)
    expect(variants[0].filename).toBe('tappa-02-variante.gpx')
    expect(variants[0].polyline.length).toBeGreaterThan(0)
  })

  it('con mainSequenceIsVariant, i file "variante" entrano nella sequenza principale (es. Via Litoranea)', () => {
    const mare01 = `<?xml version="1.0"?><gpx><trk><name>Variante Mare 01 - Da Monte Sant'Angelo a Manfredonia</name><trkseg>
<trkpt lat="41.70" lon="15.93"></trkpt><trkpt lat="41.62" lon="15.91"></trkpt>
</trkseg></trk></gpx>`
    const { built, skipped } = buildFromGpxFiles(
      [{ filename: 'variante-mare-01.gpx', xml: mare01 }],
      { id: 'x', name: 'X', theme: 'naturalistico', mainSequenceIsVariant: true, numberPatterns: [/mare\s*(\d+)/i] },
      [],
    )
    expect(skipped).toEqual([])
    expect(built.tappe).toHaveLength(1)
  })

  it('tiene solo la prima tappa quando un numero compare due volte', () => {
    const { built, skipped } = buildFromGpxFiles(
      [{ filename: 'a.gpx', xml: TAPPA_01 }, { filename: 'b.gpx', xml: TAPPA_01 }],
      info, [],
    )
    expect(built.tappe).toHaveLength(1)
    expect(skipped[0].reason).toContain('duplicato scartato')
  })

  it('inverte una tappa se così si aggancia meglio alla precedente', () => {
    // TAPPA_02 scritta al contrario: deve risultare comunque orientata in continuità.
    const reversed = `<?xml version="1.0"?><gpx><trk><name>Tappa 02 - Da Echevennoz ad Aosta</name><trkseg>
<trkpt lat="45.804577999999999" lon="7.255021000000000"></trkpt>
<trkpt lat="45.808348000000002" lon="7.241900000000000"></trkpt>
</trkseg></trk></gpx>`
    const { built } = buildFromGpxFiles(
      [{ filename: 't1.gpx', xml: TAPPA_01 }, { filename: 't2.gpx', xml: reversed }],
      info, [],
    )
    // La tappa 1 finisce vicino a 7.157: la 2 deve iniziare da lì (quindi dal punto 45.8083,7.2419, non dall'altro capo).
    expect(built.tappe[1].polyline[0]).toEqual([45.808348000000002, 7.241900000000000])
  })

  it('scarta i file senza numero di tappa riconoscibile, segnala il motivo', () => {
    const noNumber = `<?xml version="1.0"?><gpx><trk><name>Collegamento</name><trkseg>
<trkpt lat="45.0" lon="7.0"></trkpt><trkpt lat="45.1" lon="7.1"></trkpt>
</trkseg></trk></gpx>`
    const { built, skipped } = buildFromGpxFiles(
      [{ filename: 'tappa-01.gpx', xml: TAPPA_01 }, { filename: 'collegamento.gpx', xml: noNumber }],
      info, [],
    )
    expect(built.tappe).toHaveLength(1)
    expect(skipped[0].reason).toContain('nessun numero')
  })

  it('trova il numero anche nel filename "tappa-09-…" (trattino, non spazio) quando il titolo non ce l\'ha', () => {
    const noNumberInTitle = `<?xml version="1.0"?><gpx><trk><name>Da Santhià a Vercelli</name><trkseg>
<trkpt lat="45.3" lon="8.1"></trkpt><trkpt lat="45.4" lon="8.2"></trkpt>
</trkseg></trk></gpx>`
    const { built, skipped } = buildFromGpxFiles(
      [{ filename: 'tappa-01.gpx', xml: TAPPA_01 }, { filename: 'tappa-09-da-santhia-vercelli.gpx', xml: noNumberInTitle }],
      info, [],
    )
    expect(skipped).toEqual([])
    expect(built.tappe.map(t => t.ordinal)).toEqual([1, 2])
  })

  it('senza nessuna tappa utilizzabile, lancia un errore leggibile', () => {
    expect(() => buildFromGpxFiles([{ filename: 'variante.gpx', xml: TAPPA_02_VARIANTE }], info, [])).toThrow(/nessuna tappa GPX utilizzabile/)
  })
})
