/**
 * Chiave dei dati locali del Navigator legati al percorso navigato (pacchetto offline, grafo sentieri,
 * sessione, traccia registrata, parcheggio). In un cammino tutte le tappe condividono l'id del piano:
 * con la tappa nella chiave ogni tappa ha i suoi dati e non sovrascrive né ripristina quelli di un'altra.
 */
export function navStorageKey(hikeId: string, tappaOrdinal?: number | null): string {
  return tappaOrdinal != null ? `${hikeId}#t${tappaOrdinal}` : hikeId
}
