// DTREK-AUDIT.md P2 #28 — nessuna stima di copertura di rete, dichiarato esplicitamente assente
// in UI (TrailConfidenceBadge.tsx) pur essendo un prerequisito critico per tutto lo stack SOS: un
// escursionista non ha modo di sapere in anticipo se un tratto avrà campo per chiamare il 112.
// Una vera PREVISIONE di copertura lungo il percorso richiederebbe un dataset di copertura
// cellulare (proprietario, nessun equivalente OSM/pubblico noto) — fuori portata di questa
// sessione. Quello che è realisticamente disponibile: il browser stesso può riportare la qualità
// della connessione ATTUALE (Network Information API, `navigator.connection`), un segnale live
// non predittivo ma reale — oggi non usato da nessuna parte del codice, solo il binario
// online/offline (`navigator.onLine`). Non universalmente supportato (WebKit/iOS non lo espone
// affatto — DTrek Navigator gira anche come PWA iOS, vedi item #34 dello stesso audit): il codice
// deve degradare con garbo a "sconosciuta", mai fingere un dato che non ha.
export type ConnectionQuality = 'buona' | 'debole' | 'sconosciuta'

interface NetworkInformationLike {
  effectiveType?: string
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

/** Pura — 'slow-2g'/'2g' è il segnale più affidabile di connessione debole che l'API espone; '3g'/'4g' sono trattati come "buona" (nessuna via di mezzo affidabile tra i due nella specifica). */
export function classifyEffectiveType(effectiveType: string | undefined): ConnectionQuality {
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'debole'
  if (effectiveType === '3g' || effectiveType === '4g') return 'buona'
  return 'sconosciuta'
}

function getNetworkInformation(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { connection?: NetworkInformationLike; mozConnection?: NetworkInformationLike; webkitConnection?: NetworkInformationLike }
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null
}

/** Lettura una tantum, non reattiva — per un uso che non ha bisogno di aggiornarsi da solo. */
export function readConnectionQuality(): ConnectionQuality {
  const conn = getNetworkInformation()
  if (!conn) return 'sconosciuta'
  return classifyEffectiveType(conn.effectiveType)
}

/** Si aggiorna da sola sull'evento 'change' della Network Information API, se disponibile — no-op (mai chiama onChange) su un browser che non la espone. Ritorna una funzione di cleanup, sempre chiamabile anche quando non è stato agganciato nulla. */
export function watchConnectionQuality(onChange: (quality: ConnectionQuality) => void): () => void {
  const conn = getNetworkInformation()
  if (!conn?.addEventListener) return () => {}
  const handler = () => onChange(classifyEffectiveType(conn.effectiveType))
  conn.addEventListener('change', handler)
  return () => conn.removeEventListener?.('change', handler)
}
