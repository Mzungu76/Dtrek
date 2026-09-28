// Estratto da lib/placePhotoCache.ts perché testabile in isolamento (funzione pura, nessuna
// dipendenza da Supabase/fetch) — quel file importa './supabase', che inizializza un client
// Supabase a livello di modulo e lancia un'eccezione sincrona ("supabaseUrl is required") appena
// importato senza le variabili d'ambiente del progetto, come nell'ambiente vitest della CI. Un
// test che importasse isTrustedMediaUrl direttamente da placePhotoCache.ts trascinerebbe con sé
// quell'inizializzazione e fallirebbe per questo, non per il proprio contenuto (visto dal vivo).

// Un file caricato su Commons vive per sempre sotto uno di questi due host, quale che sia
// l'endpoint che lo ha restituito (Wikidata P18 → Special:FilePath su commons.wikimedia.org,
// l'Action API di Wikipedia → upload.wikimedia.org) — vedi lib/placePhotoCache.ts. Verificato dal
// vivo (copertina di Viterbo, 2026-09-28): la riga aveva un image_url cache su un terzo host
// ("thumb.wikimedia.org", MAI usato da nessuno dei due livelli lì) con parametri
// utm_source/utm_campaign/utm_content che nessuna risposta MediaWiki genera mai da sola — indizio
// di una riscrittura da un intermediario di rete tra la richiesta e la risposta, non un URL reale
// su cui contare. Un host diverso da questi due viene trattato come "nessuna foto trovata", mai
// cache come copertina permanente.
const TRUSTED_MEDIA_HOSTS = new Set(['upload.wikimedia.org', 'commons.wikimedia.org'])

export function isTrustedMediaUrl(url: string): boolean {
  try {
    return TRUSTED_MEDIA_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}
