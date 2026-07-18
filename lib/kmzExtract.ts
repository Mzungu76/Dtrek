// KMZ è solo un KML zippato (di norma con un file principale doc.kml, più eventuali icone/
// immagini che qui non servono). fflate funziona identica in browser e Node (nessuna dipendenza
// nativa), quindi questa funzione è isomorfa come lib/kmlParser.ts — riusata sia dall'import via
// link (lib/kmlSourceFetch.ts) sia dal caricamento file lato client (GpxUploader.tsx).
import { unzipSync } from 'fflate'

/** Ritorna il testo del primo file .kml trovato nell'archivio, o null se non ce n'è uno
 *  (KMZ malformato, o zip che non contiene nessun KML). */
export function extractKmlFromKmz(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes)
    const kmlName = Object.keys(files).find(name => name.toLowerCase().endsWith('.kml'))
    if (!kmlName) return null
    return new TextDecoder('utf-8').decode(files[kmlName])
  } catch {
    return null
  }
}
