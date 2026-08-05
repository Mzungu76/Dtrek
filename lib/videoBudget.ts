// lib/videoBudget.ts — da cosa è fatta la durata di un video, e come governarla.
//
// Il modello è: la durata NON si imposta, si ottiene. Si sceglie la velocità con cui il cursore
// percorre il tracciato, si accendono le opzioni che si vogliono, e il totale è la somma delle
// parti — sempre in chiaro, così togliere o aggiungere qualcosa ha un effetto visibile prima di
// generare invece che dopo.
//
// Prima era il contrario: uno slider "durata" fissava il tempo del solo VOLO, e tutto il resto
// (soste foto, stacchi, intro, finale) si aggiungeva sopra. Chi sceglieva 30s otteneva 50-60s, e
// l'interfaccia doveva scusarsi con una riga di spiegazione — sintomo che il controllo non
// controllava ciò che dichiarava.
//
// Logica pura: nessun canvas, nessun React. Le stesse funzioni servono all'anteprima del wizard e
// alla generazione vera, così il numero mostrato e il video prodotto non possono divergere.

/** Intro e finale sono costanti assolute, non frazioni della durata.
 *
 *  Devono esserlo per forza in questo modello — se scalassero con la durata totale, e la durata
 *  totale li contenesse, il calcolo sarebbe circolare. Ma è anche la scelta giusta di suo: la
 *  soglia oltre la quale un'apertura "è lunga" sta nell'attenzione di chi guarda, non nella
 *  lunghezza del video. Quattro secondi di finale sono quattro secondi tanto in un video da 20s
 *  quanto in uno da 90s. */
export const INTRO_SEC = 2.4
export const INTRO_FAST_SEC = 1.2
export const OUTRO_SEC = 4

/** Estremi della velocità del cursore, in km di percorso per secondo di video.
 *
 *  Assoluti e non ricavati dalla lunghezza del percorso: così lo stesso valore significa la stessa
 *  cosa su un giro da 3 km e su uno da 25, e chi trova il proprio ritmo se lo ritrova identico la
 *  volta dopo. La banda è ampia perché deve coprire entrambi i casi, e per questo lo slider che la
 *  espone va scalato in modo logaritmico (vedi speedFromSlider). */
export const MIN_SPEED_KM_S = 0.04
export const MAX_SPEED_KM_S = 3

/** Il volo non scende mai sotto questa soglia: sotto, il percorso è un lampo e non si legge nulla —
 *  nessuna velocità lo renderebbe un video. */
export const MIN_ROUTE_SEC = 3

export function clampSpeed(kmS: number): number {
  if (!Number.isFinite(kmS)) return 0.3
  return Math.min(MAX_SPEED_KM_S, Math.max(MIN_SPEED_KM_S, kmS))
}

/** Slider 0-1 → velocità, con passo logaritmico: senza, il 90% della corsa cadrebbe fra i valori
 *  alti (utili solo ai percorsi lunghi) e i percorsi corti sarebbero regolabili solo nell'ultimo
 *  centimetro di slider. */
export function speedFromSlider(t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return clampSpeed(MIN_SPEED_KM_S * Math.pow(MAX_SPEED_KM_S / MIN_SPEED_KM_S, k))
}

export function sliderFromSpeed(kmS: number): number {
  const s = clampSpeed(kmS)
  return Math.log(s / MIN_SPEED_KM_S) / Math.log(MAX_SPEED_KM_S / MIN_SPEED_KM_S)
}

export interface VideoBudgetInput {
  /** Lunghezza del tracciato in metri. */
  routeDistanceM: number
  /** Km di percorso per secondo di video. */
  speedKmS: number
  fastIntro: boolean
  /** Numero di SOSTE, non di foto: le foto vicine si aprono insieme in un'unica sosta
   *  (groupPhotoTimings), e contarle una per una gonfierebbe il totale rispetto al video vero. */
  photoStops: number
  photoStopSec: number
  /** Secondi complessivi degli stacchi che troveranno davvero posto nel montaggio — vedi
   *  planInterludes: uno stacco acceso che non trova un varco libero non entra nel video, e non
   *  deve nemmeno entrare nel conto. */
  interludeSec: number
}

export interface VideoBudget {
  introSec: number
  /** Solo il volo sul tracciato, al netto di ogni pausa. */
  routeSec: number
  photoSec: number
  interludeSec: number
  outroSec: number
  totalSec: number
  /** Tempo in cui la telecamera non avanza: soste e pannelli. È la quota che cresce senza farsi
   *  notare, ed è quella che trasforma un video in una carrellata di schermate ferme. */
  stillSec: number
  stillPct: number
}

export function computeVideoBudget(input: VideoBudgetInput): VideoBudget {
  const introSec = input.fastIntro ? INTRO_FAST_SEC : INTRO_SEC
  const outroSec = OUTRO_SEC
  const km = Math.max(0, input.routeDistanceM) / 1000
  const routeSec = Math.max(MIN_ROUTE_SEC, km / clampSpeed(input.speedKmS))
  const photoSec = Math.max(0, input.photoStops) * Math.max(0, input.photoStopSec)
  const interludeSec = Math.max(0, input.interludeSec)
  const totalSec = introSec + routeSec + photoSec + interludeSec + outroSec
  const stillSec = photoSec + interludeSec
  return {
    introSec, routeSec, photoSec, interludeSec, outroSec, totalSec,
    stillSec,
    stillPct: totalSec > 0 ? Math.round((stillSec / totalSec) * 100) : 0,
  }
}

/**
 * La velocità che porta il totale al bersaglio chiesto, tenendo ferme tutte le altre scelte.
 *
 * È l'altra metà del modello: la velocità resta il controllo, ma quando serve un video "da 30
 * secondi" — perché lo si deve pubblicare da qualche parte — si preme il bersaglio e la velocità
 * ci si adegua da sola. Senza questa funzione il nuovo modello renderebbe facile la qualità e
 * scomodo il vincolo, che è l'errore opposto a quello che stiamo correggendo.
 *
 * Restituisce null quando il bersaglio non è raggiungibile con le opzioni accese: intro, finale,
 * soste e stacchi da soli lo superano già, e nessuna velocità del cursore può recuperare — a quel
 * punto la cosa onesta è dirlo, non consegnare una velocità che non rispetta la promessa.
 */
export function speedForTargetTotal(targetSec: number, input: Omit<VideoBudgetInput, 'speedKmS'>): number | null {
  const introSec = input.fastIntro ? INTRO_FAST_SEC : INTRO_SEC
  const fixed = introSec + OUTRO_SEC
    + Math.max(0, input.photoStops) * Math.max(0, input.photoStopSec)
    + Math.max(0, input.interludeSec)
  const routeSecNeeded = targetSec - fixed
  if (routeSecNeeded < MIN_ROUTE_SEC) return null
  const km = Math.max(0, input.routeDistanceM) / 1000
  if (km <= 0) return null
  const speed = km / routeSecNeeded
  // Fuori banda: il bersaglio richiederebbe un cursore più lento o più veloce di quanto lo slider
  // ammetta. Anche qui vale meglio dirlo che consegnare un valore che non tiene la promessa.
  if (speed < MIN_SPEED_KM_S || speed > MAX_SPEED_KM_S) return null
  return speed
}

/** Velocità di partenza per un percorso mai configurato: quella che dà un totale vicino al
 *  bersaglio, o il centro della banda se non è raggiungibile. Serve a far trovare all'utente un
 *  video già sensato invece di un valore fisso che su un giro da 25 km sarebbe assurdo. */
export function initialSpeedFor(routeDistanceM: number, targetSec = 30, input?: Partial<Omit<VideoBudgetInput, 'speedKmS' | 'routeDistanceM'>>): number {
  return speedForTargetTotal(targetSec, {
    routeDistanceM,
    fastIntro: input?.fastIntro ?? false,
    photoStops: input?.photoStops ?? 0,
    photoStopSec: input?.photoStopSec ?? 0,
    interludeSec: input?.interludeSec ?? 0,
  }) ?? clampSpeed(routeDistanceM / 1000 / 25)
}

/** "0,42 km/s" — una cifra decimale sopra 1, due sotto, che è dove serve la precisione. */
export function formatSpeed(kmS: number): string {
  const s = clampSpeed(kmS)
  return `${s >= 1 ? s.toFixed(1) : s.toFixed(2)} km/s`.replace('.', ',')
}

/** "1:04" oltre il minuto, "38s" sotto — un totale di 94 secondi si legge male come numero puro. */
export function formatTotal(sec: number): string {
  const r = Math.round(sec)
  if (r < 60) return `${r}s`
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

/**
 * A cosa corrisponde una velocità, in parole. Non ci sono più bersagli in secondi da premere: lo
 * slider è l'unico comando, e chi non ha mai ragionato in km/s ha bisogno di un punto di
 * riferimento per capire se il valore scelto è "lento" o "da social" — non del numero esatto in
 * cima, di un giudizio.
 *
 * Le soglie sono qualitative, non un contratto: km/s è indipendente dalla lunghezza del percorso
 * per costruzione (vedi il commento su MIN/MAX_SPEED_KM_S), quindi la stessa banda descrive bene
 * sia un anello di 3 km sia una traversata di 25 — ma "bene" per un ritmo resta un giudizio, non
 * una misura.
 */
export interface SpeedBand { label: string; desc: string }

const SPEED_BANDS: (SpeedBand & { maxKmS: number })[] = [
  { maxKmS: 0.12, label: 'Lenta',       desc: 'Contemplativa: indugia su ogni tratto. Bene per un racconto lungo, non per i social.' },
  { maxKmS: 0.35, label: 'Distesa',     desc: 'Il ritmo di un racconto: si vede il percorso, non solo il traguardo.' },
  { maxKmS: 0.75, label: 'Da social',   desc: 'Il passo di un Reel o una Storia: scorre senza dilungarsi.' },
  { maxKmS: 1.6,  label: 'Veloce',      desc: 'Sintesi rapida: bene su un percorso molto lungo o per un teaser.' },
  { maxKmS: Infinity, label: 'Molto veloce', desc: 'Il percorso è quasi un lampo: restano leggibili solo i punti fermi.' },
]

export function speedBandFor(kmS: number): SpeedBand {
  const s = clampSpeed(kmS)
  return SPEED_BANDS.find(b => s <= b.maxKmS) ?? SPEED_BANDS[SPEED_BANDS.length - 1]
}
