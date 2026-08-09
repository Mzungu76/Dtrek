/**
 * Indirizzo pubblico dell'app, per i richiami dal sito del Diario.
 *
 * Chi apre un diario condiviso è il pubblico più naturale per DTrek: sta già guardando cosa
 * l'app produce. I richiami puntano qui.
 *
 * `NEXT_PUBLIC_SITE_URL` quando è configurato; altrimenti l'URL di deploy fornito da Vercel, che
 * per ora è l'indirizzo di riferimento. La costante sta in un modulo suo perché la usano sia
 * componenti server sia la generazione dei metadati, e perché il giorno del dominio proprio si
 * cambia in un punto solo.
 */
export const DTREK_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  '/'
