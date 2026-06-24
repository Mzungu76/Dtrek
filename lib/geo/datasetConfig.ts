// Central registry of MASE/ISPRA dataset endpoints (architectural decision: hardcoded
// config over CSW discovery — see piano di integrazione). baseUrl/typeName/coverageId
// are intentionally null until each is confirmed against a real GetCapabilities/
// DescribeCoverage response — this environment's egress policy blocks all external
// hosts (verified against a control domain, not just gn.mase.gov.it), so none of
// these could be probed live during this implementation pass. Populate them via
// scripts/probe-<dataset>.ts from an environment with real network access.

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
  name: 'PAI — rischio idrogeologico (frane R1-R4, alluvioni P1-P4)',
  agency: 'ISPRA',
  protocol: 'WFS',
  baseUrl: null,
  verifiedAt: null,
  notes: 'Mosaicatura nazionale plausibilmente via piattaforma IdroGEO (ISPRA); schema attributi varia per Autorità di Bacino — vedi lib/pai/paiAttributeMap.ts',
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
