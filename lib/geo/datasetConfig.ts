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
  name: 'DTM 1m LiDAR (Piano Straordinario di Telerilevamento Ambientale)',
  agency: 'MASE',
  protocol: 'WCS',
  baseUrl: null,
  verifiedAt: null,
  notes: 'Copertura nazionale parziale — spike di verifica raccomandato prima del kernel slope/aspect completo',
}

export const GEOLOGIA_DATASET: DatasetEndpoint = {
  name: "Carta Geologica d'Italia (progetto CARG)",
  agency: 'ISPRA',
  protocol: 'WMS',
  baseUrl: null,
  verifiedAt: null,
  notes: 'Protocollo incerto: possibile WMS-only (GetFeatureInfo) senza WFS vettoriale per gli attributi litologici',
}

export const USO_SUOLO_DATASET: DatasetEndpoint = {
  name: 'Uso/copertura del suolo',
  agency: 'ISPRA',
  protocol: 'WCS',
  baseUrl: null,
  verifiedAt: null,
}

export const NATURA2000_DATASET: DatasetEndpoint = {
  name: 'Rete Natura 2000 (SIC/ZSC/ZPS)',
  agency: 'MASE',
  protocol: 'WFS',
  baseUrl: null,
  verifiedAt: null,
}

export const ALL_DATASETS: DatasetEndpoint[] = [
  PAI_DATASET,
  PSINSAR_DATASET,
  DTM_DATASET,
  GEOLOGIA_DATASET,
  USO_SUOLO_DATASET,
  NATURA2000_DATASET,
]
