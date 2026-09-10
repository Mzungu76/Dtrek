// Estratto da components/bacheca/TerritoryMap.tsx (unico chiamante originale) perché il caricamento
// deve restare a livello di MODULO condiviso, non duplicato per-file: leaflet.markercluster è un
// side-effect import "vecchio stile" che patcha `window.L` una volta sola per processo (i moduli ESM
// eseguono il proprio corpo una sola volta, un secondo `import()` dello stesso modulo restituisce la
// cache senza rieseguire il side-effect). Se un secondo chiamante (qui, components/mete/MeteMap.tsx)
// avesse una propria copia di questa funzione con la propria `let leafletWithClusterPromise` e la
// propria `const L = {...leafletModule}`, il suo `window.L = L` verrebbe scritto DOPO che il plugin
// ha già patchato la copia del primo chiamante — la sua `L.markerClusterGroup` risulterebbe assente,
// bug silenzioso (nessun errore, solo un TypeError inghiottito). Una sola copia, importata da ogni
// chiamante presente e futuro, evita il problema alla radice.
let leafletWithClusterPromise: Promise<typeof import('leaflet')> | null = null

export function loadLeafletWithCluster() {
  if (!leafletWithClusterPromise) {
    leafletWithClusterPromise = import('leaflet').then(async leafletModule => {
      // leaflet.markercluster si aspetta L già globale (come da un tag <script>, non da un import
      // ESM/CJS) e vi assegna direttamente nuove proprietà
      // (`L.MarkerClusterGroup = L.FeatureGroup.extend(...)`). Il namespace object restituito da
      // `import('leaflet')` non è però estensibile per specifica ECMAScript — quell'assegnazione
      // lancerebbe un TypeError silenzioso (promise mai catturata) che interromperebbe
      // l'inizializzazione della mappa a metà. Una copia semplice (mutabile) risolve: le classi/
      // factory di Leaflet restano le stesse, solo il contenitore cambia.
      const L = { ...leafletModule } as typeof leafletModule
      ;(window as unknown as { L: typeof L }).L = L
      await import('leaflet.markercluster')
      return L
    })
  }
  return leafletWithClusterPromise
}
