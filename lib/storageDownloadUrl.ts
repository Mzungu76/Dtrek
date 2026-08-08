/**
 * Trasforma un URL pubblico di Supabase Storage in modo che il browser lo scarichi invece di
 * navigarci sopra.
 *
 * L'attributo HTML `download` da solo non basta: i browser recenti (Chrome in primis) lo ignorano
 * sulle risorse cross-origin per motivi di sicurezza, e questi URL sono su `*.supabase.co`, cioè
 * un'origine diversa da quella dell'app — il pulsante «Scarica PDF» si limitava ad aprire il file
 * in una nuova scheda. Il parametro `download` di Supabase Storage imposta invece
 * `Content-Disposition: attachment` lato server, che i browser rispettano sempre perché arriva con
 * la risposta e non dal markup del link.
 *
 * Modulo deliberatamente senza direttiva `'use client'` e senza dipendenze: è usato sia da
 * componenti client (il lettore PDF, il resoconto) sia dalla pagina pubblica del Diario, che è un
 * componente server — da un modulo `'use client'` la funzione arriverebbe come riferimento client
 * e non sarebbe chiamabile durante il render sul server.
 */
export function withForcedDownload(url: string, filename?: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}download${filename ? `=${encodeURIComponent(filename)}` : ''}`
}
