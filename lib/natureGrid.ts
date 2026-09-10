// Griglia geografica fissa usata da lib/galleryCascade.ts per cachare le gallerie Flora/Fauna
// per POSIZIONE invece che per il bbox dell'intero percorso — vedi il commento in cima a
// galleryCascade.ts. Parte pura, senza dipendenze da Supabase/rete, così è testabile senza
// nessuna configurazione d'ambiente (lib/__tests__/natureGrid.test.ts).

export interface BboxBounds { minLat: number; maxLat: number; minLon: number; maxLon: number }

// ~5,5 km di lato all'equatore (in longitudine un po' meno alle nostre latitudini) — abbastanza
// piccola da distinguere zone con microclimi diversi, abbastanza grande perché la maggior parte
// dei percorsi tocchi solo una manciata di celle invece di decine.
export const CELL_SIZE_DEG = 0.05
// Tetto di sicurezza per un percorso molto lungo (point-to-point di decine di km): oltre questo
// numero di celle si campiona invece di coprire ogni cella toccata, per non trasformare
// un'unica apertura galleria in dozzine di fetch/celle da popolare tutte insieme.
export const MAX_CELLS_PER_QUERY = 12

// Cella di griglia (chiave "<latCell>_<lonCell>") che contiene (lat, lon) — CELL_SIZE_DEG di
// lato, ancorata all'origine (0,0) così la stessa cella produce sempre la stessa chiave
// indipendentemente da chi la calcola.
function cellBoundsFromIndex(i: number, j: number): BboxBounds {
  const latCell = i * CELL_SIZE_DEG, lonCell = j * CELL_SIZE_DEG
  return { minLat: latCell, maxLat: latCell + CELL_SIZE_DEG, minLon: lonCell, maxLon: lonCell + CELL_SIZE_DEG }
}
function cellKeyFromIndex(i: number, j: number): string {
  return `${(i * CELL_SIZE_DEG).toFixed(2)}_${(j * CELL_SIZE_DEG).toFixed(2)}`
}

// Indice della cella (floor(x / CELL_SIZE_DEG)) — con un epsilon per evitare che un valore
// nominalmente su un confine di cella (es. 42.10 con CELL_SIZE_DEG=0.05) cada nella cella
// sbagliata solo per un errore di arrotondamento in virgola mobile (42.10/0.05 può risultare
// 841.9999999999999 invece di 842).
const CELL_INDEX_EPS = 1e-9
function cellIndex(x: number): number {
  return Math.floor(x / CELL_SIZE_DEG + CELL_INDEX_EPS)
}

// count indici equidistanti da idx (inclusi sempre primo e ultimo) — usato per restare sotto
// MAX_CELLS_PER_QUERY continuando a coprire l'intera estensione invece di troncare un lato.
function sampleIndices(idx: number[], count: number): number[] {
  if (idx.length <= count) return idx
  if (count <= 1) return [idx[0]]
  const out = new Set<number>()
  for (let k = 0; k < count; k++) out.add(idx[Math.round((k * (idx.length - 1)) / (count - 1))])
  return Array.from(out)
}

// Le celle toccate da `b` — di solito 1-4 per un percorso normale. Oltre MAX_CELLS_PER_QUERY
// (un point-to-point molto lungo, o un'area quasi quadrata) campiona un numero fisso di indici
// per asse invece di coprirli tutti — √MAX_CELLS_PER_QUERY per lato, così il totale resta
// garantito sotto il tetto (a differenza di un passo fisso + "aggiungi comunque l'ultimo indice"
// su entrambi gli assi, che può sforare per un'area vicina al quadrato) — includendo sempre gli
// estremi di ciascun asse così i quattro angoli dell'area restano coperti.
export function cellsForBounds(b: BboxBounds): { key: string; bounds: BboxBounds }[] {
  const range = (min: number, max: number) => {
    const out: number[] = []
    for (let k = cellIndex(min); k <= cellIndex(max); k++) out.push(k)
    return out
  }
  const latIdx = range(b.minLat, b.maxLat)
  const lonIdx = range(b.minLon, b.maxLon)

  let sampledLat = latIdx
  let sampledLon = lonIdx
  if (latIdx.length * lonIdx.length > MAX_CELLS_PER_QUERY) {
    const perAxis = Math.max(1, Math.floor(Math.sqrt(MAX_CELLS_PER_QUERY)))
    sampledLat = sampleIndices(latIdx, perAxis)
    sampledLon = sampleIndices(lonIdx, perAxis)
  }

  const cells: { key: string; bounds: BboxBounds }[] = []
  for (const i of sampledLat) for (const j of sampledLon) cells.push({ key: cellKeyFromIndex(i, j), bounds: cellBoundsFromIndex(i, j) })
  return cells
}
