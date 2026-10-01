// Funzioni pure di normalizzazione (piano §41, scripts/places/normalize.ts) — nessuna chiamata di
// rete, nessuna scrittura: solo trasformazioni testuali/geografiche riusate sia da deduplicate.ts
// (per confrontare due candidati) sia dai singoli fetcher di sorgente prima dell'import.

// Confini approssimativi dell'Italia (bbox, non il confine reale) — stesso controllo di
// sanità già usato in scripts/import-ptpr.ts per scartare coordinate palesemente sbagliate
// (es. un errore di conversione di proiezione che produce un punto fuori scala).
const ITALY_BBOX = { minLat: 35, maxLat: 48, minLon: 6, maxLon: 19 }

export function isPlausibleItalianCoordinate(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return lat >= ITALY_BBOX.minLat && lat <= ITALY_BBOX.maxLat
    && lon >= ITALY_BBOX.minLon && lon <= ITALY_BBOX.maxLon
}

// Rimuove diacritici (José → Jose) senza dipendere da una libreria esterna — NFD scompone il
// carattere accentato in lettera-base + combining mark (blocco Unicode U+0300–U+036F), poi si
// scarta il mark.
const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(COMBINING_DIACRITICS_RE, '')
}

// Nome/Comune normalizzati per confronto — NON per la visualizzazione (il nome originale va
// sempre mostrato/persistito così com'è). Minuscolo, senza accenti, punteggiatura ridotta a
// spazio, spazi multipli collassati. Deliberatamente NON rimuove prefissi come "chiesa di" /
// "castello di": farlo aiuterebbe alcuni confronti ma ne romperebbe altri in modo silenzioso
// (es. "Castello" come parte del nome proprio) — troppo specifico per una funzione generica.
export function normalizeForComparison(s: string): string {
  return stripDiacritics(s.trim().toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Similarità per token (Jaccard sull'insieme di parole) — robusta all'ordine delle parole
// ("Museo Nazionale Etrusco" vs "Museo Etrusco Nazionale" → 1.0) e a differenze minori, senza
// bisogno di una libreria di fuzzy-matching. 0 se uno dei due nomi è vuoto dopo normalizzazione.
export function nameTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForComparison(a).split(' ').filter(Boolean))
  const tokensB = new Set(normalizeForComparison(b).split(' ').filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersection = 0
  for (const t of tokensA) if (tokensB.has(t)) intersection++
  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function sameMunicipality(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return normalizeForComparison(a) === normalizeForComparison(b)
}

// ── Riparazione di testo con codifica sbagliata ("mojibake") ─────────────────────────────────
//
// Alcune sorgenti mescolano codifiche: un campo UTF-8 letto come latin1 (un .dbf PTPR con 'n°',
// una pagina MiC con 'Santhià') arriva come "nÂ°" / "SanthiÃ " — una sequenza di byte UTF-8 vista
// come caratteri latin1. Si ripara solo ciò che ha la forma esatta di quell'errore (un byte di
// testa U+00C2–U+00F4 seguito da byte di continuazione U+0080–U+00BF che formano UTF-8 valido):
// un "Ã" legittimo, senza continuazione, resta com'è.
const MOJIBAKE_SEQUENCE_RE = /[\u00c2-\u00f4][\u0080-\u00bf]+/g

export function repairMojibake(text: string): string {
  if (!MOJIBAKE_SEQUENCE_RE.test(text)) return text
  MOJIBAKE_SEQUENCE_RE.lastIndex = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return text.replace(MOJIBAKE_SEQUENCE_RE, seq => {
    try { return decoder.decode(Uint8Array.from(seq, ch => ch.charCodeAt(0))) } catch { return seq }
  })
}
