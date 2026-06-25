// Central registry of MASE/ISPRA dataset endpoints (architectural decision: hardcoded
// config over CSW discovery — see piano di integrazione). baseUrl/typeName/coverageId
// stay null until confirmed against a real GetCapabilities/DescribeFeatureType response —
// this sandbox blocks external HTTPS egress, so verification happens out-of-band (real
// responses captured outside the sandbox, inspected file-by-file) before a value is
// written here. Never populate from a "plausible" claim — only from an observed response.

export type DatasetAgency = 'MASE' | 'ISPRA'
export type DatasetProtocol = 'WFS' | 'WCS' | 'WMS'

export interface DatasetEndpoint {
  name: string
  agency: DatasetAgency
  protocol: DatasetProtocol
  baseUrl: string | null
  typeName?: string
  coverageId?: string
  /** WMS layer name, for GetFeatureInfo when no WFS is exposed. */
  layerName?: string
  /** ISO date of the last manual GetCapabilities/DescribeCoverage check, null = never verified. */
  verifiedAt: string | null
  notes?: string
}

export const PAI_DATASET: DatasetEndpoint = {
  name: 'PAI — rischio idraulico (alluvioni, scenario P2)',
  agency: 'ISPRA',
  protocol: 'WFS',
  baseUrl: 'http://sdi.isprambiente.it/geoserver/nz1/wfs',
  typeName: 'nz1:aree_peric_idraulica_p2',
  verifiedAt: '2026-06-25',
  notes: 'Workspace nz1 = solo alluvioni (WFS 2.0.0, GetCapabilities verificata). P2 = pericolosità media, TR 100-200 anni (default qui); p1 (TR 30-50, alta) e p3 (TR 200-500, bassa) sono typeName alternativi disponibili sullo stesso endpoint ma non interrogati. Frane (workspace nz2, atteso "aree_peric_frana_pai") NON verificato: nessuna risposta reale ricevuta — resta fuori da questo client. Schema attributi reale non ancora ispezionato via DescribeFeatureType — vedi lib/pai/paiAttributeMap.ts.',
}

export const PSINSAR_DATASET: DatasetEndpoint = {
  name: 'PSInSAR — velocità di deformazione del suolo (mm/anno)',
  agency: 'MASE',
  protocol: 'WFS',
  baseUrl: null,
  verifiedAt: null,
  notes: 'Densità di copertura ignota — vedi soglie in lib/si/signals/groundStability.ts',
}

export const DTM_DATASET: DatasetEndpoint = {
  name: 'DTM TINITALY 10m (INGV)',
  agency: 'MASE',
  protocol: 'WCS',
  baseUrl: null,
  verifiedAt: null,
  notes: 'Pivot da LiDAR 1m PST-A (Piano Straordinario di Telerilevamento Ambientale): quel dato è distribuito solo via download manuale per-tile ("Grigliato 1x1"), incompatibile col vincolo "zero manualità utente" di questo prodotto — abbandonato. TINITALY è un DEM nazionale 10m con un servizio WCS live, stesso protocollo già implementato qui. Endpoint candidato (NON verificato — nessuna GetCapabilities reale ispezionata): http://tinitaly.pi.ingv.it/TINItaly_1_1/wcs. Risoluzione 10m, CRS nativo EPSG:32632 (UTM zona 32N, già registrato in lib/geo/projections.ts), licenza CC BY 4.0. Questa sandbox nega l\'host (proxy allowlist, host_not_allowed) — baseUrl/coverageId restano null finché non arriva una risposta reale ispezionata da fuori sandbox (stessa disciplina di PAI Frane/PSInSAR). Fallback documentato ma non implementato se TINITALY non si sblocca mai: Copernicus DEM GLO-30 (30m, globale, AWS S3/COG, richiederebbe un client nuovo).',
}

export const GEOLOGIA_DATASET: DatasetEndpoint = {
  name: "Carta Geologica d'Italia (progetto CARG)",
  agency: 'ISPRA',
  protocol: 'WMS',
  baseUrl: 'https://sinacloud.isprambiente.it/arcgisgeo/services/geo/SGI_ISPRA_Geologia25k/MapServer/WMSServer',
  layerName: '0',
  verifiedAt: '2026-06-25',
  notes: 'ArcGIS Server WMS 1.3.0 — confermato WMS-only, nessun WFS vettoriale su questo endpoint. Layer "0" = "Unità geologiche" (litologia); layer "8" = "Quadro unione Fogli" (solo griglia indice, non usato). GetFeatureInfo richiede infoFormat=application/geo+json — questo ArcGIS Server non supporta application/json puro (vedi lib/geologia/geologiaClient.ts).',
}

export const USO_SUOLO_DATASET: DatasetEndpoint = {
  name: 'Uso/copertura del suolo (Corine Land Cover 2018, livello III)',
  agency: 'ISPRA',
  protocol: 'WFS',
  baseUrl: 'http://sdi.isprambiente.it/geoserver/lc/wfs',
  typeName: 'lc:clc18_it_4258',
  verifiedAt: '2026-06-25',
  notes: 'Confermato WFS 2.0.0 vettoriale (16 typeName disponibili) — NON WCS raster come assunto inizialmente. clc18_it_4258 = CLC 2018 livello III, la classificazione base più recente. Nomenclatura pubblica EEA (codici 111-523) — vedi lib/tei/landCoverSurfaceMap.ts. Nome-campo classe reale non ancora confermato via DescribeFeatureType — vedi CLASS_CODE_FIELDS in lib/usosuolo/usoSuoloClient.ts.',
}

export const NATURA2000_DATASET: DatasetEndpoint = {
  name: 'Rete Natura 2000 (SIC/ZSC/ZPS)',
  agency: 'MASE',
  protocol: 'WFS',
  baseUrl: 'http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/wfs/SIC_ZSC_ZPS.map',
  typeName: 'SP.SITIPROTETTI.SIC_ZSC_ZPS',
  verifiedAt: '2026-06-25',
  notes: 'Host legacy PCN (non gn.mase.gov.it). WFS 1.1.0, GetCapabilities verificata: unico outputFormat per GetFeature è "text/xml; subtype=gml/3.1.1" — nessuna opzione JSON, quindi questo client usa wfsGetFeatureGml + un parser GML scritto a mano (vedi lib/natura2000/natura2000Client.ts). Nomi-tag GML esatti non confermati da una GetFeature reale (sandbox blocca la chiamata) — solo da GetCapabilities + fingerprint MapServer.',
}

export const ALL_DATASETS: DatasetEndpoint[] = [
  PAI_DATASET,
  PSINSAR_DATASET,
  DTM_DATASET,
  GEOLOGIA_DATASET,
  USO_SUOLO_DATASET,
  NATURA2000_DATASET,
]
