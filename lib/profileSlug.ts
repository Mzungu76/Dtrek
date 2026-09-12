// Validazione dello slug del profilo pubblico (/u/[slug]) — pura e testabile, come lib/raccolte/*.
// Nessun precedente da riusare nel repo (lib/guideSlug.ts è per le ancore di pagina, non per un
// identificatore pubblico univoco fra utenti) — regole scritte da zero.

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MIN_LENGTH = 3
const MAX_LENGTH = 30

// Nomi che l'app usa già per le proprie rotte sotto /u/ non ci sono (i profili vivono TUTTI sotto
// /u/[slug], non c'è collisione possibile con /raccolte, /diario, ecc.) — questi sono parole che
// confonderebbero comunque chi legge il link, o che l'app potrebbe voler riservare in futuro.
const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'login', 'logout', 'signup', 'dtrek', 'www', 'support', 'help',
  'about', 'privacy', 'terms', 'contact', 'me', 'you', 'null', 'undefined', 'test', 'root',
])

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase()
}

/** `null` = valido. Altrimenti il messaggio da mostrare all'utente. */
export function validateSlug(raw: string): string | null {
  const slug = normalizeSlug(raw)
  if (slug.length < MIN_LENGTH) return `Almeno ${MIN_LENGTH} caratteri`
  if (slug.length > MAX_LENGTH) return `Massimo ${MAX_LENGTH} caratteri`
  if (!SLUG_RE.test(slug)) return 'Solo lettere minuscole, numeri e trattini singoli (mai all\'inizio, alla fine o doppi)'
  if (RESERVED.has(slug)) return 'Questo indirizzo è riservato — scegline un altro'
  return null
}
