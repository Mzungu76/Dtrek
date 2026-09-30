import type { PlannedHike } from './plannedStore'
import { saveActivityWithEnrichment } from './activitySave'
import { haversineM } from './geoUtils'

// Un Sito (nessun percorso da percorrere, solo un punto) è l'unica tipologia che si completa senza
// caricare/registrare una traccia GPS reale (piano §48.6, "mai richiedere GPS per Borghi/Città/
// Siti") — MA "senza traccia" non significa "senza prova": vedi il check-in GPS più sotto.
// Un Borgo/Città, deciso in sessione conversazionale, resta invece trattato come un Sentiero: il
// suo itinerario a piedi (borgoWalkPolyline) SI PUÒ camminare per davvero, quindi si completa allo
// stesso modo — Navigator/registrazione reale o import GPX, mai questo shortcut. Un Sentiero non
// passa MAI da qui, in nessun caso: la sua unica strada resta l'upload/registrazione di
// un'attività reale (lib/activitySave.ts).
export function canCompleteWithoutTrack(metaType: PlannedHike['metaType']): boolean {
  return metaType === 'sito'
}

// "In zona", non un controllo di precisione (verifica utente, sessione conversazionale: "non
// dev'essere per forza dentro un museo con precisione estrema... deve essere in zona in modo tale
// che l'app garantisca che è stato lì"). Copre parcheggio, ingresso spostato, deriva GPS — mai
// pensato per verificare la posizione esatta all'interno del luogo.
export const SITE_CHECKIN_RADIUS_M = 300

export interface GeoFix {
  lat: number
  lon: number
  accuracyM?: number
}

/** Richiede un fix GPS reale al dispositivo — mai un errore lanciato: permesso negato, timeout, o
 *  `navigator.geolocation` assente (SSR, dispositivo senza GPS) risolvono tutti a `null`, lasciando
 *  al chiamante la scelta del ripiego "registra comunque" invece di una UI rotta a metà. */
export function getCurrentGeoFix(timeoutMs = 15000): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    let settled = false
    const finish = (fix: GeoFix | null) => { if (!settled) { settled = true; resolve(fix) } }
    const timer = setTimeout(() => finish(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy }) },
      () => { clearTimeout(timer); finish(null) },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

export type CheckInOutcome = 'verified' | 'out_of_range' | 'no_gps'

export interface CheckInResult {
  outcome: CheckInOutcome
  distanceM?: number
}

/** Solo la decisione (mai l'accesso al dispositivo, isolato in getCurrentGeoFix sopra, né il
 *  salvataggio, in markMetaVisited sotto) — testabile senza un browser né un mock di navigator. */
export function evaluateCheckIn(
  fix: GeoFix | null,
  site: { latitude?: number; longitude?: number },
): CheckInResult {
  if (!fix || site.latitude == null || site.longitude == null) return { outcome: 'no_gps' }
  const distanceM = haversineM(fix.lat, fix.lon, site.latitude, site.longitude)
  return distanceM <= SITE_CHECKIN_RADIUS_M
    ? { outcome: 'verified', distanceM }
    : { outcome: 'out_of_range', distanceM }
}

// Crea davvero un'Attività (traccia di 0 o 1 punto — mai una traccia fabbricata oltre al fix GPS
// reale ricevuto) — non solo un flag — perché un'Attività è anche l'ancora a cui il Reportage si
// collega (activities.linked_planned_id, piano Blocco E §30): senza questo passaggio, una visita
// registrata non avrebbe mai un posto dove generare/leggere un Reportage, esattamente come oggi
// non esiste un sentiero "completato" senza una riga activities. saveActivityWithEnrichment se ne
// occupa già: valorizza firstCompletedAt sulla Meta collegata (se non già presente) e non tenta
// mai calcoli DTM/Overpass/storico escursionistico per una traccia sotto i 2 punti (vedi
// lib/activitySave.ts) — nessuna duplicazione di logica qui.
// Idempotente sul lato "non ricompletare": se la Meta ha già una firstCompletedAt, non crea una
// seconda Attività — salvo `opts.repeat`, la scelta esplicita dell'utente di registrare un'altra
// visita (un Sito si può rivisitare, come un sentiero si ripercorre).
//
// `fix`: il fix GPS che ha originato la chiamata — un solo trackPoint se presente, altrimenti una
// traccia vuota (mai un punto fabbricato per un check-in senza segnale). `verified`: la decisione
// di evaluateCheckIn sopra — mai dedotta di nuovo qui da `fix`, perché un fix "out_of_range" esiste
// comunque ma non deve marcare la visita come verificata.
export async function markMetaVisited(
  hike: Pick<PlannedHike, 'id' | 'title' | 'metaType' | 'siteType' | 'firstCompletedAt'>,
  fix: GeoFix | null,
  verified: boolean,
  opts: {
    /** Diario scelto dall'utente — usato solo se la Meta non ne ha ancora uno (vedi
     *  lib/activitySave.ts); assente ⇒ ripiego sul Diario di default. */
    diaryId?: string
    /** Nuova visita a un Sito già visitato: crea un'altra Attività (un altro Reportage) invece di
     *  fermarsi, come "Aggiungi un'uscita" per un sentiero. Mai impostato dal flusso di prima visita. */
    repeat?: boolean
  } = {},
): Promise<void> {
  if (!canCompleteWithoutTrack(hike.metaType)) {
    throw new Error('markMetaVisited: solo un Sito si completa senza una traccia reale — Sentiero/Borgo passano sempre da un\'attività registrata o importata')
  }
  if (hike.firstCompletedAt && !opts.repeat) return

  const now = new Date().toISOString()
  await saveActivityWithEnrichment(
    {
      id: crypto.randomUUID(),
      sport: 'Visita',
      notes: '',
      device: '',
      startTime: now,
      endTime: now,
      totalTimeSeconds: 0,
      distanceMeters: 0,
      calories: 0,
      avgHeartRate: 0,
      maxHeartRate: 0,
      avgSpeedMs: 0,
      maxSpeedMs: 0,
      altitudeMin: 0,
      altitudeMax: 0,
      elevationGain: 0,
      elevationLoss: 0,
      trackPoints: fix ? [{ time: now, lat: fix.lat, lon: fix.lon }] : [],
    },
    {
      title: hike.title,
      linkedPlannedId: hike.id,
      metaType: hike.metaType,
      siteType: hike.siteType,
      verified,
      diaryId: opts.diaryId,
    },
  )
}
